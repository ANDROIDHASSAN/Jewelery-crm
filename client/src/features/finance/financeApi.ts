// Finance & Accounting RTK Query slice.
//
// One endpoint per backend route in finance.routes.ts. Tags are scoped so a
// mutation only re-fetches what it actually invalidated (e.g. recording a
// vendor payment busts VendorPayment + the summary, not every Bill query).

import { baseApi } from '@/app/store';
import type {
  ApiOne,
  ExpenseInput,
  ExpenseUpdate,
  ExpenseCategoryInput,
  ExpenseCategoryUpdate,
  GoldLoanInput,
  GoldLoanRepaymentInput,
  PayrollInput,
  VendorPaymentInput,
  BankAccountInput,
  BankTransactionInput,
  ReconciliationInput,
} from '@goldos/shared/types';

// ---------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------

export interface PlSummary {
  revenuePaise: number;
  grossRevenuePaise: number;
  gstPaise: number;
  makingChargesPaise: number;
  discountPaise: number;
  oldGoldPaise: number;
  // POS breakdown
  posRevenuePaise: number;
  posGstPaise: number;
  // Ecommerce breakdown
  ecomRevenuePaise: number;
  ecomGstPaise: number;
  ecomShippingPaise: number;
  ecomOrderCount: number;
  expensePaise: number;
  revenueExpensePaise: number;
  capitalExpensePaise: number;
  netPaise: number;
  from: string;
  to: string;
  expensesByCategory: Array<{
    category: string;
    classification: 'REVENUE' | 'CAPITAL';
    amountPaise: number;
    count: number;
  }>;
}

export interface GstSummary {
  month: string;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  // Input GST (ITC) paid on received purchases, and net liability after credit.
  inputCgstPaise: number;
  inputSgstPaise: number;
  inputIgstPaise: number;
  inputGstPaise: number;
  netGstPayablePaise: number;
  taxableRevenuePaise: number;
  billCount: number;
}

