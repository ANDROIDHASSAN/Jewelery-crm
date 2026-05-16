import { MapPin, Phone, Clock } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';

export function StorePage(): JSX.Element {
  const locations = useAppSelector((s) => s.storefrontContent.locations);
  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
      <header className="mb-8 sm:mb-12">
        <p className="text-eyebrow uppercase text-ink-500">Visit us</p>
        <h1 className="font-display text-3xl sm:text-display-lg text-ink-900 mt-2">Our stores</h1>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {locations.map((s) => (
          <article key={s.id} className="rounded-md border border-ink-100 overflow-hidden bg-ink-0">
            <div
              className="aspect-[16/9] bg-ink-100"
              style={{ background: `url('${s.image}') center/cover no-repeat` }}
            />
            <div className="p-5 sm:p-6 space-y-3">
              <h2 className="font-display text-xl sm:text-display-sm text-ink-900">{s.name}</h2>
              <ul className="space-y-2 text-sm text-ink-700">
                <li className="flex gap-2"><MapPin className="h-4 w-4 mt-0.5 text-ink-500" /> {s.address}</li>
                <li className="flex gap-2"><Phone className="h-4 w-4 mt-0.5 text-ink-500" /> {s.phone}</li>
                <li className="flex gap-2"><Clock className="h-4 w-4 mt-0.5 text-ink-500" /> {s.hours}</li>
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
