/* eslint-disable no-console */
// READ-ONLY check of what the three homepage collection rows will render.
// Writes nothing.
//
// Mirrors GET /website/collections-list exactly, then joins against the CMS
// shopByOccasion tiles the way StorefrontHome's CollectionTiles does, so we can
// see per-metal counts and which tiles survive the "has published stock in this
// metal" gate.
//
// Run from server/:  npx tsx src/scripts/verify-collections.ts

import { rawPrisma } from '../lib/prisma.js';

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--tenant='));
  const tenantId =
    arg?.split('=')[1] ??
    (
      await rawPrisma.item.groupBy({
        by: ['tenantId'],
        _count: { _all: true },
        orderBy: { _count: { tenantId: 'desc' } },
        take: 1,
      })
    )[0]?.tenantId;
  if (!tenantId) return console.log('No tenant found.');

  const collections = await rawPrisma.collection.findMany({
    where: { tenantId, items: { some: { item: { storefrontProduct: { isPublished: true } } } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      name: true,
      slug: true,
      items: {
        where: { item: { storefrontProduct: { isPublished: true } } },
        select: { item: { select: { category: { select: { metalType: true } } } } },
      },
    },
  });

  console.log(`\nTenant: ${tenantId}`);
  console.log('─'.repeat(78));
  console.log('COLLECTIONS WITH PUBLISHED STOCK (what /collections-list returns)');
  if (collections.length === 0) console.log('  (none)');
  const countsBySlug = new Map<string, Record<string, number>>();
  for (const c of collections) {
    const byMetal: Record<string, number> = {};
    for (const ic of c.items) {
      const m = ic.item.category.metalType;
      byMetal[m] = (byMetal[m] ?? 0) + 1;
    }
    countsBySlug.set(c.slug, byMetal);
    const breakdown = Object.entries(byMetal)
      .map(([m, n]) => `${m}:${n}`)
      .join('  ');
    console.log(`  ${c.name.padEnd(24)} ${c.slug.padEnd(20)} ${breakdown}`);
  }

  // The CMS tiles that supply the images/names for those rows.
  const sf = await rawPrisma.storefrontContent.findUnique({ where: { tenantId } });
  const content = sf?.content as Record<string, unknown> | null;
  const tiles = (content?.['shopByOccasion'] ?? []) as Array<{
    name: string;
    slug: string;
    count: number;
  }>;

  console.log('\nCMS shopByOccasion TILES (stored count vs live per-metal)');
  for (const t of tiles) {
    const byMetal = countsBySlug.get(t.slug);
    const live = byMetal ? Object.values(byMetal).reduce((a, b) => a + b, 0) : 0;
    const note = byMetal ? '' : '  ← no published stock / no such collection';
    console.log(`  ${t.name.padEnd(20)} ${t.slug.padEnd(18)} stored=${String(t.count).padStart(3)}  live=${String(live).padStart(3)}${note}`);
  }

  for (const [label, metal] of [
    ['Demifine row (STAINLESS_STEEL)', 'STAINLESS_STEEL'],
    ['9KT gold row (GOLD)', 'GOLD'],
    ['Silver row (SILVER)', 'SILVER'],
  ] as const) {
    const visible = tiles
      .map((t) => ({ t, n: countsBySlug.get(t.slug)?.[metal] ?? 0 }))
      .filter((x) => x.n > 0);
    console.log(`\n${label} → ${visible.length === 0 ? 'renders NOTHING (row hidden)' : `${visible.length} tile(s)`}`);
    for (const v of visible) console.log(`    ${v.t.name} — ${v.n} product(s)`);
  }
  console.log('─'.repeat(78));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void rawPrisma.$disconnect());