export interface GstHsnRow {
  hsnCode: string | null;
  gstRateBps: number;
  quantity: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface GstBill {
  id: string;
  billNumber: string | null;
  isEcom?: boolean;
  createdAt: string;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  shop: { name: string; gstStateCode: string };
  customer: { name: string } | null;
}

export interface ExpenseRow {
  id: string;
  category: string;
  amountPaise: number;
  paidAt: string;
  shopId: string;
  notes: string | null;
  receiptUrl?: string | null;
  classification?: 'REVENUE' | 'CAPITAL';
  isRecurring?: boolean;
  recurringIntervalDays?: number | null;
  paymentMode?: string | null;
  vendorId?: string | null;
  bankAccountId?: string | null;
}

export interface ExpenseByCategory {
  category: string;
  amountPaise: number;
  count: number;
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  classification: 'REVENUE' | 'CAPITAL';
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
}

export interface BranchSummary {
  shopId: string;
  shopName: string;
  revenuePaise: number;
  expensePaise: number;
  netPaise: number;
  billCount: number;
  gstPaise: number;
}

export interface FinanceSummary {
  asOf: string;
  mtd: {
    revenuePaise: number;
    ecomRevenuePaise: number;
    ecomOrderCount: number;
    expensePaise: number;
    gstPaise: number;
    netPaise: number;
    billCount: number;
    expenseCount: number;
    from: string;
    to: string;
  };
  lastMonthGst: GstSummary;
  trend: Array<{ month: string; label: string; revenuePaise: number; expensePaise: number }>;
  branches: BranchSummary[];
  expensesByCategory: ExpenseByCategory[];
  recentExpenses: ExpenseRow[];
  openLoans: { count: number; principalPaise: number };
  vendorDues: { vendorCount: number; outstandingPaise: number };
  activeAdvances: { count: number; amountPaise: number };
}

export interface DailySales {
  from: string;
  to: string;
  totals: {
    revenuePaise: number;
    ecomRevenuePaise: number;
    ecomOrderCount: number;
    billCount: number;
    avgBillPaise: number;
    cashPaise: number;
    digitalPaise: number;
    gstPaise: number;
    discountPaise: number;
    refundPaise: number;
    refundCount: number;
    netCollectionPaise: number;
  };
  paymentMix: Array<{ mode: string; amountPaise: number; count: number }>;
  byShop: Array<{
    shopId: string;
    shopName: string;
    revenuePaise: number;
    gstPaise: number;
    billCount: number;
  }>;
  byDay: Array<{ day: string; revenuePaise: number; billCount: number }>;
  /** Bill-level detail for the window (POS bills + e-commerce orders) with GST split. */
  bills: DailySalesBill[];
}

export interface DailySalesBill {
  id: string;
  billNumber: string | null;
  isEcom: boolean;
  createdAt: string;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  shopName: string;
  customerName: string | null;
}

export interface GoldLoanRow {
  id: string;
  customer: { id: string; name: string; phone: string };
  principalPaise: number;
  interestRateBps: number;
  pledgedWeightMg: number;
  status: 'ACTIVE' | 'PARTIALLY_REPAID' | 'CLOSED' | 'DEFAULTED';
  dueAt: string;
  repaidPaise: number;
  outstandingPaise: number;
  repayments: Array<{ id: string; amountPaise: number; paidAt: string }>;
  daysToDue: number;
}

export interface PayrollRow {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  month: string;
  basePaise: number;
  commissionPaise: number;
  advancePaise: number;
  netPaise: number;
  paidAt: string | null;
}

export interface VendorLedgerRow {
  id: string;
  name: string;
  gstNumber: string | null;
  phone: string;
  purchasedPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  purchaseCount: number;
  paymentCount: number;
}

export interface VendorPaymentRow {
  id: string;
  vendorId: string;
  amountPaise: number;
  paymentMode: string;
  referenceId: string | null;
  paidAt: string;
  notes: string | null;
  bankAccountId: string | null;
}

export interface BankAccountRow {
  id: string;
  nickname: string;
  bankName: string;
  accountLast4: string;
  ifsc: string | null;
  type: 'CURRENT' | 'SAVINGS' | 'OD' | 'CC' | 'OTHER';
  openingBalancePaise: number;
  creditPaise: number;
  debitPaise: number;
  balancePaise: number;
  isActive: boolean;
  createdAt: string;
}

export interface BankTransactionRow {
  id: string;
  accountId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountPaise: number;
  balancePaise: number | null;
  description: string;
  referenceId: string | null;
  occurredAt: string;
  reconciledAt: string | null;
}

export interface ReconciliationRow {
  id: string;
  shopId: string;
  reconciledDate: string;
  expectedCashPaise: number;
  countedCashPaise: number;
  expectedUpiPaise: number;
  settledUpiPaise: number;
  expectedCardPaise: number;
  settledCardPaise: number;
  varianceCashPaise: number;
  varianceUpiPaise: number;
  varianceCardPaise: number;
  notes: string | null;
}

export interface ReconciliationExpected {
  shopId: string;
  date: string;
  expectedCashPaise: number;
  expectedUpiPaise: number;
  expectedCardPaise: number;
  existing: ReconciliationRow | null;
}

export interface AdvanceSummary {
  active: { count: number; amountPaise: number };
  consumed: { count: number; amountPaise: number };
  refunded: { count: number; amountPaise: number };
  recent: Array<{
    id: string;
    receiptNumber: string;
    customerName: string;
    customerPhone: string;
    amountPaise: number;
    status: 'ACTIVE' | 'CONSUMED' | 'REFUNDED';
    validUntil: string | null;
    createdAt: string;
  }>;
}

export interface FinancialYearReport {
  fyLabel: string;
  fyStart: string;
  fyEnd: string;
  revenuePaise: number;
  expensePaise: number;
  netPaise: number;
  gstPaise: number;
  billCount: number;
  expenseCount: number;
  prev: { revenuePaise: number; expensePaise: number };
  yoyRevenuePct: number | null;
  yoyExpensePct: number | null;
  monthly: Array<{
    month: string;
    revenuePaise: number;
    expensePaise: number;
    netPaise: number;
  }>;
  byShop: Array<{
    shopId: string;
    shopName: string;
    revenuePaise: number;
    gstPaise: number;
    billCount: number;
  }>;
}

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  shopId: string | null;
  role: { slug: string; name: string };
}

