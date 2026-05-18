// Finance & Accounting — Gold OS multi-shop financial control center.
//
// One page, 12 in-page sections selected by ?tab=… (we keep the admin
// router shallow; sections lazy-load on demand). Header is sticky on tall
// screens, sub-tab strip scrolls on phones.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { FinanceTabs } from '@/features/finance/components/FinanceTabs';
import { OverviewSection } from '@/features/finance/sections/OverviewSection';
import { ProfitLossSection } from '@/features/finance/sections/ProfitLossSection';
import { DailySalesSection } from '@/features/finance/sections/DailySalesSection';
import { GstSection } from '@/features/finance/sections/GstSection';
import { ExpensesSection } from '@/features/finance/sections/ExpensesSection';
import { ReconciliationSection } from '@/features/finance/sections/ReconciliationSection';
import { VendorsSection } from '@/features/finance/sections/VendorsSection';
import { PayrollSection } from '@/features/finance/sections/PayrollSection';
import { GoldLoansSection } from '@/features/finance/sections/GoldLoansSection';
import { BankSection } from '@/features/finance/sections/BankSection';
import { AdvancesSection } from '@/features/finance/sections/AdvancesSection';
import { FinancialYearSection } from '@/features/finance/sections/FinancialYearSection';
import { DayBookSection } from '@/features/finance/sections/DayBookSection';
import { TrialBalanceSection } from '@/features/finance/sections/TrialBalanceSection';
import { BalanceSheetSection } from '@/features/finance/sections/BalanceSheetSection';
import { LedgerSection } from '@/features/finance/sections/LedgerSection';
import { AddExpenseDialog } from '@/features/finance/components/AddExpenseDialog';
import { ShopPicker } from '@/features/finance/components/FinanceFilters';
import { downloadTallyExport } from '@/features/finance/lib/export';
import { hasPermission } from '@/features/auth/authSlice';
import { useAppSelector } from '@/app/hooks';
import { useGetFinanceSummaryQuery } from '@/features/finance/financeApi';

type TabKey =
  | 'overview'
  | 'pl'
  | 'daily'
  | 'gst'
  | 'expenses'
  | 'reconcile'
  | 'vendors'
  | 'payroll'
  | 'loans'
  | 'bank'
  | 'advances'
  | 'fy'
  // Accounting reports (Tally-style)
  | 'daybook'
  | 'trial'
  | 'balance'
  | 'ledger';

const TAB_DEFS: Array<{ key: TabKey; label: string; eyebrow: string; title: string }> = [
  { key: 'overview', label: 'Overview', eyebrow: 'Finance & accounting', title: 'Multi-shop P&L' },
  { key: 'pl', label: 'P&L', eyebrow: 'Statement', title: 'Profit & loss statement' },
  { key: 'daily', label: 'Daily Sales', eyebrow: 'Operations', title: 'Daily sales summary' },
  { key: 'gst', label: 'GST', eyebrow: 'Tax', title: 'GST reports' },
  { key: 'expenses', label: 'Expenses', eyebrow: 'Ledger', title: 'Expense tracking' },
  { key: 'reconcile', label: 'Reconciliation', eyebrow: 'Day close', title: 'Cash / UPI / Card reconciliation' },
  { key: 'vendors', label: 'Vendors', eyebrow: 'Payables', title: 'Vendor ledger' },
  { key: 'payroll', label: 'Payroll', eyebrow: 'Staff', title: 'Payroll register' },
  { key: 'loans', label: 'Gold Loans', eyebrow: 'Loans', title: 'Gold loan tracking' },
  { key: 'bank', label: 'Bank', eyebrow: 'Banking', title: 'Bank accounts' },
  { key: 'advances', label: 'Advances', eyebrow: 'Customer', title: 'Advance receipts' },
  { key: 'fy', label: 'Yearly', eyebrow: 'Annual', title: 'Financial year report' },
  // Accounting block — Tally-style reports for the CA / accountant.
  { key: 'daybook', label: 'Day Book', eyebrow: 'Accounting', title: 'Day book — chronological vouchers' },
  { key: 'trial', label: 'Trial Balance', eyebrow: 'Accounting', title: 'Trial balance' },
  { key: 'balance', label: 'Balance Sheet', eyebrow: 'Accounting', title: 'Balance sheet' },
  { key: 'ledger', label: 'Ledger', eyebrow: 'Accounting', title: 'General ledger' },
];

