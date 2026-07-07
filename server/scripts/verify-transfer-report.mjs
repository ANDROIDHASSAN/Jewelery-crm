// Verifies /analytics/stock-transfers aggregation SQL runs correctly AND
// reconciles the route/weight totals against an independent per-line JS sum.
//   node scripts/verify-transfer-report.mjs
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Pick the tenant with the most transfers so we exercise real data.
  const grouped = await prisma.transfer.groupBy({ by: ['tenantId'], _count: { _all: true } });
  grouped.sort((a, b) => b._count._all - a._count._all);
  const tenantId = grouped[0]?.tenantId;
  console.log('tenants with transfers:', grouped.map((g) => `${g.tenantId}:${g._count._all}`).join(', ') || '(none)');
  if (!tenantId) {
    console.log('No transfer data in any tenant — SQL will be exercised on empty set.');
  }
  const tid = tenantId ?? 'cmpuzcx-none';

  const statusFilter = Prisma.sql`AND t."status" <> 'REJECTED'`;

  // The exact route query from the endpoint.
  const routeRows = await prisma.$queryRaw`
    SELECT t."fromShopId", t."toShopId",
           COUNT(DISTINCT t."id")::bigint AS transfers,
           SUM(tl."quantity")::bigint AS qty,
           SUM(tl."quantity" * i."weightMg")::bigint AS weight
    FROM "Transfer" t
    JOIN "TransferLine" tl ON tl."transferId" = t."id"
    JOIN "Item" i ON i."id" = tl."itemId"
    WHERE t."tenantId" = ${tid}
      ${statusFilter}
    GROUP BY t."fromShopId", t."toShopId"
  `;
  console.log('\n[SQL] routes returned:', routeRows.length);
  const sqlWeight = routeRows.reduce((a, r) => a + Number(r.weight ?? 0), 0);
  const sqlQty = routeRows.reduce((a, r) => a + Number(r.qty ?? 0), 0);
  console.log('[SQL] total weightMg:', sqlWeight, '| total qty:', sqlQty);

  // Independent reconciliation: pull raw lines and sum in JS.
  const transfers = await prisma.transfer.findMany({
    where: { tenantId: tid, status: { not: 'REJECTED' } },
    select: { id: true, lines: { select: { quantity: true, item: { select: { weightMg: true } } } } },
  });
  let jsWeight = 0;
  let jsQty = 0;
  for (const t of transfers) {
    for (const l of t.lines) {
      jsQty += l.quantity;
      jsWeight += l.quantity * l.item.weightMg;
    }
  }
  console.log('[JS ] total weightMg:', jsWeight, '| total qty:', jsQty, '| transfers:', transfers.length);

  const ok = sqlWeight === jsWeight && sqlQty === jsQty;
  console.log('\nRECONCILES:', ok ? 'YES ✓' : 'NO ✗ — MISMATCH');
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('QUERY FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
