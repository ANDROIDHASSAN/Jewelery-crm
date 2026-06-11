// RTK Query endpoints for the promotions system: checkout pricing, coupon
// admin CRUD, and customer loyalty balance.

import { baseApi } from '@/app/store';

export interface PricingBreakdown {
  subtotalPaise: number;
  couponDiscountPaise: number;
  loyaltyDiscountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  pointsEarnable: number;
  coupon: { id: string; code: string; type: string; stackable: boolean } | null;
  couponError: string | null;
  loyalty: { balance: number; pointsUsed: number } | null;
  loyaltyError: string | null;
  stackabilityConflict: string | null;
  breakdown: {
    subtotal: number;
    afterCoupon: number;
    afterLoyalty: number;
    shipping: number;
    tax: number;
    total: number;
  };
}

export interface PricingRequest {
  cart_items: Array<{ productId?: string; slug?: string; qty: number; sizeLabel?: string }>;
  coupon_code?: string;
  use_loyalty_points?: boolean;
  loyalty_points_amount?: number;
  customer_phone?: string;
  shipping_paise?: number;
}

export interface AdminCoupon {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING' | 'BXGY' | 'FIRST_ORDER';
  valueBps: number;
  valuePaise: number;
  maxDiscountPaise: number | null;
  minCartPaise: number;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  usageCount: number;
  validFrom: string;
  validUntil: string | null;
  productIds: string[];
  categoryIds: string[];
  bxgyJson: unknown | null;
  stackable: boolean;
  isActive: boolean;
  createdAt: string;
  _count: { usages: number };
}

export interface CouponCreateInput {
  code: string;
  type: AdminCoupon['type'];
  valueBps?: number;
  valuePaise?: number;
  maxDiscountPaise?: number | null;
  minCartPaise?: number;
  usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null;
  validFrom?: string;
  validUntil?: string | null;
  productIds?: string[];
  categoryIds?: string[];
  bxgyJson?: unknown | null;
  stackable?: boolean;
  isActive?: boolean;
}

export interface LoyaltyConfigData {
  loyaltyEarnRatePaise: number;
  loyaltyPointValuePaise: number;
  loyaltyMinRedeemPoints: number;
  loyaltyMaxRedeemPct: number;
  loyaltyExpiryDays: number;
}

export const promotionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Admin: get loyalty programme config
    getLoyaltyConfig: build.query<LoyaltyConfigData, void>({
      query: () => '/settings/loyalty',
      transformResponse: (raw: { data: LoyaltyConfigData }) => raw.data,
      providesTags: [{ type: 'Order', id: 'LOYALTY_CONFIG' }],
    }),

    // Admin: update loyalty programme config
    updateLoyaltyConfig: build.mutation<LoyaltyConfigData, Partial<LoyaltyConfigData>>({
      query: (body) => ({ url: '/settings/loyalty', method: 'PATCH', body }),
      transformResponse: (raw: { data: LoyaltyConfigData }) => raw.data,
      invalidatesTags: [{ type: 'Order', id: 'LOYALTY_CONFIG' }],
    }),

    // Public pricing endpoint — call before placing order
    computeCheckoutPricing: build.mutation<PricingBreakdown, PricingRequest>({
      query: (body) => ({ url: '/website/checkout/pricing', method: 'POST', body }),
      transformResponse: (raw: { data: PricingBreakdown }) => raw.data,
    }),

    // Admin: list all coupons
    listCoupons: build.query<AdminCoupon[], void>({
      query: () => '/ecommerce/coupons',
      transformResponse: (raw: { data: AdminCoupon[] }) => raw.data,
      providesTags: [{ type: 'Order', id: 'COUPONS' }],
    }),

    // Admin: create coupon
    createCoupon: build.mutation<AdminCoupon, CouponCreateInput>({
      query: (body) => ({ url: '/ecommerce/coupons', method: 'POST', body }),
      transformResponse: (raw: { data: AdminCoupon }) => raw.data,
      invalidatesTags: [{ type: 'Order', id: 'COUPONS' }],
    }),

    // Admin: update coupon
    updateCoupon: build.mutation<AdminCoupon, { id: string } & Partial<CouponCreateInput>>({
      query: ({ id, ...body }) => ({ url: `/ecommerce/coupons/${id}`, method: 'PATCH', body }),
      transformResponse: (raw: { data: AdminCoupon }) => raw.data,
      invalidatesTags: [{ type: 'Order', id: 'COUPONS' }],
    }),

    // Admin: deactivate coupon
    deleteCoupon: build.mutation<{ deactivated: boolean }, string>({
      query: (id) => ({ url: `/ecommerce/coupons/${id}`, method: 'DELETE' }),
      transformResponse: (raw: { data: { deactivated: boolean } }) => raw.data,
      invalidatesTags: [{ type: 'Order', id: 'COUPONS' }],
    }),
  }),
});

export const {
  useGetLoyaltyConfigQuery,
  useUpdateLoyaltyConfigMutation,
  useComputeCheckoutPricingMutation,
  useListCouponsQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useDeleteCouponMutation,
} = promotionsApi;
