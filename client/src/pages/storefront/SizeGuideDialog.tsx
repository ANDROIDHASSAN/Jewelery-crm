import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

// Standard Indian ring-size chart. Circumference = π × diameter (kept internally
// consistent). Indian size is the canonical scale on the storefront; US size is
// the cross-reference for overseas shoppers.
const RING_SIZES: { indian: number; diameterMm: number; circumferenceMm: number; us: string }[] = [
  { indian: 7, diameterMm: 15.1, circumferenceMm: 47.4, us: '4.25' },
  { indian: 8, diameterMm: 15.3, circumferenceMm: 48.1, us: '4.50' },
  { indian: 9, diameterMm: 15.5, circumferenceMm: 48.7, us: '4.75' },
  { indian: 10, diameterMm: 15.9, circumferenceMm: 50.0, us: '5.25' },
  { indian: 11, diameterMm: 16.3, circumferenceMm: 51.2, us: '5.75' },
  { indian: 12, diameterMm: 16.5, circumferenceMm: 51.8, us: '6.00' },
  { indian: 13, diameterMm: 16.9, circumferenceMm: 53.1, us: '6.50' },
  { indian: 14, diameterMm: 17.3, circumferenceMm: 54.3, us: '7.00' },
  { indian: 15, diameterMm: 17.5, circumferenceMm: 55.0, us: '7.25' },
  { indian: 16, diameterMm: 17.9, circumferenceMm: 56.2, us: '7.75' },
  { indian: 17, diameterMm: 18.1, circumferenceMm: 56.9, us: '8.00' },
  { indian: 18, diameterMm: 18.5, circumferenceMm: 58.1, us: '8.50' },
  { indian: 19, diameterMm: 18.7, circumferenceMm: 58.7, us: '8.75' },
  { indian: 20, diameterMm: 19.2, circumferenceMm: 60.3, us: '9.25' },
  { indian: 21, diameterMm: 19.4, circumferenceMm: 60.9, us: '9.50' },
  { indian: 22, diameterMm: 19.8, circumferenceMm: 62.2, us: '10.00' },
  { indian: 23, diameterMm: 20.0, circumferenceMm: 62.8, us: '10.25' },
  { indian: 24, diameterMm: 20.4, circumferenceMm: 64.1, us: '10.75' },
  { indian: 25, diameterMm: 20.6, circumferenceMm: 64.7, us: '11.00' },
  { indian: 26, diameterMm: 21.0, circumferenceMm: 66.0, us: '11.50' },
];

type Tab = 'ring' | 'finger';

export function SizeGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>('ring');
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:w-[92vw] max-w-2xl max-h-[88vh] overflow-y-auto bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <div className="sticky top-0 bg-ink-0 border-b border-[#EFE0D2] px-5 sm:px-6 py-4 flex items-center justify-between">
            <Dialog.Title className="font-display text-[22px] leading-tight text-ink-900">
              Ring Size Guide
            </Dialog.Title>
            <Dialog.Close
              className="text-ink-500 hover:text-ink-900 p-1 -mr-1 rounded-md hover:bg-ink-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {/* Tab switcher */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTab('ring')}
                className={cn(
                  'h-11 rounded-md text-sm font-medium transition-colors',
                  tab === 'ring' ? 'bg-ink-900 text-ink-0' : 'bg-[#FAF3EE] text-ink-700 hover:bg-[#F3E7DC]',
                )}
              >
                (A) Measure My Ring Size
              </button>
              <button
                type="button"
                onClick={() => setTab('finger')}
                className={cn(
                  'h-11 rounded-md text-sm font-medium transition-colors',
                  tab === 'finger' ? 'bg-ink-900 text-ink-0' : 'bg-[#FAF3EE] text-ink-700 hover:bg-[#F3E7DC]',
                )}
              >
                (B) Measure My Finger Size
              </button>
            </div>

            {/* Instructions */}
            <div className="text-sm text-ink-700 space-y-1.5">
              <p className="font-medium text-ink-900">Instructions:</p>
              {tab === 'ring' ? (
                <ol className="list-decimal list-inside space-y-1 text-ink-600">
                  <li>Take a ring that already fits the intended finger.</li>
                  <li>Measure its inner diameter (in mm) with a ruler — make sure the 0&nbsp;mm point is where the ruler begins.</li>
                  <li>Match the diameter to the chart below to find your size.</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1 text-ink-600">
                  <li>Wrap a strip of paper or thread around the base of your finger.</li>
                  <li>Mark where it overlaps, then measure that length (in mm) — that&apos;s your circumference.</li>
                  <li>Match the circumference to the chart below to find your size.</li>
                </ol>
              )}
              <p className="text-ink-500 pt-1">Use the size chart to determine your ring size.</p>
            </div>

            {/* Size chart */}
            <div className="overflow-x-auto rounded-md border border-[#EFE0D2]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAF3EE] text-ink-700">
                    <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">Indian Size</th>
                    <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">Diameter (mm)</th>
                    <th
                      className={cn(
                        'px-3 py-2.5 text-center font-medium whitespace-nowrap',
                        tab === 'finger' && 'text-brand-700',
                      )}
                    >
                      Circumference (mm)
                    </th>
                    <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">US Size</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums text-ink-800">
                  {RING_SIZES.map((s, i) => (
                    <tr key={s.indian} className={cn('border-t border-[#EFE0D2]', i % 2 === 1 && 'bg-[#FDF8F4]')}>
                      <td className="px-3 py-2 text-center">{s.indian}</td>
                      <td className="px-3 py-2 text-center">{s.diameterMm.toFixed(1)}</td>
                      <td className={cn('px-3 py-2 text-center', tab === 'finger' && 'font-semibold text-brand-700')}>
                        {s.circumferenceMm.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-center">{s.us}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-ink-500 leading-relaxed">
              Tip: measure at the end of the day when fingers are largest, and avoid measuring when cold. If you&apos;re
              between sizes, pick the larger one. Need help? Reach us on WhatsApp and we&apos;ll guide you.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
