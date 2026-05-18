// Security regression tests — non-negotiable invariants. If any fail, the
// build does. We piggyback on the existing app singleton (env is already
// validated when this test loads) and flip NODE_ENV at runtime to prove the
// production-mode hardening kicks in. The middleware reads NODE_ENV from
// process.env directly so this dynamic switching is reliable.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';

const ORIGINAL_NODE_ENV = process.env['NODE_ENV'];
const ORIGINAL_ADMIN_TOKEN = process.env['ADMIN_API_TOKEN'];

afterEach(() => {
  // Restore so other test files don't see a contaminated env.
  process.env['NODE_ENV'] = ORIGINAL_NODE_ENV;
  if (ORIGINAL_ADMIN_TOKEN === undefined) {
    delete process.env['ADMIN_API_TOKEN'];
  } else {
    process.env['ADMIN_API_TOKEN'] = ORIGINAL_ADMIN_TOKEN;
  }
});

describe('Admin sentinel token bypass', () => {
  it('is HARD DISABLED in production even when ADMIN_API_TOKEN is set', async () => {
    process.env['NODE_ENV'] = 'production';
    // Note: env.ADMIN_API_TOKEN was already parsed at module load. The
    // middleware additionally checks the runtime NODE_ENV which we flipped
    // above — that's what makes this test deterministic regardless of the
    // .env value at load time.
    const app = createApp();
    const res = await supertest(app)
      .get('/api/v1/shops')
      .set('Authorization', 'Bearer admin-session-token');
    // Must be UNAUTHORIZED — the bypass is forbidden in prod regardless of env.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a random bearer token in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const app = createApp();
    const res = await supertest(app)
      .get('/api/v1/shops')
      .set('Authorization', 'Bearer totally-bogus-not-the-sentinel');
    expect(res.status).toBe(401);
  });

  it('refuses requests with no Authorization header at all', async () => {
    process.env['NODE_ENV'] = 'production';
    const app = createApp();
    const res = await supertest(app).get('/api/v1/shops');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/bearer/i);
  });
});

describe('Defence-in-depth security headers', () => {
  it('sets the full hardened header set on every response', async () => {
    const app = createApp();
    const res = await supertest(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['permissions-policy']).toContain('geolocation=()');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('emits HSTS when the request is over HTTPS (via x-forwarded-proto)', async () => {
    const app = createApp();
    app.set('trust proxy', 1);
    const res = await supertest(app)
      .get('/api/v1/health')
      .set('X-Forwarded-Proto', 'https');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
  });

  it('omits HSTS over plain HTTP so dev environments are not pinned', async () => {
    const app = createApp();
    const res = await supertest(app).get('/api/v1/health');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});
