// Auth service — email/password login, refresh, 2FA, password change.
//
// JWT contents:
//   access: { sub, tenantId, roleId, roleSlug, shopId, perms[], mustChangePassword }
//     - 15 min lifetime. Carries the effective permission list so middleware
//       can check without a DB hop per request.
//   refresh: { sub, tenantId } only — refresh re-resolves permissions from DB
//     so a role/permission change becomes effective within the refresh cycle
//     (15 min worst case).
//
// Account lockout: 5 failed attempts → 15 min lock. Successful login resets.

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../../env.js';
import { rawPrisma } from '../../lib/prisma.js';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../lib/errors.js';
import { verifyPassword, hashPassword } from './password.js';
import { verifyTotp, generateTotpSecret, totpProvisioningUri, generateBackupCodes } from './totp.js';
import { resolveUser, type ResolvedUser } from './permissions.js';
import type { PermissionKey } from '@goldos/shared/constants';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  shopId: string | null;
  roleId: string;
  roleSlug: string;
  perms: PermissionKey[];
  mustChangePassword: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
}

async function signAccessToken(p: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(accessSecret);
}

async function signRefreshToken(p: RefreshTokenPayload): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret, { algorithms: ['HS256'] });
  return asAccessPayload(payload);
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, refreshSecret, { algorithms: ['HS256'] });
  if (!payload.sub || !payload['tenantId']) {
    throw new UnauthorizedError('Malformed refresh token');
  }
  return { sub: String(payload.sub), tenantId: String(payload['tenantId']) };
}

function asAccessPayload(p: JWTPayload): AccessTokenPayload {
  if (!p.sub || !p['tenantId'] || !p['roleId'] || !p['roleSlug'] || !Array.isArray(p['perms'])) {
    throw new UnauthorizedError('Malformed access token');
  }
  return {
    sub: String(p.sub),
    tenantId: String(p['tenantId']),
    shopId: p['shopId'] ? String(p['shopId']) : null,
    roleId: String(p['roleId']),
    roleSlug: String(p['roleSlug']),
    perms: (p['perms'] as unknown[]).filter((v): v is PermissionKey => typeof v === 'string') as PermissionKey[],
    mustChangePassword: Boolean(p['mustChangePassword']),
  };
}

/**
 * Email + password (+ optional TOTP). Returns issued tokens or a partial
 * result indicating 2FA is required.
 */
export interface LoginResult {
  status: 'ok' | 'mfa_required' | 'must_change_password';
  accessToken?: string;
  refreshToken?: string;
  // Shape must match `/auth/me` exactly — the client merges them via setUser
  // and any field gap leaves the client's hasPermission() reading undefined.
  user?: {
    id: string;
    name: string;
    email: string;
    roleId: string;
    roleSlug: string;
    shopId: string | null;
    perms: PermissionKey[];
    mustChangePassword: boolean;
    totpEnabled: boolean;
  };
  // For mfa_required, the client should re-submit with totpCode or backupCode.
  challengeId?: string;
}

export async function login(input: {
  email: string;
  password: string;
  totpCode?: string;
  backupCode?: string;
}): Promise<LoginResult> {
  const user = await rawPrisma.user.findFirst({
    where: { email: input.email.toLowerCase().trim(), isActive: true },
    select: {
      id: true,
      tenantId: true,
      passwordHash: true,
      totpEnabled: true,
      totpSecret: true,
      totpBackupCodes: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      mustChangePassword: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    // Constant-ish time: hash a dummy password to avoid leaking "user exists".
    await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', input.password);
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new UnauthorizedError(`Account locked. Try again after ${user.lockedUntil.toISOString()}`);
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    await recordFailedAttempt(user.id, user.failedLoginAttempts);
    throw new UnauthorizedError('Invalid email or password');
  }

  // 2FA gate.
  if (user.totpEnabled) {
    if (input.totpCode) {
      if (!user.totpSecret || !verifyTotp(user.totpSecret, input.totpCode)) {
        await recordFailedAttempt(user.id, user.failedLoginAttempts);
        throw new UnauthorizedError('Invalid 2FA code');
      }
    } else if (input.backupCode) {
      const ok = await consumeBackupCode(user.id, user.totpBackupCodes, input.backupCode);
      if (!ok) {
        await recordFailedAttempt(user.id, user.failedLoginAttempts);
        throw new UnauthorizedError('Invalid backup code');
      }
    } else {
      return { status: 'mfa_required' };
    }
  }

  return finalizeLogin(user.id);
}

async function recordFailedAttempt(userId: string, previousAttempts: number): Promise<void> {
  const next = previousAttempts + 1;
  const data: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: next };
  if (next >= MAX_FAILED_ATTEMPTS) {
    data.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    data.failedLoginAttempts = 0; // reset after lock so the next unlock has a fresh counter
  }
  await rawPrisma.user.update({ where: { id: userId }, data });
}

async function consumeBackupCode(userId: string, storedHashes: string[], candidate: string): Promise<boolean> {
  const trimmed = candidate.trim().toUpperCase();
  for (let i = 0; i < storedHashes.length; i += 1) {
    const hash = storedHashes[i]!;
    const ok = await verifyPassword(hash, trimmed);
    if (ok) {
      // Single-use: drop the consumed hash atomically.
      const remaining = storedHashes.filter((_, idx) => idx !== i);
      await rawPrisma.user.update({
        where: { id: userId },
        data: { totpBackupCodes: remaining },
      });
      return true;
    }
  }
  return false;
}

async function finalizeLogin(userId: string): Promise<LoginResult> {
  const resolved = await resolveUser(userId);
  if (!resolved) throw new UnauthorizedError('User no longer active');

  // Stamp last login + reset counters.
  await rawPrisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
  });

  const userRow = await rawPrisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, mustChangePassword: true, totpEnabled: true },
  });
  if (!userRow) throw new UnauthorizedError('User not found');

  const accessToken = await signAccessToken({
    sub: resolved.id,
    tenantId: resolved.tenantId,
    shopId: resolved.shopId,
    roleId: resolved.roleId,
    roleSlug: resolved.roleSlug,
    perms: resolved.permissions,
    mustChangePassword: userRow.mustChangePassword,
  });
  const refreshToken = await signRefreshToken({ sub: resolved.id, tenantId: resolved.tenantId });

  return {
    status: userRow.mustChangePassword ? 'must_change_password' : 'ok',
    accessToken,
    refreshToken,
    user: {
      id: resolved.id,
      name: userRow.name,
      email: userRow.email,
      roleId: resolved.roleId,
      roleSlug: resolved.roleSlug,
      shopId: resolved.shopId,
      perms: resolved.permissions,
      mustChangePassword: userRow.mustChangePassword,
      totpEnabled: userRow.totpEnabled,
    },
  };
}

