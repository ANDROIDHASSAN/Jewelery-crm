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

    // Default storefront content — drives the public homepage. Editable from
    // the Website CMS (PUT /api/v1/storefront).
    await tx.storefrontContent.create({
      data: {
        tenantId: tenant.id,
        content: {
          brand: {
            name: 'Anant Jewellers',
            tagline:
              'Family jewellers since 1972. Hallmarked gold. Transparent pricing. Hand-crafted in Pune.',
            logo: '/logo/zelora-mark.png',
          },
          hero: {
            eyebrow: 'The 2025 Bridal Edit',
            title: 'Heirlooms, made for the modern bride.',
            subtitle:
              "Hand-set by our karigars in Pune. 22K BIS-hallmarked. Priced transparently against today's MCX rate — weight × rate + making, nothing hidden.",
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
              'Every piece you see is hand-set in our Laxmi Road workshop. We weigh in front of you, price against the live MCX rate, and stamp every gram with a BIS hallmark.',
            image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1200&q=85',
          },
          testimonial: {
            quote:
              'They weighed each piece in front of me and printed the rate for that exact minute. I’ve never felt this calm buying gold.',
            author: 'Priya R., Pune · Bridal customer, 2024',
          },
          locations: [
            {
              id: 'main',
              name: 'Main Showroom',
              address: 'Laxmi Road, Pune, Maharashtra 411002',
              phone: '+91 20 2444 0011',
              hours: 'Mon–Sat · 10:30 AM – 8:30 PM',
              image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
            },
            {
              id: 'camp',
              name: 'Camp Branch',
              address: 'East Street, Camp, Pune 411001',
              phone: '+91 20 2633 0022',
              hours: 'Mon–Sat · 11:00 AM – 9:00 PM',
              image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
            },
          ],
          whatsappNumber: '919876543210',
        },
      },
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
