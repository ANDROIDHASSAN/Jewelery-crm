/**
 * Destructive wipe of ONE tenant's transactional / test data, to hand over a
 * fresh database. Deletes inventory, catalog, stock ops, purchasing, POS &
 * invoices, CRM, finance, e-commerce, customers and the audit trail for the
 * chosen tenant.
 *
 * KEEPS (never touched): Website CMS (StorefrontContent), logins (Tenant, User,
 * UserInvitation, Role, Permission, RolePermission, UserPermission), Shops, and
 * CouponCode definitions. AuthEvent + AuditLog for the tenant ARE cleared.
 *
 * The delete order is leaf -> root so every RESTRICT foreign key is satisfied
 * without relying on cascade config. Runs as plain sequential deletes (no giant
 * transaction) to avoid remote-Neon transaction timeouts; the order is
 * FK-consistent at every step, so a partial run is safe to re-run.
 *
 * Usage (from repo root):
 *   npx tsx scripts/wipe-tenant-data.ts --list
 *       List every tenant with row counts so you can identify the live one.
 *   npx tsx scripts/wipe-tenant-data.ts --tenant=<id>
 *       DRY RUN: print exactly what would be deleted for that tenant.
 *   npx tsx scripts/wipe-tenant-data.ts --tenant=<id> --apply
 *       Execute the delete for that tenant.
 *   ... add --wipe-gold-rates to ALSO clear the GLOBAL GoldRateDaily table
 *       (shared across all tenants — not tenant-scoped).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Prisma Client reads DATABASE_URL from process.env at construction. The app
// keeps it in server/.env, so load that if it isn't already in the ambient env.
if (!process.env.DATABASE_URL) {
  try {
    const txt = readFileSync(resolve(process.cwd(), 'server/.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && process.env[m[1]] === undefined) {
        let v = m[2]!.trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  } catch {
    /* fall back to ambient env */
  }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIST = argv.includes('--list') || argv.length === 0;
const WIPE_GOLD_RATES = argv.includes('--wipe-gold-rates');
const tenantArg = argv.find((a) => a.startsWith('--tenant='));
const TENANT_ID = tenantArg ? tenantArg.split('=')[1] : undefined;

function color(c: string, s: string): string {
  return `\x1b[${c}m${s}\x1b[0m`;
}
const red = (s: string): string => color('31', s);
const green = (s: string): string => color('32', s);
const yellow = (s: string): string => color('33', s);
const cyan = (s: string): string => color('36', s);
const dim = (s: string): string => color('90', s);