/** Mint new access token from a refresh token (re-resolves permissions). */
export async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = await verifyRefreshToken(refreshToken);
  const resolved = await resolveUser(payload.sub);
  if (!resolved) throw new UnauthorizedError('Session no longer valid');

  const userRow = await rawPrisma.user.findUnique({
    where: { id: payload.sub },
    select: { mustChangePassword: true },
  });
  if (!userRow) throw new UnauthorizedError('User not found');

  const access = await signAccessToken({
    sub: resolved.id,
    tenantId: resolved.tenantId,
    shopId: resolved.shopId,
    roleId: resolved.roleId,
    roleSlug: resolved.roleSlug,
    perms: resolved.permissions,
    mustChangePassword: userRow.mustChangePassword,
  });
  const newRefresh = await signRefreshToken({ sub: resolved.id, tenantId: resolved.tenantId });
  return { accessToken: access, refreshToken: newRefresh };
}

/** Force-change-password flow used on first login (and 90-day rotation if enabled). */
export async function changePassword(userId: string, input: { currentPassword: string; newPassword: string }): Promise<void> {
  const user = await rawPrisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new NotFoundError('User');
  const ok = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!ok) throw new UnauthorizedError('Current password is incorrect');

  const hash = await hashPassword(input.newPassword);
  await rawPrisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}

/** Begin 2FA enrolment: generate secret + provisioning URI. Not enabled until verified. */
export async function startTotpEnrolment(userId: string, issuer = 'Gold OS'): Promise<{ secret: string; otpauthUri: string }> {
  const user = await rawPrisma.user.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabled: true },
  });
  if (!user) throw new NotFoundError('User');
  if (user.totpEnabled) throw new BadRequestError('2FA already enabled');

  const secret = generateTotpSecret();
  await rawPrisma.user.update({
    where: { id: userId },
    data: { totpSecret: secret }, // not yet enabled
  });
  return { secret, otpauthUri: totpProvisioningUri(secret, issuer, user.email) };
}

/** Confirm 2FA enrolment with a TOTP code. Returns one-time backup codes (plaintext) — show once. */
export async function confirmTotpEnrolment(userId: string, code: string): Promise<{ backupCodes: string[] }> {
  const user = await rawPrisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user || !user.totpSecret) throw new BadRequestError('TOTP enrolment not started');
  if (user.totpEnabled) throw new BadRequestError('2FA already enabled');
  if (!verifyTotp(user.totpSecret, code)) throw new UnauthorizedError('Invalid 2FA code');

  const plaintextCodes = generateBackupCodes(10);
  const hashed = await Promise.all(plaintextCodes.map(hashPassword));
  await rawPrisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true, totpBackupCodes: hashed },
  });
  return { backupCodes: plaintextCodes };
}

export async function disableTotp(userId: string, currentPassword: string): Promise<void> {
  const user = await rawPrisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, totpEnabled: true },
  });
  if (!user) throw new NotFoundError('User');
  if (!user.totpEnabled) return; // idempotent
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw new UnauthorizedError('Password incorrect');
  await rawPrisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] },
  });
}

/** Used by /auth/me — returns the resolved user view used for sidebar/route gating. */
/**
 * Returns the shape the client's `AuthedUser` interface expects. KEY POINT:
 * the field is `perms` (matching the login response + JWT) — not
 * `permissions` (which is the internal name on `ResolvedUser`). Confusing
 * the two would leave `user.perms` undefined on the client and crash any
 * non-super-admin trying to evaluate a permission check.
 */
export interface AuthedUserResponse {
  id: string;
  tenantId: string;
  shopId: string | null;
  roleId: string;
  roleSlug: string;
  roleName: string;
  name: string;
  email: string;
  perms: PermissionKey[];
  totpEnabled: boolean;
  mustChangePassword: boolean;
}

export async function getCurrentUser(userId: string): Promise<AuthedUserResponse> {
  const resolved = await resolveUser(userId);
  if (!resolved) throw new UnauthorizedError('Session no longer valid');
  const row = await rawPrisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, totpEnabled: true, mustChangePassword: true },
  });
  if (!row) throw new UnauthorizedError('User not found');
  return {
    id: resolved.id,
    tenantId: resolved.tenantId,
    shopId: resolved.shopId,
    roleId: resolved.roleId,
    roleSlug: resolved.roleSlug,
    roleName: resolved.roleName,
    name: row.name,
    email: row.email,
    perms: resolved.permissions,
    totpEnabled: row.totpEnabled,
    mustChangePassword: row.mustChangePassword,
  };
}
