import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import {
  useListCouponsQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useDeleteCouponMutation,
  type AdminCoupon,
  type CouponCreateInput,
} from './promotionsApi';

const COUPON_TYPE_LABELS: Record<AdminCoupon['type'], string> = {
  PERCENT: '% Off',
  FIXED: 'Fixed',
  FREE_SHIPPING: 'Free Ship',
  BXGY: 'BxGy',
  FIRST_ORDER: '1st Order',
};

// Convert a YYYY-MM-DD date-input string to a full ISO datetime the backend accepts.
// Already-full datetime strings are passed through unchanged.
function toIsoDateTime(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00.000Z`;
}

// Build the payload sent to the API — converts date strings and strips empties.
function buildPayload(fields: CouponCreateInput): CouponCreateInput {
  return {
    ...fields,
    code: fields.code?.trim().toUpperCase() ?? '',
    validFrom: toIsoDateTime(fields.validFrom ?? undefined),
    validUntil: fields.validUntil ? toIsoDateTime(fields.validUntil) : null,
  };
}

const EMPTY_FORM: CouponCreateInput = {
  code: '',
  type: 'PERCENT',
  valueBps: 1000,
  valuePaise: 0,
  maxDiscountPaise: null,
  minCartPaise: 0,
  usageLimitTotal: null,
  usageLimitPerCustomer: null,
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: null,
  stackable: true,
  isActive: true,
  // Off by default — a new code is private until the jeweller chooses to
  // advertise it.
  showOnStorefront: false,
};

/**
 * Whether a coupon can actually be redeemed right now, and why not.
 *
 * `isActive` is only ONE of the gates. A coupon can be flagged Active and still
 * be dead — expired, not started, or used up — and the storefront feed
 * (/website/coupons) checks all of them. Showing plain "Active" here hid that:
 * an expired code looked healthy, and its absence from the announcement bar
 * looked like a bug in the bar.
 *
 * Keep the gates in step with `websiteRouter.get('/coupons')`.
 */
function couponState(c: AdminCoupon): {
  label: string;
  tone: 'success' | 'neutral' | 'warning';
  redeemable: boolean;
} {
  if (!c.isActive) return { label: 'Inactive', tone: 'neutral', redeemable: false };
  const now = Date.now();
  if (c.validUntil && new Date(c.validUntil).getTime() < now) {
    return { label: 'Expired', tone: 'warning', redeemable: false };
  }
  if (c.validFrom && new Date(c.validFrom).getTime() > now) {
    return { label: 'Scheduled', tone: 'warning', redeemable: false };
  }
  if (c.usageLimitTotal != null && c.usageCount >= c.usageLimitTotal) {
    return { label: 'Used up', tone: 'warning', redeemable: false };
  }
  return { label: 'Active', tone: 'success', redeemable: true };
}

function editingToForm(c: AdminCoupon): CouponCreateInput {
  return {
    code: c.code,
    type: c.type,
    valueBps: c.valueBps,
    valuePaise: c.valuePaise,
    maxDiscountPaise: c.maxDiscountPaise,
    minCartPaise: c.minCartPaise,
    usageLimitTotal: c.usageLimitTotal,
    usageLimitPerCustomer: c.usageLimitPerCustomer,
    validFrom: c.validFrom?.slice(0, 10) ?? '',
    validUntil: c.validUntil?.slice(0, 10) ?? null,
    stackable: c.stackable,
    isActive: c.isActive,
    showOnStorefront: c.showOnStorefront,
  };
}

export function CouponsAdminTab(): JSX.Element {
  const { data: coupons = [], isLoading } = useListCouponsQuery();
  const [createCoupon, { isLoading: creating }] = useCreateCouponMutation();
  const [updateCoupon, { isLoading: updating }] = useUpdateCouponMutation();
  const [deleteCoupon] = useDeleteCouponMutation();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: AdminCoupon }>({ open: false });
  const [fields, setFields] = useState<CouponCreateInput>(EMPTY_FORM);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    setFields(dialog.editing ? editingToForm(dialog.editing) : EMPTY_FORM);
    setCodeError('');
  }, [dialog.editing, dialog.open]);

  const patch = (key: keyof CouponCreateInput, val: unknown): void =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const handleSave = async (): Promise<void> => {
    const code = fields.code?.trim() ?? '';
    if (code.length < 2) {
      setCodeError('Code must be at least 2 characters');
      return;
    }
    setCodeError('');
    const payload = buildPayload(fields);
    try {
      if (dialog.editing) {
        await updateCoupon({ id: dialog.editing.id, ...payload }).unwrap();
        toast.success('Coupon updated');
      } else {
        await createCoupon(payload).unwrap();
        toast.success(`Coupon "${code}" created`);
      }
      setDialog({ open: false });
    } catch (err) {
      const msg =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Failed to save coupon';
      toast.error(msg);
    }
  };

  const handleDeactivate = async (id: string): Promise<void> => {
    try {
      await deleteCoupon(id).unwrap();
      toast.success('Coupon deactivated');
    } catch {
      toast.error('Failed to deactivate');
    }
  };

  const isBusy = creating || updating;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-ink-900">Coupon codes</h3>
          <p className="text-sm text-ink-500 mt-0.5">Create discount codes for your storefront</p>
        </div>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus className="h-4 w-4" /> New coupon
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-400 py-8 text-center">Loading…</p>}

      {!isLoading && coupons.length === 0 && (
        <div className="rounded-lg border border-dashed border-ink-200 py-14 text-center text-ink-400 text-sm">
          No coupons yet — create one to offer discounts on your storefront.
        </div>
      )}

      {coupons.length > 0 && (
        <div className="rounded-lg border border-ink-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                {['Code', 'Type', 'Value', 'Used', 'Valid until', 'Status', 'Storefront', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-ink-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3 font-mono font-medium text-ink-900">{c.code}</td>
                  <td className="px-4 py-3">
                    <Badge tone="info">{COUPON_TYPE_LABELS[c.type]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {c.type === 'PERCENT' && `${(c.valueBps / 100).toFixed(0)}% off`}
                    {c.type === 'FIXED' && <Money paise={c.valuePaise} />}
                    {c.type === 'FREE_SHIPPING' && 'Free shipping'}
                    {c.type === 'FIRST_ORDER' && `${(c.valueBps / 100).toFixed(0)}% first order`}
                    {c.type === 'BXGY' && 'Buy X Get Y'}
                    {c.maxDiscountPaise != null && (
                      <span className="text-ink-400 ml-1">(max <Money paise={c.maxDiscountPaise} />)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-500">{c._count?.usages ?? c.usageCount}</td>
                  <td className="px-4 py-3 text-ink-500">
                    {c.validUntil ? new Date(c.validUntil).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {/* Status reflects whether the code can ACTUALLY be redeemed
                        right now, not just the isActive flag. It used to read
                        `isActive ? 'Active' : 'Inactive'`, so a coupon that
                        expired weeks ago still showed "Active" — which reads as
                        "this works" when it doesn't, and made an unadvertised
                        code look like a storefront bug. */}
                    {(() => {
                      const s = couponState(c);
                      return <Badge tone={s.tone}>{s.label}</Badge>;
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {/* Only meaningful while the code is actually redeemable — an
                        expired / not-yet-started / exhausted / inactive code is
                        never advertised whatever this flag says, so don't imply
                        it's live. */}
                    {c.showOnStorefront ? (
                      couponState(c).redeemable ? (
                        <Badge tone="success">On storefront</Badge>
                      ) : (
                        <Badge tone="neutral">On (not live)</Badge>
                      )
                    ) : (
                      <span className="text-ink-400">Private</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setDialog({ open: true, editing: c })}
                        className="p-1 rounded hover:bg-ink-100 text-ink-400 hover:text-ink-700"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {c.isActive && (
                        <button
                          onClick={() => void handleDeactivate(c.id)}
                          className="p-1 rounded hover:bg-error-50 text-ink-400 hover:text-error-600"
                          title="Deactivate"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog.Root open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false })}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:w-[520px] max-h-[90vh] overflow-y-auto bg-ink-0 rounded-lg shadow-xl border border-ink-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="font-semibold text-ink-900 text-base">
                {dialog.editing ? 'Edit coupon' : 'New coupon'}
              </Dialog.Title>
              <Dialog.Close className="p-1 rounded hover:bg-ink-100 text-ink-400">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-4">
              {/* Code + Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">
                    Code <span className="text-error-600">*</span>
                  </label>
                  <Input
                    value={fields.code ?? ''}
                    onChange={(e) => { patch('code', e.target.value.toUpperCase()); setCodeError(''); }}
                    placeholder="SAVE10"
                    className={`font-mono ${codeError ? 'border-error-400 focus:ring-error-400' : ''}`}
                  />
                  {codeError && <p className="text-xs text-error-600 mt-1">{codeError}</p>}
                </div>
                <div>
                  <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">
                    Type <span className="text-error-600">*</span>
                  </label>
                  <select
                    value={fields.type}
                    onChange={(e) => patch('type', e.target.value)}
                    className="h-9 w-full rounded-md border border-ink-200 px-3 text-sm bg-ink-0 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="PERCENT">Percentage off</option>
                    <option value="FIXED">Fixed amount off</option>
                    <option value="FREE_SHIPPING">Free shipping</option>
                    <option value="FIRST_ORDER">First order %</option>
                    <option value="BXGY">Buy X Get Y</option>
                  </select>
                </div>
              </div>

              {/* Value fields */}
              {(fields.type === 'PERCENT' || fields.type === 'FIRST_ORDER') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">Discount %</label>
                    <Input
                      type="number" min={1} max={100}
                      value={(fields.valueBps ?? 0) / 100}
                      onChange={(e) => patch('valueBps', Math.round(Number(e.target.value) * 100))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">Max discount (₹)</label>
                    <Input
                      type="number" min={0}
                      value={fields.maxDiscountPaise != null ? fields.maxDiscountPaise / 100 : ''}
                      onChange={(e) =>
                        patch('maxDiscountPaise', e.target.value ? Math.round(Number(e.target.value) * 100) : null)
                      }
                      placeholder="No cap"
                    />
                  </div>
                </div>
              )}

              {fields.type === 'FIXED' && (
                <div>
                  <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">
                    Discount amount (₹)
                  </label>
                  <Input
                    type="number" min={0}
                    value={(fields.valuePaise ?? 0) / 100}
                    onChange={(e) => patch('valuePaise', Math.round(Number(e.target.value) * 100))}
                  />
                </div>
              )}

              {/* Cart limits */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">Min cart value (₹)</label>
                  <Input
                    type="number" min={0}
                    value={(fields.minCartPaise ?? 0) / 100}
                    onChange={(e) => patch('minCartPaise', Math.round(Number(e.target.value) * 100))}
                    placeholder="0 = no min"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">Total uses (limit)</label>
                  <Input
                    type="number" min={0}
                    value={fields.usageLimitTotal ?? ''}
                    onChange={(e) => patch('usageLimitTotal', e.target.value ? Number(e.target.value) : null)}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              {/* Validity dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">Valid from</label>
                  <Input
                    type="date"
                    value={fields.validFrom?.slice(0, 10) ?? ''}
                    onChange={(e) => patch('validFrom', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-500 uppercase tracking-wide block mb-1">Valid until</label>
                  <Input
                    type="date"
                    value={fields.validUntil?.slice(0, 10) ?? ''}
                    onChange={(e) => patch('validUntil', e.target.value || null)}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                  <input
                    type="checkbox"
                    checked={fields.stackable ?? true}
                    onChange={(e) => patch('stackable', e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 accent-brand-500"
                  />
                  Stackable with loyalty points
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                  <input
                    type="checkbox"
                    checked={fields.isActive ?? true}
                    onChange={(e) => patch('isActive', e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 accent-brand-500"
                  />
                  Active
                </label>
              </div>
              {/* Publishing is separate from Active on purpose: Active only
                  means the code can be redeemed, and private codes (a goodwill
                  code for one customer, a partner code) are Active too. */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                  <input
                    type="checkbox"
                    checked={fields.showOnStorefront ?? false}
                    onChange={(e) => patch('showOnStorefront', e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 accent-brand-500"
                  />
                  Show on storefront
                </label>
                <p className="text-xs text-ink-500 mt-1 ml-6">
                  Advertises this code in the announcement bar at the top of the site, rotating with
                  today&apos;s metal rate. Leave off for private codes — anyone can see and use a
                  code once it&apos;s shown here.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-5 mt-5 border-t border-ink-100">
              <Dialog.Close asChild>
                <Button variant="outline" className="flex-1">Cancel</Button>
              </Dialog.Close>
              <Button onClick={() => void handleSave()} disabled={isBusy} className="flex-[2]">
                {isBusy ? 'Saving…' : dialog.editing ? 'Save changes' : 'Create coupon'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
