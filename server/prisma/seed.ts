// server/prisma/seed.ts — 1 tenant, 2 shops, 1 vendor, 1 category, 50 items, 3 customers, 4 users.
// Run: `npm run db:seed`. Uses rawPrisma (no tenant extension) since we're populating from scratch.

import { rawPrisma as prisma } from '../src/lib/prisma.js';

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Idempotent: nuke prior seed tenant if it exists.
    const existing = await tx.tenant.findUnique({ where: { ownerEmail: 'owner@goldos.dev' } });
    if (existing) {
      await tx.tenant.delete({ where: { id: existing.id } });
    }

    const tenant = await tx.tenant.create({
      data: {
        businessName: 'Anant Jewellers',
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
          name: 'Main Showroom — Pune',
          address: 'Laxmi Road, Pune, Maharashtra 411002',
          gstStateCode: '27',
          phone: '+912024440011',
        },
      }),
      tx.shop.create({
        data: {
          tenantId: tenant.id,
          name: 'Camp Branch — Pune',
          address: 'Camp, Pune, Maharashtra 411001',
          gstStateCode: '27',
          phone: '+912026330022',
        },
      }),
    ]);

    await tx.user.createMany({
      data: [
        { tenantId: tenant.id, name: 'Anant K.', phone: '+919876543210', role: 'OWNER' },
        { tenantId: tenant.id, shopId: shopMain.id, name: 'Priya M.', phone: '+919811112222', role: 'MANAGER' },
        { tenantId: tenant.id, shopId: shopMain.id, name: 'Ravi S.', phone: '+919811113333', role: 'BILLING' },
        { tenantId: tenant.id, shopId: shopBranch.id, name: 'Neha T.', phone: '+919811114444', role: 'BILLING' },
      ],
    });

    const category = await tx.category.create({
      data: {
        tenantId: tenant.id,
        name: 'Daily Wear',
        metalType: 'GOLD',
        defaultMakingChargeBps: 1200, // 12%
      },
    });

    await tx.vendor.create({
      data: {
        tenantId: tenant.id,
        name: 'Surat Bullion Co.',
        gstNumber: '24AAACS1429C1ZP',
        phone: '+912614435560',
        address: 'Mahidharpura, Surat 395003',
        outstandingPaise: 0,
      },
    });

    const itemsData = Array.from({ length: 50 }, (_, i) => {
      const shopId = i % 2 === 0 ? shopMain.id : shopBranch.id;
      const sku = `DW-${String(i + 1).padStart(4, '0')}`;
      const weightMg = 5000 + i * 250; // 5g to 17.25g
      return {
        tenantId: tenant.id,
        shopId,
        categoryId: category.id,
        sku,
        barcodeData: sku,
        weightMg,
        purityCaratX100: 2200,
        hallmarkStatus: 'CERTIFIED' as const,
        hallmarkRef: `H${String(100000 + i).slice(-6)}`,
        costPricePaise: weightMg * 6, // ~₹60/g cost placeholder
      };
    });
    await tx.item.createMany({ data: itemsData });

    await tx.customer.createMany({
      data: [
        { tenantId: tenant.id, phone: '+919900001111', name: 'Mrs. Sharma', tags: ['VIP'] },
        { tenantId: tenant.id, phone: '+919900002222', name: 'Mr. Patel', tags: ['Retail'] },
        { tenantId: tenant.id, phone: '+919900003333', name: 'Ms. Iyer', tags: ['Wholesale'] },
      ],
    });
  });

  // eslint-disable-next-line no-console
  console.log('[seed] done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err);
    process.exit(1);
  });
