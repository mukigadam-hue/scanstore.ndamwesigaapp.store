# Free Utility & Mobile Integration Layer

Adds a public utility surface on top of the existing locker. Nothing in the current security, locker, drawers, MFA, or auth flow is removed — we only add new public routes, components, and a thin interception hook.

## 1. Public vs Secure Routing

New public routes (no auth required, security verification bypassed):
- `/scan` — camera scanner
- `/view` — document viewer/editor (also handles `/open` already wired for PWA File Handlers)
- `/utility` — small landing card with "Scan Document", "Open a File", "Go to Vault"

Existing `/locker` and drawer routes stay gated by the current `SecurityVerify` flow. No changes to `useAuth`, MFA, WebAuthn, auto-lock, or secure delete.

The single interception point: a `SaveToVaultButton` component. When tapped, if the user is not unlocked, it stores the pending file in `sessionStorage` (`pendingVaultFile`) and routes to `/auth` → `/locker`. On successful unlock, `Locker.tsx` checks for `pendingVaultFile`, prompts the user to pick a drawer, and saves it through the existing upload pipeline. If already unlocked, save runs directly.

## 2. Mobile File Interception (Open With)

Extend `public/manifest.json` with `file_handlers` so the installed PWA appears in the system "Open With" menu for images, PDFs, and Word docs:

```text
images (image/*, .jpg .jpeg .png .webp .heic)
pdf    (application/pdf, .pdf)
word   (application/msword, .doc, .docx)
```

Handler action points to `/view`. The existing `OpenFile.tsx` LaunchQueue logic is reused inside the new `ViewerScreen` so deep-linked files render immediately without any auth gate.

Capacitor users get the same behavior via Android intent filters documented in `README.md` (no native code committed since the project is web-first; PWA file handlers cover both installed-PWA and Android-PWA cases).

## 3. Document Viewer & Editor Screen (`/view`)

New component `src/pages/ViewerScreen.tsx` with a top action bar:
- **Close Document** — clears state, fires Ad Trigger 4, routes back to `/utility`.
- **Save to Secure Vault** — uses `SaveToVaultButton` interception.
- **Save Changes** (only for editable .docx/.txt) — persists edits to an in-memory blob, fires Ad Trigger 3.

Reuses the existing preview/edit stack already in `FilePreviewDialog.tsx` (mammoth for .docx, SheetJS for .xlsx, pdfjs for PDFs, contentEditable for text). Works fully offline.

## 4. Camera & Document Scanner (`/scan`)

New `src/pages/ScanScreen.tsx` wrapping the existing `CameraCapture` component plus the existing `enhanceScan.ts` pipeline (auto-crop + contrast). After capture:
- Preview thumbnail
- **Retake** button
- **Done / Finish Scan** button → fires Ad Trigger 2, then routes to `/view` with the scanned blob so the user can either close it or save to vault.

A "Scan Document" button is added to the landing page (`Index.tsx`) and to the new `/utility` page, both publicly accessible.

## 5. Ads + Offline Detection

New `src/lib/ads.ts`:
- `useOnlineStatus()` hook (navigator.onLine + online/offline events).
- `showInterstitial(trigger): Promise<void>` — resolves immediately when offline or when no ad slot is filled, otherwise renders a full-screen `InterstitialAdOverlay` (reuses `NativeAdSlot` as the creative) with a 5s skip timer and Close button. Always resolves so the calling workflow never freezes.
- `prefetchInterstitial()` — silently warms the next ad in the background when online.

Four trigger points, each `await showInterstitial(...)` before continuing:
1. **App launch** — in `Index.tsx` `useEffect`, before rendering the hero (shows once per session via `sessionStorage` flag).
2. **Done / Finish Scan** — in `ScanScreen` before routing to `/view`.
3. **Save Changes** in editor — in `ViewerScreen` after persisting edits.
4. **Close Document / switch file** — in `ViewerScreen` close handler and in `OpenFile`/`ViewerScreen` when a new file replaces the current one.

If `navigator.onLine` is false, `showInterstitial` short-circuits and the action proceeds with zero delay.

## Files

Created:
- `src/pages/ViewerScreen.tsx`
- `src/pages/ScanScreen.tsx`
- `src/pages/UtilityHome.tsx`
- `src/components/SaveToVaultButton.tsx`
- `src/components/InterstitialAdOverlay.tsx`
- `src/lib/ads.ts`
- `src/hooks/useOnlineStatus.ts`

Edited:
- `src/App.tsx` — register new public routes
- `src/pages/Index.tsx` — launch ad trigger + "Scan Document" button
- `src/pages/Locker.tsx` — consume `pendingVaultFile` after unlock
- `public/manifest.json` — `file_handlers` entries
- `index.html` — none required (manifest already linked)

Untouched (explicitly): `SecurityVerify.tsx`, `SecuritySetup.tsx`, `useAutoLock.ts`, `webauthn.ts`, `SecureDeleteDialog.tsx`, `Auth.tsx`, all phone-PIN edge functions, `DrawerView.tsx`, `FilePreviewDialog.tsx`.

## Notes

- "AdMob" on web/PWA is served via the existing `NativeAdSlot` placeholder; real AdMob SDK requires the Capacitor native shell, which is out of scope for this web build. The trigger contract (offline-skip, resolves-always, fires at the 4 listed moments) is fully implemented and will wire to a real AdMob plugin the moment the project is wrapped in Capacitor.
- All new buttons use the existing shadcn `Button` component and current mahogany/brass design tokens so they match the locker aesthetic.
