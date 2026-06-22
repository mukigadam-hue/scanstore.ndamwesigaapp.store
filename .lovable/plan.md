# Phone-First Fast Entry — Implementation Plan

## Goal
Replace the upfront email/password screen with a frictionless phone + 5‑digit PIN sign‑up that logs the user in instantly. Keep all internal vault security (auto-lock, biometric, document MFA, secure delete) untouched. Preserve old email login for existing users.

---

## 1. Database changes (migration)

Update `public.profiles`:
- Make `email` nullable.
- Add `pin_hash text` (bcrypt-style hash, never plaintext).
- Add `country_code text`, `phone_e164 text unique` (normalized lookup key).
- Add `auth_method text default 'phone_pin'` to track legacy vs new users.
- Backfill `phone_e164` from existing `phone` where possible.

Add a SECURITY DEFINER RPC `verify_phone_pin(p_phone text, p_pin text)` that:
- Looks up profile by `phone_e164`.
- Verifies the PIN against `pin_hash` using `crypt()` (pgcrypto).
- Returns the user's email (synthetic) so the client can call `signInWithPassword`.

Enable pgcrypto extension.

## 2. Auth strategy (no SMS, instant login)

Because Supabase requires an account credential, each phone-first user gets:
- A **synthetic email** like `vault+<phone_e164>@vaultmail.local` (kept internal, never shown).
- A **synthetic password** = a random 32-char secret stored only in `pin_hash`-protected form? No — instead: the **password equals a server-derived value** the client cannot guess. Simpler: password = PIN combined with a per-user pepper. Implementation:
  - On signup, edge function `phone-pin-signup` creates the auth user with synthetic email and a strong password = `hash(pin + server_pepper + phone)`. Stores `pin_hash` (bcrypt of raw PIN) in profile. Returns the session tokens to the client which sets the session — instant login, no email confirm.
  - On login, edge function `phone-pin-login` recomputes the password from PIN + phone + pepper, then signs in. Returns session. Client sets session.
- Edge functions use `SUPABASE_SERVICE_ROLE_KEY` (already available on Cloud) + a new `VAULT_PIN_PEPPER` secret.

Auto-confirm: set `auto_confirm_email = true` via `configure_auth` so synthetic emails don't need verification (user already approved this pattern; we'll ask explicitly via the configure_auth call — only affects synthetic accounts since real users get magic links).

> Note on auto-confirm: I'll flag this trade-off — it also auto-confirms real emails. If you'd prefer to keep email verification for the legacy path, we can instead use `admin.createUser({ email_confirm: true })` in the edge function and leave global setting alone. **Default in this plan: keep global setting OFF and have the edge function pass `email_confirm: true` only for phone-first synthetic accounts.**

## 3. New entry screen (`src/pages/Auth.tsx` rewrite)

Layout (mobile-first, matches existing locker aesthetic — mahogany/brass):

```text
┌─────────────────────────────┐
│       🔐 Open Your Vault    │
│  Fast, private, no email    │
│                             │
│ [🇺🇬 +256 ▼] [ 700 123 456 ]│
│ [ • • • • • ]  5-digit PIN  │
│ [ • • • • • ]  Confirm PIN  │
│ Email (optional)   [ Skip ] │
│                             │
│   [   Open My Vault   ]     │
│                             │
│   Forgot PIN / Recover ›    │
│ Logged in before with Email?│
└─────────────────────────────┘
```

- Country picker: lightweight static list of ~30 common countries; auto-select via `Intl.DateTimeFormat().resolvedOptions().timeZone` → country map, with a fallback to UG (current default region).
- PIN inputs: 5 separate boxes, numeric only, auto-advance.
- "Open My Vault" calls `phone-pin-signup` edge function → sets session → navigates to `/locker`. No SMS, no email step.
- "Skip" hides the email field entirely.
- "Logged in before with Email?" toggles a compact email/password form using existing `signIn` flow.

## 4. Forgot PIN / Recovery flow

New screen state in Auth page (no SMS provider needed — simulated as requested):
1. Enter phone number → call `phone-recover-start` edge function which checks the phone exists and returns `{ ok: true, code: <6-digit> }` (in dev) OR just `{ ok: true }`. We'll generate the code server-side and store it in a new `pin_recovery_codes` table with 10‑min expiry.
2. UI shows: spinner "Detecting secure vault SMS code…" for 3s, then auto-fills 6 boxes with the returned code, green checkmark.
3. User picks new 5-digit PIN → call `phone-pin-reset` edge function which validates the code, updates `pin_hash`, rotates the synthetic password, and returns a fresh session.
4. Optional "Continue with Google" button on the same screen links a Google identity to the recovered account using existing `lovable.auth.signInWithOAuth("google")` flow (post-login linking).

> Honest note: auto-filling the code from the server is a simulation, not real SMS verification — anyone who knows a phone number can reset the PIN. I'll add a one-line warning to the security memory. If you later want true security, we plug in a real SMS provider and remove the server echo.

## 5. Backward compatibility

- Existing email users: bottom link "Logged in before with Email? Tap here" opens the classic form — no changes to their flow.
- Inside `/locker`, if a logged-in user has no `phone_e164` or no `pin_hash`, show a dismissible banner: "Upgrade your vault identity — add a phone + 5-digit PIN." Tapping opens a small dialog that calls `phone-pin-attach` edge function to attach phone + PIN to the existing auth user without changing their email/password.

## 6. Files touched

**New:**
- `supabase/functions/phone-pin-signup/index.ts`
- `supabase/functions/phone-pin-login/index.ts`
- `supabase/functions/phone-recover-start/index.ts`
- `supabase/functions/phone-pin-reset/index.ts`
- `supabase/functions/phone-pin-attach/index.ts`
- `src/components/CountryCodePicker.tsx`
- `src/components/PinInput.tsx`
- `src/components/UpgradeVaultBanner.tsx`

**Edited:**
- `src/pages/Auth.tsx` (full rewrite of UI, keep legacy path as collapsed section)
- `src/pages/Locker.tsx` (mount UpgradeVaultBanner)
- `src/lib/auth.tsx` (add `signInWithPhonePin`, `signUpWithPhonePin` helpers)

**Migration:** profiles columns + pgcrypto + `pin_recovery_codes` table + `verify_phone_pin` RPC.

**Secrets:** `VAULT_PIN_PEPPER` (auto-generated 32-byte).

## 7. What stays untouched
- Document MFA / WebAuthn / auto-lock / secure delete / scan & save pipeline — zero changes.
- Profiles RLS still scoped to `auth.uid()`.
- `src/integrations/supabase/client.ts` and types — only regenerated, never hand-edited.

## 8. Order of execution
1. Migration (profiles + recovery table + RPC + pgcrypto).
2. Add `VAULT_PIN_PEPPER` secret.
3. Deploy 5 edge functions.
4. Build `PinInput`, `CountryCodePicker`, `UpgradeVaultBanner`.
5. Rewrite `Auth.tsx`.
6. Mount banner in `Locker.tsx`.
7. Smoke test: new signup → instant `/locker`, forgot PIN → reset → still see same documents, old email user → login + upgrade banner.

Reply **"go"** to start, or tell me which parts to tweak (e.g. real SMS via Twilio instead of simulated, or keep email verification on the legacy path).
