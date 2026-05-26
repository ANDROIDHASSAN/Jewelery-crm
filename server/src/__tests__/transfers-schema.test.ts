// Stock-transfer schema contract tests.
//
// The state machine itself is DB-coupled (Prisma + AsyncLocalStorage tenant
// scope), so it lives in the e2e suite. These tests pin the Zod validation
// rules so the API contract can't silently regress — same pattern as
// bill-math.test.ts.

import { describe, expect, it } from 'vitest';
import {
  TransferCreateSchema,
  TransferRejectSchema,
  TransferStatusSchema,
} from '@goldos/shared/schemas';

const CUID = 'clxxxxxxxxxxxxxxxxxxxxxxxx'; // 26 chars, satisfies CuidSchema min

describe('TransferCreateSchema', () => {
  const valid = {
    fromShopId: CUID,
    toShopId: CUID.replace('x', 'y'),
    itemIds: [CUID.replace('x', 'a'), CUID.replace('x', 'b')],
    reason: 'Festive distribution',
  };

  it('accepts a well-formed transfer request', () => {
    const parsed = TransferCreateSchema.parse(valid);
    expect(parsed.itemIds).toHaveLength(2);
    expect(parsed.notes ?? null).toBeNull();
  });

  it('rejects fromShopId === toShopId', () => {
    expect(() =>
      TransferCreateSchema.parse({ ...valid, toShopId: valid.fromShopId }),
    ).toThrow(/differ/i);
  });

  it('rejects empty itemIds', () => {
    expect(() => TransferCreateSchema.parse({ ...valid, itemIds: [] })).toThrow();
  });

  it('caps itemIds at 200 to bound the approve/complete txn', () => {
    const oversized = Array.from({ length: 201 }, (_, i) =>
      CUID.replace('x', String.fromCharCode(97 + (i % 26))).padEnd(26, '0'),
    );
    expect(() => TransferCreateSchema.parse({ ...valid, itemIds: oversized })).toThrow();
  });

  it('requires a non-empty reason', () => {
    expect(() => TransferCreateSchema.parse({ ...valid, reason: '' })).toThrow();
    expect(() => TransferCreateSchema.parse({ ...valid, reason: '  ' })).not.toThrow();
  });

  it('accepts optional notes up to 1000 chars', () => {
    const ok = TransferCreateSchema.parse({ ...valid, notes: 'A'.repeat(1000) });
    expect(ok.notes).toHaveLength(1000);
    expect(() => TransferCreateSchema.parse({ ...valid, notes: 'A'.repeat(1001) })).toThrow();
  });
});

describe('TransferRejectSchema', () => {
  it('requires a rejectionReason', () => {
    expect(() => TransferRejectSchema.parse({})).toThrow();
    expect(() => TransferRejectSchema.parse({ rejectionReason: '' })).toThrow();
    expect(TransferRejectSchema.parse({ rejectionReason: 'Wrong destination' }).rejectionReason).toBe(
      'Wrong destination',
    );
  });

  it('caps the reason at 400 chars', () => {
    expect(() => TransferRejectSchema.parse({ rejectionReason: 'A'.repeat(401) })).toThrow();
  });
});

describe('TransferStatusSchema', () => {
  it('enumerates the 4 workflow states', () => {
    for (const s of ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'] as const) {
      expect(TransferStatusSchema.parse(s)).toBe(s);
    }
    expect(() => TransferStatusSchema.parse('IN_TRANSIT')).toThrow();
    expect(() => TransferStatusSchema.parse('INITIATED')).toThrow();
  });
});
