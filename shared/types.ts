// shared/types.ts — z.infer types exported for both client and server.

import type { z } from 'zod';
import type {
  TenantSchema,
  ShopSchema,
  ShopInputSchema,
  UserSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  CategorySchema,
  CategoryInputSchema,
  ItemSchema,
  ItemInputSchema,
  ItemMovementSchema,
  TransferInitiateSchema,
  VendorSchema,
  PurchaseOrderSchema,
  CustomerSchema,
  CustomerInputSchema,
  BillLineInputSchema,
  PaymentInputSchema,
  OldGoldExchangeInputSchema,
  BillCreateSchema,
  BillSchema,
  ExpenseInputSchema,
  GoldLoanSchema,
  LeadInputSchema,
  LeadSchema,
  ProductInputSchema,
  OrderSchema,
  ApiErrorSchema,
  PageSchema,
} from './schemas.js';

export type Tenant = z.infer<typeof TenantSchema>;
export type Shop = z.infer<typeof ShopSchema>;
export type ShopInput = z.infer<typeof ShopInputSchema>;
export type User = z.infer<typeof UserSchema>;

export type OtpRequest = z.infer<typeof OtpRequestSchema>;
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

export type Category = z.infer<typeof CategorySchema>;
export type CategoryInput = z.infer<typeof CategoryInputSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type ItemInput = z.infer<typeof ItemInputSchema>;
export type ItemMovement = z.infer<typeof ItemMovementSchema>;
export type TransferInitiate = z.infer<typeof TransferInitiateSchema>;
export type Vendor = z.infer<typeof VendorSchema>;
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerInput = z.infer<typeof CustomerInputSchema>;
export type BillLineInput = z.infer<typeof BillLineInputSchema>;
export type PaymentInput = z.infer<typeof PaymentInputSchema>;
export type OldGoldExchangeInput = z.infer<typeof OldGoldExchangeInputSchema>;
export type BillCreate = z.infer<typeof BillCreateSchema>;
export type Bill = z.infer<typeof BillSchema>;

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
export type GoldLoan = z.infer<typeof GoldLoanSchema>;

export type LeadInput = z.infer<typeof LeadInputSchema>;
export type Lead = z.infer<typeof LeadSchema>;

export type ProductInput = z.infer<typeof ProductInputSchema>;
export type Order = z.infer<typeof OrderSchema>;

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type Page = z.infer<typeof PageSchema>;

export interface ApiList<T> {
  data: T[];
  page: Page;
}
export interface ApiOne<T> {
  data: T;
}
