import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  accessToken: string | null;
}

const STORAGE_KEY = 'zelora.accessToken';

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const initialState: AuthState = { accessToken: readStoredToken() };

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
      try {
        window.localStorage.setItem(STORAGE_KEY, action.payload);
      } catch {
        /* ignore */
      }
    },
    logout(state) {
      state.accessToken = null;
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
  },
});

export const { setAccessToken, logout } = slice.actions;
export const authReducer = slice.reducer;
