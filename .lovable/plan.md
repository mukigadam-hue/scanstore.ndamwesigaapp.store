

## Ad Monetization System for Free-Tier Users

### Overview
Create a reusable `NativeAdSlot` component with built-in 60s refresh, memory cleanup, and pre-fetching. Place ads on **two pages only**: the landing page (Index) and the security verification page (SecurityVerify). Ads are completely unmounted everywhere else.

### New File: `src/components/NativeAdSlot.tsx`
A self-contained ad placeholder component that:
- Accepts props: `slotId` (string), `size` ("banner" | "medium"), `className`
- Renders a fixed-height container (banner: 60px, medium: 90px) with a subtle border and "Ad" label — ready for AdMob/network SDK swap later
- Uses `useState` to hold the current "ad instance" (a unique key/timestamp) and `useEffect` for the 60s refresh interval
- On each refresh cycle: generates a new ad key, destroys the old instance, loads the new one — all inside a `useEffect` with proper cleanup (`clearInterval` on unmount)
- Uses `document.visibilitychange` listener to pause refresh when tab is hidden and resume when visible
- Fixed dimensions prevent layout jumps on refresh

### New File: `src/hooks/useAdPrefetch.ts`
A lightweight hook that:
- When called (e.g., inside document viewer/scanner), silently "pre-fetches" by preparing ad slot data in a ref/context
- On return to the ad-bearing page, the `NativeAdSlot` reads the pre-fetched data and renders instantly without flicker
- For now, this just pre-generates timestamps/keys; when a real ad SDK is integrated, this is where `fetch()` calls go

### Modifications

**`src/pages/Index.tsx`**
- Import `NativeAdSlot`
- Add one banner ad above the "DocLocker" heading (inside the hero, below the background overlay, above the icon) with `slotId="landing-top"`
- Ensure the ad container has `z-10` and doesn't overlap the CTA button

**`src/components/SecurityVerify.tsx`**
- Import `NativeAdSlot`
- Add one ad at the very top of the component's return (`slotId="verify-top"`)
- Add one ad at the very bottom (`slotId="verify-bottom"`)
- Both use fixed-height containers so they never overlap verification buttons

**No ads anywhere else** — the component is simply not rendered in Locker, DrawerView, CameraCapture, or FilePreviewDialog. Since React unmounts components when navigating away, all intervals are automatically cleaned up.

### Technical Details
- All `setInterval` calls are inside `useEffect` with `return () => clearInterval(id)` for guaranteed cleanup
- Visibility API (`document.addEventListener('visibilitychange', ...)`) pauses refresh when page is backgrounded — saves battery
- Pre-fetch hook stores data in a module-level variable (not state) so it persists across navigations without re-renders
- Fixed container heights (`h-[60px]` / `h-[90px]`) with `overflow-hidden` prevent layout shifts
- Placeholder divs have clear comments marking where to insert AdMob/network `<ins>` tags or SDK calls

