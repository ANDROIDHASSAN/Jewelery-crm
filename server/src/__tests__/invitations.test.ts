// Invitation token + accept-payload validation. The DB-touching service
// paths (create/list/revoke/accept) are exercised by the manual smoke flow;
// putting them in CI requires a test Postgres which isn't wired yet.

import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Mirror of AcceptInvitationSchema in server/src/modules/auth/auth.routes.ts.
// We re-declare instead of importing because importing the route file pulls
// in the whole module graph including Prisma, which we want to avoid here.
const AcceptInvitationSchema = z.object({
  token: z.string().min(32).max(80),
  name: z.string().min(2).max(120),
  password: z.string().min(10).max(120),
  phone: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/, 'Phone must be +91 followed by 10 digits starting 6-9')
    .optional(),
});

describe('Invitation token generation', () => {
  it('produces 256 bits of entropy (43 url-safe base64 chars)', () => {
    const raw = crypto.randomBytes(32);
    const token = raw.toString('base64url');
    expect(token.length).toBe(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('SHA-256 hash is deterministic for the same token', () => {
    const token = 'kx9eR_4ZjQp7mYnA-bV6sLoWtH3cN8dF1uZpXqEoT2A';
    const h1 = crypto.createHash('sha256').update(token).digest('hex');
    const h2 = crypto.createHash('sha256').update(token).digest('hex');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('different tokens produce different hashes', () => {
    const a = crypto.createHash('sha256').update('a'.repeat(43)).digest('hex');
    const b = crypto.createHash('sha256').update('b'.repeat(43)).digest('hex');
    expect(a).not.toBe(b);
  });
});

describe('AcceptInvitationSchema', () => {
  const validToken = 'a'.repeat(43);

  it('accepts a complete valid payload', () => {
    const r = AcceptInvitationSchema.safeParse({
      token: validToken,
      name: 'Priya Mehta',
      password: 'Strong-Password-1!',
      phone: '+919876543210',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a payload without optional phone', () => {
    const r = AcceptInvitationSchema.safeParse({
      token: validToken,
      name: 'Priya',
      password: 'Strong-Password-1!',
    });
    expect(r.success).toBe(true);
  });

  it('rejects passwords shorter than 10 chars', () => {
    const r = AcceptInvitationSchema.safeParse({
      token: validToken,
      name: 'Priya',
      password: 'short',
    });
    expect(r.success).toBe(false);
  });

  it('rejects tokens shorter than 32 chars (probe attempts)', () => {
    const r = AcceptInvitationSchema.safeParse({
      token: 'too-short',
      name: 'Priya',
      password: 'Strong-Password-1!',
    });
    expect(r.success).toBe(false);
  });

  it('rejects tokens longer than 80 chars (overflow attempts)', () => {
    const r = AcceptInvitationSchema.safeParse({
      token: 'a'.repeat(100),
      name: 'Priya',
      password: 'Strong-Password-1!',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-Indian phone format', () => {
    const r = AcceptInvitationSchema.safeParse({
      token: validToken,
      name: 'Priya',
      password: 'Strong-Password-1!',
      phone: '5551234567', // US format
    });
    expect(r.success).toBe(false);
  });

  it('rejects names shorter than 2 chars', () => {
    const r = AcceptInvitationSchema.safeParse({
      token: validToken,
      name: 'P',
      password: 'Strong-Password-1!',
    });
    expect(r.success).toBe(false);
  });
});