// Ordered leaf -> root delete plan. Each entry names a Prisma model delegate
// and the `where` that scopes it to the tenant (child tables without a
// tenantId column are scoped through their parent relation). Order matters:
// a row is always deleted before any row it references via a RESTRICT FK.
function plan(t: string): Array<{ label: string; run: () => Promise<{ count: number }> }> {
  return [
    // ── E-commerce ───────────────────────────────────────────────────────
    { label: 'orderReview',        run: () => prisma.orderReview.deleteMany({ where: { tenantId: t } }) },
    { label: 'orderEvent',         run: () => prisma.orderEvent.deleteMany({ where: { tenantId: t } }) },
    { label: 'orderItem',          run: () => prisma.orderItem.deleteMany({ where: { order: { tenantId: t } } }) },
    { label: 'couponUsage',        run: () => prisma.couponUsage.deleteMany({ where: { tenantId: t } }) },
    { label: 'cartItem',           run: () => prisma.cartItem.deleteMany({ where: { tenantId: t } }) },
    { label: 'wishlistItem',       run: () => prisma.wishlistItem.deleteMany({ where: { tenantId: t } }) },
    { label: 'order',              run: () => prisma.order.deleteMany({ where: { tenantId: t } }) },
    { label: 'productSection',     run: () => prisma.productSection.deleteMany({ where: { tenantId: t } }) },
    { label: 'product',            run: () => prisma.product.deleteMany({ where: { tenantId: t } }) },
    // ── POS / invoices ───────────────────────────────────────────────────
    { label: 'payment',            run: () => prisma.payment.deleteMany({ where: { bill: { tenantId: t } } }) },
    { label: 'oldGoldExchange',    run: () => prisma.oldGoldExchange.deleteMany({ where: { bill: { tenantId: t } } }) },
    { label: 'refund',             run: () => prisma.refund.deleteMany({ where: { bill: { tenantId: t } } }) },
    { label: 'billLine',           run: () => prisma.billLine.deleteMany({ where: { bill: { tenantId: t } } }) },
    { label: 'bill',               run: () => prisma.bill.deleteMany({ where: { tenantId: t } }) },
    { label: 'cashMovement',       run: () => prisma.cashMovement.deleteMany({ where: { tenantId: t } }) },
    { label: 'parkedBill',         run: () => prisma.parkedBill.deleteMany({ where: { tenantId: t } }) },
    { label: 'registerSession',    run: () => prisma.registerSession.deleteMany({ where: { tenantId: t } }) },
    { label: 'estimate',           run: () => prisma.estimate.deleteMany({ where: { tenantId: t } }) },
    { label: 'repair',             run: () => prisma.repair.deleteMany({ where: { tenantId: t } }) },
    { label: 'advance',            run: () => prisma.advance.deleteMany({ where: { tenantId: t } }) },
    // ── Finance ──────────────────────────────────────────────────────────
    { label: 'goldLoanRepayment',  run: () => prisma.goldLoanRepayment.deleteMany({ where: { loan: { tenantId: t } } }) },
    { label: 'goldLoan',           run: () => prisma.goldLoan.deleteMany({ where: { tenantId: t } }) },
    { label: 'loyaltyTransaction', run: () => prisma.loyaltyTransaction.deleteMany({ where: { tenantId: t } }) },
    { label: 'vendorPayment',      run: () => prisma.vendorPayment.deleteMany({ where: { tenantId: t } }) },
    { label: 'expense',            run: () => prisma.expense.deleteMany({ where: { tenantId: t } }) },
    { label: 'bankTransaction',    run: () => prisma.bankTransaction.deleteMany({ where: { tenantId: t } }) },
    { label: 'reconciliation',     run: () => prisma.reconciliation.deleteMany({ where: { tenantId: t } }) },
    { label: 'bankAccount',        run: () => prisma.bankAccount.deleteMany({ where: { tenantId: t } }) },
    // ── Purchasing ───────────────────────────────────────────────────────
    { label: 'purchaseOrderItem',  run: () => prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId: t } } }) },
    { label: 'purchaseOrder',      run: () => prisma.purchaseOrder.deleteMany({ where: { tenantId: t } }) },
    { label: 'vendor',             run: () => prisma.vendor.deleteMany({ where: { tenantId: t } }) },
    // ── Stock ops ────────────────────────────────────────────────────────
    { label: 'transferLine',       run: () => prisma.transferLine.deleteMany({ where: { transfer: { tenantId: t } } }) },
    { label: 'stockRequestLine',   run: () => prisma.stockRequestLine.deleteMany({ where: { request: { tenantId: t } } }) },
    { label: 'stockRequest',       run: () => prisma.stockRequest.deleteMany({ where: { tenantId: t } }) },
    { label: 'transfer',           run: () => prisma.transfer.deleteMany({ where: { tenantId: t } }) },
    // ── Inventory / catalog ──────────────────────────────────────────────
    { label: 'saleItem',           run: () => prisma.saleItem.deleteMany({ where: { tenantId: t } }) },
    { label: 'itemDiamond',        run: () => prisma.itemDiamond.deleteMany({ where: { tenantId: t } }) },
    { label: 'itemMovement',       run: () => prisma.itemMovement.deleteMany({ where: { tenantId: t } }) },
    { label: 'itemCollection',     run: () => prisma.itemCollection.deleteMany({ where: { tenantId: t } }) },
    { label: 'item',               run: () => prisma.item.deleteMany({ where: { tenantId: t } }) },
    { label: 'collection',         run: () => prisma.collection.deleteMany({ where: { tenantId: t } }) },
    { label: 'category',           run: () => prisma.category.deleteMany({ where: { tenantId: t } }) },
    // ── CRM ──────────────────────────────────────────────────────────────
    { label: 'leadActivity',       run: () => prisma.leadActivity.deleteMany({ where: { lead: { tenantId: t } } }) },
    { label: 'lead',               run: () => prisma.lead.deleteMany({ where: { tenantId: t } }) },
    { label: 'whatsAppMessage',    run: () => prisma.whatsAppMessage.deleteMany({ where: { tenantId: t } }) },
    // ── Customers (operator chose to remove) ─────────────────────────────
    { label: 'customerAddress',    run: () => prisma.customerAddress.deleteMany({ where: { tenantId: t } }) },
    { label: 'customer',           run: () => prisma.customer.deleteMany({ where: { tenantId: t } }) },
    // ── Audit + auth history ─────────────────────────────────────────────
    { label: 'auditLog',           run: () => prisma.auditLog.deleteMany({ where: { tenantId: t } }) },
    { label: 'authEvent',          run: () => prisma.authEvent.deleteMany({ where: { tenantId: t } }) },
  ];
}

