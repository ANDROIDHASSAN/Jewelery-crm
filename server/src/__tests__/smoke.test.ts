// server/src/__tests__/smoke.test.ts — proves the toolchain works end-to-end (D1 requirement).
//
// This test does NOT hit the database; that's covered by D2's tenant-isolation e2e once
// a test DB is wired in CI. The smoke test ensures Express + Zod + middleware chain boots.

import { describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { OtpRequestSchema } from '@goldos/shared/schemas';

describe('app boot', () => {
  it('responds to /api/v1/health', async () => {
    const app = createApp();
    const res = await supertest(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('rejects unauthenticated calls to /api/v1/shops with 401', async () => {
    const app = createApp();
    const res = await supertest(app).get('/api/v1/shops');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('validates OTP request schema', () => {
    const ok = OtpRequestSchema.safeParse({ phone: '+919876543210' });
    expect(ok.success).toBe(true);
    const bad = OtpRequestSchema.safeParse({ phone: '9876543210' });
    expect(bad.success).toBe(false);
  });

  it('rejects malformed OTP request via the endpoint', async () => {
    const app = createApp();
    const res = await supertest(app).post('/api/v1/auth/otp/request').send({ phone: 'not-a-phone' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
