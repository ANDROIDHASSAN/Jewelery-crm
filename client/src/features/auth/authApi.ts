import { baseApi } from '@/app/store';
import type { AuthedUser } from './authSlice';

interface LoginResponse {
  data: {
    accessToken: string;
    user: AuthedUser;
    mustChangePassword: boolean;
  };
}

interface MeResponse {
  data: AuthedUser;
}

interface Totp2faStartResponse {
  data: { secret: string; otpauthUri: string };
}

interface Totp2faVerifyResponse {
  data: { backupCodes: string[] };
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    login: b.mutation<LoginResponse, { email: string; password: string; totpCode?: string; backupCode?: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    me: b.query<MeResponse, void>({
      query: () => '/auth/me',
    }),
    changePassword: b.mutation<void, { currentPassword: string; newPassword: string; confirmPassword: string }>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),
    start2fa: b.mutation<Totp2faStartResponse, void>({
      query: () => ({ url: '/auth/2fa/start', method: 'POST' }),
    }),
    verify2fa: b.mutation<Totp2faVerifyResponse, { code: string }>({
      query: (body) => ({ url: '/auth/2fa/verify', method: 'POST', body }),
    }),
    disable2fa: b.mutation<void, { password: string }>({
      query: (body) => ({ url: '/auth/2fa/disable', method: 'POST', body }),
    }),
    logout: b.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
    // Legacy phone-OTP endpoints (kept so existing storefront flows keep working).
    requestOtp: b.mutation<{ data: { sent: boolean; devCode?: string } }, { phone: string }>({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),
    verifyOtp: b.mutation<{ data: { accessToken: string } }, { phone: string; code: string }>({
      query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }),
    }),
  }),
});

export const {
  useLoginMutation,
  useMeQuery,
  useChangePasswordMutation,
  useStart2faMutation,
  useVerify2faMutation,
  useDisable2faMutation,
  useLogoutMutation,
  useRequestOtpMutation,
  useVerifyOtpMutation,
} = authApi;
