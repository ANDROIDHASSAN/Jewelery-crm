// Dev-only token mint for the legacy phone-OTP path. Production should use
// the email/password flow in auth.service.ts. This module re-exports just the
// post-credential issuance pipeline so a verified dev OTP can still get a
// JWT with the full permission list resolved.

import { SignJWT } from 'jose';
import { env } from '../../env.js';
import { rawPrisma } from '../../lib/prisma.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { resolveUser } from './permissions.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export async function devFinalize(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; roleSlug: string; perms: string[] };
}> {
  if (env.NODE_ENV === 'production') throw new UnauthorizedError('Dev-only path');
  const resolved = await resolveUser(userId);
  if (!resolved) throw new UnauthorizedError('User no longer active');
  const row = await rawPrisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!row) throw new UnauthorizedError('User not found');

  const accessToken = await new SignJWT({
    tenantId: resolved.tenantId,
    shopId: resolved.shopId,
    roleId: resolved.roleId,
    roleSlug: resolved.roleSlug,
    perms: resolved.permissions,
    mustChangePassword: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(resolved.id)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(accessSecret);
  const refreshToken = await new SignJWT({ tenantId: resolved.tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(resolved.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(refreshSecret);

  return {
    accessToken,
    refreshToken,
    user: { id: resolved.id, name: row.name, email: row.email, roleSlug: resolved.roleSlug, perms: resolved.permissions },
  };
}
