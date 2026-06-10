// Storefront journal / blog — an index page (/store/blog) listing all posts and
// a detail page (/store/blog/:slug) rendering one post. Posts are CMS-managed
// (Website CMS → Homepage sections → Blog / Journal posts) and live on the
// storefront content blob, so adding/editing a post needs no DB migration.

import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import type { BlogPost } from '@/features/storefront/storefrontContentSlice';

// Parse an ISO date (YYYY-MM-DD) into a {day, month} badge. Null = hide badge.
function dateParts(iso: string): { day: string; month: string } | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
  };
}

// Full, human date e.g. "3 March 2026". Empty string for blank/invalid dates.
function fullDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function BlogCard({ post }: { post: BlogPost }): JSX.Element {
  const badge = dateParts(post.date);
  return (
    <Link to={`/store/blog/${post.slug}`} className="group flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-[#FAF3EE] gold-shine-target">
        <img
          src={post.image}
          alt={post.title}
          className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.05] transition-transform duration-slow"
          loading="lazy"
        />
        {badge && (
          <div className="absolute top-3 right-3 h-14 w-14 rounded-full bg-ink-0 shadow-sm flex flex-col items-center justify-center text-center leading-none">
            <span className="font-display text-lg text-ink-900">{badge.day}</span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-ink-500 mt-0.5">{badge.month}</span>
          </div>
        )}
      </div>
      <h3 className="mt-4 font-display text-lg leading-snug text-ink-900 group-hover:text-brand-700 transition-colors line-clamp-2">
        {post.title}
      </h3>
      {post.excerpt && (
        <p className="mt-2 text-sm text-ink-600 leading-relaxed line-clamp-2">{post.excerpt}</p>
      )}
      <span className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-700 group-hover:gap-2.5 transition-all">
        Read more
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export function BlogIndexPage(): JSX.Element {
  const blogs = useAppSelector((s) => s.storefrontContent.blogs);
  const brand = useAppSelector((s) => s.storefrontContent.brand);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
      <header className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
        <p className="text-eyebrow uppercase text-brand-700">Our journal</p>
        <h1 className="font-display text-3xl sm:text-[40px] md:text-[48px] leading-[1.05] text-ink-900 mt-3">
          The {brand.name} Journal
        </h1>
        <p className="mt-4 text-sm sm:text-base text-ink-600 leading-relaxed">
          Buying guides, care tips and behind-the-bench stories from our Haryana workshop.
        </p>
      </header>

      {blogs.length === 0 ? (
        <p className="text-center text-sm text-ink-600 py-10">New stories coming soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 md:gap-10">
          {blogs.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogDetailPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const blogs = useAppSelector((s) => s.storefrontContent.blogs);
  const brand = useAppSelector((s) => s.storefrontContent.brand);
  const post = blogs.find((b) => b.slug === slug);
  // Up to 3 other posts for the "Keep reading" rail.
  const more = blogs.filter((b) => b.slug !== slug).slice(0, 3);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!post) {
    return (
      <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
        <h1 className="font-display text-2xl sm:text-[32px] text-ink-900">Story not found</h1>
        <p className="mt-2 text-sm text-ink-600">We couldn&apos;t find the article you were looking for.</p>
        <Link
          to="/store/blog"
          className="mt-6 inline-flex h-12 px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors items-center"
        >
          Back to the journal
        </Link>
      </div>
    );
  }

  const dated = fullDate(post.date);
  // Split the body into paragraphs on blank lines (single newlines stay within
  // a paragraph). Falls back to the whole string when there are no blank lines.
  const paragraphs = post.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <article className="w-full">
      {/* Header band */}
      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pt-10 sm:pt-14 md:pt-16">
        <Link
          to="/store/blog"
          className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-brand-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          The journal
        </Link>
        <h1 className="font-display text-3xl sm:text-[40px] md:text-[48px] leading-[1.08] text-ink-900 mt-5">
          {post.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
          {dated && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {dated}
            </span>
          )}
          {post.author && <span>By {post.author}</span>}
        </div>
      </div>

      {/* Cover image */}
      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 mt-8 sm:mt-10">
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-[#FAF3EE]">
          <img src={post.image} alt={post.title} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-12 md:py-14">
        <div className="space-y-5 text-[15px] sm:text-base text-ink-700 leading-[1.8]">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p className="text-ink-500">This story is being written. Check back soon.</p>
          )}
        </div>

        <div className="mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-ink-100">
          <Link
            to="/store/collections"
            className="inline-flex items-center gap-2 h-11 sm:h-12 px-5 sm:px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors"
          >
            Shop the collection
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Keep reading */}
      {more.length > 0 && (
        <div className="bg-[#FDF8F4] border-t border-[#EFE0D2]/60">
          <div className="max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
            <h2 className="font-display text-2xl sm:text-[28px] md:text-[32px] leading-tight text-ink-900 mb-8 sm:mb-10">
              Keep reading
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {more.map((p) => (
                <BlogCard key={p.slug} post={p} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer brand line so the page never ends abruptly when there are no
          other posts to keep reading. */}
      {more.length === 0 && (
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pb-12 text-center text-sm text-ink-500">
          More stories from {brand.name} are on the way.
        </div>
      )}
    </article>
  );
}
