import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { HeroSlide } from '@/features/storefront/storefrontContentSlice';

const ROTATE_MS = 5000;

// Full-bleed, auto-rotating hero banner (Palmonas-style). Each slide is an
// image with an optional headline overlay + a "Shop Now" CTA that links to a
// collection (or any route). Rotates every 5s, pauses on hover/focus, and
// exposes prev/next arrows + dot controls. Returns null when there are no
// slides so the caller can fall back to its editorial band alone.
export function HeroCarousel({ slides }: { slides: HeroSlide[] }): JSX.Element | null {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  // Keep the index valid if the slide list shrinks (e.g. CMS edit / HMR).
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  // Auto-advance unless paused or there's nothing to rotate.
  useEffect(() => {
    if (paused || count <= 1) return undefined;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, count]);

  if (count === 0) return null;

  const go = (n: number): void => setIndex(((n % count) + count) % count);

  return (
    <section
      className="relative w-full overflow-hidden bg-ink-100"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Tall-ish on mobile, wide cinematic banner on desktop. */}
      <div className="relative h-[460px] sm:h-[520px] lg:h-[600px]">
        {/* Slide track — all slides sit side-by-side, each exactly one viewport
            wide (w-full + shrink-0). The track box stays one viewport wide, so
            translateX(-index * 100%) snaps left by exactly one full slide. */}
        <div
          className="flex h-full transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="relative h-full w-full shrink-0" aria-hidden={i !== index}>
              <img
                src={slide.image}
                alt={slide.headline || 'Featured collection'}
                className="absolute inset-0 h-full w-full object-cover"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
              {/* Legibility scrim — stronger at the bottom where the CTA sits. */}
              <div
                className="absolute inset-0 bg-gradient-to-t from-ink-900/55 via-ink-900/10 to-transparent"
                aria-hidden
              />
              {/* Slide content — bottom-left, with a Shop Now CTA. */}
              <div className="absolute inset-x-0 bottom-0">
                <div className="max-w-[1280px] mx-auto px-5 sm:px-8 pb-12 sm:pb-16">
                  {slide.headline && (
                    <h2 className="font-display text-ink-0 text-[28px] sm:text-[40px] lg:text-[52px] leading-[1.1] max-w-xl drop-shadow-sm">
                      {slide.headline}
                    </h2>
                  )}
                  {slide.ctaHref && (
                    <Link
                      to={slide.ctaHref}
                      tabIndex={i === index ? 0 : -1}
                      className="group mt-5 inline-flex items-center gap-2 h-11 sm:h-12 px-6 sm:px-8 rounded-full bg-ink-0 text-ink-900 text-sm font-medium hover:bg-brand-50 transition-colors duration-fast shadow-sm"
                    >
                      <span>{slide.ctaLabel || 'Shop Now'}</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous slide"
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-full bg-ink-0/80 text-ink-900 hover:bg-ink-0 shadow-sm backdrop-blur transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next slide"
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-full bg-ink-0/80 text-ink-900 hover:bg-ink-0 shadow-sm backdrop-blur transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === index ? 'w-6 bg-ink-0' : 'w-1.5 bg-ink-0/50 hover:bg-ink-0/80',
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
