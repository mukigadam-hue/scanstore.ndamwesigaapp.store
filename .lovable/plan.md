

## Problem

A corrupted/expired session token is stored in localStorage. The Supabase client keeps retrying token refresh in a loop (dozens of "Failed to fetch" errors), which blocks all other auth requests (login, signup). The `auth.tsx` provider never clears the bad session, so the app stays stuck.

## Fix Plan

### 1. Fix `src/lib/auth.tsx` - Handle stale sessions and network errors

- Wrap `getSession()` in a try-catch. If it fails (network error), call `supabase.auth.signOut()` to clear the corrupted localStorage tokens, then set `loading = false` so the UI unblocks.
- Add a safety timeout (5 seconds) so if `onAuthStateChange` never fires due to network issues, loading still resolves to false.
- This prevents the infinite refresh loop from blocking the entire app.

### 2. Fix `src/pages/Auth.tsx` - Better error handling for network failures

- Wrap `signIn` and `signUp` calls in try-catch blocks that detect `TypeError: Failed to fetch` and show a user-friendly message like "Network error. Please check your connection and try again."
- Currently the catch block doesn't exist on `handleSubmit`, so network failures cause unhandled promise rejections with no user feedback.

### Technical Details

**Root cause**: When a Supabase session expires or the refresh token becomes invalid, the client retries aggressively. The current code has no mechanism to detect this failure loop and clear the bad token from `localStorage`.

**Files to edit**:
- `src/lib/auth.tsx` (add try-catch around getSession, add timeout fallback, clear bad sessions)
- `src/pages/Auth.tsx` (add network error handling in handleSubmit and handleForgotPassword)

