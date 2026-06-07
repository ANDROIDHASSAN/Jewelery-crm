// Profit & Loss statement — revenue side / expense side / net. Date range
// is in the consumer's URL search params (see FinancePage). Print-ready
// markup so "print to PDF" produces a clean CA-style report.

import { useMemo, useState } from 'react';
import { Download, Printer, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { ChartCard, CurrencyBarChart, RankedBarChart, CurrencyDonutChart } from '@/components/ui/charts';
import { useGetPlQuery, useGetCogsQuery, useGetRevenueByCategoryQuery } from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString, printSection, downloadTallyExport } from '@/features/finance/lib/export';
import { FilterRow, ShopPicker, DateInput } from '@/features/finance/components/FinanceFilters';
import { toast } from 'sonner';

function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProfitLossSection(): JSX.Element {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);

  const fromIso = new Date(from).toISOString();
  const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();

  const { data, isLoading } = useGetPlQuery({ from: fromIso, to: toIso, shopId });
  const pl = data?.data;

  const { data: cogsData } = useGetCogsQuery({ from: fromIso, to: toIso, shopId });
  const cogs = cogsData?.data ?? [];

  const { data: revCatData } = useGetRevenueByCategoryQuery({ from: fromIso, to: toIso, shopId });
  const revCat = revCatData?.data;

  const expensesByCategory = pl?.expensesByCategory ?? [];
  const expenseChartData = useMemo(
    () =>
      expensesByCategory
        .slice()
        .sort((a, b) => b.amountPaise - a.amountPaise)
        .slice(0, 8)
        .map((c) => ({
          label: c.category,
          revenue: c.classification === 'REVENUE' ? c.amountPaise : 0,
          capital: c.classification === 'CAPITAL' ? c.amountPaise : 0,
        })),
    [expensesByCategory],
  );

  function handleCsvExport(): void {
    if (!pl) return;
    const header = ['P&L Statement', `${from} to ${to}`];
    const rows: (string | number)[][] = [
      header,
      [],
      ['Section', 'Line', 'Amount (₹)'],
      ['Revenue', 'Gross billed (incl. GST)', paiseToRupeeString(pl.revenuePaise)],
      ['Revenue', 'GST collected', paiseToRupeeString(pl.gstPaise)],
      ['Revenue', 'Net revenue (excl. GST)', paiseToRupeeString(pl.grossRevenuePaise)],
      ['Revenue', 'Making charges', paiseToRupeeString(pl.makingChargesPaise)],
      ['Revenue', 'Discounts given', paiseToRupeeString(pl.discountPaise)],
      ['Revenue', 'Old-gold value accepted', paiseToRupeeString(pl.oldGoldPaise)],
      [],
      ['Expense', 'Revenue expenses', paiseToRupeeString(pl.revenueExpensePaise)],
      ['Expense', 'Capital expenses', paiseToRupeeString(pl.capitalExpensePaise)],
      ['Expense', 'Total expenses', paiseToRupeeString(pl.expensePaise)],
      [],
      ['Result', 'Net profit / loss (excl. GST, excl. capex)', paiseToRupeeString(pl.netPaise)],
      [],
      ['Expense breakdown by category'],
      ['Category', 'Type', 'Count', 'Amount (₹)'],
      ...expensesByCategory.map((c) => [
        c.category,
        c.classification,
        c.count,
        paiseToRupeeString(c.amountPaise),
      ]),
    ];
    downloadCsv(`pl-${from}-to-${to}.csv`, rows);
  }

  async function handleTallyExport(): Promise<void> {
    try {
      await downloadTallyExport(
        new Date(from).toISOString(),
        new Date(`${to}T23:59:59.999Z`).toISOString(),
      );
      toast.success('Tally CSV downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <ShopPicker value={shopId} onChange={setShopId} />
        <div className="flex items-end gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={!pl}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => printSection('pl-print', 'P&L')}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleTallyExport()}>
            <FileText className="h-4 w-4" /> Tally
          </Button>
        </div>
      </FilterRow>

      <div id="pl-print">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            label="Net revenue"
            value={pl ? <Money paise={pl.grossRevenuePaise} /> : isLoading ? '…' : '—'}
            delta={
              pl && (pl.ecomRevenuePaise ?? 0) > 0
                ? { value: `POS + ${pl.ecomOrderCount} online orders`, direction: 'flat' }
                : { value: `${from} → ${to}`, direction: 'flat' }
            }
            tone="success"
          />
          <MetricCard
            label="Revenue expenses"
            value={pl ? <Money paise={pl.revenueExpensePaise} /> : '—'}
            tone="warning"
          />
          <MetricCard
            label="Capital expenses"
            value={pl ? <Money paise={pl.capitalExpensePaise} /> : '—'}
            tone="neutral"
            delta={{ value: 'Excluded from P&L', direction: 'flat' }}
          />
          <MetricCard
            label="Net profit"
            value={pl ? <Money paise={pl.netPaise} /> : '—'}
            tone={pl ? (pl.netPaise >= 0 ? 'success' : 'danger') : 'neutral'}
            delta={
              pl
                ? {
                    value:
                      pl.grossRevenuePaise > 0
                        ? `${((pl.netPaise / pl.grossRevenuePaise) * 100).toFixed(1)}% margin`
                        : '—',
                    direction: pl.netPaise >= 0 ? 'up' : 'down',
                  }
                : undefined
            }
          />
        </section>

        {/* P&L statement (CA style) */}
        <section className="mt-4 rounded-md border border-ink-100 bg-ink-0">
          <header className="px-4 py-3 border-b border-ink-100">
            <p className="text-eyebrow uppercase text-ink-500">Statement</p>
            <h2 className="text-md font-medium text-ink-900">Profit &amp; loss summary</h2>
          </header>
          <div className="divide-y divide-ink-100">
            <PlGroup title="Income">
              <PlLine label="Gross billed — POS (incl. GST)" paise={pl?.posRevenuePaise ?? 0} muted />
              {(pl?.ecomRevenuePaise ?? 0) > 0 && (
                <PlLine label={`Gross billed — Online (incl. GST) · ${pl?.ecomOrderCount ?? 0} orders`} paise={pl?.ecomRevenuePaise ?? 0} muted />
              )}
              <PlLine label="Total gross billed" paise={pl?.revenuePaise ?? 0} />
              <PlLine label="Less: GST collected" paise={-(pl?.gstPaise ?? 0)} muted />
              <PlLine
                label="Net revenue"
                paise={pl?.grossRevenuePaise ?? 0}
                strong
              />
              <PlLine
                label="Making charges included (POS)"
                paise={pl?.makingChargesPaise ?? 0}
                muted
              />
              {(pl?.ecomShippingPaise ?? 0) > 0 && (
                <PlLine label="Shipping collected (Online)" paise={pl?.ecomShippingPaise ?? 0} muted />
              )}
              <PlLine label="Discounts given" paise={pl?.discountPaise ?? 0} muted />
              <PlLine label="Old-gold value accepted" paise={pl?.oldGoldPaise ?? 0} muted />
            </PlGroup>
            <PlGroup title="Expenditure">
              <PlLine label="Revenue expenses" paise={pl?.revenueExpensePaise ?? 0} />
              <PlLine
                label="Capital expenses (booked separately)"
                paise={pl?.capitalExpensePaise ?? 0}
                muted
              />
              <PlLine
                label="Total recorded expenses"
                paise={pl?.expensePaise ?? 0}
                strong
              />
            </PlGroup>
            <PlGroup title="Result">
              <PlLine
                label="Net profit / loss (operating)"
                paise={pl?.netPaise ?? 0}
                strong
                tone={pl ? (pl.netPaise >= 0 ? 'success' : 'danger') : undefined}
              />
            </PlGroup>
          </div>
        </section>

        {expenseChartData.length > 0 && (
          <ChartCard
            className="mt-4"
            title="Expense breakdown — revenue vs capital"
            eyebrow="Categories"
          >
            <CurrencyBarChart
              data={expenseChartData}
              series={[
                { key: 'revenue', name: 'Revenue', color: '#6E695F' },
                { key: 'capital', name: 'Capital', color: '#C99B2A' },
              ]}
              height={240}
            />
          </ChartCard>
        )}

        {/* COGS breakdown */}
        {cogs.length > 0 && (
          <ChartCard
            className="mt-4"
            title="Cost of goods — metal / making / stone"
            eyebrow="COGS"
          >
            <CurrencyBarChart
              data={cogs.map((r) => ({
                label: r.label,
                metal: r.metalCostPaise,
                making: r.makingChargesPaise,
                stone: r.stoneChargesPaise,
              }))}
              series={[
                { key: 'metal', name: 'Metal value', color: '#C99B2A' },
                { key: 'making', name: 'Making charges', color: '#6E695F' },
                { key: 'stone', name: 'Stone charges', color: '#A16207' },
              ]}
              height={260}
            />
          </ChartCard>
        )}
      </div>

      {/* Revenue by category */}
      {revCat && (
        <section className="space-y-3 sm:space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {revCat.byMainCategory.length > 0 && (
              <ChartCard title="Revenue by category" eyebrow="Category">
                <CurrencyDonutChart
                  data={revCat.byMainCategory.map((c) => ({
                    label: c.category,
                    value: c.revenuePaise,
                  }))}
                  height={240}
                  centerLabel="Total"
                  centerValue={`₹${(revCat.byMainCategory.reduce((s, c) => s + c.revenuePaise, 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                />
              </ChartCard>
            )}
            {revCat.bySubCategory.length > 0 && (
              <ChartCard title="Revenue by sub-category" eyebrow="Sub-category">
                <RankedBarChart
                  data={revCat.bySubCategory.map((c) => ({
                    label: c.subCategory,
                    value: c.revenuePaise,
                    sub: c.mainCategory,
                  }))}
                  height={Math.max(160, revCat.bySubCategory.length * 36)}
                  unit="currency"
                  name="Revenue"
                />
              </ChartCard>
            )}
          </div>
          {revCat.topItems.length > 0 && (
            <ChartCard title="Top 10 items by revenue" eyebrow="Items">
              <RankedBarChart
                data={revCat.topItems.map((i) => ({
                  label: i.itemName,
                  value: i.revenuePaise,
                  sub: i.categoryName,
                }))}
                height={Math.max(160, revCat.topItems.length * 36)}
                unit="currency"
                name="Revenue"
              />
            </ChartCard>
          )}
        </section>
      )}
    </div>
  );
}

function PlGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="px-4 py-3 sm:py-4">
      <p className="text-eyebrow uppercase text-ink-500 mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PlLine({
  label,
  paise,
  strong = false,
  muted = false,
  tone,
}: {
  label: string;
  paise: number;
  strong?: boolean;
  muted?: boolean;
  tone?: 'success' | 'danger';
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span
        className={
          strong
            ? 'text-ink-900 font-medium'
            : muted
              ? 'text-ink-500'
              : 'text-ink-700'
        }
      >
        {label}
      </span>
      <Money
        paise={paise}
        className={
          tone === 'success'
            ? 'text-success-700 font-semibold'
            : tone === 'danger'
              ? 'text-danger-700 font-semibold'
              : strong
                ? 'text-ink-900 font-semibold'
                : muted
                  ? 'text-ink-500'
                  : 'text-ink-800'
        }
      />
    </div>
  );
}
