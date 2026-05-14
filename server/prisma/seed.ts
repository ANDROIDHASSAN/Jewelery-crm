// server/prisma/seed.ts — comprehensive demo fixtures so every admin module
// has live data. Run: `npm run db:seed`. Uses rawPrisma (no tenant extension)
// since we're populating from scratch.

import { rawPrisma as prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

async function main(): Promise<void> {
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
      await tx.itemMovement.deleteMany({ where: { tenantId: existing.id } });
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
        ...allItems.slice(48, 50).map((it, i) => ({
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
            content: preservedContent.content,
            version: preservedContent.version,
            updatedBy: preservedContent.updatedBy,
          }
        : {
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
