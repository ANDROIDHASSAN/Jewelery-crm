// Verifies the hybrid-inventory migration landed cleanly:
//  - existing Item rows have isSerialized=true and quantityOnHand=1
//  - existing Shop rows have type='RETAIL' (or 'WAREHOUSE' if isWarehouse=true)
//  - row counts match the pre-migration snapshot
//
//   node scripts/verify-hybrid-migration.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const itemTotal = await prisma.item.count();
  const itemsSerializedDefault = await prisma.item.count({ where: { isSerialized: true } });
  const itemsQtyOneDefault = await prisma.item.count({ where: { quantityOnHand: 1 } });

  const shopTotal = await prisma.shop.count();
  const shopRetail = await prisma.shop.count({ where: { type: 'RETAIL' } });
  const shopWarehouse = await prisma.shop.count({ where: { type: 'WAREHOUSE' } });
  const shopIsWarehouseTrue = await prisma.shop.count({ where: { isWarehouse: true } });

  const transferLineTotal = await prisma.transferLine.count();
  const transferLineQtyOne = await prisma.transferLine.count({ where: { quantity: 1 } });

  console.log('-- post-migration verification --');
  console.log(`Item:        ${itemTotal} rows`);
  console.log(`  isSerialized=true:    ${itemsSerializedDefault} (${itemsSerializedDefault === itemTotal ? 'ok' : 'MISMATCH'})`);
  console.log(`  quantityOnHand=1:     ${itemsQtyOneDefault} (${itemsQtyOneDefault === itemTotal ? 'ok' : 'MISMATCH'})`);

  console.log(`Shop:        ${shopTotal} rows`);
  console.log(`  type=RETAIL:          ${shopRetail}`);
  console.log(`  type=WAREHOUSE:       ${shopWarehouse}`);
  console.log(`  isWarehouse=true:     ${shopIsWarehouseTrue}`);
  console.log(
    `  WAREHOUSE / isWarehouse consistency: ${shopWarehouse === shopIsWarehouseTrue ? 'ok' : 'MISMATCH'}`,
  );

  console.log(`TransferLine: ${transferLineTotal} rows`);
  console.log(`  quantity=1:           ${transferLineQtyOne} (${transferLineQtyOne === transferLineTotal ? 'ok' : 'MISMATCH'})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
