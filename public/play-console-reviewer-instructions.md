# DocLocker — Google Play Console Reviewer Instructions

_Last updated: July 25, 2026_

This document is written **in English** and provides everything the Google Play
review team needs to fully evaluate DocLocker, including a permanent,
reusable demo account, PIN, and step-by-step instructions to bypass the
multi-factor security wall.

---

## 1. Demo account (permanent, reusable, valid worldwide)

| Field | Value |
|-------|-------|
| Sign-in method | **Email + Password** (primary review path) |
| Email | `playreview@doclocker.app` |
| Password | `PlayReview!2026` |
| Country | Any (account works globally) |
| Alternate method | Phone + 5-digit PIN (see §3) |

> **Please update these values before submission** if you have rotated them.
> The account is provisioned so it is always accessible, reusable, and does
> not expire. It is not tied to any regional restriction.

---

## 2. How to sign in (Email + Password path — recommended)

1. Open the app. You will land on the **Landing / Public** screen.
2. Tap **"Open Vault"** (top-right shield icon) or **"Sign in"**.
3. Choose **"Continue with Email"**.
4. Enter the demo email and password from §1.
5. Tap **Sign in**.

After sign-in the app will ask you to pass **2-step security verification**
before opening the vault. Follow §4 to bypass it.

---

## 3. Alternative: Phone + PIN sign-in

If you prefer to test the phone-based flow instead of email:

1. On the sign-in screen tap **"Use phone number"**.
2. Enter phone: **`+10000000000`**
3. Enter 5-digit PIN: **`24680`**
4. Tap **Sign in**.

Both accounts land in the same demo vault with the same pre-seeded documents.

---

## 4. Bypassing the 2-step security wall (required to reach the vault)

DocLocker requires users to register 3 of 6 security factors and pass 2 of
them to unlock the vault. The demo account already has **all six factors
pre-registered**, so the reviewer only needs to pass **any two** of the
following on the verification screen:

| Factor shown on screen | Value to enter |
|------------------------|----------------|
| School name            | `Lovable High` |
| Any family member's name you like | `Alex` |
| Recovery question 1 (favourite color) | `blue` |
| Recovery question 2 (birth city) | `Kampala` |
| One-time email code    | Tap **"Send code to email"** — the code is delivered to `playreview@doclocker.app`. If email is not reachable during review, use any two of the text factors above instead. |
| Fingerprint / Face ID (WebAuthn) | Optional. Requires a device sensor. Skip on emulators. |

Enter any **two** of the text-based values above and tap **Unlock Vault**.
No QR codes or barcodes are required.

---

## 5. What the reviewer can test after unlocking

- Browse pre-seeded drawers (IDs, Certificates, Receipts, Photos, PDFs).
- Open, rename, download, and delete documents.
- Scan a new document (Document mode and Two-Sided ID mode).
- Take a photo (color mode with manual crop).
- Upload a file from device storage.
- Change language (12 languages available; English is default).
- Review Privacy Policy at **Settings → Privacy** or `/privacy`.
- Sign out from **Settings → Sign out**.

---

## 6. Notes for the reviewer

- The app uses **Google Sign-In** as an optional third path. If the reviewer
  chooses Google Sign-In, please use any Google account you control — the
  app does not require a specific Google identity.
- The demo account credentials in §1 are **maintained at all times, valid in
  every region, and reusable across review cycles**. If they ever stop
  working, please contact the developer at the email below and a fresh set
  will be issued within 24 hours.
- No paid subscription is required to complete review; the demo account is
  provisioned on the **Premium** tier so every feature is unlocked.

---

## 7. Developer contact

- Email: **ndamson8@gmail.com**
- Web: **https://scanstore.ndamwesigaapp.store**
