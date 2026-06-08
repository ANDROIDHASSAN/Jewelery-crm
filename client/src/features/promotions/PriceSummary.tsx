import { Money } from '@/components/ui/money';
import type { PricingBreakdown } from './promotionsApi';

interface PriceSummaryProps {
  pricing: PricingBreakdown | null;
  fallbackSubtotalPaise: number;
  fallbackShippingPaise?: number;
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }): JSX.Element {
  return (
    <div className={`flex items-center justify-between ${highlight ? 'text-success-700' : ''}`}>
      <span className={highlight ? 'text-success-700' : 'text-ink-500'}>{label}</span>
      <span className={`font-mono tabular-nums ${highlight ? 'text-success-700' : 'text-ink-800'}`}>{value}</span>
    </div>
  );
}

export function PriceSummary({ pricing, fallbackSubtotalPaise, fallbackShippingPaise = 0 }: PriceSummaryProps): JSX.Element {
  if (!pricing) {
    const gst = Math.round((fallbackSubtotalPaise * 300) / 10_000);
    return (
      <div className="space-y-2 text-sm">
        <Row label="Subtotal" value={<Money paise={fallbackSubtotalPaise} />} />
        <Row label="GST (3%)" value={<Money paise={gst} />} />
        {fallbackShippingPaise > 0 && (
          <Row label="Shipping" value={<Money paise={fallbackShippingPaise} />} />
        )}
        {fallbackShippingPaise === 0 && (
          <Row label="Shipping" value={<span className="text-brand-700">Free</span>} />
        )}
        <div className="border-t border-[#EFE0D2] pt-2 flex items-center justify-between font-medium">
          <span className="text-ink-900">Total</span>
          <Money paise={fallbackSubtotalPaise + gst + fallbackShippingPaise} className="text-ink-900 font-mono tabular-nums text-base" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <Row label="Subtotal" value={<Money paise={pricing.subtotalPaise} />} />

      {pricing.couponDiscountPaise > 0 && (
        <Row
          label={pricing.coupon ? `Coupon (${pricing.coupon.code})` : 'Coupon discount'}
          value={<span>−<Money paise={pricing.couponDiscountPaise} /></span>}
          highlight
        />
      )}

      {pricing.shippingPaise === 0 && pricing.coupon?.type === 'FREE_SHIPPING' && (
        <Row label={`Coupon (${pricing.coupon.code})`} value={<span className="text-success-700">Free shipping</span>} highlight />
      )}

      {pricing.loyaltyDiscountPaise > 0 && (
        <Row
          label={`Points (${pricing.loyalty?.pointsUsed ?? 0} pts)`}
          value={<span>−<Money paise={pricing.loyaltyDiscountPaise} /></span>}
          highlight
        />
      )}

      <Row label="GST (3%)" value={<Money paise={pricing.taxPaise} />} />

      {pricing.shippingPaise > 0 && (
        <Row label="Shipping" value={<Money paise={pricing.shippingPaise} />} />
      )}
      {pricing.shippingPaise === 0 && pricing.coupon?.type !== 'FREE_SHIPPING' && (
        <Row label="Shipping" value={<span className="text-brand-700">Free</span>} />
      )}

      <div className="border-t border-[#EFE0D2] pt-2 flex items-center justify-between font-medium">
        <span className="text-ink-900">Total</span>
        <Money paise={pricing.totalPaise} className="text-ink-900 font-mono tabular-nums text-base" />
      </div>

      {pricing.pointsEarnable > 0 && (
        <p className="text-xs text-amber-700 pt-0.5">
          You&apos;ll earn {pricing.pointsEarnable.toLocaleString('en-IN')} loyalty pts on this order
        </p>
      )}
    </div>
  );
}
