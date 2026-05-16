// Accounting reports — Day Book, Trial Balance, Balance Sheet, General
// Ledger. These derive double-entry style vouchers from existing data
// (bills, expenses, vendor payments, bank txns, gold loans, advances)
// without persisting a separate Journal table. Persistence comes in v2
// when we ship a proper Tally-style ledger.
//
// Chart of accounts (Indian small-business convention):
//
//   Assets
//     1010  Cash on hand           (POS cash sales - cash expenses)
//     1020  Bank — <nickname>      (one per BankAccount row)
//     1110  Inventory at cost      (sum of Item.costPricePaise where IN_STOCK)
//     1120  Sundry Debtors         (unpaid bills - PARTIAL / PENDING)
//     1210  Gold loans receivable  (outstanding principal)
//   Liabilities
//     2010  Sundry Creditors       (vendor outstandings)
//     2110  Customer Advances      (active advances)
//     2210  GST Payable            (CGST + SGST + IGST - GST paid as expense)
//   Equity
//     3010  Owner's Capital        (plug, derived from balance-sheet identity)
//     3110  Retained Earnings      (cumulative net profit prior to period)
//   Income
//     4010  Sales — Gold/Silver    (totalPaise - GST)
//     4020  Making Charges         (separate revenue line, info only)
//   Expenses
//     5xxx  By category (Rent, Salaries, …)
//     5910  Capital Expenditure    (CAPITAL classification — info only,
//                                   NOT a P&L expense; lands on balance sheet)

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';

export const accountingRouter: Router = Router();

function noTenant(res: { status: (n: number) => { json: (b: unknown) => void } }): void {
  res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } });
}

function startOfFy(d: Date): Date {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 3, 1));
}

// =====================================================================
// DAY BOOK — chronological list of every voucher in a date range
// =====================================================================
// Each voucher mirrors what a Tally day book shows: date, voucher type,
// ledger, debit/credit, narration. We derive these on the fly from the
// underlying domain rows so the day book always reflects current data.

interface DayBookVoucher {
  date: string;
  voucherType: 'SALE' | 'EXPENSE' | 'VENDOR_PAYMENT' | 'BANK' | 'GOLD_LOAN' | 'REPAYMENT' | 'ADVANCE';
  voucherNumber: string;
  party: string;
  narration: string;
  debitAccount: string;
  creditAccount: string;
  amountPaise: number;
}

