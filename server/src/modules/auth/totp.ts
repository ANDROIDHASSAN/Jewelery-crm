// RFC 6238 TOTP implementation (HMAC-SHA1, 30s window, 6-digit codes).
//
// No third-party dep — TOTP is short enough to implement directly and
// auditable in 60 lines. Compatible with Google Authenticator, Authy, 1Password.
//
// Storage: the base32 secret is stored on the User row (User.totpSecret).
// During verification the caller passes the candidate code; we check the
// current 30-second window plus ±1 windows to tolerate clock skew.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOTP_PERIOD_SEC = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_TOLERANCE = 1; // accept ±1 window for clock drift
const ALG = 'sha1';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(b32: string): Buffer {
  const cleaned = b32.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 char in TOTP secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // 64-bit counter, big-endian. Bitwise ops are 32-bit in JS, so split.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const mac = createHmac(ALG, secret).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const slice = mac.subarray(offset, offset + 4);
  const truncated = slice.readUInt32BE(0) & 0x7fffffff;
  return (truncated % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpProvisioningUri(secret: string, issuer: string, account: string): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params.toString()}`;
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SEC);
  const candidate = Buffer.from(code, 'ascii');
  for (let drift = -TOTP_WINDOW_TOLERANCE; drift <= TOTP_WINDOW_TOLERANCE; drift += 1) {
    const expected = Buffer.from(hotp(key, now + drift), 'ascii');
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
      return true;
    }
  }
  return false;
}

// Backup codes: 8 char A-Z0-9, ten codes per setup. Stored as argon2 hashes
// (re-uses the password hasher) so a DB leak can't expose them.
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(8);
    let code = '';
    for (const b of bytes) code += charset[b % charset.length];
    codes.push(code);
  }
  return codes;
}
