// Dynamic sitemap + robots for the public storefront (SEO Plan §5–6).
//
// A crawler discovers deep pages through sitemap.xml. Since our storefront is a
// client-rendered SPA, without a sitemap Google never learns that
// /products/<slug> or /collections/<slug> exist. This module generates the
// whole set FROM THE DATABASE so a newly-published product/collection/blog post
// shows up in the sitemap on the next fetch — no rebuild, no manual edit.
//
// Structure (mirrors the Shopify/Palmonas sitemap-index model):
//   /sitemap.xml               → index pointing at the child sitemaps below
//   /sitemap-pages.xml         → home + static pages (story, care, hallmark…)
//   /sitemap-collections.xml   → every /collections/<slug> landing page
//   /sitemap-products.xml      → every published /products/<slug>
//   /sitemap-blog.xml          → the Journal index + every /blog/<slug>
//   /robots.txt                → crawl guidance + Sitemap: pointer
//
// These are mounted on websiteRouter (so they live at /api/v1/website/*) and
// exposed at the clean storefront paths (/sitemap.xml, /robots.txt …) via the
// vercel.json rewrites — the URLs MUST be served from the storefront's own
// domain, not the Render API domain, or Google rejects cross-host sitemaps.

import type { Request, Response, Router } from 'express';
import { rawPrisma } from '../../lib/prisma.js';
import { resolveCanonicalTenantId } from '../../lib/canonical-tenant.js';
import { env } from '../../env.js';

// Tenant for a public request: explicit ?tenant= wins (multi-tenant/preview),
// else the canonical tenant this deployment's storefront maps to. Same rule the
// rest of website.routes.ts uses, kept local so this file stands alone.
async function resolveTenant(req: Request): Promise<string> {
  const t = req.query['tenant'];
  if (typeof t === 'string' && t.length > 0) return t;
  return resolveCanonicalTenantId();
}

