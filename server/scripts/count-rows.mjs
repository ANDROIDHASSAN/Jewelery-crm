// One-off row-count snapshot for verifying the hybrid-inventory migration
// did not lose or duplicate any data. Run before and after `migrate deploy`
// and diff the two outputs.
//
//   node scripts/count-rows.mjs
//
// Prints a one-line-per-table summary so it's easy to eyeball.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tables = [
  'tenant',
  'shop',
  'user',
  'item',
  'itemMovement',
  'transfer',
  'transferLine',
  'bill',
  'billLine',
  'customer',
  'category',
  'vendor',
  'purchaseOrder',
];

async function main() {
  const at = new Date().toISOString();
  console.log(`-- row counts @ ${at} --`);
  for (const t of tables) {
    try {
      const n = await prisma[t].count();
      console.log(`${t.padEnd(20)} ${n}`);
    } catch (err) {
      console.log(`${t.padEnd(20)} ERROR  ${err.message}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
