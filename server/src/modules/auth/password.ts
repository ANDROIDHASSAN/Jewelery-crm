// argon2id password hashing.
//
// Why argon2id, not bcrypt: argon2id won the Password Hashing Competition and
// is the OWASP-recommended choice for new systems. The npm package wraps the
// reference C impl; parameters below match OWASP 2023 defaults (memory hard
// enough to make GPU cracking expensive, fast enough on a typical Node server).

import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against a stored hash.
 * Returns false (never throws) on a malformed hash so the caller can treat
 * malformed-DB and wrong-password the same way (constant-time-ish at the
 * route layer).
 */
export async function verifyPassword(hash: string | null | undefined, plain: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Generate a temporary password. Used when a super-admin creates a user
 * without supplying one — the password is returned in the API response
 * once, so the admin can hand it to the employee.
 *
 * Format: 4 letters + 4 digits + 2 letters = 10 chars, mix of upper/lower
 * + numbers, no ambiguous chars (0/O, l/1).
 */
const TEMP_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const TEMP_DIGIT = '23456789';

export function generateTempPassword(): string {
  const bytes = randomBytes(12);
  const out: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const b = bytes[i]!;
    if (i < 4 || i >= 8) out.push(TEMP_ALPHA[b % TEMP_ALPHA.length]!);
    else out.push(TEMP_DIGIT[b % TEMP_DIGIT.length]!);
  }
  // Force at least one uppercase by capitalising index 0; argon2-side rules
  // require lower + upper + digit + length 10+.
  out[0] = out[0]!.toUpperCase();
  return out.join('');
}