// Dry-run counts — one count() per model in the plan, same scoping.
async function previewCounts(t: string): Promise<Array<{ label: string; count: number }>> {
  const p = prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>;
  const scoped: Record<string, unknown> = {
    orderReview: { tenantId: t }, orderEvent: { tenantId: t },
    orderItem: { order: { tenantId: t } }, couponUsage: { tenantId: t },
    cartItem: { tenantId: t }, wishlistItem: { tenantId: t }, order: { tenantId: t },
    productSection: { tenantId: t }, product: { tenantId: t },
    payment: { bill: { tenantId: t } }, oldGoldExchange: { bill: { tenantId: t } },
    refund: { bill: { tenantId: t } }, billLine: { bill: { tenantId: t } }, bill: { tenantId: t },
    cashMovement: { tenantId: t }, parkedBill: { tenantId: t }, registerSession: { tenantId: t },
    estimate: { tenantId: t }, repair: { tenantId: t }, advance: { tenantId: t },
    goldLoanRepayment: { loan: { tenantId: t } }, goldLoan: { tenantId: t },
    loyaltyTransaction: { tenantId: t }, vendorPayment: { tenantId: t }, expense: { tenantId: t },
    bankTransaction: { tenantId: t }, reconciliation: { tenantId: t }, bankAccount: { tenantId: t },
    purchaseOrderItem: { purchaseOrder: { tenantId: t } }, purchaseOrder: { tenantId: t }, vendor: { tenantId: t },
    transferLine: { transfer: { tenantId: t } }, stockRequestLine: { request: { tenantId: t } },
    stockRequest: { tenantId: t }, transfer: { tenantId: t }, saleItem: { tenantId: t },
    itemDiamond: { tenantId: t }, itemMovement: { tenantId: t }, itemCollection: { tenantId: t },
    item: { tenantId: t }, collection: { tenantId: t }, category: { tenantId: t },
    leadActivity: { lead: { tenantId: t } }, lead: { tenantId: t }, whatsAppMessage: { tenantId: t },
    customerAddress: { tenantId: t }, customer: { tenantId: t },
    auditLog: { tenantId: t }, authEvent: { tenantId: t },
  };
  const out: Array<{ label: string; count: number }> = [];
  for (const [label] of plan(t).map((e) => [e.label] as const)) {
    const count = await p[label]!.count({ where: scoped[label] });
    out.push({ label, count });
  }
  return out;
}

async function listTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, businessName: true, createdAt: true } });
  console.log(cyan(`\n${tenants.length} tenant(s):\n`));
  for (const t of tenants) {
    const [items, bills, orders, leads, customers, products, vendors, pos] = await Promise.all([
      prisma.item.count({ where: { tenantId: t.id } }),
      prisma.bill.count({ where: { tenantId: t.id } }),
      prisma.order.count({ where: { tenantId: t.id } }),
      prisma.lead.count({ where: { tenantId: t.id } }),
      prisma.customer.count({ where: { tenantId: t.id } }),
      prisma.product.count({ where: { tenantId: t.id } }),
      prisma.vendor.count({ where: { tenantId: t.id } }),
      prisma.purchaseOrder.count({ where: { tenantId: t.id } }),
    ]);
    console.log(`${yellow(t.id)}  ${t.businessName ?? '(no name)'}  ${dim('created ' + t.createdAt.toISOString().slice(0, 10))}`);
    console.log(
      `   items=${items}  bills=${bills}  orders=${orders}  leads=${leads}  customers=${customers}  products=${products}  vendors=${vendors}  POs=${pos}\n`,
    );
  }
  const rateRows = await prisma.goldRateDaily.count();
  console.log(dim(`GoldRateDaily (GLOBAL, shared across tenants): ${rateRows} row(s)\n`));
  console.log(dim('Next: npx tsx scripts/wipe-tenant-data.ts --tenant=<id>   (dry run)\n'));
}

async function main(): Promise<void> {
  if (LIST && !TENANT_ID) {
    await listTenants();
    return;
  }
  if (!TENANT_ID) {
    console.error(red('Missing --tenant=<id>. Run with --list first to find it.'));
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true, businessName: true } });
  if (!tenant) {
    console.error(red(`No tenant with id ${TENANT_ID}. Run --list to see valid ids.`));
    process.exit(1);
  }

  console.log(cyan(`\nTenant: ${tenant.id}  ${tenant.businessName ?? ''}`));
  const preview = await previewCounts(TENANT_ID);
  const total = preview.reduce((s, r) => s + r.count, 0);
  console.log(dim(`\nRows that will be deleted (${total} total):`));
  for (const r of preview) {
    if (r.count > 0) console.log(`   ${r.label.padEnd(20)} ${r.count}`);
  }
  if (WIPE_GOLD_RATES) {
    const gr = await prisma.goldRateDaily.count();
    console.log(`   ${red('goldRateDaily (GLOBAL)'.padEnd(20))} ${gr}   ${red('← affects ALL tenants')}`);
  }

  if (!APPLY) {
    console.log(yellow(`\nDRY RUN. Nothing deleted. Re-run with --apply to execute.\n`));
    return;
  }

  console.log(red(`\nDeleting for tenant ${TENANT_ID}…\n`));
  let grand = 0;
  for (const step of plan(TENANT_ID)) {
    const { count } = await step.run();
    grand += count;
    if (count > 0) console.log(`   ${green('✓')} ${step.label.padEnd(20)} ${count}`);
  }
  if (WIPE_GOLD_RATES) {
    const r = await prisma.goldRateDaily.deleteMany({});
    grand += r.count;
    console.log(`   ${green('✓')} ${'goldRateDaily'.padEnd(20)} ${r.count} ${dim('(global)')}`);
  }
  console.log(green(`\nDone. Deleted ${grand} row(s). Kept: CMS, logins, shops, coupon codes.\n`));
}

main()
  .catch((err) => {
    console.error(red('Wipe failed:'), err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
