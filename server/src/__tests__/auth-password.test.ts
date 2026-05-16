// argon2id round-trip + temp-password generator format.

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, generateTempPassword } from '../modules/auth/password.js';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('Secret123!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Secret123!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('verifyPassword on null/empty hash returns false (no throw)', async () => {
    expect(await verifyPassword(null, 'anything')).toBe(false);
    expect(await verifyPassword(undefined, 'anything')).toBe(false);
    expect(await verifyPassword('not-a-real-hash', 'anything')).toBe(false);
  });

  it('generateTempPassword produces a 12-char password meeting the policy', () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(12);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/\d/.test(pw)).toBe(true);
    // No ambiguous characters.
    expect(pw).not.toMatch(/[0Ol1I]/);
  });
});