export interface VendorLite {
  id: string;
  name: string;
  gstNumber: string | null;
  phone: string;
  outstandingPaise: number;
}

export interface CustomerLite {
  id: string;
  name: string;
  phone: string;
}

// ---------------------------------------------------------------------
// Accounting shapes
// ---------------------------------------------------------------------

export interface DayBookVoucher {
  date: string;
  voucherType: 'SALE' | 'EXPENSE' | 'VENDOR_PAYMENT' | 'BANK' | 'GOLD_LOAN' | 'REPAYMENT' | 'ADVANCE';
  voucherNumber: string;
  party: string;
  narration: string;
  debitAccount: string;
  creditAccount: string;
  amountPaise: number;
}

export interface DayBookResponse {
  from: string;
  to: string;
  vouchers: DayBookVoucher[];
  totals: { voucherCount: number; debitPaise: number; creditPaise: number };
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  group: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  debitPaise: number;
  creditPaise: number;
}

export interface TrialBalanceResponse {
  asOf: string;
  rows: TrialBalanceRow[];
  totals: { debitPaise: number; creditPaise: number };
  meta: {
    revenueExpensePaise: number;
    capitalExpensePaise: number;
    netIncomePaise: number;
  };
}

export interface BalanceSheetResponse {
  asOf: string;
  assets: {
    current: Array<{ label: string; amountPaise: number }>;
    currentTotal: number;
    fixed: Array<{ label: string; amountPaise: number }>;
    fixedTotal: number;
    total: number;
  };
  liabilities: {
    current: Array<{ label: string; amountPaise: number }>;
    currentTotal: number;
  };
  equity: {
    rows: Array<{ label: string; amountPaise: number }>;
    total: number;
  };
  balanced: boolean;
  liabilitiesPlusEquity: number;
}

export interface LedgerEntry {
  date: string;
  narration: string;
  voucher: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
}

export interface LedgerResponse {
  account: string;
  from: string;
  to: string;
  entries: LedgerEntry[];
  totals: { debitPaise: number; creditPaise: number; closingBalancePaise: number };
}

// ---------------------------------------------------------------------
// New response shapes (COGS / Returns / Revenue-by-Category)
// ---------------------------------------------------------------------

export interface CogsMonthRow {
  month: string;
  label: string;
  metalCostPaise: number;
  makingChargesPaise: number;
  stoneChargesPaise: number;
  totalPaise: number;
  billCount: number;
}

export interface ReturnRow {
  id: string;
  billNumber: string | null;
  orderNumber: string | null;
  customerName: string | null;
  shopName: string;
  amountPaise: number;
  reason: string;
  refundedAt: string;
  source: 'POS' | 'ECOM';
}

export interface ReturnsResponse {
  trend: Array<{ month: string; label: string; refundPaise: number; refundCount: number }>;
  refunds: ReturnRow[];
  totals: { refundPaise: number; refundCount: number };
}

export interface RevenueByCategoryResponse {
  byMainCategory: Array<{ category: string; revenuePaise: number }>;
  bySubCategory: Array<{
    mainCategory: string;
    subCategory: string;
    revenuePaise: number;
    billCount: number;
  }>;
  topItems: Array<{
    itemName: string;
    sku: string;
    categoryName: string;
    revenuePaise: number;
    billCount: number;
  }>;
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

export const financeApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Summary / overview
    getFinanceSummary: b.query<ApiOne<FinanceSummary>, { shopId?: string } | void>({
      query: (params) => ({ url: '/finance/summary', params: params ?? undefined }),
      providesTags: ['FinanceSummary'],
    }),
    getDailySales: b.query<
      ApiOne<DailySales>,
      { shopId?: string; range?: 'today' | 'yesterday' | 'week' | 'month'; from?: string; to?: string }
    >({
      query: (params) => ({ url: '/finance/daily-sales', params }),
      providesTags: ['DailySales'],
    }),
    getPl: b.query<ApiOne<PlSummary>, { from: string; to: string; shopId?: string }>({
      query: (params) => ({ url: '/finance/pl', params }),
      providesTags: ['PL'],
    }),

