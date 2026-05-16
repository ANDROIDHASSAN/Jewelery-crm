import { useState } from 'react';
import { Truck, Package, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Money } from '@/components/ui/money';
import { useLazyLookupOrderQuery } from '@/features/storefront/storefrontApi';

const STAGES = [
  { key: 'PENDING', label: 'Order placed', Icon: Clock },
  { key: 'CONFIRMED', label: 'Confirmed', Icon: CheckCircle2 },
  { key: 'PACKED', label: 'Packed', Icon: Package },
  { key: 'SHIPPED', label: 'In transit', Icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', Icon: CheckCircle2 },
];

export function TrackOrderPage(): JSX.Element {
  const [id, setId] = useState('');
  const [phone, setPhone] = useState('+91 ');
  const [lookup, { data: order, isFetching, error }] = useLazyLookupOrderQuery();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    const local = digits.startsWith('91') ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(local)) {
      toast.error('Please enter a valid Indian phone number');
      return;
    }
    try {
      await lookup({ id: id.trim(), phone: `+91${local}` }).unwrap();
    } catch {
      // RTKQ surfaces the error; toast it here too.
      toast.error('No order matched. Check the order ID and phone.');
    }
  }

  const currentStageIdx = order ? STAGES.findIndex((s) => s.key === order.status) : -1;

  return (
    <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 md:py-20">
      <header className="mb-6 sm:mb-8">
        <p className="text-eyebrow uppercase text-ink-500">Track your order</p>
        <h1 className="font-display text-2xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-3">
          Where is my piece?
        </h1>
        <p className="mt-3 text-sm text-ink-600">
          Enter the order id (e.g. <span className="font-mono">ZL-AB12CD</span>) and the phone you used at checkout.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 mb-8 sm:mb-10">
        <input
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Order id"
          className="h-12 px-4 rounded-full border border-ink-200 text-sm focus:border-brand-400 outline-none font-mono"
        />
        <input
          required
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 98XXX XXXXX"
          className="h-12 px-4 rounded-full border border-ink-200 text-sm focus:border-brand-400 outline-none font-mono"
        />
        <button
          type="submit"
          disabled={isFetching}
          className="h-12 px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 disabled:opacity-60 transition-colors"
        >
          {isFetching ? 'Looking…' : 'Track'}
        </button>
      </form>

      {!!error && (
        <div className="rounded-md border border-ink-100 bg-ink-25 p-5 sm:p-6 text-sm text-ink-600">
          Couldn&apos;t find an order with those details. Double-check the order id and phone, or WhatsApp us.
        </div>
      )}

      {order && (
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5 sm:p-6 space-y-5 sm:space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-eyebrow uppercase text-ink-500">Order</p>
              <p className="font-mono text-sm text-ink-700 truncate">ZL-{order.id.slice(-6).toUpperCase()}</p>
              <p className="text-xs text-ink-500 mt-1">{new Date(order.createdAt).toLocaleString('en-IN')}</p>
            </div>
            <Money paise={order.totalPaise} className="font-mono text-base sm:text-lg tabular-nums shrink-0" />
          </div>

          <ol className="grid grid-cols-5 gap-1 sm:gap-2">
            {STAGES.map((s, i) => {
              const reached = currentStageIdx >= i;
              return (
                <li key={s.key} className="flex flex-col items-center text-center">
                  <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full inline-flex items-center justify-center ${reached ? 'bg-brand-400 text-ink-900' : 'bg-ink-100 text-ink-400'}`}>
                    <s.Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <span className={`mt-1.5 sm:mt-2 text-[9px] sm:text-[11px] leading-tight uppercase tracking-wider ${reached ? 'text-ink-800' : 'text-ink-400'}`}>{s.label}</span>
                </li>
              );
            })}
          </ol>

          {order.shiprocketAwb && (
            <p className="text-sm text-ink-600">
              Shiprocket AWB: <span className="font-mono text-ink-900">{order.shiprocketAwb}</span>
            </p>
          )}

          <div>
            <p className="text-eyebrow uppercase text-ink-500 mb-3">Pieces</p>
            <ul className="divide-y divide-ink-100">
              {order.items.map((it) => (
                <li key={it.id} className="py-3 flex items-center gap-3">
                  {it.product?.images[0] && (
                    <img src={it.product.images[0]} alt={it.product.name} className="h-12 w-12 rounded object-cover" />
                  )}
                  <div className="flex-1">
                    <p className="text-ink-900 text-sm">{it.product?.name ?? 'Piece'}</p>
                    <p className="text-xs text-ink-500">Qty {it.qty}</p>
                  </div>
                  <Money paise={it.pricePaise * it.qty} className="font-mono tabular-nums text-sm" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
