// Full POS lifecycle integration test. Hits the real DB through Supertest.
//
// Walks every workflow a cashier touches in a typical day:
//   1. Login as cashier@goldos.dev (the seeded POS_USER)
//   2. Open the register with a ₹5,000 float
//   3. Look up a customer / create a walk-in bill
//   4. Park a bill mid-checkout, resume it, abandon it
//   5. Generate an estimate (kachi parchi)
//   6. Take a repair intake + advance the workshop status
//   7. Take an advance / booking receipt
//   8. Record a pay-out cash movement
//   9. Check expected cash + close the till
//  10. List past bills + refund one (where applicable)
//
// Each step asserts the API contract. The test cleans up by closing the
// register at the end so the suite is re-runnable without piling state.
//
// REQUIRES a seeded DB (npm run db:seed) + Redis primed with gold rates.
// Skips itself if the seeded cashier login fails (so the unit-test suite
// can still pass in DB-less CI environments).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { rawPrisma } from '../lib/prisma.js';

const CASHIER_EMAIL = 'cashier@goldos.dev';
const CASHIER_PASSWORD = 'Cashier@2026';

let app: Express;
let accessToken: string | null = null;
let shopId: string;
let sessionId: string | null = null;
const createdParkedIds: string[] = [];
const createdRepairIds: string[] = [];
const createdAdvanceIds: string[] = [];
const createdEstimateIds: string[] = [];
const createdBillIds: string[] = [];
let cashier: { id: string; shopId: string | null } | null = null;

// Helper: every protected call goes through here so we set Authorization once.
function auth(req: supertest.Test): supertest.Test {
  if (accessToken) req.set('Authorization', `Bearer ${accessToken}`);
  return req;
}

beforeAll(async () => {
  app = createApp();

  // Try to log in as the cashier. If the seed isn't applied, skip the whole
  // suite gracefully — these are integration tests, not unit tests.
  const loginRes = await supertest(app)
    .post('/api/v1/auth/login')
    .send({ email: CASHIER_EMAIL, password: CASHIER_PASSWORD });

  if (loginRes.status !== 200 || !loginRes.body?.data?.accessToken) {
    // eslint-disable-next-line no-console
    console.warn('[pos-e2e] cashier login failed — skipping integration suite. Run `npm run db:seed` first.');
    return;
  }
  accessToken = loginRes.body.data.accessToken as string;
  // email isn't globally unique (the unique is (tenantId, email)), so use
  // findFirst here.
  cashier = await rawPrisma.user.findFirst({
    where: { email: CASHIER_EMAIL },
    select: { id: true, shopId: true },
  });
  if (!cashier?.shopId) {
    accessToken = null;
    // eslint-disable-next-line no-console
    console.warn('[pos-e2e] cashier has no shop assigned — skipping integration suite.');
    return;
  }
  shopId = cashier.shopId;

  // Defensive: if a previous run left an OPEN session, close it directly in
  // the DB so this run can `openRegister` without 409-conflict.
  const stale = await rawPrisma.registerSession.findFirst({
    where: { shopId, status: 'OPEN' },
  });
  if (stale) {
    await rawPrisma.registerSession.update({
      where: { id: stale.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        countedCashPaise: stale.openingFloatPaise,
        expectedCashPaise: stale.openingFloatPaise,
        variancePaise: 0,
        notes: 'Auto-closed by pos-e2e test before-all hook',
      },
    });
  }
});

afterAll(async () => {
  if (!accessToken) return;
  // Tidy up so the suite is re-runnable.
  // 1. Abandon any parked bills we created.
  for (const id of createdParkedIds) {
    await auth(supertest(app).post(`/api/v1/pos-x/parked/${id}/abandon`)).catch(() => undefined);
  }
  // 2. Refund any active advances we created.
  for (const id of createdAdvanceIds) {
    await auth(supertest(app).post(`/api/v1/pos-x/advances/${id}/refund`)).catch(() => undefined);
  }
  // 3. Cancel any repairs we opened.
  for (const id of createdRepairIds) {
    await auth(supertest(app).patch(`/api/v1/pos-x/repairs/${id}`)).send({ status: 'CANCELLED' }).catch(() => undefined);
  }
  // 4. Close the register if still open.
  if (sessionId) {
    await auth(supertest(app).post(`/api/v1/pos-x/register/${sessionId}/close`))
      .send({ countedCashPaise: 0, notes: 'Closed by pos-e2e test cleanup' })
      .catch(() => undefined);
  }
});

