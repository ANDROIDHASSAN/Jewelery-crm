// Auth state: access token + the resolved user (perms, role) so the sidebar
// and route guards can read it synchronously without a query round-trip.
//
// Persistence: only the access token and a tiny `user` snapshot land in
// localStorage. The server is the source of truth — on hydrate we still hit
// /auth/me to refresh.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AuthedUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleSlug: string;
  shopId: string | null;
  perms: string[];
  mustChangePassword: boolean;
  totpEnabled: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: AuthedUser | null;
}

const TOKEN_KEY = 'zelora.accessToken';
const USER_KEY = 'zelora.user';

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readStoredUser(): AuthedUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return normaliseUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Coerce any blob coming off localStorage or the wire into a safe
 * AuthedUser. Defends against:
 *   - stale local-storage entries from a previous build (old shape with no `perms`)
 *   - an API response that drifted from the type
 *   - a partial /me hydration that races the login mutation
 * Never returns undefined fields — the permission checks below treat
 * an empty array as "no perms" rather than crashing.
 */
function normaliseUser(raw: unknown): AuthedUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.roleSlug !== 'string') return null;
  // Some old payloads called it `permissions`; tolerate both transparently.
  const permsCandidate = (r.perms ?? r.permissions) as unknown;
  const perms = Array.isArray(permsCandidate)
    ? permsCandidate.filter((p): p is string => typeof p === 'string')
    : [];
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    email: typeof r.email === 'string' ? r.email : '',
    roleId: typeof r.roleId === 'string' ? r.roleId : '',
    roleSlug: r.roleSlug,
    shopId: typeof r.shopId === 'string' ? r.shopId : null,
    perms,
    mustChangePassword: Boolean(r.mustChangePassword),
    totpEnabled: Boolean(r.totpEnabled),
  };
}

const initialState: AuthState = {
  accessToken: readStoredToken(),
  user: readStoredUser(),
};

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
      try {
        window.localStorage.setItem(TOKEN_KEY, action.payload);
      } catch {
        /* ignore */
      }
    },
    setSession(state, action: PayloadAction<{ accessToken: string; user: AuthedUser }>) {
      const user = normaliseUser(action.payload.user);
      state.accessToken = action.payload.accessToken;
      state.user = user;
      try {
        window.localStorage.setItem(TOKEN_KEY, action.payload.accessToken);
        if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
      } catch {
        /* ignore */
      }
    },
    setUser(state, action: PayloadAction<AuthedUser>) {
      const user = normaliseUser(action.payload);
      state.user = user;
      try {
        if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
      } catch {
        /* ignore */
      }
    },
    logout(state) {
      state.accessToken = null;
      state.user = null;
      try {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
      } catch {
        /* ignore */
      }
    },
  },
});

export const { setAccessToken, setSession, setUser, logout } = slice.actions;
export const authReducer = slice.reducer;

// Selectors -------------------------------------------------------------

export function hasPermission(user: AuthedUser | null, key: string): boolean {
  if (!user) return false;
  if (user.roleSlug === 'SUPER_ADMIN') return true;
  // `perms` should always be an array — but defend against malformed state
  // (stale localStorage, API drift). An empty array means "no permission".
  return Array.isArray(user.perms) && user.perms.includes(key);
}

export function hasAnyPermission(user: AuthedUser | null, keys: readonly string[]): boolean {
  if (!user) return false;
  if (user.roleSlug === 'SUPER_ADMIN') return true;
  if (!Array.isArray(user.perms)) return false;
  return keys.some((k) => user.perms.includes(k));
}
