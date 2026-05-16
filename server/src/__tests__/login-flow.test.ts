// Login schema + route surface smoke tests. DB-less.

import { describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { LoginSchema, ChangePasswordSchema, PasswordSchema } from '@goldos/shared/schemas';

describe('LoginSchema', () => {
  it('accepts a well-formed body without TOTP', () => {
    const ok = LoginSchema.safeParse({ email: 'owner@goldos.dev', password: 'Owner@2026demo' });
    expect(ok.success).toBe(true);
  });

  it('accepts an optional 6-digit TOTP', () => {
    const ok = LoginSchema.safeParse({ email: 'owner@goldos.dev', password: 'x'.repeat(10), totpCode: '123456' });
    expect(ok.success).toBe(true);
  });

  it('rejects malformed email', () => {
    const bad = LoginSchema.safeParse({ email: 'not-an-email', password: 'whatever' });
    expect(bad.success).toBe(false);
  });

  it('rejects malformed TOTP', () => {
    const bad = LoginSchema.safeParse({ email: 'a@b.c', password: 'x', totpCode: '12345' });
    expect(bad.success).toBe(false);
  });
});

describe('PasswordSchema', () => {
  it('rejects short / weak passwords', () => {
    expect(PasswordSchema.safeParse('short').success).toBe(false);
    expect(PasswordSchema.safeParse('alllowercase1').success).toBe(false);
    expect(PasswordSchema.safeParse('ALLUPPER123').success).toBe(false);
    expect(PasswordSchema.safeParse('NoDigitsHere').success).toBe(false);
  });

  it('accepts a policy-compliant password', () => {
    expect(PasswordSchema.safeParse('Owner@2026demo').success).toBe(true);
  });
});

describe('ChangePasswordSchema', () => {
  it('rejects mismatched confirm', () => {
    const r = ChangePasswordSchema.safeParse({
      currentPassword: 'whatever',
      newPassword: 'Brandnew2026!',
      confirmPassword: 'different',
    });
    expect(r.success).toBe(false);
  });
});

describe('login route surface', () => {
  it('rejects malformed login body with 400', async () => {
    const app = createApp();
    const res = await supertest(app).post('/api/v1/auth/login').send({ email: 'nope', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('me endpoint requires auth', async () => {
    const app = createApp();
    const res = await supertest(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