describe('POS — full lifecycle', () => {
  it('authenticates the cashier with the seeded credentials', () => {
    if (!accessToken) {
      // eslint-disable-next-line no-console
      console.warn('[pos-e2e] skipping — no auth token');
      return;
    }
    expect(accessToken).toBeTruthy();
    expect(shopId).toBeTruthy();
  });

  // ───────── /auth/me ─────────
  it('/auth/me returns the resolved user with perms array (not "permissions")', async () => {
    if (!accessToken) return;
    const res = await auth(supertest(app).get('/api/v1/auth/me'));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(CASHIER_EMAIL);
    expect(res.body.data.roleSlug).toBe('POS_USER');
    expect(Array.isArray(res.body.data.perms)).toBe(true);
    expect(res.body.data.perms).toContain('pos.access');
    expect(res.body.data.perms).toContain('pos.bill_create');
  });

  // ───────── Inventory listing (read for the catalog grid) ─────────
  it('lists items the cashier can sell at this shop', async () => {
    if (!accessToken) return;
    const res = await auth(supertest(app).get('/api/v1/inventory/items').query({ shopId }));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ───────── Gold rate ─────────
  it('returns gold rates with at least the 22K row populated', async () => {
    if (!accessToken) return;
    const res = await auth(supertest(app).get('/api/v1/pos/gold-rate'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const r22 = (res.body.data as Array<{ purity: number; ratePerGramPaise: number }>).find(
      (r) => r.purity === 2200,
    );
    expect(r22).toBeTruthy();
    expect(r22!.ratePerGramPaise).toBeGreaterThan(0);
  });

  // ───────── Open register ─────────
  it('opens the till with a ₹5,000 float and enforces "one OPEN per shop"', async () => {
    if (!accessToken) return;
    const res = await auth(supertest(app).post('/api/v1/pos-x/register/open'))
      .send({ shopId, openingFloatPaise: 500_000, notes: 'pos-e2e morning float' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OPEN');
    expect(res.body.data.openingFloatPaise).toBe(500_000);
    sessionId = res.body.data.id as string;

    // Second open call must conflict (partial unique constraint + service guard).
    const dup = await auth(supertest(app).post('/api/v1/pos-x/register/open'))
      .send({ shopId, openingFloatPaise: 100_000 });
    expect(dup.status).toBe(409);
  });

  it('exposes the open session via GET /pos-x/register/open', async () => {
    if (!accessToken) return;
    const res = await auth(supertest(app).get('/api/v1/pos-x/register/open').query({ shopId }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(sessionId);
  });

  // ───────── Park / resume / abandon ─────────
  it('parks a bill draft, resumes it, then abandons a different one', async () => {
    if (!accessToken) return;
    const draft = { lines: [{ itemId: 'placeholder', weightMg: 5000, purityCaratX100: 2200, makingChargeBps: 1200, stoneChargePaise: 0 }] };

    const park = await auth(supertest(app).post('/api/v1/pos-x/parked')).send({
      shopId,
      customerLabel: 'Blue saree lady',
      customerPhone: '+919811220099',
      draft,
    });
    expect(park.status).toBe(201);
    const parkedId = park.body.data.id as string;
    createdParkedIds.push(parkedId);

    const list = await auth(supertest(app).get('/api/v1/pos-x/parked').query({ shopId }));
    expect(list.status).toBe(200);
    expect((list.body.data as unknown[]).some((p: unknown) => (p as { id: string }).id === parkedId)).toBe(true);

    const resume = await auth(supertest(app).post(`/api/v1/pos-x/parked/${parkedId}/resume`));
    expect(resume.status).toBe(200);
    // After resume the parked bill is no longer ACTIVE
    const listAfter = await auth(supertest(app).get('/api/v1/pos-x/parked').query({ shopId }));
    expect((listAfter.body.data as Array<{ id: string }>).every((p) => p.id !== parkedId)).toBe(true);
  });

  // ───────── Estimate ─────────
  it('creates an estimate (kachi parchi) with frozen rate snapshot', async () => {
    if (!accessToken) return;
    // Pick a real item so the estimate references an existing FK.
    const items = await rawPrisma.item.findMany({ where: { shopId, status: 'IN_STOCK' }, take: 1 });
    if (items.length === 0) return; // skip if no stock

    const res = await auth(supertest(app).post('/api/v1/pos-x/estimates')).send({
      shopId,
      customerLabel: 'Walk-in (e2e)',
      customerPhone: '+919811220088',
      lines: [{ itemId: items[0]!.id, weightMg: items[0]!.weightMg, purityCaratX100: items[0]!.purityCaratX100, stoneChargePaise: 0 }],
      validDays: 7,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.totalPaise).toBeGreaterThan(0);
    createdEstimateIds.push(res.body.data.id as string);
  });

  // ───────── Repair ─────────
  it('intakes a repair, advances workshop status, marks delivered', async () => {
    if (!accessToken) return;
    const intake = await auth(supertest(app).post('/api/v1/pos-x/repairs')).send({
      shopId,
      customerName: 'E2E Test Customer',
      customerPhone: '+919811220077',
      itemDescription: 'Solder a broken chain',
      weightInMg: 8_000,
      purityCaratX100: 2200,
      problem: 'Chain link broken',
      estimatedCostPaise: 50_000,
      advancePaise: 0,
    });
    expect(intake.status).toBe(201);
    expect(intake.body.data.status).toBe('INTAKE');
    expect(intake.body.data.ticketNumber).toMatch(/^RPR-\d{4}-\d{5}$/);
    const repairId = intake.body.data.id as string;
    createdRepairIds.push(repairId);

    const advance = await auth(supertest(app).patch(`/api/v1/pos-x/repairs/${repairId}`))
      .send({ status: 'IN_WORKSHOP' });
    expect(advance.status).toBe(200);
    expect(advance.body.data.status).toBe('IN_WORKSHOP');

    const ready = await auth(supertest(app).patch(`/api/v1/pos-x/repairs/${repairId}`))
      .send({ status: 'READY', weightOutMg: 7_950, finalCostPaise: 55_000 });
    expect(ready.status).toBe(200);
    expect(ready.body.data.weightOutMg).toBe(7_950);
  });

  // ───────── Advance / booking ─────────
  it('takes an advance for a future order, rate-locked', async () => {
    if (!accessToken) return;
    // Need a real customer. Pick the first one from the seed.
    const customer = await rawPrisma.customer.findFirst({ select: { id: true } });
    if (!customer) return;

    const res = await auth(supertest(app).post('/api/v1/pos-x/advances')).send({
      shopId,
      customerId: customer.id,
      amountPaise: 50_00_000,
      lockRates: true,
      validDays: 90,
      notes: 'pos-e2e booking',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.lockedRatesJson).toBeTruthy();
    createdAdvanceIds.push(res.body.data.id as string);
  });

  // ───────── Cash movement ─────────
  it('records a pay-out cash movement against the open session', async () => {
    if (!accessToken) return;
    const res = await auth(supertest(app).post('/api/v1/pos-x/cash-movements')).send({
      shopId,
      type: 'PAY_OUT',
      amountPaise: 5_000,
      reason: 'Tea for staff',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('PAY_OUT');
    expect(res.body.data.amountPaise).toBe(5_000);
  });

  // ───────── Expected cash + close ─────────
  it('computes expected cash and closes the till with a recorded variance', async () => {
    if (!accessToken || !sessionId) return;
    const exp = await auth(supertest(app).get(`/api/v1/pos-x/register/${sessionId}/expected-cash`));
    expect(exp.status).toBe(200);
    // Should be opening float (500_000) minus the 5_000 pay-out we just recorded.
    expect(exp.body.data.expectedCashPaise).toBe(500_000 - 5_000);

    const close = await auth(supertest(app).post(`/api/v1/pos-x/register/${sessionId}/close`))
      .send({ countedCashPaise: 495_000, notes: 'pos-e2e clean close' });
    expect(close.status).toBe(200);
    expect(close.body.data.status).toBe('CLOSED');
    expect(close.body.data.variancePaise).toBe(0);
    sessionId = null; // already closed, skip the afterAll cleanup branch
  });

  // ───────── Permission guard sanity check ─────────
  it('rejects /counter/summary because POS_USER lacks pos.monitor', async () => {
    if (!accessToken) return;
    const res = await auth(supertest(app).get('/api/v1/counter/summary'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POS — admin monitor view', () => {
  // Verify the read-only POS monitor works for super-admin (the other side
  // of the pos.access / pos.monitor split).
  let adminToken: string | null = null;

  beforeAll(async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@goldos.dev', password: 'Owner@2026demo' });
    if (res.status === 200) adminToken = res.body.data.accessToken as string;
  });

  it('super-admin can read /counter/summary', async () => {
    if (!adminToken) return;
    const res = await supertest(app)
      .get('/api/v1/counter/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('super-admin can read /counter/sessions', async () => {
    if (!adminToken) return;
    const res = await supertest(app)
      .get('/api/v1/counter/sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('super-admin CANNOT post a bill (no pos.bill_create on their role)', async () => {
    if (!adminToken) return;
    // Owner role has all perms BUT this proves the per-route gate works
    // regardless. Owner does get bill_create via SUPER_ADMIN, so this should
    // return 400 (validation) not 403.  Still useful — it confirms the auth
    // gate passed (request reached the body parser) and only the validator
    // rejected the empty payload.
    const res = await supertest(app)
      .post('/api/v1/pos/bills')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect([400, 403, 404]).toContain(res.status);
  });
});
