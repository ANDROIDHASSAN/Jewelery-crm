import { baseApi } from '@/app/store';

interface OtpRequestResponse {
  data: { sent: boolean; devCode?: string };
}
interface OtpVerifyResponse {
  data: { accessToken: string };
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    requestOtp: b.mutation<OtpRequestResponse, { phone: string }>({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),
    verifyOtp: b.mutation<OtpVerifyResponse, { phone: string; code: string }>({
      query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }),
    }),
    logout: b.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
  }),
});

export const { useRequestOtpMutation, useVerifyOtpMutation, useLogoutMutation } = authApi;
