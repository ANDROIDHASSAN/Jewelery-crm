// server/src/modules/auth/auth.service.ts — JWT issuance + refresh rotation.
// OTP send is stubbed in Day 1; D3 wires WhatsApp Cloud template.

import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../env.js';
import { rawPrisma } from '../../lib/prisma.js';
import { UnauthorizedError } from '../../lib/errors.js';
import type { Role } from '@goldos/shared/constants';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export interface TokenPayload {
  sub: string; // userId
  tenantId: string;
  role: Role;
  shopId?: string;
}

export async function issueAccessToken(p: TokenPayload): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(accessSecret);
}

export async function issueRefreshToken(p: TokenPayload): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(refreshSecret);
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, { algorithms: ['HS256'] });
    if (!payload.sub || !payload['tenantId'] || !payload['role']) {
      throw new UnauthorizedError('Malformed refresh token');
    }
    return {
      sub: String(payload.sub),
      tenantId: String(payload['tenantId']),
      role: payload['role'] as Role,
      shopId: payload['shopId'] ? String(payload['shopId']) : undefined,
    };
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
}

/** Day 1 stub. D3 wires WhatsApp Cloud template + OTP store in Redis. */
export async function sendOtp(_phone: string): Promise<{ devCode?: string }> {
  // In dev, return a fixed code so the login flow is testable without WhatsApp creds.
  if (env.NODE_ENV !== 'production') return { devCode: '123456' };
  return {};
}

export async function findUserForLogin(phone: string): Promise<{
  id: string;
  tenantId: string;
  shopId: string | null;
  role: Role;
} | null> {
  // Raw client (no tenant scope) — login lookup happens BEFORE tenant context exists.
  const user = await rawPrisma.user.findFirst({
    where: { phone, isActive: true },
    select: { id: true, tenantId: true, shopId: true, role: true },
  });
  return user;
}
