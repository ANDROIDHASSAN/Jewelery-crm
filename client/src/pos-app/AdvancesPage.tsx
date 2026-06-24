// Advances / booking receipts: customer puts money down to lock today's
// rate against a future bridal order.

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Banknote, Plus, User, X } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/money';
import { useSearchPosCustomersQuery } from '@/features/pos/posApi';
import { useCreateAdvanceMutation, useListAdvancesQuery, useRefundAdvanceMutation } from './posFeaturesApi';

export function AdvancesPage(): JSX.Element {
  const [opening, setOpening] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const { data, isLoading } = useListAdvancesQuery({ shopId }, { skip: !shopId });
  const [refund] = useRefundAdvanceMutation();

  const rows = data?.data ?? [];

  async function onRefund(id: string): Promise<void> {
    if (!confirm('Refund this advance to the customer?')) return;
    try {
      await refund(id).unwrap();
      toast.success('Advance refunded');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Refund failed');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Bookings</p>
          <h2 className="font-display text-display-sm text-ink-900">Advances</h2>
          <p className="text-sm text-ink-500 mt-1">
            Customer paid up front to lock the rate. Apply against a future bill.
          </p>
        </div>
        <Button onClick={() => setOpening(true)}>
          <Plus className="h-4 w-4 mr-1.5" />New advance
        </Button>
      </header>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <EmptyState
          eyebrow="None"
          title="No advances on file"
          body="Use this when a customer puts money down for a future order."
        />
      )}

      <ul className="space-y-2">
        {rows.map((a) => (
          <li key={a.id} className="rounded-lg border border-ink-100 bg-ink-0 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 h-9 w-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink-900">{a.customer?.name ?? '—'}</span>
                    {a.customer?.phone && (
                      <span className="text-xs text-ink-500 font-mono">{a.customer.phone}</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    {a.receiptNumber} · {new Date(a.createdAt).toLocaleDateString('en-IN')}
                    {a.validUntil ? (
                      <> · valid till {new Date(a.validUntil).toLocaleDateString('en-IN')}</>
                    ) : null}
                  </div>
                  {a.notes && (
                    <div className="text-xs text-ink-400 mt-1 italic">{a.notes}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <Money paise={a.amountPaise} className="font-semibold text-ink-900" />
                  <div className="mt-1">
                    <Badge
                      tone={
                        a.status === 'CONSUMED'
                          ? 'success'
                          : a.status === 'REFUNDED'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {a.status}
                    </Badge>
                  </div>
                </div>
                {a.status === 'ACTIVE' && (
                  <Button variant="outline" size="sm" onClick={() => void onRefund(a.id)}>
                    <X className="h-4 w-4 mr-1" />Refund
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <NewAdvanceSheet open={opening} onClose={() => setOpening(false)} shopId={shopId} />
    </div>
  );
}

function NewAdvanceSheet({
  open,
  onClose,
  shopId,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
}): JSX.Element {
  // Customer can be an existing CRM pick (search) or a brand-new walk-in
  // entered inline (name + phone). 'new' mode is the answer to "No customers
  // match. Add them in CRM first." — now you can add them right here.
  const [customerMode, setCustomerMode] = useState<'search' | 'new'>('search');
  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  // A pick can be an existing Customer (has customerId) or a CRM Lead with no
  // Customer row yet — in which case we submit name+phone and the server
  // creates the customer (upsert by phone).
  const [pickedCustomer, setPickedCustomer] = useState<
    { name: string; phone: string; source: 'customer' | 'lead' } | null
  >(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [lockRates, setLockRates] = useState(true);
  const [validDays, setValidDays] = useState(90);
  const [notes, setNotes] = useState('');

  const trimmedQ = customerQuery.trim();
  const { data: searchData, isFetching: searching } = useSearchPosCustomersQuery(
    trimmedQ ? { q: trimmedQ, limit: 10 } : { limit: 10 },
  );
  const suggestions = searchData?.data ?? [];

  const [submit, { isLoading }] = useCreateAdvanceMutation();

  // A customer is "ready" either way: a pick (customer or lead), or a filled-in
  // new one.
  const newCustomerReady = newName.trim().length > 0 && newPhone.replace(/\D/g, '').length >= 10;
  const customerReady = customerMode === 'search' ? !!pickedCustomer : newCustomerReady;

  useEffect(() => {
    if (open) {
      setCustomerMode('search');
      setCustomerId('');
      setCustomerQuery('');
      setPickedCustomer(null);
      setShowSuggestions(false);
      setNewName('');
      setNewPhone('');
      setAmountRupees('');
      setLockRates(true);
      setValidDays(90);
      setNotes('');
    }
  }, [open]);

  // Switch to inline-create mode, seeding the phone if the search text is a
  // number (the common "typed a phone, no match" case).
  function startNewCustomer(): void {
    const digits = customerQuery.replace(/\D/g, '');
    setNewPhone(digits.length >= 10 ? digits : '');
    setNewName(digits.length >= 10 ? '' : customerQuery.trim());
    setShowSuggestions(false);
    setCustomerMode('new');
  }

  function pickCustomer(c: { id: string; name: string; phone: string; source: 'customer' | 'lead' }): void {
    // Only a real Customer carries a usable customerId; a lead is submitted by
    // name + phone and converted server-side.
    setCustomerId(c.source === 'customer' ? c.id : '');
    setCustomerQuery(`${c.name} · ${c.phone}`);
    setPickedCustomer({ name: c.name, phone: c.phone, source: c.source });
    setShowSuggestions(false);
  }

  function clearCustomer(): void {
    setCustomerId('');
    setCustomerQuery('');
    setPickedCustomer(null);
    setShowSuggestions(true);
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    // Build the customer half of the payload from whichever mode is active.
    let customerPayload: { customerId: string } | { customerName: string; customerPhone: string };
    if (customerMode === 'search') {
      if (!pickedCustomer) {
        toast.error('Pick a customer from the list');
        return;
      }
      // Existing customer → use the id. CRM lead → send name + phone so the
      // server creates/links the customer (upsert by phone).
      customerPayload =
        pickedCustomer.source === 'customer' && customerId
          ? { customerId }
          : { customerName: pickedCustomer.name, customerPhone: pickedCustomer.phone };
    } else {
      const name = newName.trim();
      const digits = newPhone.replace(/\D/g, '');
      if (!name) {
        toast.error('Enter the customer name');
        return;
      }
      if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
        toast.error('Enter a valid 10-digit mobile number');
        return;
      }
      customerPayload = { customerName: name, customerPhone: `+91${digits}` };
    }
    const amount = Number(amountRupees);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      await submit({
        shopId,
        ...customerPayload,
        amountPaise: Math.round(amount * 100),
        lockRates,
        validDays,
        notes: notes.trim() || null,
      }).unwrap();
      toast.success('Advance receipt created');
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to create advance');
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* w-full sm:max-w-lg overrides the base w-3/4 cap via tailwind-merge so
          the panel is a comfortable fixed width instead of ballooning to 75%
          of the viewport. The form carries its own px so fields aren't flush
          against the left border. */}
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New advance receipt</SheetTitle>
        </SheetHeader>
        <form onSubmit={save} className="px-4 sm:px-6 pt-5 pb-8 space-y-5">
          {/* Customer — search an existing record, or add a new one inline. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-ink-600">Customer</Label>
              {customerMode === 'search' ? (
                <button
                  type="button"
                  onClick={startNewCustomer}
                  className="text-[11px] text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5"
                >
                  <Plus className="h-3 w-3" />New customer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomerMode('search')}
                  className="text-[11px] text-ink-500 hover:text-ink-900"
                >
                  Search existing
                </button>
              )}
            </div>

            {customerMode === 'search' ? (
              <>
                <div className="relative">
                  <Input
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setCustomerId('');
                      setPickedCustomer(null);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Search by name or phone…"
                    autoComplete="off"
                    readOnly={!!pickedCustomer}
                  />
                  {pickedCustomer && (
                    <button
                      type="button"
                      onClick={clearCustomer}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-500 hover:text-ink-900 bg-ink-0 px-1 py-0.5 rounded"
                    >
                      Change
                    </button>
                  )}
                  {showSuggestions && !pickedCustomer && (
                    <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-ink-200 bg-ink-0 shadow-lg z-20">
                      {searching && (
                        <p className="px-3 py-2 text-xs text-ink-500">Searching…</p>
                      )}
                      {!searching && suggestions.length === 0 && (
                        <button
                          type="button"
                          onMouseDown={startNewCustomer}
                          className="w-full text-left px-3 py-2.5 hover:bg-brand-50/40"
                        >
                          <p className="text-sm font-medium text-brand-700 inline-flex items-center gap-1">
                            <Plus className="h-3.5 w-3.5" />Add a new customer
                          </p>
                          <p className="text-xs text-ink-500">No match — save their name &amp; number here.</p>
                        </button>
                      )}
                      {suggestions.map((c) => (
                        <button
                          type="button"
                          key={`${c.source}-${c.id}`}
                          onMouseDown={() => pickCustomer(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-brand-50/40 border-b border-ink-50 last:border-0"
                        >
                          <p className="text-sm font-medium text-ink-900 flex items-center gap-1.5">
                            {c.name}
                            {c.source === 'lead' && (
                              <span className="text-[10px] font-normal uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
                                Lead
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-ink-500 font-mono">{c.phone}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {pickedCustomer && (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-brand-50/50 border border-brand-100">
                    <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-brand-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900 leading-tight">{pickedCustomer.name}</p>
                      <p className="text-xs text-ink-500 font-mono">{pickedCustomer.phone}</p>
                      {pickedCustomer.source === 'lead' && (
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          New customer — will be created from this CRM lead on save.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2 rounded-md border border-brand-100 bg-brand-50/30 p-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-ink-500">Full name</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Aanya Sharma"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-ink-500">Mobile number</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-500 font-mono">+91</span>
                    <Input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="98XXXXXXXX"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-[11px] text-ink-400">
                    Saved to CRM on submit. If this number already exists, that record is reused.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Amount (₹)</Label>
            <Input
              inputMode="numeric"
              placeholder="e.g. 25000"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              required
            />
          </div>

          {/* Lock rates */}
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-ink-100 p-3 hover:bg-ink-50/50 transition-colors">
            <input
              type="checkbox"
              className="mt-0.5 accent-brand-600"
              checked={lockRates}
              onChange={(e) => setLockRates(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium text-ink-800">Lock today's gold rates</p>
              <p className="text-xs text-ink-500 mt-0.5">
                Customer's bill will use today's rates even if the market moves later.
              </p>
            </div>
          </label>

          {/* Valid days */}
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Valid for (days)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={validDays}
              onChange={(e) => setValidDays(Number(e.target.value))}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Notes (optional)</Label>
            <Input
              placeholder="e.g. Bridal set for Aanya — Dec wedding"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-1">
            <Button type="submit" disabled={isLoading || !customerReady} className="w-full">
              {isLoading ? 'Saving…' : 'Create advance'}
            </Button>
            {!customerReady && (
              <p className="text-xs text-ink-400 text-center mt-2">
                <Banknote className="h-3 w-3 inline mr-1" />
                {customerMode === 'search'
                  ? 'Select or add a customer above to continue'
                  : 'Enter the customer name & mobile to continue'}
              </p>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
