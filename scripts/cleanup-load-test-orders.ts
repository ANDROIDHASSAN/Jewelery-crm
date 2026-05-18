/**
 * One-shot cleanup for the junk orders the earlier load test created.
 *
 * The load test in scripts/load-orders.ts placed ~60 orders with customer
 * name like "Load Buyer warm-…" or "Load Buyer load-…". They're cluttering
 * the admin Kanban + skewing the revenue tile. Delete via the customer
 * name pattern + bounded date so we never touch real orders.
 *
 * Run with:  npx tsx scripts/cleanup-load-test-orders.ts [--dry-run]
 *
 * By default we do a dry-run preview. Pass `--apply` to actually delete.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function color(c: string, s: string): string {
  return `\x1b[${c}m${s}\x1b[0m`;
}
const red = (s: string): string => color('31', s);
const green = (s: string): string => color('32', s);
const yellow = (s: string): string => color('33', s);
const dim = (s: string): string => color('90', s);

async function main(): Promise<void> {
  console.log(dim('Scanning for load-test orders…'));

  // Match every "Load Buyer …" customer + every "Notification Test" / "Debug" / "E2E Test Buyer"
  // throwaway. Bounded by createdAt > 2026-05-15 (well before today) so we
  // never delete production orders, even if a customer's real name starts
  // with "Load Buyer".
  const SAFE_DATE_FLOOR = new Date('2026-05-15T00:00:00Z');
  const namePatterns = ['Load Buyer', 'Notification Test', 'Debug', 'E2E Test Buyer'];

  const junkCustomers = await prisma.customer.findMany({
    where: {
      OR: namePatterns.map((p) => ({ name: { startsWith: p } })),
      createdAt: { gte: SAFE_DATE_FLOOR },
    },
    select: { id: true, name: true, tenantId: true, _count: { select: { orders: true, bills: true } } },
  });

  if (junkCustomers.length === 0) {
    console.log(green('Nothing to clean — DB is already tidy.'));
    return;
  }

  // Sum stats so the dry-run shows what we'd touch.
  const customerIds = junkCustomers.map((c) => c.id);
  const [orderCount, orderAgg, eventCount, leadCount] = await Promise.all([
    prisma.order.count({ where: { customerId: { in: customerIds } } }),
    prisma.order.aggregate({
      where: { customerId: { in: customerIds } },
      _sum: { totalPaise: true },
    }),
    prisma.orderEvent.count({ where: { order: { customerId: { in: customerIds } } } }),
    prisma.lead.count({ where: { phone: { in: junkCustomers.map((c) => c.id) } } }),
  ]);

  console.log(`\n${yellow('Junk found:')}`);
  console.log(`  ${dim('Customers')}    ${junkCustomers.length}`);
  console.log(`  ${dim('Orders')}       ${orderCount}`);
  console.log(`  ${dim('Order events')} ${eventCount}`);
  console.log(`  ${dim('Total revenue')} ₹${((orderAgg._sum.totalPaise ?? 0) / 100).toLocaleString('en-IN')}`);
  void leadCount; // Leads aren't keyed by customerId in this schema — skip.

  if (!APPLY) {
    console.log(`\n${dim('Dry-run only. Pass --apply to actually delete.')}`);
    return;
  }

  console.log(`\n${red('Deleting…')}`);
  // Cascade order: OrderEvent (via Order onDelete cascade) → Order → Customer.
  // CartItem / WishlistItem also cascade off Customer. Lead-mirror rows
  // referencing these customers don't cascade — they have no FK — but we
  // ignore them (a leftover Lead pointing at a deleted phone is harmless).
  const orders = await prisma.order.deleteMany({
    where: { customerId: { in: customerIds } },
  });
  console.log(`  ${green('✓')} Deleted ${orders.count} orders (cascades dropped order events + items)`);

  const customers = await prisma.customer.deleteMany({
    where: { id: { in: customerIds } },
  });
  console.log(`  ${green('✓')} Deleted ${customers.count} customers (cascades dropped cart + wishlist)`);

  console.log(`\n${green('Done.')}`);
}

main()
  .catch((err) => {
    console.error(red('Cleanup failed:'), err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
