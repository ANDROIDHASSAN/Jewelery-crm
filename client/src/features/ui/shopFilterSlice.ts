// Global shop scope picked from the top-bar ShopSwitcher. null = "All shops"
// (no filter). Persisted to localStorage so reloads keep the operator's last
// view; reconciliation against the live shop list happens in ShopSwitcher
// (a stale id from a deleted/renamed shop falls back to the first active
// shop or to null).
//
// Down-stream pages opt in by reading useSelectedShopId() and passing it to
// their query. Pages that don't opt in keep their current behaviour, so this
// landing breaks nothing.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useAppSelector } from '@/app/hooks';

const STORAGE_KEY = 'goldos:selectedShopId';

interface ShopFilterState {
  /** Live shop id selected in the top-bar dropdown. null = consolidated. */
  shopId: string | null;
}

function readPersisted(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // We persisted as a raw string; older builds may have written 'null'
    // literally so guard against it.
    return raw === 'null' || raw === '' ? null : raw;
  } catch {
    return null;
  }
}

const slice = createSlice({
  name: 'shopFilter',
  initialState: { shopId: readPersisted() } as ShopFilterState,
  reducers: {
    setSelectedShopId(state, action: PayloadAction<string | null>) {
      state.shopId = action.payload;
      if (typeof window !== 'undefined') {
        try {
          if (action.payload) window.localStorage.setItem(STORAGE_KEY, action.payload);
          else window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore quota / private-mode errors */
        }
      }
    },
  },
});

export const { setSelectedShopId } = slice.actions;
export const shopFilterReducer = slice.reducer;

/** Convenience hook so pages don't have to know the slice path. */
export function useSelectedShopId(): string | null {
  return useAppSelector((s) => s.shopFilter.shopId);
}