    // GST
    getGstSummary: b.query<ApiOne<GstSummary>, { month: string; shopId?: string }>({
      query: (params) => ({ url: '/finance/gst-summary', params }),
      providesTags: ['GstSummary'],
    }),
    getGstBills: b.query<{ data: GstBill[] }, { month: string; shopId?: string }>({
      query: (params) => ({ url: '/finance/gst-bills', params }),
      providesTags: ['GstSummary'],
    }),
    getGstHsnSummary: b.query<{ data: GstHsnRow[] }, { month: string; shopId?: string }>({
      query: (params) => ({ url: '/finance/gst-hsn-summary', params }),
      providesTags: ['GstSummary'],
    }),

    // Expenses
    getExpenses: b.query<
      { data: ExpenseRow[]; page: { nextCursor?: string; hasMore: boolean } },
      {
        limit?: number;
        cursor?: string;
        shopId?: string;
        category?: string;
        classification?: 'REVENUE' | 'CAPITAL';
        from?: string;
        to?: string;
      } | void
    >({
      query: (params) => ({ url: '/finance/expenses', params: params ?? undefined }),
      providesTags: ['Expense'],
    }),
    getExpensesByCategory: b.query<
      { data: ExpenseByCategory[] },
      { from: string; to: string; shopId?: string }
    >({
      query: (params) => ({ url: '/finance/expenses/by-category', params }),
      providesTags: ['Expense'],
    }),
    createExpense: b.mutation<ApiOne<ExpenseRow>, ExpenseInput>({
      query: (body) => ({ url: '/finance/expenses', method: 'POST', body }),
      invalidatesTags: ['Expense', 'FinanceSummary', 'PL', 'DailySales'],
    }),
    updateExpense: b.mutation<ApiOne<ExpenseRow>, { id: string; body: ExpenseUpdate }>({
      query: ({ id, body }) => ({ url: `/finance/expenses/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Expense', 'FinanceSummary', 'PL'],
    }),
    deleteExpense: b.mutation<void, string>({
      query: (id) => ({ url: `/finance/expenses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Expense', 'FinanceSummary', 'PL'],
    }),

    // Expense categories (ledgers / heads)
    getExpenseCategories: b.query<{ data: ExpenseCategoryRow[] }, { includeArchived?: boolean } | void>({
      query: (params) => ({ url: '/finance/expense-categories', params: params ?? undefined }),
      providesTags: ['ExpenseCategory'],
    }),
    createExpenseCategory: b.mutation<ApiOne<ExpenseCategoryRow>, ExpenseCategoryInput>({
      query: (body) => ({ url: '/finance/expense-categories', method: 'POST', body }),
      invalidatesTags: ['ExpenseCategory'],
    }),
    updateExpenseCategory: b.mutation<
      ApiOne<ExpenseCategoryRow>,
      { id: string; body: ExpenseCategoryUpdate }
    >({
      query: ({ id, body }) => ({ url: `/finance/expense-categories/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['ExpenseCategory', 'Expense', 'FinanceSummary', 'PL'],
    }),
    deleteExpenseCategory: b.mutation<unknown, string>({
      query: (id) => ({ url: `/finance/expense-categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['ExpenseCategory'],
    }),

    // Gold loans
    getGoldLoans: b.query<
      { data: GoldLoanRow[]; page: { nextCursor?: string; hasMore: boolean } },
      { status?: 'ACTIVE' | 'PARTIALLY_REPAID' | 'CLOSED' | 'DEFAULTED'; limit?: number; cursor?: string } | void
    >({
      query: (params) => ({ url: '/finance/gold-loans', params: params ?? undefined }),
      providesTags: ['GoldLoan'],
    }),
    createGoldLoan: b.mutation<ApiOne<GoldLoanRow>, GoldLoanInput>({
      query: (body) => ({ url: '/finance/gold-loans', method: 'POST', body }),
      invalidatesTags: ['GoldLoan', 'FinanceSummary'],
    }),
    addGoldLoanRepayment: b.mutation<
      ApiOne<{ id: string; amountPaise: number; paidAt: string }>,
      Omit<GoldLoanRepaymentInput, 'loanId'> & { loanId: string }
    >({
      query: ({ loanId, ...body }) => ({
        url: `/finance/gold-loans/${loanId}/repayments`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['GoldLoan', 'FinanceSummary'],
    }),

    // Reconciliation
    getReconciliationExpected: b.query<
      ApiOne<ReconciliationExpected>,
      { shopId: string; date: string }
    >({
      query: (params) => ({ url: '/finance/reconciliation/expected', params }),
      providesTags: ['Reconciliation'],
    }),
    getReconciliations: b.query<
      { data: ReconciliationRow[] },
      { shopId?: string; from?: string; to?: string; limit?: number } | void
    >({
      query: (params) => ({ url: '/finance/reconciliation', params: params ?? undefined }),
      providesTags: ['Reconciliation'],
    }),
    createReconciliation: b.mutation<ApiOne<ReconciliationRow>, ReconciliationInput>({
      query: (body) => ({ url: '/finance/reconciliation', method: 'POST', body }),
      invalidatesTags: ['Reconciliation', 'FinanceSummary'],
    }),

    // Payroll
    getPayroll: b.query<{ data: PayrollRow[] }, { month?: string } | void>({
      query: (params) => ({ url: '/finance/payroll', params: params ?? undefined }),
      providesTags: ['Payroll'],
    }),
    createPayroll: b.mutation<ApiOne<PayrollRow>, PayrollInput>({
      query: (body) => ({ url: '/finance/payroll', method: 'POST', body }),
      invalidatesTags: ['Payroll', 'FinanceSummary'],
    }),
    markPayrollPaid: b.mutation<ApiOne<PayrollRow>, string>({
      query: (id) => ({ url: `/finance/payroll/${id}/mark-paid`, method: 'POST' }),
      invalidatesTags: ['Payroll'],
    }),

    // Vendors
    getVendorLedger: b.query<{ data: VendorLedgerRow[] }, void>({
      query: () => ({ url: '/finance/vendors/ledger' }),
      providesTags: ['Vendor', 'VendorPayment'],
    }),
    getVendorPayments: b.query<{ data: VendorPaymentRow[] }, string>({
      query: (vendorId) => ({ url: `/finance/vendors/${vendorId}/payments` }),
      providesTags: ['VendorPayment'],
    }),
    createVendorPayment: b.mutation<ApiOne<VendorPaymentRow>, VendorPaymentInput>({
      query: (body) => ({ url: '/finance/vendor-payments', method: 'POST', body }),
      invalidatesTags: ['Vendor', 'VendorPayment', 'FinanceSummary'],
    }),
    getVendorList: b.query<{ data: VendorLite[] }, void>({
      query: () => ({ url: '/finance/vendors' }),
      providesTags: ['Vendor'],
    }),

    // Advances
    getAdvanceSummary: b.query<ApiOne<AdvanceSummary>, void>({
      query: () => ({ url: '/finance/advances/summary' }),
      providesTags: ['Advance'],
    }),

    // Bank
    getBankAccounts: b.query<{ data: BankAccountRow[] }, void>({
      query: () => ({ url: '/finance/bank-accounts' }),
      providesTags: ['BankAccount'],
    }),
    createBankAccount: b.mutation<ApiOne<BankAccountRow>, BankAccountInput>({
      query: (body) => ({ url: '/finance/bank-accounts', method: 'POST', body }),
      invalidatesTags: ['BankAccount'],
    }),
    getBankTransactions: b.query<
      { data: BankTransactionRow[] },
      { accountId: string; limit?: number }
    >({
      query: ({ accountId, ...params }) => ({
        url: `/finance/bank-accounts/${accountId}/transactions`,
        params,
      }),
      providesTags: ['BankTransaction'],
    }),
    createBankTransaction: b.mutation<ApiOne<BankTransactionRow>, BankTransactionInput>({
      query: (body) => ({ url: '/finance/bank-transactions', method: 'POST', body }),
      invalidatesTags: ['BankAccount', 'BankTransaction'],
    }),

    // Financial year
    getFinancialYear: b.query<ApiOne<FinancialYearReport>, { fy?: string } | void>({
      query: (params) => ({ url: '/finance/financial-year', params: params ?? undefined }),
      providesTags: ['FinancialYear'],
    }),

    // Staff (for payroll dropdown)
    getFinanceStaff: b.query<{ data: StaffRow[] }, void>({
      query: () => ({ url: '/finance/staff' }),
      providesTags: ['User'],
    }),

    // Customer search (for gold-loan typeahead and similar pickers).
    searchCustomers: b.query<{ data: CustomerLite[] }, { q?: string; limit?: number } | void>({
      query: (params) => ({ url: '/finance/customers/search', params: params ?? undefined }),
      providesTags: ['Customer'],
    }),

    // Accounting
    getDayBook: b.query<{ data: DayBookResponse }, { from: string; to: string; shopId?: string }>({
      query: (params) => ({ url: '/finance/accounting/day-book', params }),
      providesTags: ['Bill', 'Expense', 'VendorPayment', 'BankTransaction'],
    }),
    getTrialBalance: b.query<
      { data: TrialBalanceResponse },
      { asOf?: string; shopId?: string } | void
    >({
      query: (params) => ({
        url: '/finance/accounting/trial-balance',
        params: params ?? undefined,
      }),
      providesTags: ['Bill', 'Expense', 'VendorPayment', 'BankTransaction', 'Vendor'],
    }),
    getBalanceSheet: b.query<{ data: BalanceSheetResponse }, { asOf?: string } | void>({
      query: (params) => ({
        url: '/finance/accounting/balance-sheet',
        params: params ?? undefined,
      }),
      providesTags: ['Bill', 'Expense', 'VendorPayment', 'BankTransaction', 'Vendor'],
    }),
    getLedger: b.query<
      { data: LedgerResponse },
      { account: string; from: string; to: string }
    >({
      query: (params) => ({ url: '/finance/accounting/ledger', params }),
      providesTags: ['Bill', 'Expense', 'VendorPayment', 'BankTransaction'],
    }),

    // COGS breakdown by month
    getCogs: b.query<
      { data: CogsMonthRow[] },
      { from: string; to: string; shopId?: string }
    >({
      query: (params) => ({ url: '/finance/cogs', params }),
      providesTags: ['Bill'],
    }),

    // Returns / refunds
    getReturns: b.query<
      { data: ReturnsResponse },
      { from: string; to: string; shopId?: string; limit?: number }
    >({
      query: (params) => ({ url: '/finance/returns', params }),
      providesTags: ['Bill'],
    }),

    // Revenue by category / sub-category / item
    getRevenueByCategory: b.query<
      { data: RevenueByCategoryResponse },
      { from: string; to: string; shopId?: string }
    >({
      query: (params) => ({ url: '/finance/revenue-by-category', params }),
      providesTags: ['Bill'],
    }),
  }),
});

export const {
  useGetFinanceSummaryQuery,
  useGetDailySalesQuery,
  useGetPlQuery,
  useGetGstSummaryQuery,
  useGetGstBillsQuery,
  useGetGstHsnSummaryQuery,
  useGetExpensesQuery,
  useGetExpensesByCategoryQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
  useGetGoldLoansQuery,
  useCreateGoldLoanMutation,
  useAddGoldLoanRepaymentMutation,
  useGetReconciliationExpectedQuery,
  useGetReconciliationsQuery,
  useCreateReconciliationMutation,
  useGetPayrollQuery,
  useCreatePayrollMutation,
  useMarkPayrollPaidMutation,
  useGetVendorLedgerQuery,
  useGetVendorPaymentsQuery,
  useCreateVendorPaymentMutation,
  useGetVendorListQuery,
  useGetAdvanceSummaryQuery,
  useGetBankAccountsQuery,
  useCreateBankAccountMutation,
  useGetBankTransactionsQuery,
  useCreateBankTransactionMutation,
  useGetFinancialYearQuery,
  useGetFinanceStaffQuery,
  useGetDayBookQuery,
  useGetTrialBalanceQuery,
  useGetBalanceSheetQuery,
  useGetLedgerQuery,
  useSearchCustomersQuery,
  useGetCogsQuery,
  useGetReturnsQuery,
  useGetRevenueByCategoryQuery,
} = financeApi;
