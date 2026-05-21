// Auth thunks that combine state changes with RTK Query cache resets.
//
// Why this file exists: the `logout` and `setSession` reducers in
// authSlice.ts only mutate the auth slice. They do not flush the RTK
// Query cache (`baseApi.reducer`). That cache survives logout, so the
// next user (or the next-tab anonymous session) is briefly served the
// previous user's tenant- and role-scoped data — the classic
// "cache poisoning across role switch" bug.
//
// These thunks bundle:
//   1. The auth-slice mutation (sync)
//   2. RTK Query cache invalidation (baseApi.util.resetApiState)
//   3. Best-effort server-side cleanup (refresh-cookie revoke on logout)
//
// Every call site that used `dispatch(logout())` or `dispatch(setSession(...))`
// should switch to these. Direct reducer dispatches are still allowed in
// hot paths (e.g. baseQueryWithRefresh on a 401) where the cache is
// already about to refetch on a fresh token anyway.

import type { AppDispatch, RootState } from '@/app/store';
import { baseApi } from '@/app/store';
import { logout, setSession, type AuthedUser } from './authSlice';

/**
 * Sign the user in (or switch to a different user). Resets the RTK Query
 * cache whenever the incoming user.id differs from the one already in
 * state — so the freshly-logged-in user never sees the previous user's
 * cached lists, dashboard tiles, or POS state.
 */
export function signInWithFreshCache(payload: {
  accessToken: string;
  user: AuthedUser;
}) {
  return (dispatch: AppDispatch, getState: () => RootState): void => {
    const previousUserId = getState().auth.user?.id ?? null;
    const isDifferentUser = previousUserId !== null && previousUserId !== payload.user.id;
    dispatch(setSession(payload));
    if (isDifferentUser) {
      // Nuke every cached query. The next render's hooks will re-issue
      // their underlying fetches with the new bearer token, so the user
      // sees their own data — not the previous user's.
      dispatch(baseApi.util.resetApiState());
    }
  };
}

/**
 * Sign the user out cleanly:
 *   1. Try to invalidate the refresh cookie server-side (best effort —
 *      a network failure must NOT block the local logout, otherwise an
 *      offline user is stuck).
 *   2. Clear the auth slice and localStorage.
 *   3. Reset the RTK Query cache so the next visitor on this device
 *      (or the same user logging back in with a different role) gets
 *      a clean slate.
 */
export function signOutAndClear() {
  return async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const token = getState().auth.accessToken;
    if (token) {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Offline / network blip — proceed with local logout anyway.
      }
    }
    dispatch(logout());
    dispatch(baseApi.util.resetApiState());
  };
}