// Slugify a category name the same way website.routes.ts does, so the
// /collections/<slug> URLs we emit resolve to the same page the storefront nav
// links to. Kept in sync deliberately (a shared 6-line helper isn't worth an
// import cycle).
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The canonical public origin for <loc> URLs. Prefer the explicitly-configured
// canonical host (correct for SEO — one host, never a mix); otherwise rebuild
// it from the headers Vercel forwards when it proxies the clean /sitemap.xml
// path to this API, so the very first deploy still emits usable absolute URLs.
function resolveSiteBaseUrl(req: Request): string {
  const configured = env.STOREFRONT_BASE_URL.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const fwdHost = req.headers['x-forwarded-host'];
  const host =
    (typeof fwdHost === 'string' && fwdHost.split(',')[0]?.trim()) ||
    req.headers['host'] ||
    'localhost:3000';
  const fwdProto = req.headers['x-forwarded-proto'];
  const proto =
    (typeof fwdProto === 'string' && fwdProto.split(',')[0]?.trim()) ||
    (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// XML text escaping. Slugs are `[a-z0-9-]` today, but names/URLs could carry
// `&` etc. — escape defensively so one stray character can't break the whole
// document for the crawler.
function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

// A YYYY-MM-DD <lastmod> value (W3C date — the form Search Console prefers).
function isoDate(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

type UrlEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority?: number;
};

function renderUrlset(entries: UrlEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority != null) parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function renderIndex(base: string, children: Array<{ path: string; lastmod?: string }>): string {
  const items = children
    .map((c) => {
      const lastmod = c.lastmod ? `\n    <lastmod>${c.lastmod}</lastmod>` : '';
      return `  <sitemap>\n    <loc>${xmlEscape(base + c.path)}</loc>${lastmod}\n  </sitemap>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

// Sitemaps regenerate from live data but change slowly — let the CDN hold them
// for an hour (with SWR) instead of the 10s the parent website middleware sets,
// so a crawler's repeated fetches don't hammer the DB.
function setSitemapCache(res: Response): void {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
}

// Static storefront pages worth indexing (mirrors client routes.tsx —
// STATIC_PATHS + the top-level nav/hub pages). Cart/account/search/track/order
// are intentionally excluded (thin, private, or non-canonical — see robots.txt).
const STATIC_PAGES: Array<{ path: string; priority: number; changefreq: UrlEntry['changefreq'] }> = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/collections', priority: 0.8, changefreq: 'daily' },
  { path: '/sale', priority: 0.7, changefreq: 'daily' },
  { path: '/blog', priority: 0.6, changefreq: 'weekly' },
  { path: '/locations', priority: 0.6, changefreq: 'monthly' },
  { path: '/story', priority: 0.5, changefreq: 'monthly' },
  { path: '/workshop', priority: 0.4, changefreq: 'monthly' },
  { path: '/contact', priority: 0.5, changefreq: 'monthly' },
  { path: '/care', priority: 0.4, changefreq: 'monthly' },
  { path: '/hallmark', priority: 0.4, changefreq: 'monthly' },
  { path: '/help', priority: 0.3, changefreq: 'monthly' },
  { path: '/privacy', priority: 0.2, changefreq: 'yearly' },
  { path: '/terms', priority: 0.2, changefreq: 'yearly' },
];

// Read the tenant's blog posts out of the storefront CMS content blob. Posts
// live as `content.blogs: { slug, date, ... }[]` (storefrontContentSlice.ts);
// tolerate a missing/malformed blob rather than 500 the sitemap.
async function loadBlogPosts(tenantId: string): Promise<Array<{ slug: string; date?: string }>> {
  const row = await rawPrisma.storefrontContent.findUnique({
    where: { tenantId },
    select: { content: true },
  });
  const content = row?.content as { blogs?: unknown } | null;
  const blogs = content?.blogs;
  if (!Array.isArray(blogs)) return [];
  const out: Array<{ slug: string; date?: string }> = [];
  for (const b of blogs) {
    if (b && typeof b === 'object') {
      const slug = (b as { slug?: unknown }).slug;
      const date = (b as { date?: unknown }).date;
      if (typeof slug === 'string' && slug.length > 0) {
        out.push({ slug, date: typeof date === 'string' ? date : undefined });
      }
    }
  }
  return out;
}

export function registerSitemapRoutes(router: Router): void {
  // ── Sitemap index — the one URL you submit to Search Console / Bing. ──────
  router.get('/sitemap.xml', async (req, res, next) => {
    try {
      const base = resolveSiteBaseUrl(req);
      const today = isoDate(new Date());
      setSitemapCache(res);
      res.send(
        renderIndex(base, [
          { path: '/sitemap-pages.xml', lastmod: today },
          { path: '/sitemap-collections.xml', lastmod: today },
          { path: '/sitemap-products.xml', lastmod: today },
          { path: '/sitemap-blog.xml', lastmod: today },
        ]),
      );
    } catch (err) {
      next(err);
    }
  });

  // ── Static pages ──────────────────────────────────────────────────────────
  router.get('/sitemap-pages.xml', async (req, res, next) => {
    try {
      const base = resolveSiteBaseUrl(req);
      const entries: UrlEntry[] = STATIC_PAGES.map((p) => ({
        loc: base + p.path,
        changefreq: p.changefreq,
        priority: p.priority,
      }));
      setSitemapCache(res);
      res.send(renderUrlset(entries));
    } catch (err) {
      next(err);
    }
  });

  // ── Collections — both curated Collections (own slug) AND category-derived
  // landing pages (/collections/<slugified category name>), deduped. Both
  // resolve to the storefront CollectionPage. ────────────────────────────────
  router.get('/sitemap-collections.xml', async (req, res, next) => {
    try {
      const tenantId = await resolveTenant(req);
      const base = resolveSiteBaseUrl(req);

      const [collections, categories] = await Promise.all([
        // Only Collections that actually contain a published product — never
        // link a crawler to an empty page (matches /collections-list).
        rawPrisma.collection.findMany({
          where: {
            tenantId,
            items: { some: { item: { storefrontProduct: { isPublished: true } } } },
          },
          select: { slug: true, createdAt: true },
        }),
        rawPrisma.category.findMany({
          where: { tenantId },
          select: { name: true },
        }),
      ]);

      const seen = new Set<string>();
      const entries: UrlEntry[] = [];
      for (const c of collections) {
        if (seen.has(c.slug)) continue;
        seen.add(c.slug);
        entries.push({
          loc: `${base}/collections/${c.slug}`,
          lastmod: isoDate(c.createdAt),
          changefreq: 'daily',
          priority: 0.9,
        });
      }
      for (const cat of categories) {
        const slug = slugifyName(cat.name);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        entries.push({ loc: `${base}/collections/${slug}`, changefreq: 'daily', priority: 0.9 });
      }

      setSitemapCache(res);
      res.send(renderUrlset(entries));
    } catch (err) {
      next(err);
    }
  });

  // ── Products — every published PDP. Capped at Google's 50k-URL sitemap
  // limit; if the catalog ever exceeds it, paginate into sitemap-products-N.xml
  // and add them to the index above. ─────────────────────────────────────────
  router.get('/sitemap-products.xml', async (req, res, next) => {
    try {
      const tenantId = await resolveTenant(req);
      const base = resolveSiteBaseUrl(req);
      const products = await rawPrisma.product.findMany({
        where: { tenantId, isPublished: true },
        select: { slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50000,
      });
      const entries: UrlEntry[] = products.map((p) => ({
        loc: `${base}/products/${p.slug}`,
        lastmod: isoDate(p.createdAt),
        changefreq: 'weekly',
        priority: 0.8,
      }));
      setSitemapCache(res);
      res.send(renderUrlset(entries));
    } catch (err) {
      next(err);
    }
  });

  // ── Blog / Journal — the index + each post. ─────────────────────────────────
  router.get('/sitemap-blog.xml', async (req, res, next) => {
    try {
      const tenantId = await resolveTenant(req);
      const base = resolveSiteBaseUrl(req);
      const posts = await loadBlogPosts(tenantId);
      const entries: UrlEntry[] = [
        { loc: `${base}/blog`, changefreq: 'weekly', priority: 0.6 },
        ...posts.map((p) => ({
          loc: `${base}/blog/${p.slug}`,
          lastmod: isoDate(p.date),
          changefreq: 'monthly' as const,
          priority: 0.6,
        })),
      ];
      setSitemapCache(res);
      res.send(renderUrlset(entries));
    } catch (err) {
      next(err);
    }
  });

  // ── robots.txt ──────────────────────────────────────────────────────────────
  router.get('/robots.txt', (req, res) => {
    const base = resolveSiteBaseUrl(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        // Thin / private / non-canonical surfaces — keep them out of the index
        // so crawl budget goes to products & collections.
        'Disallow: /account',
        'Disallow: /cart',
        'Disallow: /wishlist',
        'Disallow: /search',
        'Disallow: /track',
        'Disallow: /order/',
        'Disallow: /*?tenant=',
        'Disallow: /*?section=',
        'Disallow: /*?sub=',
        '',
        '# Slow down aggressive SEO crawlers (they add no discovery value here)',
        'User-agent: AhrefsBot',
        'Crawl-delay: 10',
        'User-agent: SemrushBot',
        'Crawl-delay: 10',
        'User-agent: MJ12bot',
        'Crawl-delay: 10',
        '',
        '# AI shopping crawlers (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot,',
        '# Google-Extended) are intentionally NOT blocked — that is how the brand',
        '# surfaces in AI shopping answers (AEO/GEO).',
        '',
        `Sitemap: ${base}/sitemap.xml`,
        '',
      ].join('\n'),
    );
  });
}
