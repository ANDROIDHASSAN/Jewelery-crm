import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronsUpDown, Store } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

// Day 1: static shops. D5 wires this to shopsApi.
const shops = [
  { id: 'shop-main', name: 'Main Showroom — Pune' },
  { id: 'shop-branch', name: 'Camp Branch — Pune' },
  { id: 'all', name: 'All shops (consolidated)' },
];

export function ShopSwitcher(): JSX.Element {
  const [current, setCurrent] = useState(shops[0]!);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex items-center gap-2 h-9 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm text-ink-800 hover:bg-ink-50 transition-colors duration-fast"
      >
        <Store className="h-4 w-4 text-ink-500" aria-hidden />
        <span className="hidden sm:inline">{current.name}</span>
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
              onSelect={() => setCurrent(shop)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm text-ink-700 outline-none cursor-pointer',
                'data-[highlighted]:bg-ink-50 data-[highlighted]:text-ink-900',
              )}
            >
              <span>{shop.name}</span>
              {current.id === shop.id && <Check className="h-3.5 w-3.5 text-brand-500" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
