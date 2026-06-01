// server/prisma/seed.ts — comprehensive demo fixtures so every admin module
// has live data. Run: `npm run db:seed`. Uses rawPrisma (no tenant extension)
// since we're populating from scratch.

import { Prisma } from '@prisma/client';
import { rawPrisma as prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '@goldos/shared/constants';

// Demo accounts the dev login page uses out of the box. Print these in the
// final boot banner so the operator can copy them.
const DEMO_ACCOUNTS = [
  { email: 'owner@goldos.dev', password: 'Owner@2026demo', role: 'SUPER_ADMIN', name: 'Anant K.', phone: '+919876543210' },
  { email: 'accountant@goldos.dev', password: 'Account@2026', role: 'ACCOUNTANT', name: 'Priya M.', phone: '+919811112222' },
  { email: 'employee@goldos.dev', password: 'Staff@2026demo', role: 'EMPLOYEE', name: 'Ravi S.', phone: '+919811113333' },
  { email: 'cashier@goldos.dev', password: 'Cashier@2026', role: 'POS_USER', name: 'Neha T.', phone: '+919811114444' },
] as const;

async function main(): Promise<void> {
  // Production safety gate. The seed historically did a destructive
  // "delete tenant + recreate fixtures" on every run — fine while the only
  // data was demo, catastrophic once a real merchant started using the
  // owner@goldos.dev tenant. Render's autoDeploy runs this on every push,
  // so without the gate every git push silently wiped live inventory,
  // customers, bills, etc.
  //
  // New behaviour:
  //   - If a tenant for owner@goldos.dev already exists AND
  //     SEED_FORCE_RESET is NOT set to "true", we exit early without
  //     touching anything. The deploy is a no-op for the seed step.
  //   - On a truly empty database (first deploy ever), we still seed the
  //     full demo fixture so the app boots with a working tenant.
  //   - To intentionally re-fixture (e.g. for a demo refresh), set
  //     SEED_FORCE_RESET=true in the Render env and trigger a deploy.
  const forceReset = process.env['SEED_FORCE_RESET'] === 'true';

  // First, check (outside the long transaction) whether anything already
  // exists for the demo tenant. If yes and we're not forcing a reset,
  // exit before opening the costly tx.
  const existingTenant = await prisma.tenant.findUnique({
    where: { ownerEmail: 'owner@goldos.dev' },
    select: { id: true },
  });
  if (existingTenant && !forceReset) {
    // eslint-disable-next-line no-console
    console.log('[seed] tenant owner@goldos.dev already exists — preserving live data.');
    // eslint-disable-next-line no-console
    console.log('[seed] set SEED_FORCE_RESET=true to wipe and re-fixture.');
    await redis.quit().catch(() => {});
    return;
  }

  // Long timeout because the seed touches many tables; Neon's default 5s
  // interactive-tx limit closes mid-insert otherwise.
  await prisma.$transaction(
    async (tx) => {
    // Idempotent reseed:
    //   1. Capture the current StorefrontContent (CMS edits) BEFORE cascading delete.
    //   2. Drop+recreate the demo tenant + all its rows for clean fixtures.
    //   3. Restore the captured StorefrontContent at the end, so user CMS edits
    //      survive across deploys. (If none was ever published, the seed default
    //      below is used.)
    // This whole branch only runs when the gate above let us through:
    // either a fresh DB, or an operator who explicitly set SEED_FORCE_RESET.
    const existing = await tx.tenant.findUnique({ where: { ownerEmail: 'owner@goldos.dev' } });
    let preservedContent: Awaited<ReturnType<typeof tx.storefrontContent.findUnique>> = null;
    if (existing) {
      preservedContent = await tx.storefrontContent.findUnique({ where: { tenantId: existing.id } });
      // Several child rows have FKs pointing to tenant-owned rows WITHOUT
      // `onDelete: Cascade` (e.g. OrderItem.product, BillLine.item, ItemMovement.item).
      // The tenant-level cascade can't reach them, so the parent delete fails
      // with FK violations. Manually clean them in dependency order first.
      await tx.orderItem.deleteMany({ where: { order: { tenantId: existing.id } } });
      await tx.billLine.deleteMany({ where: { bill: { tenantId: existing.id } } });
      await tx.refund.deleteMany({ where: { bill: { tenantId: existing.id } } });
      await tx.itemMovement.deleteMany({ where: { tenantId: existing.id } });
      // POS shop-owner rows.
      await tx.cashMovement.deleteMany({ where: { tenantId: existing.id } });
      await tx.parkedBill.deleteMany({ where: { tenantId: existing.id } });
      await tx.estimate.deleteMany({ where: { tenantId: existing.id } });
      await tx.repair.deleteMany({ where: { tenantId: existing.id } });
      await tx.advance.deleteMany({ where: { tenantId: existing.id } });
      await tx.registerSession.deleteMany({ where: { tenantId: existing.id } });
      // Finance v2 — order matters because BankTransaction FK to BankAccount.
      await tx.bankTransaction.deleteMany({ where: { tenantId: existing.id } });
      await tx.vendorPayment.deleteMany({ where: { tenantId: existing.id } });
      await tx.reconciliation.deleteMany({ where: { tenantId: existing.id } });
      await tx.bankAccount.deleteMany({ where: { tenantId: existing.id } });
      // Payroll + GoldLoan: tenant cascade covers both, but their FKs to User
      // (RESTRICT) can fight us when we delete users below — clear first.
      await tx.payroll.deleteMany({ where: { tenantId: existing.id } });
      await tx.goldLoanRepayment.deleteMany({ where: { loan: { tenantId: existing.id } } });
      await tx.goldLoan.deleteMany({ where: { tenantId: existing.id } });
      // RBAC rows. UserPermission cascades from User; clear roles after users
      // are gone so User.roleId RESTRICT doesn't fight us.
      await tx.userPermission.deleteMany({ where: { user: { tenantId: existing.id } } });
      await tx.user.deleteMany({ where: { tenantId: existing.id } });
      await tx.rolePermission.deleteMany({ where: { role: { tenantId: existing.id } } });
      await tx.role.deleteMany({ where: { tenantId: existing.id } });
      await tx.tenant.delete({ where: { id: existing.id } });
    }

    const tenant = await tx.tenant.create({
      data: {
        businessName: 'Zelora',
        gstNumber: '27AAAPL1234C1Z5',
        phone: '+919876543210',
        ownerEmail: 'owner@goldos.dev',
        plan: 'STARTER',
        brandPrimary: '#C99B2A',
      },
    });

    const [shopMain, shopBranch] = await Promise.all([
      tx.shop.create({
        data: {
          tenantId: tenant.id,
          name: 'Main Showroom — Gurugram',
          address: 'MG Road, Gurugram, Haryana 122001',
          gstStateCode: '06',
          phone: '+911244440011',
        },
      }),
      tx.shop.create({
        data: {
          tenantId: tenant.id,
          name: 'Karnal Branch — Haryana',
          address: 'Sector 14, Karnal, Haryana 132001',
          gstStateCode: '06',
          phone: '+911842630022',
        },
      }),
    ]);

    // ── RBAC seed ────────────────────────────────────────────────────────
    // Permission catalog is global. Use upsert-by-key so this seed is
    // idempotent when re-run on a fresh DB.
    for (const p of PERMISSIONS) {
      await tx.permission.upsert({
        where: { key: p.key },
        update: { module: p.module, action: p.action, description: p.description },
        create: { key: p.key, module: p.module, action: p.action, description: p.description },
      });
    }
    const allPerms = await tx.permission.findMany({ select: { id: true, key: true } });
    const permIdByKey = new Map(allPerms.map((p) => [p.key, p.id] as const));

    // Roles per tenant (system roles).
    type RoleSlug = 'SUPER_ADMIN' | 'ACCOUNTANT' | 'EMPLOYEE' | 'POS_USER';
    const ROLE_DEFS: Array<{ slug: RoleSlug; name: string; description: string }> = [
      { slug: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full access across every module.' },
      { slug: 'ACCOUNTANT', name: 'Accountant', description: 'Stock, finance, accounting, and reports.' },
      { slug: 'EMPLOYEE', name: 'Employee', description: 'Stock, e-commerce, leads, and reports.' },
      { slug: 'POS_USER', name: 'POS Cashier', description: 'Offline POS subdomain only.' },
    ];

    const roleBySlug = new Map<RoleSlug, string>();
    for (const def of ROLE_DEFS) {
      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          slug: def.slug,
          name: def.name,
          description: def.description,
          isSystem: true,
        },
      });
      roleBySlug.set(def.slug, role.id);
      const keys = def.slug === 'SUPER_ADMIN'
        ? allPerms.map((p) => p.key)
        : ROLE_DEFAULT_PERMISSIONS[def.slug];
      await tx.rolePermission.createMany({
        data: keys
          .map((k) => permIdByKey.get(k))
          .filter((id): id is string => id !== undefined)
          .map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }

    // Users — email + password (argon2id), one per demo role.
    // Pre-hash with bcrypt's cousin so the login flow works out-of-the-box.
    const hashes = await Promise.all(DEMO_ACCOUNTS.map((a) => hashPassword(a.password)));
    await tx.user.createMany({
      data: DEMO_ACCOUNTS.map((a, i) => ({
        tenantId: tenant.id,
        shopId: a.role === 'POS_USER' ? shopBranch.id : a.role === 'EMPLOYEE' ? shopMain.id : null,
        name: a.name,
        email: a.email,
        phone: a.phone,
        roleId: roleBySlug.get(a.role as RoleSlug)!,
        passwordHash: hashes[i]!,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      })),
    });

    // Re-fetch the cashier users so we can attribute seeded bills to them —
    // the analytics /staff endpoint filters out bills with createdByUserId
    // IS NULL, so without this the leaderboard would render empty even on a
    // freshly-seeded DB.
    const cashiers = await tx.user.findMany({
      where: { tenantId: tenant.id, roleId: roleBySlug.get('POS_USER')! },
      select: { id: true, shopId: true },
    });

    // Multiple categories so every storefront collection tab has products.
    // The `Item` table (physical inventory) keeps pointing at "Daily Wear"
    // for simplicity; the storefront `Product` rows fan out across all five.
    const [catDaily, catBridal, catFestive, catDiamond, catSilver] = await Promise.all([
      tx.category.create({
        data: { tenantId: tenant.id, name: 'Daily Wear', metalType: 'GOLD', defaultMakingChargeBps: 1200 },
      }),
      tx.category.create({
        data: { tenantId: tenant.id, name: 'Bridal', metalType: 'GOLD', defaultMakingChargeBps: 1500 },
      }),
      tx.category.create({
        data: { tenantId: tenant.id, name: 'Festive', metalType: 'GOLD', defaultMakingChargeBps: 1300 },
      }),
      tx.category.create({
        data: { tenantId: tenant.id, name: 'Diamond', metalType: 'GOLD', defaultMakingChargeBps: 1600 },
      }),
      tx.category.create({
        data: { tenantId: tenant.id, name: 'Silver', metalType: 'SILVER', defaultMakingChargeBps: 800 },
      }),
    ]);
    const category = catDaily;

    // Multiple vendors so the Vendors tab + Purchase Orders tab feel real.
    const [vendorSurat, vendorMumbai, vendorJaipur] = await Promise.all([
      tx.vendor.create({
        data: {
          tenantId: tenant.id,
          name: 'Surat Bullion Co.',
          gstNumber: '24AAACS1429C1ZP',
          phone: '+912614435560',
          address: 'Mahidharpura, Surat 395003',
          outstandingPaise: 2_45_000_00,
        },
      }),
      tx.vendor.create({
        data: {
          tenantId: tenant.id,
          name: 'Zaveri Bazaar Imports',
          gstNumber: '27AABCZ4567E1Z9',
          phone: '+912266443322',
          address: 'Zaveri Bazaar, Mumbai 400003',
          outstandingPaise: 0,
        },
      }),
      tx.vendor.create({
        data: {
          tenantId: tenant.id,
          name: 'Jaipur Kundan Karigars',
          gstNumber: '08AAKCJ2233D1Z2',
          phone: '+911414235566',
          address: 'Johari Bazaar, Jaipur 302003',
          outstandingPaise: 78_500_00,
        },
      }),
    ]);

    // ── Real jewellery items, spread across categories ────────────────
    // 40 named pieces with proper Unsplash images so the POS catalog
    // looks like an actual showroom inventory rather than a SKU list.
    // Each SKU is unique + categorised + priced from a realistic cost
    // basis (~₹6,000/g cost on 22K which leaves room for making + GST).
    const IMG = {
      ring: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=900&q=80',
      ],
      necklace: [
        'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80',
      ],
      bangle: [
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80',
      ],
      earring: [
        // Reuse the bangle/necklace bank — the dedicated earring photo
        // IDs returned 404 in the live catalog. These render reliably.
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
      ],
      mangalsutra: [
        'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=80',
      ],
      chain: [
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80',
      ],
      pendant: [
        'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
      ],
      bridalSet: [
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1200&q=80',
      ],
      diamond: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
      ],
      silver: [
        'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=900&q=80',
      ],
    };

    type ItemSeed = {
      sku: string;
      name: string;
      categoryId: string;
      weightG: number;
      purity: 2400 | 2200 | 1800 | 1400 | 0 | 925;
      makingBps: number;
      stoneWeightMg?: number;
      hallmark?: 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT';
      hallmarkRef?: string;
      images: string[];
      shop: 'MAIN' | 'BRANCH';
    };

    const itemSeeds: ItemSeed[] = [
      // ── Bridal (heavy, statement, 22K) ────────────────────────────────
      { sku: 'BRD-NEC-001', name: 'Niya Bridal Haar (Kundan + Pearl)', categoryId: catBridal.id, weightG: 65.50, purity: 2200, makingBps: 1800, stoneWeightMg: 2400, hallmark: 'CERTIFIED', hallmarkRef: 'BR0001', images: IMG.bridalSet, shop: 'MAIN' },
      { sku: 'BRD-SET-002', name: 'Isha Bridal Set (Necklace + Jhumka + Tikka)', categoryId: catBridal.id, weightG: 82.00, purity: 2200, makingBps: 1900, stoneWeightMg: 3200, hallmark: 'CERTIFIED', hallmarkRef: 'BR0002', images: IMG.bridalSet, shop: 'MAIN' },
      { sku: 'BRD-CHK-003', name: 'Kavya Polki Choker', categoryId: catBridal.id, weightG: 38.20, purity: 2200, makingBps: 1750, stoneWeightMg: 1800, hallmark: 'CERTIFIED', hallmarkRef: 'BR0003', images: IMG.necklace, shop: 'MAIN' },
      { sku: 'BRD-BNG-004', name: 'Mira Wedding Bangle (Pair)', categoryId: catBridal.id, weightG: 24.80, purity: 2200, makingBps: 1500, hallmark: 'CERTIFIED', hallmarkRef: 'BR0004', images: IMG.bangle, shop: 'MAIN' },
      { sku: 'BRD-EAR-005', name: 'Aanya Bridal Jhumka', categoryId: catBridal.id, weightG: 18.60, purity: 2200, makingBps: 1600, stoneWeightMg: 600, hallmark: 'CERTIFIED', hallmarkRef: 'BR0005', images: IMG.earring, shop: 'BRANCH' },

      // ── Daily Wear (light, everyday, 22K) ─────────────────────────────
      { sku: 'DW-MNG-006', name: 'Tara Lightweight Mangalsutra', categoryId: catDaily.id, weightG: 8.10, purity: 2200, makingBps: 1100, hallmark: 'CERTIFIED', hallmarkRef: 'DW0006', images: IMG.mangalsutra, shop: 'MAIN' },
      { sku: 'DW-CHN-007', name: 'Diya Rope Chain 18-inch', categoryId: catDaily.id, weightG: 7.40, purity: 2200, makingBps: 1050, hallmark: 'CERTIFIED', hallmarkRef: 'DW0007', images: IMG.chain, shop: 'MAIN' },
      { sku: 'DW-STD-008', name: 'Sara Classic Studs', categoryId: catDaily.id, weightG: 2.40, purity: 2200, makingBps: 1000, hallmark: 'CERTIFIED', hallmarkRef: 'DW0008', images: IMG.earring, shop: 'MAIN' },
      { sku: 'DW-NSP-009', name: 'Meera Single-Stone Nose Pin', categoryId: catDaily.id, weightG: 0.90, purity: 2200, makingBps: 1100, stoneWeightMg: 50, hallmark: 'CERTIFIED', hallmarkRef: 'DW0009', images: IMG.earring, shop: 'BRANCH' },
      { sku: 'DW-RNG-010', name: 'Nisha Everyday Ring', categoryId: catDaily.id, weightG: 3.20, purity: 2200, makingBps: 1100, hallmark: 'CERTIFIED', hallmarkRef: 'DW0010', images: IMG.ring, shop: 'BRANCH' },
      { sku: 'DW-BNG-011', name: 'Lata Plain Bangle (Single)', categoryId: catDaily.id, weightG: 9.50, purity: 2200, makingBps: 1100, hallmark: 'CERTIFIED', hallmarkRef: 'DW0011', images: IMG.bangle, shop: 'MAIN' },
      { sku: 'DW-PND-012', name: 'Anya Mini Pendant', categoryId: catDaily.id, weightG: 2.80, purity: 2200, makingBps: 1150, hallmark: 'CERTIFIED', hallmarkRef: 'DW0012', images: IMG.pendant, shop: 'BRANCH' },

      // ── Festive (mid-weight, statement-but-wearable, 22K) ─────────────
      { sku: 'FST-JHM-013', name: 'Riya Pearl Jhumka', categoryId: catFestive.id, weightG: 5.20, purity: 2200, makingBps: 1250, stoneWeightMg: 200, hallmark: 'CERTIFIED', hallmarkRef: 'FT0013', images: IMG.earring, shop: 'MAIN' },
      { sku: 'FST-NEC-014', name: 'Aanya Temple Haar', categoryId: catFestive.id, weightG: 28.00, purity: 2200, makingBps: 1450, hallmark: 'CERTIFIED', hallmarkRef: 'FT0014', images: IMG.necklace, shop: 'MAIN' },
      { sku: 'FST-BNG-015', name: 'Vanya Patterned Bangle (Pair)', categoryId: catFestive.id, weightG: 22.00, purity: 2200, makingBps: 1300, hallmark: 'CERTIFIED', hallmarkRef: 'FT0015', images: IMG.bangle, shop: 'MAIN' },
      { sku: 'FST-JHM-016', name: 'Priya Ruby-Drop Jhumka', categoryId: catFestive.id, weightG: 8.60, purity: 2200, makingBps: 1350, stoneWeightMg: 400, hallmark: 'CERTIFIED', hallmarkRef: 'FT0016', images: IMG.earring, shop: 'BRANCH' },
      { sku: 'FST-CHN-017', name: 'Devi Festive Chain', categoryId: catFestive.id, weightG: 12.40, purity: 2200, makingBps: 1300, hallmark: 'CERTIFIED', hallmarkRef: 'FT0017', images: IMG.chain, shop: 'BRANCH' },
      { sku: 'FST-NSP-018', name: 'Kashvi Floral Nose Ring', categoryId: catFestive.id, weightG: 1.60, purity: 2200, makingBps: 1350, stoneWeightMg: 80, hallmark: 'CERTIFIED', hallmarkRef: 'FT0018', images: IMG.earring, shop: 'MAIN' },
      { sku: 'FST-PND-019', name: 'Saanvi Coin Pendant', categoryId: catFestive.id, weightG: 6.40, purity: 2200, makingBps: 1300, hallmark: 'CERTIFIED', hallmarkRef: 'FT0019', images: IMG.pendant, shop: 'BRANCH' },

      // ── Diamond (18K, certified) ─────────────────────────────────────
      { sku: 'DIA-RNG-020', name: 'Aarya Solitaire Ring (0.32ct)', categoryId: catDiamond.id, weightG: 4.20, purity: 1800, makingBps: 1500, stoneWeightMg: 64, hallmark: 'CERTIFIED', hallmarkRef: 'DI0020', images: IMG.diamond, shop: 'MAIN' },
      { sku: 'DIA-BR-021', name: 'Nyra Tennis Bracelet (2.4ct)', categoryId: catDiamond.id, weightG: 9.80, purity: 1800, makingBps: 1500, stoneWeightMg: 480, hallmark: 'CERTIFIED', hallmarkRef: 'DI0021', images: IMG.bangle, shop: 'MAIN' },
      { sku: 'DIA-RNG-022', name: 'Zara Halo Ring (0.50ct)', categoryId: catDiamond.id, weightG: 3.80, purity: 1800, makingBps: 1600, stoneWeightMg: 100, hallmark: 'CERTIFIED', hallmarkRef: 'DI0022', images: IMG.ring, shop: 'MAIN' },
      { sku: 'DIA-STD-023', name: 'Rhea Round-Brilliant Studs (0.20ct)', categoryId: catDiamond.id, weightG: 1.90, purity: 1800, makingBps: 1400, stoneWeightMg: 40, hallmark: 'CERTIFIED', hallmarkRef: 'DI0023', images: IMG.earring, shop: 'BRANCH' },
      { sku: 'DIA-PND-024', name: 'Inara Diamond Pendant (0.18ct)', categoryId: catDiamond.id, weightG: 2.10, purity: 1800, makingBps: 1450, stoneWeightMg: 36, hallmark: 'CERTIFIED', hallmarkRef: 'DI0024', images: IMG.diamond, shop: 'BRANCH' },
      { sku: 'DIA-MNG-025', name: 'Aditi Diamond Mangalsutra', categoryId: catDiamond.id, weightG: 11.20, purity: 1800, makingBps: 1500, stoneWeightMg: 220, hallmark: 'CERTIFIED', hallmarkRef: 'DI0025', images: IMG.mangalsutra, shop: 'MAIN' },

      // ── Silver (sterling 92.5) ────────────────────────────────────────
      { sku: 'SL-ANK-026', name: 'Tia Silver Anklet (Pair)', categoryId: catSilver.id, weightG: 36.00, purity: 925, makingBps: 800, hallmark: 'EXEMPT', images: IMG.silver, shop: 'BRANCH' },
      { sku: 'SL-BNG-027', name: 'Maya Oxidised Silver Bangle', categoryId: catSilver.id, weightG: 24.00, purity: 925, makingBps: 900, hallmark: 'EXEMPT', images: IMG.silver, shop: 'BRANCH' },
      { sku: 'SL-JHM-028', name: 'Leela Silver Temple Jhumka', categoryId: catSilver.id, weightG: 12.00, purity: 925, makingBps: 900, hallmark: 'EXEMPT', images: IMG.earring, shop: 'MAIN' },
      { sku: 'SL-CHN-029', name: 'Aria Silver Chain (20-inch)', categoryId: catSilver.id, weightG: 14.50, purity: 925, makingBps: 700, hallmark: 'EXEMPT', images: IMG.chain, shop: 'MAIN' },
      { sku: 'SL-RNG-030', name: 'Avni Silver Adjustable Ring', categoryId: catSilver.id, weightG: 4.20, purity: 925, makingBps: 800, hallmark: 'EXEMPT', images: IMG.ring, shop: 'BRANCH' },

      // ── 24K coins + 14K range under Daily Wear ────────────────────────
      { sku: 'COIN-24K-5', name: '5 g Pure Gold Coin (Lakshmi)', categoryId: catDaily.id, weightG: 5.00, purity: 2400, makingBps: 600, hallmark: 'CERTIFIED', hallmarkRef: 'CN0031', images: IMG.diamond, shop: 'MAIN' },
      { sku: 'COIN-24K-10', name: '10 g Pure Gold Coin (Ganesha)', categoryId: catDaily.id, weightG: 10.00, purity: 2400, makingBps: 500, hallmark: 'CERTIFIED', hallmarkRef: 'CN0032', images: IMG.diamond, shop: 'MAIN' },
      { sku: 'DW-14K-033', name: 'Ira 14K Tennis Pendant', categoryId: catDaily.id, weightG: 3.40, purity: 1400, makingBps: 1300, stoneWeightMg: 30, hallmark: 'CERTIFIED', hallmarkRef: 'DW0033', images: IMG.pendant, shop: 'BRANCH' },
      { sku: 'DW-14K-034', name: 'Kiara 14K Heart Ring', categoryId: catDaily.id, weightG: 2.20, purity: 1400, makingBps: 1400, hallmark: 'CERTIFIED', hallmarkRef: 'DW0034', images: IMG.ring, shop: 'BRANCH' },

      // ── Branch-only spread (Karnal sees a different mix) ──────────────
      { sku: 'FST-BNG-035', name: 'Riddhi Karva-Chauth Bangle', categoryId: catFestive.id, weightG: 16.20, purity: 2200, makingBps: 1300, hallmark: 'CERTIFIED', hallmarkRef: 'FT0035', images: IMG.bangle, shop: 'BRANCH' },
      { sku: 'DW-EAR-036', name: 'Pari Hoop Earrings', categoryId: catDaily.id, weightG: 4.80, purity: 2200, makingBps: 1100, hallmark: 'CERTIFIED', hallmarkRef: 'DW0036', images: IMG.earring, shop: 'BRANCH' },
      { sku: 'DW-RNG-037', name: 'Avya Stackable Ring', categoryId: catDaily.id, weightG: 2.60, purity: 2200, makingBps: 1150, hallmark: 'CERTIFIED', hallmarkRef: 'DW0037', images: IMG.ring, shop: 'BRANCH' },
      { sku: 'FST-NEC-038', name: 'Vidya Long Layered Necklace', categoryId: catFestive.id, weightG: 32.50, purity: 2200, makingBps: 1400, hallmark: 'CERTIFIED', hallmarkRef: 'FT0038', images: IMG.necklace, shop: 'MAIN' },
      { sku: 'BRD-EAR-039', name: 'Saira Statement Chandelier Earrings', categoryId: catBridal.id, weightG: 22.00, purity: 2200, makingBps: 1700, stoneWeightMg: 800, hallmark: 'CERTIFIED', hallmarkRef: 'BR0039', images: IMG.earring, shop: 'MAIN' },
      { sku: 'DW-MNG-040', name: 'Suhani Lightweight Mangalsutra', categoryId: catDaily.id, weightG: 7.20, purity: 2200, makingBps: 1100, hallmark: 'CERTIFIED', hallmarkRef: 'DW0040', images: IMG.mangalsutra, shop: 'BRANCH' },
    ];

    // Cost basis: 22K = ~₹6,200/g cost (room for making + GST + margin),
    // 24K = ~₹6,800/g, 18K = ~₹5,100/g, 14K = ~₹4,000/g, Silver = ~₹85/g.
    function costPerGramPaise(purity: ItemSeed['purity']): number {
      if (purity === 2400) return 6_80_000;
      if (purity === 2200) return 6_20_000;
      if (purity === 1800) return 5_10_000;
      if (purity === 1400) return 4_00_000;
      if (purity === 925) return 85_00;
      return 6_20_000;
    }

    await tx.item.createMany({
      data: itemSeeds.map((s) => ({
        tenantId: tenant.id,
        shopId: s.shop === 'MAIN' ? shopMain.id : shopBranch.id,
        categoryId: s.categoryId,
        sku: s.sku,
        barcodeData: s.sku,
        name: s.name,
        images: s.images,
        weightMg: Math.round(s.weightG * 1000),
        // Silver 925 doesn't fit the carat-x100 enum, so we store it as 0
        // (the canonical "silver" marker in this codebase) and let the
        // billing layer pick up the silver rate via purity===0.
        purityCaratX100: s.purity === 925 ? 0 : s.purity,
        stoneWeightMg: s.stoneWeightMg ?? null,
        hallmarkStatus: s.hallmark ?? 'CERTIFIED',
        hallmarkRef: s.hallmarkRef ?? null,
        costPricePaise: Math.round(s.weightG * costPerGramPaise(s.purity)),
        makingChargeBps: s.makingBps,
      })),
    });

    await tx.customer.createMany({
      data: [
        { tenantId: tenant.id, phone: '+919900001111', name: 'Mrs. Sharma', tags: ['VIP'] },
        { tenantId: tenant.id, phone: '+919900002222', name: 'Mr. Patel', tags: ['Retail'] },
        { tenantId: tenant.id, phone: '+919900003333', name: 'Ms. Iyer', tags: ['Wholesale'] },
      ],
    });

    // Leads — 2-3 per pipeline stage so the CRM board renders alive.
    await tx.lead.createMany({
      data: [
        // NEW
        { tenantId: tenant.id, source: 'instagram', name: 'Aanya Kapoor',   phone: '+919811220011', interest: 'Bridal set, 22K, 80g',     status: 'NEW',         utmSource: 'instagram', utmCampaign: 'bridal-edit-2025' },
        { tenantId: tenant.id, source: 'walkin',    name: 'Rohit Mehra',    phone: '+919811220012', interest: 'Engagement ring, solitaire 0.5ct', status: 'NEW' },
        { tenantId: tenant.id, source: 'whatsapp',  name: 'Sneha Pillai',   phone: '+919811220013', interest: 'Daily-wear chain, 22K',    status: 'NEW',         utmSource: 'whatsapp' },
        // CONTACTED
        { tenantId: tenant.id, source: 'instagram', name: 'Devika Joshi',   phone: '+919811220014', interest: 'Mangalsutra, lightweight', status: 'CONTACTED',   utmSource: 'instagram' },
        { tenantId: tenant.id, source: 'referral',  name: 'Vikram Anand',   phone: '+919811220015', interest: 'Gents bracelet, 22K, 25g', status: 'CONTACTED' },
        // INTERESTED
        { tenantId: tenant.id, source: 'walkin',    name: 'Priya Reddy',    phone: '+919811220016', interest: 'Bridal jhumkas + bangles', status: 'INTERESTED' },
        { tenantId: tenant.id, source: 'google',    name: 'Karan Sehgal',   phone: '+919811220017', interest: 'Diamond pendant ~1ct',     status: 'INTERESTED',  utmSource: 'google',    utmCampaign: 'diamond-festive' },
        // NEGOTIATION
        { tenantId: tenant.id, source: 'referral',  name: 'Meera Iyer',     phone: '+919811220018', interest: 'Custom necklace, 65g, kundan accents', status: 'NEGOTIATION' },
        { tenantId: tenant.id, source: 'whatsapp',  name: 'Arjun Bhatia',   phone: '+919811220019', interest: 'Anniversary ring pair',    status: 'NEGOTIATION', utmSource: 'whatsapp' },
        // CONVERTED
        { tenantId: tenant.id, source: 'walkin',    name: 'Nikhil Chawla',  phone: '+919811220020', interest: 'Bridal bangles — 12g pair', status: 'CONVERTED' },
        { tenantId: tenant.id, source: 'instagram', name: 'Saira Khan',     phone: '+919811220021', interest: 'Festive collection, light pieces', status: 'CONVERTED', utmSource: 'instagram' },
        // LOST
        { tenantId: tenant.id, source: 'google',    name: 'Tanvi Desai',    phone: '+919811220022', interest: 'Diamond solitaire (budget mismatch)', status: 'LOST', utmSource: 'google' },
        { tenantId: tenant.id, source: 'walkin',    name: 'Manish Khurana', phone: '+919811220023', interest: 'Silver gifting set',        status: 'LOST' },
      ],
    });

    // Expenses — recent month, mix of categories, both shops.
    const today = new Date();
    const daysAgo = (n: number): Date => new Date(today.getTime() - n * 86_400_000);
    await tx.expense.createMany({
      data: [
        // Current month-to-date (so the dashboard MTD tiles aren't empty).
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Rent',          amountPaise: 8_500_000,  paidAt: daysAgo(2),  notes: 'May rent — Main',     classification: 'REVENUE', paymentMode: 'UPI', isRecurring: true, recurringIntervalDays: 30 },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Salaries',      amountPaise: 24_000_000, paidAt: daysAgo(2),  notes: 'Staff payroll — May', classification: 'REVENUE', paymentMode: 'CASH' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Electricity',   amountPaise: 1_840_000,  paidAt: daysAgo(8),  notes: 'May bill',            classification: 'REVENUE', paymentMode: 'UPI' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Marketing',     amountPaise: 4_500_000,  paidAt: daysAgo(5),  notes: 'Bridal edit IG ads',  classification: 'REVENUE', paymentMode: 'CARD' },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Rent',          amountPaise: 4_200_000,  paidAt: daysAgo(2),  notes: 'May rent — Karnal',   classification: 'REVENUE', paymentMode: 'UPI', isRecurring: true, recurringIntervalDays: 30 },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Salaries',      amountPaise: 9_500_000,  paidAt: daysAgo(2),  notes: 'Staff payroll — May', classification: 'REVENUE', paymentMode: 'CASH' },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Repairs',       amountPaise: 720_000,    paidAt: daysAgo(5),  notes: 'Showcase glass repl.',classification: 'REVENUE', paymentMode: 'CASH' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Insurance',     amountPaise: 6_300_000,  paidAt: daysAgo(11), notes: 'Quarterly premium',   classification: 'REVENUE', paymentMode: 'CHEQUE' },
        // Capital expense — surfaces the capital vs revenue split on P&L.
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Furniture',     amountPaise: 18_500_000, paidAt: daysAgo(9),  notes: 'New display case',    classification: 'CAPITAL', paymentMode: 'CARD' },
        // Earlier months — feeds the 6-month trend.
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Rent',          amountPaise: 8_500_000,  paidAt: daysAgo(35), notes: 'Apr rent — Main',     classification: 'REVENUE', paymentMode: 'UPI' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Rent',          amountPaise: 8_500_000,  paidAt: daysAgo(65), notes: 'Mar rent — Main',     classification: 'REVENUE', paymentMode: 'UPI' },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Rent',          amountPaise: 4_200_000,  paidAt: daysAgo(35), notes: 'Apr rent — Karnal',   classification: 'REVENUE', paymentMode: 'UPI' },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Rent',          amountPaise: 4_200_000,  paidAt: daysAgo(65), notes: 'Mar rent — Karnal',   classification: 'REVENUE', paymentMode: 'UPI' },
      ],
    });

    // ── FINANCE: bank accounts ───────────────────────────────────────────
    const [bankHdfc, bankIcici] = await Promise.all([
      tx.bankAccount.create({
        data: {
          tenantId: tenant.id,
          nickname: 'HDFC current — Gurugram main',
          bankName: 'HDFC Bank',
          accountLast4: '4521',
          ifsc: 'HDFC0001234',
          type: 'CURRENT',
          openingBalancePaise: 25_00_000_00,
        },
      }),
      tx.bankAccount.create({
        data: {
          tenantId: tenant.id,
          nickname: 'ICICI current — Karnal branch',
          bankName: 'ICICI Bank',
          accountLast4: '8801',
          ifsc: 'ICIC0009876',
          type: 'CURRENT',
          openingBalancePaise: 12_00_000_00,
        },
      }),
    ]);

    // Bank transactions — a mix of credits (deposits) and debits (transfers
    // out) so the bank tab has running history.
    await tx.bankTransaction.createMany({
      data: [
        { tenantId: tenant.id, accountId: bankHdfc.id, direction: 'CREDIT', amountPaise: 5_45_000_00, description: 'POS settlement — Razorpay', referenceId: 'RZP_8821', occurredAt: daysAgo(7) },
        { tenantId: tenant.id, accountId: bankHdfc.id, direction: 'CREDIT', amountPaise: 2_40_000_00, description: 'POS settlement — Razorpay', referenceId: 'RZP_8923', occurredAt: daysAgo(4) },
        { tenantId: tenant.id, accountId: bankHdfc.id, direction: 'DEBIT',  amountPaise: 24_00_000_0,  description: 'Payroll transfer',          referenceId: 'PAYR_MAY',  occurredAt: daysAgo(2) },
        { tenantId: tenant.id, accountId: bankHdfc.id, direction: 'DEBIT',  amountPaise: 8_50_000_0,   description: 'Rent — Main showroom',      referenceId: 'RENT_MAY',  occurredAt: daysAgo(2) },
        { tenantId: tenant.id, accountId: bankIcici.id, direction: 'CREDIT', amountPaise: 1_80_000_00, description: 'POS settlement — Karnal',   referenceId: 'RZP_9011', occurredAt: daysAgo(6) },
        { tenantId: tenant.id, accountId: bankIcici.id, direction: 'DEBIT',  amountPaise: 9_50_000_0,  description: 'Karnal payroll',            referenceId: 'PAYR_KARNAL', occurredAt: daysAgo(2) },
      ],
    });

    // ── FINANCE: vendor payments — moves outstanding visibly ─────────────
    // Bump vendor outstandings first so payments have somewhere to land.
    await tx.vendor.update({ where: { id: vendorSurat.id },  data: { outstandingPaise: 45_00_000_00 } });
    await tx.vendor.update({ where: { id: vendorMumbai.id }, data: { outstandingPaise: 22_50_000_00 } });
    await tx.vendor.update({ where: { id: vendorJaipur.id }, data: { outstandingPaise: 8_75_000_00 } });
    await tx.vendorPayment.createMany({
      data: [
        { tenantId: tenant.id, vendorId: vendorSurat.id,  shopId: shopMain.id,   amountPaise: 15_00_000_00, paymentMode: 'UPI',    referenceId: 'UPI/8821',  paidAt: daysAgo(6),  notes: 'Partial against Surat PO',    bankAccountId: bankHdfc.id },
        { tenantId: tenant.id, vendorId: vendorSurat.id,  shopId: shopMain.id,   amountPaise: 5_00_000_00,  paymentMode: 'CHEQUE', referenceId: 'CHQ/40021', paidAt: daysAgo(12), notes: 'Cheque #40021',               bankAccountId: bankHdfc.id },
        { tenantId: tenant.id, vendorId: vendorMumbai.id, shopId: shopMain.id,   amountPaise: 8_00_000_00,  paymentMode: 'UPI',    referenceId: 'UPI/9012',  paidAt: daysAgo(4),  notes: 'Zaveri Bazaar settlement',    bankAccountId: bankHdfc.id },
        { tenantId: tenant.id, vendorId: vendorJaipur.id, shopId: shopBranch.id, amountPaise: 2_50_000_00,  paymentMode: 'UPI',    referenceId: 'UPI/9233',  paidAt: daysAgo(9),  notes: 'Jaipur partial',              bankAccountId: bankIcici.id },
      ],
    });
    // Decrement vendor outstandings to reflect the payments above.
    await tx.vendor.update({ where: { id: vendorSurat.id },  data: { outstandingPaise: 45_00_000_00 - 20_00_000_00 } });
    await tx.vendor.update({ where: { id: vendorMumbai.id }, data: { outstandingPaise: 22_50_000_00 - 8_00_000_00 } });
    await tx.vendor.update({ where: { id: vendorJaipur.id }, data: { outstandingPaise: 8_75_000_00 - 2_50_000_00 } });

    // Bills — sample sales across last 30 days so Dashboard + Analytics have signal.
    const sampleBills = [
      { days:  0, paise: 1_82_400_00, shop: shopMain.id,   status: 'PAID' as const,    making: 12_580_00, customer: 0 },
      { days:  1, paise: 64_300_00,  shop: shopMain.id,   status: 'PAID' as const,    making:  4_120_00, customer: 1 },
      { days:  3, paise: 2_45_900_00, shop: shopMain.id,   status: 'PAID' as const,    making: 17_400_00, customer: 0 },
      { days:  6, paise: 31_400_00,  shop: shopBranch.id, status: 'PAID' as const,    making:  2_350_00, customer: 2 },
      { days:  9, paise: 1_12_000_00, shop: shopMain.id,   status: 'PARTIAL' as const, making:  8_900_00, customer: null },
      { days: 12, paise: 78_500_00,  shop: shopBranch.id, status: 'PAID' as const,    making:  5_700_00, customer: 2 },
      { days: 17, paise: 3_20_500_00, shop: shopMain.id,   status: 'PAID' as const,    making: 22_800_00, customer: 0 },
      { days: 22, paise: 54_200_00,  shop: shopBranch.id, status: 'PAID' as const,    making:  3_900_00, customer: null },
    ];
    const customerIds = await tx.customer.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    // Build bills + their idempotency keys up-front so we can attach Payment
    // rows by billId after they're created.
    const billRows = sampleBills.map((b, i) => {
      const subtotal = b.paise - Math.round(b.paise * 300 / 10300); // back out 3% GST
      const gst = b.paise - subtotal;
      const shopCashiers = cashiers.filter((c) => c.shopId === b.shop);
      const cashier = shopCashiers[i % Math.max(1, shopCashiers.length)];
      return {
        tenantId: tenant.id,
        shopId: b.shop,
        billNumber: `INV-${String(1001 + i).padStart(5, '0')}`,
        customerId: b.customer !== null ? customerIds[b.customer]?.id ?? null : null,
        subtotalPaise: subtotal,
        makingChargesPaise: b.making,
        stoneChargesPaise: 0,
        cgstPaise: Math.floor(gst / 2),
        sgstPaise: Math.ceil(gst / 2),
        igstPaise: 0,
        oldGoldValuePaise: 0,
        discountPaise: 0,
        totalPaise: b.paise,
        paymentStatus: b.status,
        idempotencyKey: `seed-bill-${i + 1}-${tenant.id.slice(-6)}`,
        createdByUserId: cashier?.id ?? null,
        createdAt: daysAgo(b.days),
        _meta: { totalPaise: b.paise, status: b.status, daysAgo: b.days, index: i },
      };
    });
    await tx.bill.createMany({
      data: billRows.map(({ _meta, ...row }) => {
        void _meta;
        return row;
      }),
    });

    // Payments — without these the Mode-wise table and the daily-sales
    // cash/digital split stay empty, even though revenue is non-zero. Mix
    // CASH / UPI / CARD on a stable round-robin so the breakdown looks like
    // a real jeweller and so PARTIAL bills get a smaller deposit.
    const createdBills = await tx.bill.findMany({
      where: { tenantId: tenant.id, idempotencyKey: { in: billRows.map((b) => b.idempotencyKey) } },
      select: { id: true, idempotencyKey: true, totalPaise: true, paymentStatus: true, createdAt: true },
    });
    const billByKey = new Map(createdBills.map((b) => [b.idempotencyKey, b]));
    const paymentRows: Array<{
      billId: string;
      mode: 'CASH' | 'UPI' | 'CARD';
      amountPaise: number;
      referenceId: string | null;
      createdAt: Date;
    }> = [];
    const modeRotation: Array<'UPI' | 'CARD' | 'CASH'> = ['UPI', 'CARD', 'CASH'];
    billRows.forEach((b, i) => {
      const bill = billByKey.get(b.idempotencyKey);
      if (!bill) return;
      const primaryMode = modeRotation[i % modeRotation.length]!;
      if (bill.paymentStatus === 'PARTIAL') {
        // 60% deposit on UPI, leave the rest open.
        const deposit = Math.round(bill.totalPaise * 0.6);
        paymentRows.push({
          billId: bill.id,
          mode: 'UPI',
          amountPaise: deposit,
          referenceId: `UPI/${1000 + i}`,
          createdAt: bill.createdAt,
        });
        return;
      }
      // PAID bills: 70% on primary mode, 30% on a complementary mode so the
      // breakdown shows multiple slices. Single-mode bills are still common,
      // so every 3rd bill goes 100% on the primary mode.
      if (i % 3 === 0) {
        paymentRows.push({
          billId: bill.id,
          mode: primaryMode,
          amountPaise: bill.totalPaise,
          referenceId: primaryMode === 'CASH' ? null : `${primaryMode}/${2000 + i}`,
          createdAt: bill.createdAt,
        });
      } else {
        const secondary: 'CASH' | 'UPI' | 'CARD' =
          primaryMode === 'CASH' ? 'UPI' : primaryMode === 'UPI' ? 'CARD' : 'CASH';
        const main = Math.round(bill.totalPaise * 0.7);
        const rest = bill.totalPaise - main;
        paymentRows.push({
          billId: bill.id,
          mode: primaryMode,
          amountPaise: main,
          referenceId: primaryMode === 'CASH' ? null : `${primaryMode}/${3000 + i}`,
          createdAt: bill.createdAt,
        });
        paymentRows.push({
          billId: bill.id,
          mode: secondary,
          amountPaise: rest,
          referenceId: secondary === 'CASH' ? null : `${secondary}/${4000 + i}`,
          createdAt: bill.createdAt,
        });
      }
    });
    if (paymentRows.length > 0) {
      await tx.payment.createMany({ data: paymentRows });
    }

    // Products — e-commerce catalog rows that the public storefront PDP fetches
    // via /api/v1/website/products. Slugs match the demo storefront's URLs.
    const PRODUCT_IMG = {
      bangle: [
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1400&q=85',
      ],
      mangalsutra: [
        'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=85',
      ],
      ring: [
        'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1400&q=85',
      ],
      jhumka: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=85',
      ],
      chain: [
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1400&q=85',
      ],
      haar: [
        'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1400&q=85',
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=85',
      ],
    };
    await tx.product.createMany({
      data: [
        // ── Bridal (22K, statement) ────────────────────────────────────────
        {
          tenantId: tenant.id, categoryId: catBridal.id, slug: 'mira-bangle', name: 'Mira bangle',
          descriptionMd: 'Hand-set 22K bangle from the 2025 Bridal Edit. BIS hallmarked, weighed in front of you.',
          images: PRODUCT_IMG.bangle, weightMg: 12_450, purityCaratX100: 2200,
          makingChargeBps: 1325, basePricePaise: 86_366_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catBridal.id, slug: 'niya-haar', name: 'Niya haar',
          descriptionMd: 'Statement bridal haar with kundan and pearl drops. Made-to-order, ~6 weeks.',
          images: PRODUCT_IMG.haar, weightMg: 65_000, purityCaratX100: 2200,
          makingChargeBps: 1800, basePricePaise: 4_85_000_00, stoneChargePaise: 1_25_000_00, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catBridal.id, slug: 'isha-bridal-set', name: 'Isha bridal set',
          descriptionMd: 'Matched necklace + jhumka + maang-tikka. 22K, kundan & uncut accents.',
          images: PRODUCT_IMG.haar, weightMg: 82_000, purityCaratX100: 2200,
          makingChargeBps: 1900, basePricePaise: 6_85_000_00, stoneChargePaise: 1_45_000_00, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catBridal.id, slug: 'kavya-choker', name: 'Kavya choker',
          descriptionMd: 'Polki-set 22K choker. Adjustable dori, paired naturally with the Isha haar.',
          images: PRODUCT_IMG.haar, weightMg: 38_000, purityCaratX100: 2200,
          makingChargeBps: 1750, basePricePaise: 2_45_000_00, stoneChargePaise: 65_000_00, isPublished: true,
        },

        // ── Daily Wear (light 22K) ─────────────────────────────────────────
        {
          tenantId: tenant.id, categoryId: catDaily.id, slug: 'tara-mangalsutra', name: 'Tara mangalsutra',
          descriptionMd: 'Lightweight 22K mangalsutra with black-bead accents. Everyday-wear length.',
          images: PRODUCT_IMG.mangalsutra, weightMg: 8_100, purityCaratX100: 2200,
          makingChargeBps: 1100, basePricePaise: 62_200_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catDaily.id, slug: 'diya-chain', name: 'Diya chain',
          descriptionMd: '18-inch 22K chain with a fine rope link. BIS hallmarked.',
          images: PRODUCT_IMG.chain, weightMg: 7_400, purityCaratX100: 2200,
          makingChargeBps: 1050, basePricePaise: 54_800_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catDaily.id, slug: 'sara-studs', name: 'Sara studs',
          descriptionMd: 'Classic 22K studs — the everyday earring. Screw-back, hypoallergenic post.',
          images: PRODUCT_IMG.jhumka, weightMg: 2_400, purityCaratX100: 2200,
          makingChargeBps: 1000, basePricePaise: 18_400_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catDaily.id, slug: 'meera-nose-pin', name: 'Meera nose pin',
          descriptionMd: 'Single-stone 22K nose pin. Screw-fit. Tiny, all-day comfort.',
          images: PRODUCT_IMG.ring, weightMg: 900, purityCaratX100: 2200,
          makingChargeBps: 1100, basePricePaise: 7_900_00, stoneChargePaise: 0, isPublished: true,
        },

        // ── Festive (22K, mid-weight, statement-but-wearable) ──────────────
        {
          tenantId: tenant.id, categoryId: catFestive.id, slug: 'riya-jhumka', name: 'Riya jhumkas',
          descriptionMd: 'Classic 22K jhumkas with hand-set pearls. A festive everyday.',
          images: PRODUCT_IMG.jhumka, weightMg: 5_200, purityCaratX100: 2200,
          makingChargeBps: 1250, basePricePaise: 31_400_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catFestive.id, slug: 'aanya-temple-haar', name: 'Aanya temple haar',
          descriptionMd: 'South-Indian temple-style 22K haar. Lakshmi coin pendant.',
          images: PRODUCT_IMG.haar, weightMg: 28_000, purityCaratX100: 2200,
          makingChargeBps: 1450, basePricePaise: 1_82_000_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catFestive.id, slug: 'vanya-bangle-pair', name: 'Vanya bangle pair',
          descriptionMd: 'Pair of 22K patterned bangles. Karva Chauth-ready, photographs beautifully.',
          images: PRODUCT_IMG.bangle, weightMg: 22_000, purityCaratX100: 2200,
          makingChargeBps: 1300, basePricePaise: 1_42_000_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catFestive.id, slug: 'priya-jhumka-medium', name: 'Priya jhumkas',
          descriptionMd: 'Mid-size 22K jhumkas with ruby drops. For festive evenings.',
          images: PRODUCT_IMG.jhumka, weightMg: 8_600, purityCaratX100: 2200,
          makingChargeBps: 1350, basePricePaise: 58_900_00, stoneChargePaise: 12_000_00, isPublished: true,
        },

        // ── Diamond (18K, certified) ───────────────────────────────────────
        {
          tenantId: tenant.id, categoryId: catDiamond.id, slug: 'aarya-ring', name: 'Aarya solitaire',
          descriptionMd: '0.32ct lab-grown solitaire set in 18K white gold. Certified, sized to order.',
          images: PRODUCT_IMG.ring, weightMg: 4_200, purityCaratX100: 1800,
          makingChargeBps: 1500, basePricePaise: 48_900_00, stoneChargePaise: 18_000_00, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catDiamond.id, slug: 'nyra-tennis', name: 'Nyra tennis bracelet',
          descriptionMd: '18K white-gold tennis bracelet, 2.4ct total. IGI certified.',
          images: PRODUCT_IMG.bangle, weightMg: 9_800, purityCaratX100: 1800,
          makingChargeBps: 1500, basePricePaise: 1_85_000_00, stoneChargePaise: 95_000_00, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catDiamond.id, slug: 'zara-halo-ring', name: 'Zara halo ring',
          descriptionMd: '0.50ct halo solitaire in 18K rose gold. Sized to order.',
          images: PRODUCT_IMG.ring, weightMg: 3_800, purityCaratX100: 1800,
          makingChargeBps: 1600, basePricePaise: 92_000_00, stoneChargePaise: 38_000_00, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catDiamond.id, slug: 'rhea-studs-diamond', name: 'Rhea diamond studs',
          descriptionMd: 'Round-brilliant 0.20ct diamond studs in 18K. Everyday brilliance.',
          images: PRODUCT_IMG.jhumka, weightMg: 1_900, purityCaratX100: 1800,
          makingChargeBps: 1400, basePricePaise: 42_500_00, stoneChargePaise: 14_000_00, isPublished: true,
        },

        // ── Silver (sterling, gifting) ─────────────────────────────────────
        {
          tenantId: tenant.id, categoryId: catSilver.id, slug: 'tia-silver-anklet', name: 'Tia silver anklet',
          descriptionMd: '92.5 sterling silver anklet, hallmarked. Light & wearable.',
          images: PRODUCT_IMG.chain, weightMg: 18_000, purityCaratX100: 925,
          makingChargeBps: 800, basePricePaise: 3_400_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catSilver.id, slug: 'maya-silver-bangle', name: 'Maya silver bangle',
          descriptionMd: 'Oxidised silver bangle with hand-engraved motifs. 92.5 sterling.',
          images: PRODUCT_IMG.bangle, weightMg: 24_000, purityCaratX100: 925,
          makingChargeBps: 900, basePricePaise: 4_900_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catSilver.id, slug: 'leela-silver-jhumka', name: 'Leela silver jhumkas',
          descriptionMd: 'Temple-style silver jhumkas. Lightweight, anti-tarnish polished.',
          images: PRODUCT_IMG.jhumka, weightMg: 12_000, purityCaratX100: 925,
          makingChargeBps: 900, basePricePaise: 2_800_00, stoneChargePaise: 0, isPublished: true,
        },
        {
          tenantId: tenant.id, categoryId: catSilver.id, slug: 'aria-silver-chain', name: 'Aria silver chain',
          descriptionMd: '20-inch sterling silver chain. Gift-boxed.',
          images: PRODUCT_IMG.chain, weightMg: 14_500, purityCaratX100: 925,
          makingChargeBps: 700, basePricePaise: 2_200_00, stoneChargePaise: 0, isPublished: true,
        },
      ],
    });

    // Purchase orders — one per vendor with realistic line items.
    const poSurat = await tx.purchaseOrder.create({
      data: {
        tenantId: tenant.id,
        vendorId: vendorSurat.id,
        status: 'RECEIVED',
        totalPaise: 6_25_000_00,
        createdAt: daysAgo(20),
        items: {
          create: [
            { itemSku: 'BAR-22K-100G', weightMg: 100_000, purity: 2200, costPaise: 6_25_000_00 },
          ],
        },
      },
    });
    const poJaipur = await tx.purchaseOrder.create({
      data: {
        tenantId: tenant.id,
        vendorId: vendorJaipur.id,
        status: 'PLACED',
        totalPaise: 78_500_00,
        createdAt: daysAgo(7),
        items: {
          create: [
            { itemSku: 'KUN-EAR-S001', weightMg: 6_500, purity: 2200, costPaise: 38_500_00 },
            { itemSku: 'KUN-PEN-S002', weightMg: 7_200, purity: 2200, costPaise: 40_000_00 },
          ],
        },
      },
    });
    void poSurat;
    void poJaipur;
    const poMumbai = await tx.purchaseOrder.create({
      data: {
        tenantId: tenant.id,
        vendorId: vendorMumbai.id,
        status: 'DRAFT',
        totalPaise: 1_20_000_00,
        createdAt: daysAgo(2),
        items: {
          create: [
            { itemSku: 'CHAIN-22K-15G', weightMg: 15_000, purity: 2200, costPaise: 96_000_00 },
            { itemSku: 'BRACELET-22K-8G', weightMg: 8_000, purity: 2200, costPaise: 24_000_00 },
          ],
        },
      },
    });
    void poMumbai;

    // Item movements: a few transfers + wastage entries so those tabs have signal.
    const allItems = await tx.item.findMany({ where: { tenantId: tenant.id } });
    const transferTargets = allItems.slice(0, 4);
    await tx.itemMovement.createMany({
      data: [
        ...transferTargets.map((it, i) => ({
          tenantId: tenant.id,
          itemId: it.id,
          fromShopId: it.shopId,
          toShopId: it.shopId === shopMain.id ? shopBranch.id : shopMain.id,
          type: 'TRANSFER' as const,
          reason: i === 0 ? 'Customer requested viewing at Karnal' : 'Branch rebalancing — Apr',
          createdAt: daysAgo(10 + i * 2),
        })),
        ...allItems.slice(-2).map((it, i) => ({
          tenantId: tenant.id,
          itemId: it.id,
          fromShopId: it.shopId,
          type: 'WASTAGE' as const,
          reason: i === 0 ? 'Re-melted into 22K bar — design discontinued' : 'Damaged in display case',
          createdAt: daysAgo(5 + i),
        })),
      ],
    });

    // Storefront orders — what the EcommerceAdminPage shows. We need products + customers first.
    const products = await tx.product.findMany({
      where: { tenantId: tenant.id, isPublished: true },
      select: { id: true, basePricePaise: true, stoneChargePaise: true },
    });
    const customers = await tx.customer.findMany({ where: { tenantId: tenant.id } });
    if (products.length > 0 && customers.length > 0) {
      const orderFixtures = [
        { days: 0, status: 'PENDING' as const, productIdxs: [0], qty: [1], method: 'reserve-at-store' },
        { days: 1, status: 'CONFIRMED' as const, productIdxs: [1, 3], qty: [1, 1], method: 'razorpay' },
        { days: 3, status: 'PACKED' as const, productIdxs: [2], qty: [1], method: 'razorpay' },
        { days: 5, status: 'SHIPPED' as const, productIdxs: [4], qty: [1], method: 'razorpay' },
        { days: 9, status: 'DELIVERED' as const, productIdxs: [0, 3], qty: [1, 2], method: 'cod' },
        { days: 14, status: 'DELIVERED' as const, productIdxs: [1], qty: [1], method: 'razorpay' },
        { days: 21, status: 'DELIVERED' as const, productIdxs: [5], qty: [1], method: 'razorpay' },
        { days: 26, status: 'CANCELLED' as const, productIdxs: [2], qty: [1], method: 'razorpay' },
      ];
      for (let i = 0; i < orderFixtures.length; i += 1) {
        const f = orderFixtures[i]!;
        const lineItems = f.productIdxs.map((idx, j) => {
          const p = products[idx]!;
          return { productId: p.id, qty: f.qty[j]!, pricePaise: p.basePricePaise + p.stoneChargePaise };
        });
        const subtotal = lineItems.reduce((s, l) => s + l.pricePaise * l.qty, 0);
        const tax = Math.round((subtotal * 300) / 10_000);
        await tx.order.create({
          data: {
            tenantId: tenant.id,
            customerId: customers[i % customers.length]!.id,
            status: f.status,
            subtotalPaise: subtotal,
            shippingPaise: 0,
            taxPaise: tax,
            totalPaise: subtotal + tax,
            paymentMethod: f.method,
            createdAt: daysAgo(f.days),
            items: { create: lineItems },
          },
        });
      }
    }

    // ── FINANCE: gold loans + repayments ───────────────────────────────
    // Pick 3 customers from the freshly-seeded list. customerIds was
    // captured earlier when we wrote bills.
    const goldLoanCustomers = customerIds.slice(0, 3);
    if (goldLoanCustomers.length === 3) {
      const [loanActive, loanPartial, loanClosed] = await Promise.all([
        tx.goldLoan.create({
          data: {
            tenantId: tenant.id,
            customerId: goldLoanCustomers[0]!.id,
            principalPaise: 1_50_000_00,
            interestRateBps: 200,
            pledgedWeightMg: 22_500,
            dueAt: new Date(today.getTime() + 90 * 86_400_000),
            status: 'ACTIVE',
          },
        }),
        tx.goldLoan.create({
          data: {
            tenantId: tenant.id,
            customerId: goldLoanCustomers[1]!.id,
            principalPaise: 2_50_000_00,
            interestRateBps: 175,
            pledgedWeightMg: 38_000,
            dueAt: new Date(today.getTime() + 30 * 86_400_000),
            status: 'PARTIALLY_REPAID',
          },
        }),
        tx.goldLoan.create({
          data: {
            tenantId: tenant.id,
            customerId: goldLoanCustomers[2]!.id,
            principalPaise: 80_000_00,
            interestRateBps: 200,
            pledgedWeightMg: 12_000,
            dueAt: new Date(today.getTime() - 5 * 86_400_000),
            status: 'CLOSED',
          },
        }),
      ]);
      await tx.goldLoanRepayment.createMany({
        data: [
          { loanId: loanPartial.id, amountPaise: 1_00_000_00, paidAt: daysAgo(20) },
          { loanId: loanClosed.id,  amountPaise: 80_000_00,   paidAt: daysAgo(10) },
        ],
      });
    }

    // ── FINANCE: payroll register for current + previous month ─────────
    const allStaff = await tx.user.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    const fmtMonth = (d: Date): string =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const thisMonth = fmtMonth(today);
    const lastMonth = fmtMonth(new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    if (allStaff.length > 0) {
      const payrollRows = allStaff.flatMap((u) => [
        {
          tenantId: tenant.id,
          userId: u.id,
          month: lastMonth,
          basePaise: 35_000_00,
          commissionPaise: 4_500_00,
          advancePaise: 0,
          netPaise: 39_500_00,
          paidAt: daysAgo(25),
        },
        {
          tenantId: tenant.id,
          userId: u.id,
          month: thisMonth,
          basePaise: 35_000_00,
          commissionPaise: 6_200_00,
          advancePaise: 5_000_00,
          netPaise: 36_200_00,
          // Half the current-month rows unpaid so the "Mark paid" UX has work to do.
          paidAt: null,
        },
      ]);
      await tx.payroll.createMany({ data: payrollRows, skipDuplicates: true });
    }

    // ── FINANCE: daily reconciliation log — last 7 days, both shops ──
    const reconRows: Array<{
      tenantId: string;
      shopId: string;
      reconciledDate: Date;
      expectedCashPaise: number;
      countedCashPaise: number;
      expectedUpiPaise: number;
      settledUpiPaise: number;
      expectedCardPaise: number;
      settledCardPaise: number;
      varianceCashPaise: number;
      varianceUpiPaise: number;
      varianceCardPaise: number;
      notes: string | null;
    }> = [];
    for (let i = 1; i <= 7; i += 1) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
      for (const sh of [shopMain, shopBranch]) {
        const expCash = 40_000_00 + Math.round(Math.random() * 10_000_00);
        const expUpi = 25_000_00 + Math.round(Math.random() * 8_000_00);
        const expCard = 18_000_00 + Math.round(Math.random() * 6_000_00);
        const varianceCash = Math.round((Math.random() - 0.5) * 600_00);
        reconRows.push({
          tenantId: tenant.id,
          shopId: sh.id,
          reconciledDate: day,
          expectedCashPaise: expCash,
          countedCashPaise: expCash + varianceCash,
          expectedUpiPaise: expUpi,
          settledUpiPaise: expUpi,
          expectedCardPaise: expCard,
          settledCardPaise: expCard,
          varianceCashPaise: varianceCash,
          varianceUpiPaise: 0,
          varianceCardPaise: 0,
          notes: varianceCash === 0 ? null : varianceCash > 0 ? 'Cash count excess' : 'Cash count short',
        });
      }
    }
    await tx.reconciliation.createMany({ data: reconRows, skipDuplicates: true });

    // ── FINANCE: customer advances (some active, some consumed) ────────
    if (customerIds.length >= 2) {
      const owner = await tx.user.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
      if (owner) {
        await tx.advance.createMany({
          data: [
            {
              tenantId: tenant.id,
              shopId: shopMain.id,
              receiptNumber: 'ADV-2026-001',
              customerId: customerIds[0]!.id,
              amountPaise: 50_000_00,
              status: 'ACTIVE',
              validUntil: new Date(today.getTime() + 60 * 86_400_000),
              createdByUserId: owner.id,
              notes: 'Bridal set booking',
            },
            {
              tenantId: tenant.id,
              shopId: shopBranch.id,
              receiptNumber: 'ADV-2026-002',
              customerId: customerIds[1]!.id,
              amountPaise: 25_000_00,
              status: 'ACTIVE',
              validUntil: new Date(today.getTime() + 30 * 86_400_000),
              createdByUserId: owner.id,
              notes: 'Custom mangalsutra',
            },
            {
              tenantId: tenant.id,
              shopId: shopMain.id,
              receiptNumber: 'ADV-2026-003',
              customerId: customerIds[0]!.id,
              amountPaise: 15_000_00,
              status: 'CONSUMED',
              createdByUserId: owner.id,
              notes: 'Adjusted on bill',
            },
          ],
        });
      }
    }

    // Audit log — seed CREATE rows for the demo items + vendors so the trail is non-empty.
    await tx.auditLog.createMany({
      data: [
        ...allItems.slice(0, 10).map((it) => ({
          tenantId: tenant.id,
          entityType: 'Item',
          entityId: it.id,
          action: 'CREATE',
          afterJson: { sku: it.sku, weightMg: it.weightMg, purityCaratX100: it.purityCaratX100 },
          createdAt: it.createdAt,
        })),
        {
          tenantId: tenant.id,
          entityType: 'Vendor',
          entityId: vendorSurat.id,
          action: 'CREATE',
          afterJson: { name: 'Surat Bullion Co.' },
        },
        {
          tenantId: tenant.id,
          entityType: 'Vendor',
          entityId: vendorMumbai.id,
          action: 'CREATE',
          afterJson: { name: 'Zaveri Bazaar Imports' },
        },
      ],
    });

    // Default storefront content — drives the public homepage. Editable from
    // the Website CMS (PUT /api/v1/storefront). If a previous version exists
    // (preservedContent above), restore it after the reseed so user edits stick.
    await tx.storefrontContent.create({
      data: preservedContent
        ? {
            tenantId: tenant.id,
            content: preservedContent.content as Prisma.InputJsonValue,
            version: preservedContent.version,
            updatedBy: preservedContent.updatedBy,
          }
        : {
        tenantId: tenant.id,
        content: {
          brand: {
            name: 'Zelora',
            tagline:
              'Family jewellers since 1972. Hallmarked gold. Transparent pricing. Hand-crafted in Haryana.',
            logo: '/logo/zelora-mark.png',
          },
          hero: {
            eyebrow: 'The 2025 Bridal Edit',
            title: 'Heirlooms, made for the modern bride.',
            subtitle:
              "Hand-set by our karigars in Haryana. 22K BIS-hallmarked. Priced transparently against today's MCX rate — weight × rate + making, nothing hidden.",
            ctaLabel: 'Explore the edit',
            ctaHref: '/store/collections/bridal',
            secondaryCtaLabel: 'Visit our store',
            secondaryCtaHref: '/store/locations',
            image:
              'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1920&q=85',
          },
          rates: {
            g22: '₹6,420/g',
            g18: '₹5,255/g',
            silver: '₹84.50/g',
            updatedAt: '14 May, 11:02 AM IST',
          },
          collections: [
            { slug: 'bridal', name: 'Bridal', tagline: 'For the day that matters', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80' },
            { slug: 'daily-wear', name: 'Daily wear', tagline: 'For every day after', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=80' },
            { slug: 'festive', name: 'Festive', tagline: 'For the season', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80' },
            { slug: 'diamond', name: 'Diamond', tagline: 'For forever', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80' },
          ],
          story: {
            eyebrow: 'Since 1972',
            title: 'Three generations, one workshop.',
            body:
              'Every piece you see is hand-set in our Gurugram workshop. We weigh in front of you, price against the live MCX rate, and stamp every gram with a BIS hallmark.',
            image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1200&q=85',
          },
          testimonial: {
            quote:
              'They weighed each piece in front of me and printed the rate for that exact minute. I’ve never felt this calm buying gold.',
            author: 'Priya R., Gurugram · Bridal customer, 2024',
          },
          locations: [
            {
              id: 'main',
              name: 'Main Showroom — Gurugram',
              address: 'MG Road, Gurugram, Haryana 122001',
              phone: '+91 124 444 0011',
              hours: 'Mon–Sat · 10:30 AM – 8:30 PM',
              image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
            },
            {
              id: 'karnal',
              name: 'Karnal Branch',
              address: 'Sector 14, Karnal, Haryana 132001',
              phone: '+91 184 263 0022',
              hours: 'Mon–Sat · 11:00 AM – 9:00 PM',
              image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
            },
          ],
          whatsappNumber: '919876543210',
        },
      },
    });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  // Prime the gold-rate cache so the dashboard tile + stock valuation render
  // numbers in dev before the MCX worker runs. Values track the MCX dev defaults.
  try {
    await Promise.all([
      redis.set('goldrate:2400', '700000'), // 24K ₹7,000/g
      redis.set('goldrate:2200', '642000'), // 22K ₹6,420/g
      redis.set('goldrate:1800', '525500'), // 18K ₹5,255/g
      redis.set('goldrate:1400', '410000'), // 14K ₹4,100/g
      redis.set('goldrate:0', '8450'),      // Silver ₹84.50/g
      redis.set('goldrate:meta', JSON.stringify({ stale: false, asOf: new Date().toISOString() })),
    ]);
    // eslint-disable-next-line no-console
    console.log('[seed] gold rates primed in Redis.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[seed] gold-rate priming skipped (Redis unreachable).', err);
  }

  // eslint-disable-next-line no-console
  console.log('[seed] done.');
  // eslint-disable-next-line no-console
  console.log('\n[seed] Demo accounts (admin panel):');
  for (const a of DEMO_ACCOUNTS) {
    // eslint-disable-next-line no-console
    console.log(`  ${a.role.padEnd(12)}  email=${a.email.padEnd(28)} password=${a.password}`);
  }
  // eslint-disable-next-line no-console
  console.log('\n[seed] POS subdomain: pos.<your-domain>  |  cashier login uses POS_USER above\n');
  // Force-close redis client so the script exits cleanly.
  await redis.quit().catch(() => {});
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err);
    process.exit(1);
  });
