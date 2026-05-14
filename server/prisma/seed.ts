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
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Rent',       amountPaise: 8_500_000, paidAt: daysAgo(28), notes: 'May rent — Main' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Salaries',   amountPaise: 24_000_000, paidAt: daysAgo(2),  notes: 'Staff payroll — Apr' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Electricity',amountPaise: 1_840_000, paidAt: daysAgo(14), notes: 'Apr bill' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Marketing',  amountPaise: 4_500_000, paidAt: daysAgo(9),  notes: 'Bridal edit IG ads' },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Rent',       amountPaise: 4_200_000, paidAt: daysAgo(28), notes: 'May rent — Karnal' },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Salaries',   amountPaise: 9_500_000, paidAt: daysAgo(2),  notes: 'Staff payroll — Apr' },
        { tenantId: tenant.id, shopId: shopBranch.id, category: 'Repairs',    amountPaise: 720_000,   paidAt: daysAgo(5),  notes: 'Showcase glass replacement' },
        { tenantId: tenant.id, shopId: shopMain.id,   category: 'Insurance',  amountPaise: 6_300_000, paidAt: daysAgo(18), notes: 'Quarterly premium' },
      ],
    });

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
    await tx.bill.createMany({
      data: sampleBills.map((b, i) => {
        const subtotal = b.paise - Math.round(b.paise * 300 / 10300); // back out 3% GST
        const gst = b.paise - subtotal;
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
          createdAt: daysAgo(b.days),
        };
      }),
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
