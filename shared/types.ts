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
  AddStockSchema,
  TransferSchema,
  TransferLineSchema,
  TransferLineInputSchema,
  TransferCreateSchema,
  TransferRejectSchema,
  VendorSchema,
  VendorInputSchema,
  PurchaseOrderSchema,
  PurchaseOrderCreateSchema,
  PurchaseOrderItemInputSchema,
  WastageInputSchema,
  CustomerSchema,
  CustomerInputSchema,
  BillLineInputSchema,
  PaymentInputSchema,
  OldGoldExchangeInputSchema,
  BillCreateSchema,
  BillSchema,
  ExpenseInputSchema,
  ExpenseUpdateSchema,
  ExpenseClassificationSchema,
  GoldLoanSchema,
  GoldLoanInputSchema,
  GoldLoanRepaymentInputSchema,
  PayrollInputSchema,
  VendorPaymentInputSchema,
  BankAccountInputSchema,
  BankTransactionInputSchema,
  ReconciliationInputSchema,
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
export type AddStock = z.infer<typeof AddStockSchema>;
export type Transfer = z.infer<typeof TransferSchema>;
export type TransferLine = z.infer<typeof TransferLineSchema>;
export type TransferLineInput = z.infer<typeof TransferLineInputSchema>;
export type TransferCreate = z.infer<typeof TransferCreateSchema>;
export type TransferReject = z.infer<typeof TransferRejectSchema>;
// `TransferStatus` is exported from ./constants.ts (the canonical enum). Don't
// re-export from the schema to avoid an ambiguous name across shared/index.ts.
export type Vendor = z.infer<typeof VendorSchema>;
export type VendorInput = z.infer<typeof VendorInputSchema>;
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export type PurchaseOrderCreate = z.infer<typeof PurchaseOrderCreateSchema>;
export type PurchaseOrderItemInput = z.infer<typeof PurchaseOrderItemInputSchema>;
export type WastageInput = z.infer<typeof WastageInputSchema>;

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerInput = z.infer<typeof CustomerInputSchema>;
export type BillLineInput = z.infer<typeof BillLineInputSchema>;
export type PaymentInput = z.infer<typeof PaymentInputSchema>;
export type OldGoldExchangeInput = z.infer<typeof OldGoldExchangeInputSchema>;
export type BillCreate = z.infer<typeof BillCreateSchema>;
export type Bill = z.infer<typeof BillSchema>;

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
export type ExpenseUpdate = z.infer<typeof ExpenseUpdateSchema>;
export type ExpenseClassification = z.infer<typeof ExpenseClassificationSchema>;
export type GoldLoan = z.infer<typeof GoldLoanSchema>;
export type GoldLoanInput = z.infer<typeof GoldLoanInputSchema>;
export type GoldLoanRepaymentInput = z.infer<typeof GoldLoanRepaymentInputSchema>;
export type PayrollInput = z.infer<typeof PayrollInputSchema>;
export type VendorPaymentInput = z.infer<typeof VendorPaymentInputSchema>;
export type BankAccountInput = z.infer<typeof BankAccountInputSchema>;
export type BankTransactionInput = z.infer<typeof BankTransactionInputSchema>;
export type ReconciliationInput = z.infer<typeof ReconciliationInputSchema>;

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