function tabLink(key: TabKey): string {
  return `/admin/finance?tab=${key}`;
}

export function FinancePage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabKey | null;
  const activeTab: TabKey = useMemo(() => {
    const valid = TAB_DEFS.find((t) => t.key === tabParam);
    return (valid?.key ?? 'overview') as TabKey;
  }, [tabParam]);
  const def = TAB_DEFS.find((t) => t.key === activeTab) ?? TAB_DEFS[0]!;

  const user = useAppSelector((s) => s.auth.user);
  const canExpenseWrite = hasPermission(user, 'finance.expense_write');
  const canExport = hasPermission(user, 'finance.ledger_export');

  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  // Reset URL to `?tab=...` when query string is missing, so sharable links
  // always carry the section.
  useEffect(() => {
    if (!tabParam) {
      const next = new URLSearchParams(params);
      next.set('tab', 'overview');
      setParams(next, { replace: true });
    }
  }, [tabParam, params, setParams]);

  // Use the MTD window from finance summary for the Tally button — same
  // window the dashboard tiles show.
  const { data: summaryRes } = useGetFinanceSummaryQuery(undefined, {
    skip: activeTab !== 'overview' && activeTab !== 'pl',
  });
  const mtd = summaryRes?.data.mtd;

  async function handleTallyExport(): Promise<void> {
    try {
      const now = new Date();
      const from = mtd?.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const to = mtd?.to ?? now.toISOString();
      await downloadTallyExport(from, to);
      toast.success('Tally CSV downloaded');
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={def.eyebrow}
        title={def.title}
        actions={
          <>
            {activeTab === 'overview' && (
              <div className="min-w-[200px]">
                <ShopPicker value={shopId} onChange={setShopId} label="Branch view" />
              </div>
            )}
            {canExpenseWrite && (
              <Button variant="outline" onClick={() => setAddExpenseOpen(true)}>
                <Plus className="h-4 w-4" /> Add expense
              </Button>
            )}
            {canExport && (
              <Button variant="outline" onClick={() => void handleTallyExport()}>
                <Download className="h-4 w-4" /> Tally export
              </Button>
            )}
          </>
        }
        bare
      />

      <FinanceTabs
        tabs={TAB_DEFS.map((t) => ({ to: tabLink(t.key), label: t.label, end: false }))}
      />

      {/* Active section */}
      <div>
        {activeTab === 'overview' && <OverviewSection shopId={shopId} />}
        {activeTab === 'pl' && <ProfitLossSection />}
        {activeTab === 'daily' && <DailySalesSection />}
        {activeTab === 'gst' && <GstSection />}
        {activeTab === 'expenses' && <ExpensesSection />}
        {activeTab === 'reconcile' && <ReconciliationSection />}
        {activeTab === 'vendors' && <VendorsSection />}
        {activeTab === 'payroll' && <PayrollSection />}
        {activeTab === 'loans' && <GoldLoansSection />}
        {activeTab === 'bank' && <BankSection />}
        {activeTab === 'advances' && <AdvancesSection />}
        {activeTab === 'fy' && <FinancialYearSection />}
        {activeTab === 'daybook' && <DayBookSection />}
        {activeTab === 'trial' && <TrialBalanceSection />}
        {activeTab === 'balance' && <BalanceSheetSection />}
        {activeTab === 'ledger' && <LedgerSection />}
      </div>

      <AddExpenseDialog open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)} />
    </div>
  );
}
