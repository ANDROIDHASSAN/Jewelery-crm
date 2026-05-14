import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import type { Item } from '@goldos/shared/types';
import { useGetItemsQuery, useGetCategoriesQuery } from '@/features/inventory/inventoryApi';
import { DataTable } from '@/components/data/DataTable';
import { Button } from '@/components/ui/button';
import { Money, Weight, Purity } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet';

export function InventoryPage(): JSX.Element {
  const { data, isLoading } = useGetItemsQuery({});
  const { data: catRes } = useGetCategoriesQuery();
  const [selected, setSelected] = useState<Item | null>(null);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of catRes?.data ?? []) map.set(c.id, c.name);
    return map;
  }, [catRes?.data]);

  const columns = useMemo<ColumnDef<Item>[]>(
    () => [
      { accessorKey: 'sku', header: 'SKU', cell: (i) => <span className="font-mono text-xs">{String(i.getValue())}</span> },
      {
        accessorKey: 'categoryId',
        header: 'Category',
        cell: (i) => categoryNameById.get(String(i.getValue())) ?? '—',
      },
      {
        accessorKey: 'weightMg',
        header: () => <span className="block text-right">Weight</span>,
        cell: (i) => <div className="text-right"><Weight mg={Number(i.getValue())} /></div>,
      },
      {
        accessorKey: 'purityCaratX100',
        header: 'Purity',
        cell: (i) => <Purity x100={Number(i.getValue())} />,
      },
      {
        accessorKey: 'hallmarkStatus',
        header: 'Hallmark',
        cell: (i) => {
          const v = String(i.getValue());
          const tone =
            v === 'CERTIFIED' ? 'success' : v === 'PENDING' ? 'warning' : v === 'SUBMITTED' ? 'info' : 'neutral';
          return <Badge tone={tone as 'success' | 'warning' | 'info' | 'neutral'}>{v.toLowerCase()}</Badge>;
        },
      },
      {
        accessorKey: 'costPricePaise',
        header: () => <span className="block text-right">Cost</span>,
        cell: (i) => <div className="text-right"><Money paise={Number(i.getValue())} /></div>,
      },
    ],
    [categoryNameById],
  );

  return (
    <>
      <div className="space-y-4">
        <header className="flex items-end justify-between">
          <div>
            <p className="text-eyebrow uppercase text-ink-500">Stock & inventory</p>
            <h1 className="font-display text-display-sm text-ink-900">Items</h1>
          </div>
          <Button>
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        </header>

        {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
        {!isLoading && (!data || data.data.length === 0) && (
          <EmptyState
            eyebrow="No items yet"
            title="Your inventory will appear here."
            body="Add your first item or bulk-import from Excel. Hallmarking status, weight, purity, and live valuation update automatically."
            action={<Button>Bulk import from Excel</Button>}
          />
        )}
        {data && data.data.length > 0 && (
          <DataTable columns={columns} data={data.data} onRowClick={(r) => setSelected(r)} />
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selected?.sku}</SheetTitle>
          </SheetHeader>
          {selected && (
            <SheetBody>
              <dl className="space-y-3 text-sm">
                <Row label="Weight"><Weight mg={selected.weightMg} /></Row>
                <Row label="Purity"><Purity x100={selected.purityCaratX100} /></Row>
                <Row label="Cost price"><Money paise={selected.costPricePaise} /></Row>
                <Row label="Hallmark"><Badge tone="success">{selected.hallmarkStatus.toLowerCase()}</Badge></Row>
              </dl>
            </SheetBody>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 pb-2 last:border-b-0">
      <dt className="text-ink-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
