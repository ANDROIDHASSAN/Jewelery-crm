import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  accessToken: string | null;
}

const initialState: AuthState = { accessToken: null };

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    logout(state) {
      state.accessToken = null;
    },
  },
});

export const { setAccessToken, logout } = slice.actions;
export const authReducer = slice.reducer;
