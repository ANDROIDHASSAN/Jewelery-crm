// Top-bar shop scope picker. Data-driven — reads the live shop list from
// /shops so renames in Team & Roles propagate here within one refetch. The
// previous version (Day-1 placeholder) hardcoded fake shop ids ('shop-main',
// 'shop-branch') in a local useState so selecting one did nothing and a
// real-shop rename never showed up. The new flow:
//
//   1. useGetShopsQuery() — RTK Query keeps the dropdown in sync with the
//      DB. Mutations on /shops invalidate the list tag, so an Edit shop
//      action in Team & Roles refreshes this dropdown automatically.
//   2. setSelectedShopId — Redux slice persists the choice to localStorage
//      so reloads stay on the same scope. Pages opt in via
//      useSelectedShopId() (Dashboard already does).
//   3. Stale-id reconciliation — if the persisted id no longer exists
//      (deleted, rename created a new id), we fall back to "All shops"
//      silently. Nothing breaks if a saved id is gone.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronsUpDown, Store } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useAppDispatch } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import {
  setSelectedShopId,
  useSelectedShopId,
} from '@/features/ui/shopFilterSlice';

const ALL_SHOPS_LABEL = 'All shops (consolidated)';

export function ShopSwitcher(): JSX.Element {
  const dispatch = useAppDispatch();
  const selectedShopId = useSelectedShopId();
  const { data: shopsRes, isLoading } = useGetShopsQuery();

  // Only active shops belong in the picker. Deactivated shops still exist
  // in the DB (we soft-delete) but a cashier picking one would just see an
  // empty dashboard.
  const shops = useMemo(
    () => (shopsRes?.data ?? []).filter((s) => s.isActive !== false),
    [shopsRes?.data],
  );

  // Reconcile persisted id with the live list. If the saved id isn't in the
  // current shop set (rename created a new id, or shop was deactivated /
  // removed), clear it so we fall back to "All shops". This avoids the
  // dropdown showing a label that doesn't exist on the server.
  useEffect(() => {
    if (!shopsRes) return;
    if (selectedShopId && !shops.some((s) => s.id === selectedShopId)) {
      dispatch(setSelectedShopId(null));
    }
  }, [shopsRes, shops, selectedShopId, dispatch]);

  const activeLabel =
    shops.find((s) => s.id === selectedShopId)?.name ?? ALL_SHOPS_LABEL;

  function selectShop(id: string | null): void {
    dispatch(setSelectedShopId(id));
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex items-center gap-2 h-9 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm text-ink-800 hover:bg-ink-50 transition-colors duration-fast"
      >
        <Store className="h-4 w-4 text-ink-500" aria-hidden />
        <span className="hidden sm:inline">
          {isLoading && shops.length === 0 ? 'Loading shops…' : activeLabel}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-ink-400 ml-1" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-40 min-w-[240px] rounded-md border border-ink-100 bg-ink-0 p-1 shadow-md"
          sideOffset={6}
          align="start"
        >
          {shops.map((shop) => (
            <DropdownMenu.Item
              key={shop.id}
              onSelect={() => selectShop(shop.id)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm text-ink-700 outline-none cursor-pointer',
                'data-[highlighted]:bg-ink-50 data-[highlighted]:text-ink-900',
              )}
            >
              <span>{shop.name}</span>
              {selectedShopId === shop.id && (
                <Check className="h-3.5 w-3.5 text-brand-500" />
              )}
            </DropdownMenu.Item>
          ))}
          {shops.length > 0 && (
            <DropdownMenu.Separator className="my-1 h-px bg-ink-100" />
          )}
          <DropdownMenu.Item
            onSelect={() => selectShop(null)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm text-ink-700 outline-none cursor-pointer',
              'data-[highlighted]:bg-ink-50 data-[highlighted]:text-ink-900',
            )}
          >
            <span>{ALL_SHOPS_LABEL}</span>
            {selectedShopId === null && (
              <Check className="h-3.5 w-3.5 text-brand-500" />
            )}
          </DropdownMenu.Item>
          {shops.length === 0 && !isLoading && (
            <p className="px-2.5 py-1.5 text-xs text-ink-500 italic">
              No shops registered yet. Add one in Team & roles → Shops.
            </p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
