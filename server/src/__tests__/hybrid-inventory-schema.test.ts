// Schema contract tests for the hybrid inventory work:
//   - AddStockSchema (POST /inventory/items/:id/add-stock)
//   - TransferCreateSchema with the new `lines` shape (per-line quantity)
//   - ShopSchema.type / ShopTypeSchema
//
// State machine + DB behavior is tested separately in the e2e suite; this
// file pins the API contract so it can't silently regress.

import { describe, expect, it } from 'vitest';
import {
  AddStockSchema,
  TransferCreateSchema,
  ShopSchema,
  ShopTypeSchema,
  ItemInputSchema,
} from '@goldos/shared/schemas';

const CUID = 'clxxxxxxxxxxxxxxxxxxxxxxxx'; // 26 chars, satisfies CuidSchema min

describe('AddStockSchema', () => {
  it('accepts a minimum valid request', () => {
    const parsed = AddStockSchema.parse({ quantity: 1 });
    expect(parsed.quantity).toBe(1);
    expect(parsed.reason).toBeUndefined();
    expect(parsed.costPricePaise).toBeUndefined();
  });

  it('accepts a full request with reason + cost override', () => {
    const parsed = AddStockSchema.parse({
      quantity: 50,
      reason: 'Restock from vendor Rajesh',
      costPricePaise: 6_400_000,
    });
    expect(parsed.quantity).toBe(50);
    expect(parsed.reason).toBe('Restock from vendor Rajesh');
    expect(parsed.costPricePaise).toBe(6_400_000);
  });

  it('rejects zero or negative quantity', () => {
    expect(() => AddStockSchema.parse({ quantity: 0 })).toThrow();
    expect(() => AddStockSchema.parse({ quantity: -5 })).toThrow();
  });

  it('rejects non-integer quantity', () => {
    expect(() => AddStockSchema.parse({ quantity: 1.5 })).toThrow();
  });

  it('caps quantity at 10000 so a typo cannot blow up the transaction', () => {
    expect(() => AddStockSchema.parse({ quantity: 10_001 })).toThrow();
    expect(AddStockSchema.parse({ quantity: 10_000 }).quantity).toBe(10_000);
  });

  it('rejects negative cost price override', () => {
    expect(() => AddStockSchema.parse({ quantity: 1, costPricePaise: -1 })).toThrow();
  });

  it('caps reason at 200 chars', () => {
    expect(() =>
      AddStockSchema.parse({ quantity: 1, reason: 'A'.repeat(201) }),
    ).toThrow();
    expect(
      AddStockSchema.parse({ quantity: 1, reason: 'A'.repeat(200) }).reason,
    ).toHaveLength(200);
  });
});

describe('TransferCreateSchema — lines / itemIds shapes', () => {
  const base = {
    fromShopId: CUID,
    toShopId: CUID.replace('x', 'y'),
    reason: 'Festive distribution',
  };

  it('accepts the legacy itemIds shape (qty=1 each)', () => {
    const parsed = TransferCreateSchema.parse({
      ...base,
      itemIds: [CUID.replace('x', 'a'), CUID.replace('x', 'b')],
    });
    expect(parsed.itemIds).toHaveLength(2);
    expect(parsed.lines).toBeUndefined();
  });

  it('accepts the new lines shape with explicit quantity', () => {
    const parsed = TransferCreateSchema.parse({
      ...base,
      lines: [
        { itemId: CUID.replace('x', 'a'), quantity: 1 },
        { itemId: CUID.replace('x', 'b'), quantity: 20 },
      ],
    });
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines?.[1]?.quantity).toBe(20);
  });

  it('defaults line quantity to 1 when omitted', () => {
    const parsed = TransferCreateSchema.parse({
      ...base,
      lines: [{ itemId: CUID.replace('x', 'a') }],
    });
    expect(parsed.lines?.[0]?.quantity).toBe(1);
  });

  it('rejects passing both itemIds and lines simultaneously', () => {
    expect(() =>
      TransferCreateSchema.parse({
        ...base,
        itemIds: [CUID.replace('x', 'a')],
        lines: [{ itemId: CUID.replace('x', 'b'), quantity: 2 }],
      }),
    ).toThrow();
  });

  it('rejects passing neither itemIds nor lines', () => {
    expect(() => TransferCreateSchema.parse(base)).toThrow();
  });

  it('rejects zero quantity on a line', () => {
    expect(() =>
      TransferCreateSchema.parse({
        ...base,
        lines: [{ itemId: CUID.replace('x', 'a'), quantity: 0 }],
      }),
    ).toThrow();
  });

  it('caps line quantity at 10000', () => {
    expect(() =>
      TransferCreateSchema.parse({
        ...base,
        lines: [{ itemId: CUID.replace('x', 'a'), quantity: 10_001 }],
      }),
    ).toThrow();
  });
});

describe('ShopTypeSchema + ShopSchema.type', () => {
  it('accepts WAREHOUSE and RETAIL', () => {
    expect(ShopTypeSchema.parse('WAREHOUSE')).toBe('WAREHOUSE');
    expect(ShopTypeSchema.parse('RETAIL')).toBe('RETAIL');
  });

  it('rejects unknown shop types', () => {
    expect(() => ShopTypeSchema.parse('STORAGE')).toThrow();
    expect(() => ShopTypeSchema.parse('shop')).toThrow();
  });

  it('defaults Shop.type to RETAIL when omitted', () => {
    const parsed = ShopSchema.parse({
      id: CUID,
      tenantId: CUID,
      name: 'Camp Branch',
      address: '12 Main Road, Camp, Pune',
      gstStateCode: '27',
      phone: '+919876543210',
      isActive: true,
      isWarehouse: false,
    });
    expect(parsed.type).toBe('RETAIL');
  });

  it('round-trips an explicit WAREHOUSE type', () => {
    const parsed = ShopSchema.parse({
      id: CUID,
      tenantId: CUID,
      name: 'Central Warehouse',
      address: 'MIDC Bhosari, Pune',
      gstStateCode: '27',
      phone: '+919876543211',
      isActive: true,
      isWarehouse: true,
      type: 'WAREHOUSE',
    });
    expect(parsed.type).toBe('WAREHOUSE');
    expect(parsed.isWarehouse).toBe(true);
  });
});

describe('ItemInputSchema — publishToWebsite flag', () => {
  const baseItem = {
    shopId: CUID,
    categoryId: CUID,
    sku: 'DW-0001',
    barcodeData: 'DW-0001',
    name: 'Floral pendant',
    images: ['https://example.com/img.jpg'],
    weightMg: 8000,
    purityCaratX100: 2200,
    hallmarkStatus: 'CERTIFIED' as const,
    costPricePaise: 500_000,
    isSerialized: true,
    quantityOnHand: 1,
  };

  it('defaults publishToWebsite to false when omitted', () => {
    const parsed = ItemInputSchema.parse(baseItem);
    expect(parsed.publishToWebsite).toBe(false);
  });

  it('accepts publishToWebsite=true', () => {
    const parsed = ItemInputSchema.parse({ ...baseItem, publishToWebsite: true });
    expect(parsed.publishToWebsite).toBe(true);
  });

  it('rejects non-boolean publishToWebsite', () => {
    expect(() =>
      ItemInputSchema.parse({ ...baseItem, publishToWebsite: 'yes' }),
    ).toThrow();
  });
});
