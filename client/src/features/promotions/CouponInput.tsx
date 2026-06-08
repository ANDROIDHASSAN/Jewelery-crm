import { useState } from 'react';
import { Tag, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface CouponInputProps {
  onApply: (code: string) => void;
  onRemove: () => void;
  appliedCode: string | null;
  discountPaise: number;
  error: string | null;
  isLoading: boolean;
}

export function CouponInput({
  onApply,
  onRemove,
  appliedCode,
  discountPaise,
  error,
  isLoading,
}: CouponInputProps): JSX.Element {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (input.trim()) onApply(input.trim().toUpperCase());
  };

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle className="h-4 w-4 text-success-600 shrink-0" />
          <span className="font-mono font-medium text-success-800">{appliedCode}</span>
          {discountPaise > 0 && (
            <span className="text-success-600 text-xs">
              −₹{Math.round(discountPaise / 100).toLocaleString('en-IN')} off
            </span>
          )}
          {discountPaise === 0 && (
            <span className="text-success-600 text-xs">Free shipping applied</span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-success-600 hover:text-success-900 hover:bg-success-100"
          aria-label="Remove coupon"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Enter coupon code"
            className="h-10 w-full rounded-lg border border-ink-200 bg-ink-0 pl-9 pr-3 text-sm font-mono placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 px-4 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Apply
        </button>
      </form>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-error-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