accountingRouter.get('/day-book', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const shopWhere = q.shopId ? { shopId: q.shopId } : {};

    const [bills, expenses, vendorPayments, bankTxns, loans, repayments, advances] =
      await Promise.all([
        prisma.bill.findMany({
          where: { createdAt: { gte: q.from, lte: q.to }, voidedAt: null, ...shopWhere },
          select: {
            id: true,
            billNumber: true,
            createdAt: true,
            totalPaise: true,
            cgstPaise: true,
            sgstPaise: true,
            igstPaise: true,
            customer: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.expense.findMany({
          where: { paidAt: { gte: q.from, lte: q.to }, ...shopWhere },
          select: {
            id: true,
            paidAt: true,
            amountPaise: true,
            category: true,
            classification: true,
            paymentMode: true,
            notes: true,
            vendor: { select: { name: true } },
          },
          orderBy: { paidAt: 'asc' },
        }),
        prisma.vendorPayment.findMany({
          where: { paidAt: { gte: q.from, lte: q.to } },
          include: { vendor: { select: { name: true } } },
          orderBy: { paidAt: 'asc' },
        }),
        prisma.bankTransaction.findMany({
          where: { occurredAt: { gte: q.from, lte: q.to } },
          include: { account: { select: { nickname: true } } },
          orderBy: { occurredAt: 'asc' },
        }),
        prisma.goldLoan.findMany({
          where: {
            // No createdAt on GoldLoan; treat dueAt as the issuance proxy
            // shifted by 12 months would be misleading — just include all
            // ACTIVE/PARTIAL/CLOSED loans whose status changed in range
            // would require event log. For v1 we list ACTIVE loans only
            // (so they show up as "in custody"). Closed loans appear via
            // their repayments.
            status: { in: ['ACTIVE', 'PARTIALLY_REPAID'] },
          },
          include: { customer: { select: { name: true } } },
        }),
        prisma.goldLoanRepayment.findMany({
          where: { paidAt: { gte: q.from, lte: q.to } },
          include: {
            loan: { include: { customer: { select: { name: true } } } },
          },
          orderBy: { paidAt: 'asc' },
        }),
        prisma.advance.findMany({
          where: { createdAt: { gte: q.from, lte: q.to } },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    const vouchers: DayBookVoucher[] = [];

    for (const b of bills) {
      const taxable = b.totalPaise - b.cgstPaise - b.sgstPaise - b.igstPaise;
      vouchers.push({
        date: b.createdAt.toISOString(),
        voucherType: 'SALE',
        voucherNumber: b.billNumber,
        party: b.customer?.name ?? 'Walk-in',
        narration: 'Jewellery sale',
        debitAccount: 'Customer / Bank',
        creditAccount: 'Sales A/c',
        amountPaise: taxable,
      });
      if (b.cgstPaise + b.sgstPaise > 0) {
        vouchers.push({
          date: b.createdAt.toISOString(),
          voucherType: 'SALE',
          voucherNumber: b.billNumber,
          party: b.customer?.name ?? 'Walk-in',
          narration: 'CGST + SGST collected',
          debitAccount: 'Customer / Bank',
          creditAccount: 'GST Payable',
          amountPaise: b.cgstPaise + b.sgstPaise,
        });
      }
      if (b.igstPaise > 0) {
        vouchers.push({
          date: b.createdAt.toISOString(),
          voucherType: 'SALE',
          voucherNumber: b.billNumber,
          party: b.customer?.name ?? 'Walk-in',
          narration: 'IGST collected',
          debitAccount: 'Customer / Bank',
          creditAccount: 'GST Payable',
          amountPaise: b.igstPaise,
        });
      }
    }

    for (const e of expenses) {
      const ledger = e.classification === 'CAPITAL' ? `${e.category} (Fixed Asset)` : e.category;
      vouchers.push({
        date: e.paidAt.toISOString(),
        voucherType: 'EXPENSE',
        voucherNumber: `EXP-${e.id.slice(-6).toUpperCase()}`,
        party: e.vendor?.name ?? '—',
        narration: e.notes ?? e.category,
        debitAccount: ledger,
        creditAccount: e.paymentMode === 'CASH' ? 'Cash on hand' : 'Bank A/c',
        amountPaise: e.amountPaise,
      });
    }

    for (const v of vendorPayments) {
      vouchers.push({
        date: v.paidAt.toISOString(),
        voucherType: 'VENDOR_PAYMENT',
        voucherNumber: `VP-${v.id.slice(-6).toUpperCase()}`,
        party: v.vendor.name,
        narration: v.notes ?? 'Vendor payment',
        debitAccount: `Vendor: ${v.vendor.name}`,
        creditAccount: v.paymentMode === 'CASH' ? 'Cash on hand' : 'Bank A/c',
        amountPaise: v.amountPaise,
      });
    }

    for (const t of bankTxns) {
      vouchers.push({
        date: t.occurredAt.toISOString(),
        voucherType: 'BANK',
        voucherNumber: t.referenceId ?? `BT-${t.id.slice(-6).toUpperCase()}`,
        party: t.account.nickname,
        narration: t.description,
        debitAccount: t.direction === 'CREDIT' ? `Bank: ${t.account.nickname}` : t.description,
        creditAccount: t.direction === 'CREDIT' ? t.description : `Bank: ${t.account.nickname}`,
        amountPaise: t.amountPaise,
      });
    }

    for (const l of loans) {
      // No issuance date stored; skip in day-book until we add it. Loan
      // outstandings still feed Trial Balance + Balance Sheet via principal.
      void l;
    }

    for (const r of repayments) {
      vouchers.push({
        date: r.paidAt.toISOString(),
        voucherType: 'REPAYMENT',
        voucherNumber: `GLR-${r.id.slice(-6).toUpperCase()}`,
        party: r.loan.customer.name,
        narration: 'Gold loan repayment',
        debitAccount: 'Cash / Bank',
        creditAccount: 'Gold loans receivable',
        amountPaise: r.amountPaise,
      });
    }

    for (const a of advances) {
      vouchers.push({
        date: a.createdAt.toISOString(),
        voucherType: 'ADVANCE',
        voucherNumber: a.receiptNumber,
        party: a.customer.name,
        narration: a.notes ?? 'Customer advance receipt',
        debitAccount: 'Cash / Bank',
        creditAccount: 'Customer Advances',
        amountPaise: a.amountPaise,
      });
    }

    vouchers.sort((a, b) => a.date.localeCompare(b.date));

    const totalDebits = vouchers.reduce((acc, v) => acc + v.amountPaise, 0);
    const totalCredits = totalDebits; // double-entry — equal by construction

    res.json({
      data: {
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        vouchers,
        totals: {
          voucherCount: vouchers.length,
          debitPaise: totalDebits,
          creditPaise: totalCredits,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// TRIAL BALANCE — list of every ledger account with debit/credit total
// =====================================================================

accountingRouter.get('/trial-balance', async (req, res, next) => {
  try {
    const q = z
      .object({
        asOf: z.coerce.date().optional(),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const asOf = q.asOf ?? new Date();
    const shopWhere = q.shopId ? { shopId: q.shopId } : {};

    const [
      bankAccounts,
      billAgg,
      expenseAgg,
      expensesByCat,
      vendorAgg,
      goldLoans,
      advanceAgg,
      itemCostAgg,
    ] = await Promise.all([
      prisma.bankAccount.findMany({ where: { isActive: true } }),
      prisma.bill.aggregate({
        where: { createdAt: { lte: asOf }, voidedAt: null, ...shopWhere },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true, makingChargesPaise: true },
      }),
      prisma.expense.aggregate({
        where: { paidAt: { lte: asOf }, ...shopWhere },
        _sum: { amountPaise: true },
      }),
      prisma.expense.groupBy({
        by: ['category', 'classification'],
        where: { paidAt: { lte: asOf }, ...shopWhere },
        _sum: { amountPaise: true },
      }),
      prisma.vendor.aggregate({ _sum: { outstandingPaise: true } }),
      prisma.goldLoan.findMany({
        where: { status: { in: ['ACTIVE', 'PARTIALLY_REPAID'] } },
        include: { repayments: true },
      }),
      prisma.advance.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { amountPaise: true },
      }),
      // Inventory at cost — approximate book value of stock on hand. v1
      // uses Item.costPricePaise; v2 will move to weighted-average per
      // category once we ship inventory valuation properly.
      prisma.item.aggregate({
        where: { status: 'IN_STOCK', ...shopWhere },
        _sum: { costPricePaise: true },
        _count: { _all: true },
      }),
    ]);

    // Bank balance per account.
    const bankTxnAgg = await prisma.bankTransaction.groupBy({
      by: ['accountId', 'direction'],
      where: { occurredAt: { lte: asOf } },
      _sum: { amountPaise: true },
    });
    const bankCredits = new Map<string, number>();
    const bankDebits = new Map<string, number>();
    for (const r of bankTxnAgg) {
      const sum = r._sum.amountPaise ?? 0;
      if (r.direction === 'CREDIT') bankCredits.set(r.accountId, sum);
      else bankDebits.set(r.accountId, sum);
    }

    const totalBankBalance = bankAccounts.reduce(
      (acc, a) =>
        acc + a.openingBalancePaise + (bankCredits.get(a.id) ?? 0) - (bankDebits.get(a.id) ?? 0),
      0,
    );

    // Cash on hand — sum of cash payments on bills MINUS cash expenses MINUS
    // cash vendor payments. Rough but matches what a shopowner expects.
    const cashIn = await prisma.$queryRaw<Array<{ amt: bigint }>>`
      SELECT COALESCE(SUM(p."amountPaise"),0)::bigint AS amt
      FROM "Payment" p
      JOIN "Bill" b ON b."id" = p."billId"
      WHERE b."tenantId" = ${tenantId}
        AND b."createdAt" <= ${asOf}
        AND b."voidedAt" IS NULL
        AND p."mode" = 'CASH'
    `;
    const cashExpAgg = await prisma.expense.aggregate({
      where: { paidAt: { lte: asOf }, paymentMode: 'CASH' },
      _sum: { amountPaise: true },
    });
    const cashVendorAgg = await prisma.vendorPayment.aggregate({
      where: { paidAt: { lte: asOf }, paymentMode: 'CASH' },
      _sum: { amountPaise: true },
    });
    const cashOnHand =
      Number(cashIn[0]?.amt ?? 0n) -
      (cashExpAgg._sum.amountPaise ?? 0) -
      (cashVendorAgg._sum.amountPaise ?? 0);

    // Gold-loan outstanding principal.
    const goldLoanOutstanding = goldLoans.reduce((acc, l) => {
      const repaid = l.repayments.reduce((s, r) => s + r.amountPaise, 0);
      return acc + Math.max(0, l.principalPaise - repaid);
    }, 0);

    // Revenue / capital expense split.
    const revenueExpenseByCat = new Map<string, number>();
    let capitalExpenseTotal = 0;
    for (const g of expensesByCat) {
      const amt = g._sum.amountPaise ?? 0;
      if (g.classification === 'CAPITAL') {
        capitalExpenseTotal += amt;
      } else {
        revenueExpenseByCat.set(g.category, (revenueExpenseByCat.get(g.category) ?? 0) + amt);
      }
    }

    const grossRevenue =
      (billAgg._sum.totalPaise ?? 0) -
      (billAgg._sum.cgstPaise ?? 0) -
      (billAgg._sum.sgstPaise ?? 0) -
      (billAgg._sum.igstPaise ?? 0);
    const gstCollected =
      (billAgg._sum.cgstPaise ?? 0) + (billAgg._sum.sgstPaise ?? 0) + (billAgg._sum.igstPaise ?? 0);
    const revenueExpensePaise = Array.from(revenueExpenseByCat.values()).reduce((a, b) => a + b, 0);
    const inventoryAtCost = itemCostAgg._sum.costPricePaise ?? 0;
    const vendorDues = vendorAgg._sum.outstandingPaise ?? 0;
    const advancesOutstanding = advanceAgg._sum.amountPaise ?? 0;

    // Sundry debtors — unpaid portion of bills. Compute as totalPaise of
    // bills with payment_status != PAID, minus payments already received.
    const debtorBills = await prisma.bill.findMany({
      where: {
        createdAt: { lte: asOf },
        voidedAt: null,
        paymentStatus: { in: ['PARTIAL', 'PENDING'] },
        ...shopWhere,
      },
      select: {
        totalPaise: true,
        payments: { select: { amountPaise: true } },
      },
    });
    const debtorsPaise = debtorBills.reduce((acc, b) => {
      const paid = b.payments.reduce((s, p) => s + p.amountPaise, 0);
      return acc + Math.max(0, b.totalPaise - paid);
    }, 0);

    // Build the trial-balance rows. Convention: positive = debit, negative
    // would be credit; we store as separate fields for clarity.
    interface TbRow {
      code: string;
      name: string;
      group: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
      debitPaise: number;
      creditPaise: number;
    }
    const rows: TbRow[] = [];
    // Assets (debit balances)
    rows.push({ code: '1010', name: 'Cash on hand', group: 'Asset', debitPaise: Math.max(0, cashOnHand), creditPaise: cashOnHand < 0 ? -cashOnHand : 0 });
    for (const a of bankAccounts) {
      const bal =
        a.openingBalancePaise + (bankCredits.get(a.id) ?? 0) - (bankDebits.get(a.id) ?? 0);
      rows.push({
        code: `1020-${a.accountLast4}`,
        name: `Bank — ${a.nickname}`,
        group: 'Asset',
        debitPaise: Math.max(0, bal),
        creditPaise: bal < 0 ? -bal : 0,
      });
    }
    rows.push({ code: '1110', name: 'Inventory at cost', group: 'Asset', debitPaise: inventoryAtCost, creditPaise: 0 });
    rows.push({ code: '1120', name: 'Sundry Debtors', group: 'Asset', debitPaise: debtorsPaise, creditPaise: 0 });
    rows.push({ code: '1210', name: 'Gold loans receivable', group: 'Asset', debitPaise: goldLoanOutstanding, creditPaise: 0 });
    rows.push({ code: '1310', name: 'Fixed assets (capital)', group: 'Asset', debitPaise: capitalExpenseTotal, creditPaise: 0 });
    // Liabilities
    rows.push({ code: '2010', name: 'Sundry Creditors (Vendors)', group: 'Liability', debitPaise: 0, creditPaise: vendorDues });
    rows.push({ code: '2110', name: 'Customer Advances', group: 'Liability', debitPaise: 0, creditPaise: advancesOutstanding });
    rows.push({ code: '2210', name: 'GST Payable', group: 'Liability', debitPaise: 0, creditPaise: gstCollected });
    // Income
    rows.push({ code: '4010', name: 'Sales A/c', group: 'Income', debitPaise: 0, creditPaise: grossRevenue });
    rows.push({ code: '4020', name: 'Making charges (info)', group: 'Income', debitPaise: 0, creditPaise: billAgg._sum.makingChargesPaise ?? 0 });
    // Expenses (debit)
    let expenseCode = 5000;
    for (const [cat, amt] of Array.from(revenueExpenseByCat.entries()).sort()) {
      expenseCode += 10;
      rows.push({
        code: String(expenseCode),
        name: cat,
        group: 'Expense',
        debitPaise: amt,
        creditPaise: 0,
      });
    }

    const totalDebits = rows.reduce((a, r) => a + r.debitPaise, 0);
    const totalCredits = rows.reduce((a, r) => a + r.creditPaise, 0);
    const plug = totalDebits - totalCredits;
    // Owner's Equity balances the books. In real Tally it's broken into
    // capital + retained earnings; for v1 we present a single line.
    rows.push({
      code: '3010',
      name: 'Owner Equity (derived)',
      group: 'Equity',
      debitPaise: plug < 0 ? -plug : 0,
      creditPaise: plug > 0 ? plug : 0,
    });

    res.json({
      data: {
        asOf: asOf.toISOString(),
        rows,
        totals: {
          debitPaise: rows.reduce((a, r) => a + r.debitPaise, 0),
          creditPaise: rows.reduce((a, r) => a + r.creditPaise, 0),
        },
        meta: {
          revenueExpensePaise,
          capitalExpensePaise: capitalExpenseTotal,
          netIncomePaise: grossRevenue - revenueExpensePaise,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// BALANCE SHEET — Assets / Liabilities + Equity at a date
// =====================================================================

accountingRouter.get('/balance-sheet', async (req, res, next) => {
  try {
    const q = z.object({ asOf: z.coerce.date().optional() }).parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);
    const asOf = q.asOf ?? new Date();

    const [bankAccounts, billAgg, expenseAgg, vendorAgg, goldLoans, advanceAgg, itemCostAgg, debtorBills, capExpAgg] =
      await Promise.all([
        prisma.bankAccount.findMany({ where: { isActive: true } }),
        prisma.bill.aggregate({
          where: { createdAt: { lte: asOf }, voidedAt: null },
          _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        }),
        prisma.expense.aggregate({
          where: { paidAt: { lte: asOf }, classification: 'REVENUE' },
          _sum: { amountPaise: true },
        }),
        prisma.vendor.aggregate({ _sum: { outstandingPaise: true } }),
        prisma.goldLoan.findMany({
          where: { status: { in: ['ACTIVE', 'PARTIALLY_REPAID'] } },
          include: { repayments: true },
        }),
        prisma.advance.aggregate({ where: { status: 'ACTIVE' }, _sum: { amountPaise: true } }),
        prisma.item.aggregate({
          where: { status: 'IN_STOCK' },
          _sum: { costPricePaise: true },
        }),
        prisma.bill.findMany({
          where: {
            createdAt: { lte: asOf },
            voidedAt: null,
            paymentStatus: { in: ['PARTIAL', 'PENDING'] },
          },
          select: { totalPaise: true, payments: { select: { amountPaise: true } } },
        }),
        prisma.expense.aggregate({
          where: { paidAt: { lte: asOf }, classification: 'CAPITAL' },
          _sum: { amountPaise: true },
        }),
      ]);

    const bankTxnAgg = await prisma.bankTransaction.groupBy({
      by: ['accountId', 'direction'],
      where: { occurredAt: { lte: asOf } },
      _sum: { amountPaise: true },
    });
    const bankCredits = new Map<string, number>();
    const bankDebits = new Map<string, number>();
    for (const r of bankTxnAgg) {
      const sum = r._sum.amountPaise ?? 0;
      if (r.direction === 'CREDIT') bankCredits.set(r.accountId, sum);
      else bankDebits.set(r.accountId, sum);
    }
    const bankItems = bankAccounts.map((a) => ({
      label: `${a.nickname} ····${a.accountLast4}`,
      amountPaise:
        a.openingBalancePaise + (bankCredits.get(a.id) ?? 0) - (bankDebits.get(a.id) ?? 0),
    }));
    const bankTotal = bankItems.reduce((s, x) => s + x.amountPaise, 0);

    const cashIn = await prisma.$queryRaw<Array<{ amt: bigint }>>`
      SELECT COALESCE(SUM(p."amountPaise"),0)::bigint AS amt
      FROM "Payment" p
      JOIN "Bill" b ON b."id" = p."billId"
      WHERE b."tenantId" = ${tenantId}
        AND b."createdAt" <= ${asOf}
        AND b."voidedAt" IS NULL
        AND p."mode" = 'CASH'
    `;
    const cashExpAgg = await prisma.expense.aggregate({
      where: { paidAt: { lte: asOf }, paymentMode: 'CASH' },
      _sum: { amountPaise: true },
    });
    const cashVendorAgg = await prisma.vendorPayment.aggregate({
      where: { paidAt: { lte: asOf }, paymentMode: 'CASH' },
      _sum: { amountPaise: true },
    });
    const cashOnHand =
      Number(cashIn[0]?.amt ?? 0n) -
      (cashExpAgg._sum.amountPaise ?? 0) -
      (cashVendorAgg._sum.amountPaise ?? 0);

    const debtorsPaise = debtorBills.reduce((acc, b) => {
      const paid = b.payments.reduce((s, p) => s + p.amountPaise, 0);
      return acc + Math.max(0, b.totalPaise - paid);
    }, 0);
    const goldLoanOutstanding = goldLoans.reduce((acc, l) => {
      const repaid = l.repayments.reduce((s, r) => s + r.amountPaise, 0);
      return acc + Math.max(0, l.principalPaise - repaid);
    }, 0);
    const inventoryAtCost = itemCostAgg._sum.costPricePaise ?? 0;
    const capExp = capExpAgg._sum.amountPaise ?? 0;
    const grossRevenue =
      (billAgg._sum.totalPaise ?? 0) -
      (billAgg._sum.cgstPaise ?? 0) -
      (billAgg._sum.sgstPaise ?? 0) -
      (billAgg._sum.igstPaise ?? 0);
    const gstCollected =
      (billAgg._sum.cgstPaise ?? 0) + (billAgg._sum.sgstPaise ?? 0) + (billAgg._sum.igstPaise ?? 0);
    const revenueExpense = expenseAgg._sum.amountPaise ?? 0;
    const vendorDues = vendorAgg._sum.outstandingPaise ?? 0;
    const advancesOut = advanceAgg._sum.amountPaise ?? 0;
    const netIncome = grossRevenue - revenueExpense;

    // Current assets
    const currentAssets = [
      { label: 'Cash on hand', amountPaise: cashOnHand },
      ...bankItems.map((b) => ({ label: b.label, amountPaise: b.amountPaise })),
      { label: 'Inventory at cost', amountPaise: inventoryAtCost },
      { label: 'Sundry Debtors', amountPaise: debtorsPaise },
      { label: 'Gold loans receivable', amountPaise: goldLoanOutstanding },
    ];
    const currentAssetsTotal = currentAssets.reduce((s, x) => s + x.amountPaise, 0);
    const fixedAssets = [{ label: 'Fixed assets (capital expenditure)', amountPaise: capExp }];
    const fixedAssetsTotal = fixedAssets.reduce((s, x) => s + x.amountPaise, 0);
    const totalAssets = currentAssetsTotal + fixedAssetsTotal;

    // Current liabilities
    const currentLiabilities = [
      { label: 'Sundry Creditors (vendors)', amountPaise: vendorDues },
      { label: 'Customer Advances', amountPaise: advancesOut },
      { label: 'GST Payable', amountPaise: gstCollected },
    ];
    const currentLiabilitiesTotal = currentLiabilities.reduce((s, x) => s + x.amountPaise, 0);

    // Equity = total assets - liabilities. Net income shown as a sub-line.
    const ownerEquity = totalAssets - currentLiabilitiesTotal;
    const equity = [
      { label: 'Net income (current period)', amountPaise: netIncome },
      { label: 'Owner Capital (derived)', amountPaise: ownerEquity - netIncome },
    ];
    const equityTotal = equity.reduce((s, x) => s + x.amountPaise, 0);
    const totalLiabAndEquity = currentLiabilitiesTotal + equityTotal;

    res.json({
      data: {
        asOf: asOf.toISOString(),
        assets: {
          current: currentAssets,
          currentTotal: currentAssetsTotal,
          fixed: fixedAssets,
          fixedTotal: fixedAssetsTotal,
          total: totalAssets,
        },
        liabilities: {
          current: currentLiabilities,
          currentTotal: currentLiabilitiesTotal,
        },
        equity: {
          rows: equity,
          total: equityTotal,
        },
        balanced: Math.abs(totalAssets - totalLiabAndEquity) < 100,
        liabilitiesPlusEquity: totalLiabAndEquity,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// LEDGER — drill into one account by name slug
// =====================================================================
// Slugs handled: cash, bank-<accountId>, sales, gst, vendor-<vendorId>,
// expense-<category>, gold-loans, advances.

accountingRouter.get('/ledger', async (req, res, next) => {
  try {
    const q = z
      .object({
        account: z.string(),
        from: z.coerce.date(),
        to: z.coerce.date(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    type Entry = {
      date: string;
      narration: string;
      voucher: string;
      debitPaise: number;
      creditPaise: number;
    };
    const entries: Entry[] = [];

    if (q.account === 'sales') {
      const bills = await prisma.bill.findMany({
        where: { createdAt: { gte: q.from, lte: q.to }, voidedAt: null },
        select: {
          billNumber: true,
          createdAt: true,
          totalPaise: true,
          cgstPaise: true,
          sgstPaise: true,
          igstPaise: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      for (const b of bills) {
        entries.push({
          date: b.createdAt.toISOString(),
          narration: `Bill ${b.billNumber}`,
          voucher: b.billNumber,
          debitPaise: 0,
          creditPaise: b.totalPaise - b.cgstPaise - b.sgstPaise - b.igstPaise,
        });
      }
    } else if (q.account === 'gst') {
      const bills = await prisma.bill.findMany({
        where: { createdAt: { gte: q.from, lte: q.to }, voidedAt: null },
        select: { billNumber: true, createdAt: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const b of bills) {
        const tax = b.cgstPaise + b.sgstPaise + b.igstPaise;
        if (tax > 0) {
          entries.push({
            date: b.createdAt.toISOString(),
            narration: `Bill ${b.billNumber} — GST collected`,
            voucher: b.billNumber,
            debitPaise: 0,
            creditPaise: tax,
          });
        }
      }
    } else if (q.account === 'cash') {
      const cashPayments = await prisma.$queryRaw<
        Array<{ date: Date; bill: string; amt: bigint }>
      >`
        SELECT b."createdAt" AS date, b."billNumber" AS bill, p."amountPaise"::bigint AS amt
        FROM "Payment" p
        JOIN "Bill" b ON b."id" = p."billId"
        WHERE b."tenantId" = ${tenantId}
          AND b."createdAt" BETWEEN ${q.from} AND ${q.to}
          AND b."voidedAt" IS NULL
          AND p."mode" = 'CASH'
        ORDER BY b."createdAt" ASC
      `;
      for (const p of cashPayments) {
        entries.push({
          date: new Date(p.date).toISOString(),
          narration: `Cash received on bill ${p.bill}`,
          voucher: p.bill,
          debitPaise: Number(p.amt),
          creditPaise: 0,
        });
      }
      const cashExp = await prisma.expense.findMany({
        where: { paidAt: { gte: q.from, lte: q.to }, paymentMode: 'CASH' },
        select: { id: true, paidAt: true, amountPaise: true, category: true, notes: true },
        orderBy: { paidAt: 'asc' },
      });
      for (const e of cashExp) {
        entries.push({
          date: e.paidAt.toISOString(),
          narration: e.notes ?? e.category,
          voucher: `EXP-${e.id.slice(-6).toUpperCase()}`,
          debitPaise: 0,
          creditPaise: e.amountPaise,
        });
      }
    } else if (q.account.startsWith('bank-')) {
      const accountId = q.account.slice('bank-'.length);
      const txns = await prisma.bankTransaction.findMany({
        where: { accountId, occurredAt: { gte: q.from, lte: q.to } },
        orderBy: { occurredAt: 'asc' },
      });
      for (const t of txns) {
        entries.push({
          date: t.occurredAt.toISOString(),
          narration: t.description,
          voucher: t.referenceId ?? `BT-${t.id.slice(-6).toUpperCase()}`,
          debitPaise: t.direction === 'CREDIT' ? t.amountPaise : 0,
          creditPaise: t.direction === 'DEBIT' ? t.amountPaise : 0,
        });
      }
    } else if (q.account.startsWith('vendor-')) {
      const vendorId = q.account.slice('vendor-'.length);
      const payments = await prisma.vendorPayment.findMany({
        where: { vendorId, paidAt: { gte: q.from, lte: q.to } },
        orderBy: { paidAt: 'asc' },
      });
      for (const p of payments) {
        entries.push({
          date: p.paidAt.toISOString(),
          narration: p.notes ?? 'Vendor payment',
          voucher: `VP-${p.id.slice(-6).toUpperCase()}`,
          debitPaise: p.amountPaise,
          creditPaise: 0,
        });
      }
    } else if (q.account.startsWith('expense-')) {
      const category = q.account.slice('expense-'.length);
      const exp = await prisma.expense.findMany({
        where: { category, paidAt: { gte: q.from, lte: q.to } },
        select: { id: true, paidAt: true, amountPaise: true, notes: true },
        orderBy: { paidAt: 'asc' },
      });
      for (const e of exp) {
        entries.push({
          date: e.paidAt.toISOString(),
          narration: e.notes ?? category,
          voucher: `EXP-${e.id.slice(-6).toUpperCase()}`,
          debitPaise: e.amountPaise,
          creditPaise: 0,
        });
      }
    } else if (q.account === 'gold-loans') {
      const reps = await prisma.goldLoanRepayment.findMany({
        where: { paidAt: { gte: q.from, lte: q.to } },
        include: { loan: { include: { customer: { select: { name: true } } } } },
        orderBy: { paidAt: 'asc' },
      });
      for (const r of reps) {
        entries.push({
          date: r.paidAt.toISOString(),
          narration: `Repayment — ${r.loan.customer.name}`,
          voucher: `GLR-${r.id.slice(-6).toUpperCase()}`,
          debitPaise: 0,
          creditPaise: r.amountPaise,
        });
      }
    } else if (q.account === 'advances') {
      const adv = await prisma.advance.findMany({
        where: { createdAt: { gte: q.from, lte: q.to } },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      for (const a of adv) {
        entries.push({
          date: a.createdAt.toISOString(),
          narration: `Advance — ${a.customer.name}`,
          voucher: a.receiptNumber,
          debitPaise: 0,
          creditPaise: a.amountPaise,
        });
      }
    }

    // Running balance.
    let running = 0;
    const withBalance = entries.map((e) => {
      running += e.debitPaise - e.creditPaise;
      return { ...e, balancePaise: running };
    });

    res.json({
      data: {
        account: q.account,
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        entries: withBalance,
        totals: {
          debitPaise: entries.reduce((a, e) => a + e.debitPaise, 0),
          creditPaise: entries.reduce((a, e) => a + e.creditPaise, 0),
          closingBalancePaise: running,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Use Prisma to silence unused import in some compile configs.
void Prisma;
