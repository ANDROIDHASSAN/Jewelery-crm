// Customer-facing review sheet — opened from AccountPage on each delivered
// order that hasn't been reviewed yet. Phone is the auth, same convention as
// the rest of the storefront. The server verifies the phone owns the order
// before accepting the write (see /website/orders/:id/review).

import { useState, useEffect } from 'react';
import { Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateOrderReviewMutation } from '@/features/storefront/storefrontApi';
import { cn } from '@/lib/cn';

interface OrderReviewSheetProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  phone: string;
  /** Display label for the order — usually the lead product name + a count. */
  orderLabel: string;
  /** Thumb shown above the form, if the order has any product images. */
  thumbUrl?: string;
}

export function OrderReviewSheet({
  open,
  onClose,
  orderId,
  phone,
  orderLabel,
  thumbUrl,
}: OrderReviewSheetProps): JSX.Element | null {
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [createReview, { isLoading }] = useCreateOrderReviewMutation();

  // Reset when (re-)opened — feels off if a previous draft lingers when the
  // user closes and reopens the sheet for a different order.
  useEffect(() => {
    if (open) {
      setRating(0);
      setHover(0);
      setTitle('');
      setBody('');
    }
  }, [open, orderId]);

  // Close on Escape — standard sheet/modal behaviour.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !isLoading) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, isLoading]);

  if (!open) return null;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (rating < 1) {
      toast.error('Pick a star rating');
      return;
    }
    if (body.trim().length < 4) {
      toast.error('Tell us a bit more — at least a few words.');
      return;
    }
    try {
      await createReview({
        orderId,
        phone,
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
      }).unwrap();
      toast.success('Thank you — your review is in.');
      onClose();
    } catch (err) {
      const e = err as { status?: number; data?: { error?: { message?: string } } };
      // 409 = already reviewed (another tab, race). Close gracefully.
      if (e.status === 409) {
        toast.message('This order was already reviewed.');
        onClose();
        return;
      }
      const message = e.data?.error?.message ?? 'Could not submit your review.';
      toast.error(message);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Write a review">
      {/* Backdrop — same warm wash as other storefront overlays. */}
      <button
        type="button"
        onClick={() => !isLoading && onClose()}
        className="absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]"
        aria-label="Close"
      />
      {/* Sheet panel — slides up on mobile, right on desktop. */}
      <div
        className={cn(
          'absolute bg-ink-0 shadow-2xl flex flex-col',
          // Mobile: bottom sheet with a tasteful top radius
          'inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl',
          // Desktop: right-side panel
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:h-full sm:w-[480px] sm:max-w-[92vw] sm:rounded-none sm:border-l sm:border-ink-100',
          'animate-in slide-in-from-bottom sm:slide-in-from-right duration-300',
        )}
      >
        <header className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 sm:pt-7 pb-4 border-b border-ink-100">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              Share your experience
            </p>
            <h2 className="font-display text-xl sm:text-2xl text-ink-900 mt-1.5 leading-tight">
              How was your purchase?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !isLoading && onClose()}
            className="h-9 w-9 rounded-full text-ink-500 hover:bg-ink-50 hover:text-ink-900 inline-flex items-center justify-center transition-colors -mt-1"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 sm:py-6 space-y-5">
          {/* Order preview */}
          <div className="flex items-center gap-3 rounded-md bg-ink-25 p-3">
            {thumbUrl ? (
              <img src={thumbUrl} alt="" className="h-14 w-14 rounded object-cover ring-1 ring-ink-100" />
            ) : (
              <div className="h-14 w-14 rounded bg-brand-50 ring-1 ring-brand-100" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900 truncate">{orderLabel}</p>
              <p className="font-mono text-[11px] text-ink-500 mt-0.5">
                ZL-{orderId.slice(-6).toUpperCase()}
              </p>
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-2">
              Rating
            </label>
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (hover || rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    className="h-11 w-11 inline-flex items-center justify-center rounded-md hover:bg-brand-50 transition-colors"
                  >
                    <Star
                      className={cn(
                        'h-7 w-7 transition-all duration-150',
                        active ? 'fill-brand-400 text-brand-500' : 'text-ink-200',
                      )}
                    />
                  </button>
                );
              })}
              <span className="ml-2 text-sm font-mono tabular-nums text-ink-500 min-w-[2ch]">
                {rating > 0 ? `${rating}/5` : ''}
              </span>
            </div>
            <p className="text-[11px] text-ink-500 mt-2">
              {rating === 5
                ? 'Loved it'
                : rating === 4
                  ? 'Very good'
                  : rating === 3
                    ? 'Just okay'
                    : rating === 2
                      ? 'Could be better'
                      : rating === 1
                        ? 'Disappointed'
                        : 'Tap a star to rate'}
            </p>
          </div>

          {/* Title (optional) */}
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 block mb-2">
              Headline <span className="font-normal lowercase text-ink-400">· optional</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Stunning craftsmanship"
              className="w-full h-11 px-3.5 bg-ink-25 rounded-md border border-ink-100 text-sm text-ink-900 placeholder:text-ink-400 focus:bg-ink-0 focus:border-brand-300 outline-none transition-colors"
            />
          </label>

          {/* Body (required) */}
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 block mb-2">
              Your review
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="What did you like? How did it look in person? Would you buy again?"
              className="w-full px-3.5 py-2.5 bg-ink-25 rounded-md border border-ink-100 text-sm text-ink-900 placeholder:text-ink-400 focus:bg-ink-0 focus:border-brand-300 outline-none transition-colors resize-y leading-relaxed"
              required
            />
            <p className="text-[11px] text-ink-400 mt-1.5 text-right font-mono tabular-nums">
              {body.length}/2000
            </p>
          </label>

          <p className="text-[11px] text-ink-500 leading-relaxed">
            Your name and the first letter of your number show on the public review.
            We never share your full phone or email.
          </p>
        </form>

        <footer className="px-5 sm:px-7 py-4 border-t border-ink-100 bg-ink-25/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !isLoading && onClose()}
            className="h-11 px-5 rounded-full border border-ink-200 text-sm text-ink-700 hover:bg-ink-50 transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => void submit(e)}
            className="h-11 px-6 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors disabled:opacity-50"
            disabled={isLoading || rating < 1 || body.trim().length < 4}
          >
            {isLoading ? 'Submitting…' : 'Submit review'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Read-only star strip — used to display an existing review's rating. */
export function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5',
            n <= rating ? 'fill-brand-400 text-brand-500' : 'text-ink-200',
          )}
        />
      ))}
    </span>
  );
}
