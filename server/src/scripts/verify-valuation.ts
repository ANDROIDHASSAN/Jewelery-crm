/* eslint-disable no-console */
// READ-ONLY verification of the 9K-basis stock valuation against real tenant
// data. Writes nothing.
//
// Runs the ACTUAL production code paths — resolveMetalRates() and
// computeValuation() — inside a real tenant context, then independently
// re-derives the same total from raw rows, bucketed per metal. If the two
// disagree, the formula and the aggregation have drifted apart.
//
// Run from server/:
//   npx tsx src/scripts/verify-valuation.ts               # busiest tenant
//   npx tsx src/scripts/verify-valuation.ts --tenant=<id>

import { metalPurityLabel, metalValueOrCostPaise } from '@goldos/shared/metal-rate';
import { rawPrisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { runWithTenant } from '../lib/async-context.js';
import { resolveMetalRates } from '../lib/metal-rate.js';
import { computeValuation } from '../modules/inventory/inventory.service.js';

const rupees = (p: number): string =>
  `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

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

  if (!tenantId) {
    console.log('No tenant with items found.');
    return;
  }

  await runWithTenant({ tenantId }, async () => {
    const rates = await resolveMetalRates();
    console.log(`\nTenant: ${tenantId}`);
    console.log('─'.repeat(78));
    console.log('RESOLVED RATES');
    console.log(
      `  9K gold  : ${rates.gold9kPaise ? rupees(rates.gold9kPaise) + '/g' : '(not configured)'}  [${rates.goldSource}]`,
    );
    console.log(
      `  Silver   : ${rates.silverPaise ? rupees(rates.silverPaise) + '/g' : '(not configured)'}  [${rates.silverSource}]`,
    );
    console.log(
      `  Platinum : ${rates.platinum950Paise ? rupees(rates.platinum950Paise) + '/g' : '(not configured)'}  [${rates.platinumSource}]`,
    );
    console.log(
      `  GOLDAPI_KEY attached: ${rates.liveFeedConfigured}   CMS "as of": ${rates.cmsUpdatedAt ?? '—'}`,
    );

    const v = await computeValuation({});

    const items = await rawPrisma.item.findMany({
      where: { tenantId, status: 'IN_STOCK' },
      select: {
        weightMg: true,
        purityCaratX100: true,
        costPricePaise: true,
        isSerialized: true,
        quantityOnHand: true,
        category: { select: { metalType: true } },
        diamonds: { select: { costPaise: true } },
      },
    });

    type B = {
      units: number;
      metalPaise: number;
      diamondPaise: number;
      ratedUnits: number;
      weightMg: number;
    };
    const buckets = new Map<string, B>();
    let check = 0;
    for (const it of items) {
      const units = it.isSerialized ? 1 : it.quantityOnHand;
      const diamond = it.diamonds.reduce((s, d) => s + d.costPaise, 0);
      const metal = metalValueOrCostPaise(
        {
          metalType: it.category.metalType,
          weightMg: it.weightMg,
          purityCaratX100: it.purityCaratX100,
          costPricePaise: it.costPricePaise,
        },
        rates,
      );
      check += (metal + diamond) * units;
      const key = it.category.metalType ?? 'null';
      const b = buckets.get(key) ?? {
        units: 0,
        metalPaise: 0,
        diamondPaise: 0,
        ratedUnits: 0,
        weightMg: 0,
      };
      b.units += units;
      b.metalPaise += metal * units;
      b.diamondPaise += diamond * units;
      b.weightMg += it.weightMg * units;
      // Did this row price off a rate, or fall back to its cost?
      if (metal !== it.costPricePaise) b.ratedUnits += units;
      buckets.set(key, b);
    }

    console.log('\nBY METAL TYPE');
    console.log(
      '  ' +
        'metal'.padEnd(17) +
        'units'.padStart(7) +
        'weight(g)'.padStart(12) +
        'metal value'.padStart(18) +
        'diamond'.padStart(14) +
        '  basis',
    );
    for (const [metal, b] of [...buckets.entries()].sort((a, b) => b[1].metalPaise - a[1].metalPaise)) {
      const basis =
        b.ratedUnits === 0
          ? 'cost'
          : b.ratedUnits === b.units
            ? 'rate'
            : `mixed (${b.ratedUnits}/${b.units} rated)`;
      console.log(
        '  ' +
          metal.padEnd(17) +
          String(b.units).padStart(7) +
          (b.weightMg / 1000).toFixed(2).padStart(12) +
          rupees(b.metalPaise).padStart(18) +
          rupees(b.diamondPaise).padStart(14) +
          '  ' +
          basis,
      );
    }

    const shopSum = v.byShop.reduce((s, r) => s + r.totalPaise, 0);
    const catSum = v.byCategory.reduce((s, r) => s + r.totalPaise, 0);
    const agree = v.totalPaise === check;

    // What every chart / chip / receipt will now print for this stock. The old
    // purity-only labels rendered the STAINLESS_STEEL rows as "Silver".
    const labels = new Map<string, number>();
    for (const it of items) {
      const units = it.isSerialized ? 1 : it.quantityOnHand;
      const l = metalPurityLabel(it.category.metalType, it.purityCaratX100);
      labels.set(l, (labels.get(l) ?? 0) + units);
    }
    console.log('\nMATERIAL LABELS (what the charts/POS/receipt print)');
    for (const [label, units] of [...labels.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${label.padEnd(20)} ${String(units).padStart(5)} pieces`);
    }

    console.log('\nTOTALS');
    console.log(`  computeValuation()  : ${rupees(v.totalPaise)}   (${v.itemCount} pieces)`);
    console.log(`  independent re-calc : ${rupees(check)}  ${agree ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(
      `  byShop sum          : ${rupees(shopSum)}  ${shopSum === v.totalPaise ? '✅' : '❌'}`,
    );
    console.log(
      `  byCategory sum      : ${rupees(catSum)}  ${catSum === v.totalPaise ? '✅' : '❌'}`,
    );
    console.log('─'.repeat(78));

    if (!agree || shopSum !== v.totalPaise || catSum !== v.totalPaise) process.exitCode = 1;
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // BOTH connections must close or the process hangs forever. resolveMetalRates
    // reads Redis, and ioredis keeps the event loop alive on its own — closing
    // only Prisma leaves the script running, holding the Windows Prisma engine
    // DLL and blocking every later `prisma generate` with EPERM.
    await rawPrisma.$disconnect();
    redis.disconnect();
  });
