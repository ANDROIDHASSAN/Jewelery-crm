/* eslint-disable no-console */
// READ-ONLY: why a coupon does / doesn't reach the storefront announcement bar.
// Prints each gate /website/coupons applies. Writes nothing. No Redis → exits
// on Prisma disconnect alone.
//
// Run from server/:  npx tsx src/scripts/check-coupons.ts

import { rawPrisma } from '../lib/prisma.js';

async function main(): Promise<void> {
  const now = new Date();
  const rows = await rawPrisma.couponCode.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      code: true,
      isActive: true,
      showOnStorefront: true,
      validFrom: true,
      validUntil: true,
      usageCount: true,
      usageLimitTotal: true,
    },
  });

  console.log(`\nNow: ${now.toISOString()}  (${now.toLocaleString('en-IN')})`);
  console.log('─'.repeat(96));
  console.log(
    '  ' +
      'CODE'.padEnd(10) +
      'active'.padEnd(8) +
      'onSF'.padEnd(7) +
      'started'.padEnd(9) +
      'notExpired'.padEnd(12) +
      'hasUses'.padEnd(9) +
      '=> ADVERTISED',
  );
  for (const c of rows) {
    const started = c.validFrom <= now;
    const notExpired = c.validUntil == null || c.validUntil >= now;
    const hasUses = c.usageLimitTotal == null || c.usageCount < c.usageLimitTotal;
    const shown = c.isActive && c.showOnStorefront && started && notExpired && hasUses;
    console.log(
      '  ' +
        c.code.padEnd(10) +
        String(c.isActive).padEnd(8) +
        String(c.showOnStorefront).padEnd(7) +
        String(started).padEnd(9) +
        String(notExpired).padEnd(12) +
        String(hasUses).padEnd(9) +
        (shown ? '✅ YES' : '❌ no'),
    );
    if (!notExpired) {
      const days = Math.round((now.getTime() - c.validUntil!.getTime()) / 86_400_000);
      console.log(
        `             ↳ validUntil ${c.validUntil!.toISOString().slice(0, 10)} — EXPIRED ${days} day(s) ago`,
      );
    }
    if (!started) {
      console.log(`             ↳ validFrom ${c.validFrom.toISOString().slice(0, 10)} — not started yet`);
    }
    if (!hasUses) {
      console.log(`             ↳ used ${c.usageCount}/${c.usageLimitTotal} — exhausted`);
    }
  }
  console.log('─'.repeat(96));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void rawPrisma.$disconnect());
