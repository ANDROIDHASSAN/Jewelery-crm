// Backfill: for every IN_STOCK inventory Item that has a name + at least one
// image, create a linked storefront Product so the public catalog reflects
// the back-of-house catalog from day one.
//
// Idempotent — skips items that already have a Product via Product.linkedItemId.
// Slug collisions get an id-derived suffix appended. Cost price flows into
// basePricePaise as a starting floor (e-commerce route re-prices live from
// gold rate at runtime).
//
//   node scripts/backfill-products-from-items.mjs           # dry run
//   node scripts/backfill-products-from-items.mjs --apply   # actually write

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

function slugify(raw) {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'item';
}

async function reserveSlug(tenantId, base, itemId) {
  const candidate = slugify(base);
  const existing = await prisma.product.findUnique({
    where: { tenantId_slug: { tenantId, slug: candidate } },
    select: { id: true },
  });
  if (!existing) return candidate;
  return `${candidate}-${itemId.slice(-6).toLowerCase()}`;
}

async function main() {
  const items = await prisma.item.findMany({
    where: {
      status: 'IN_STOCK',
      name: { not: null },
      // images: { isEmpty: false } not portable across Prisma versions for
      // String[] — filter in JS below.
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      images: true,
      categoryId: true,
      weightMg: true,
      purityCaratX100: true,
      makingChargeBps: true,
      costPricePaise: true,
      sku: true,
    },
  });

  const eligible = items.filter((i) => i.name && i.images.length > 0);
  console.log(`Eligible items (IN_STOCK, named, with image): ${eligible.length}`);

  // Skip items that already have a linked Product.
  const linkedIds = await prisma.product.findMany({
    where: { linkedItemId: { in: eligible.map((i) => i.id) } },
    select: { linkedItemId: true },
  });
  const alreadyLinked = new Set(linkedIds.map((r) => r.linkedItemId));
  const toCreate = eligible.filter((i) => !alreadyLinked.has(i.id));

  console.log(`Already linked, skipping: ${alreadyLinked.size}`);
  console.log(`To create:                ${toCreate.length}`);

  if (!APPLY) {
    console.log('\nDry run — pass --apply to actually create the Product rows.');
    if (toCreate.length > 0) {
      console.log('\nSample (first 5):');
      for (const it of toCreate.slice(0, 5)) {
        console.log(`  - [${it.sku}] ${it.name} (${it.images.length} image(s))`);
      }
    }
    return;
  }

  let created = 0;
  let failed = 0;
  for (const it of toCreate) {
    try {
      const slug = await reserveSlug(it.tenantId, it.name, it.id);
      await prisma.product.create({
        data: {
          tenantId: it.tenantId,
          linkedItemId: it.id,
          name: it.name,
          slug,
          categoryId: it.categoryId,
          descriptionMd: '',
          images: it.images,
          weightMg: it.weightMg,
          purityCaratX100: it.purityCaratX100,
          makingChargeBps: it.makingChargeBps ?? 0,
          basePricePaise: it.costPricePaise,
          stoneChargePaise: 0,
          isPublished: true,
        },
      });
      created += 1;
    } catch (err) {
      failed += 1;
      console.error(`  FAIL [${it.sku}] ${it.name}:`, err.message);
    }
  }
  console.log(`\nCreated: ${created}, Failed: ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
