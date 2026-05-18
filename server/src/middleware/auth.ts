// JWT verify → attaches req.user with effective permission list.
// Per specs/api-design.md: Authorization: Bearer <accessToken>.
//
// The access token carries the resolved permission set (see
// modules/auth/permissions.ts) so middleware can do O(1) checks without
// hitting the DB on every request. Token rotates every 15 min, so role
// changes become effective within that window.

import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { resolveUser } from '../modules/auth/permissions.js';
import { UnauthorizedError } from '../lib/errors.js';
import { env } from '../env.js';
import { resolveCanonicalTenantId } from '../lib/canonical-tenant.js';
import { PERMISSION_KEYS, type PermissionKey } from '@goldos/shared/constants';

export interface AuthUser {
  userId: string;
  tenantId: string;
  shopId?: string;
  roleId: string;
  roleSlug: string;
  perms: readonly PermissionKey[];
  mustChangePassword: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

async function resolveAdminTenantId(): Promise<string> {
  if (env.ADMIN_TENANT_ID) return env.ADMIN_TENANT_ID;
  try {
    return await resolveCanonicalTenantId();
  } catch {
    throw new UnauthorizedError('No tenant provisioned for admin session');
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    // Sentinel-token bypass for legacy admin pages. DEV/STAGING ONLY —
    // permanently refused in production regardless of env config. Even if
    // ADMIN_API_TOKEN is set in prod (misconfiguration, leaked .env, ops
    // mistake), an attacker who learns the value cannot use it. The boot
    // warning in server/src/index.ts surfaces the misconfiguration so the
    // operator notices and removes the env var.
    //
    // Read NODE_ENV from process.env (not the cached `env` object) so an
    // orchestrator that flips the env mid-process — and the security tests
    // that simulate prod — see the change immediately.
    const isProdRuntime = process.env['NODE_ENV'] === 'production';
    if (
      !isProdRuntime &&
      env.ADMIN_API_TOKEN &&
      token === env.ADMIN_API_TOKEN
    ) {
      const tenantId = await resolveAdminTenantId();
      // Find the SUPER_ADMIN role for this tenant so route handlers that
      // dereference req.user.roleId still work.
      const { rawPrisma } = await import('../lib/prisma.js');
      const superAdmin = await rawPrisma.role.findFirst({
        where: { tenantId, slug: 'SUPER_ADMIN' },
        select: { id: true },
      });
      req.user = {
        userId: 'admin',
        tenantId,
        roleId: superAdmin?.id ?? 'sentinel',
        roleSlug: 'SUPER_ADMIN',
        perms: PERMISSION_KEYS,
        mustChangePassword: false,
      };
      return next();
    }

    const payload = await verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      shopId: payload.shopId ?? undefined,
      roleId: payload.roleId,
      roleSlug: payload.roleSlug,
      perms: payload.perms,
      mustChangePassword: payload.mustChangePassword,
    };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

/**
 * Strict variant: re-resolves permissions from DB on every request. Use
 * sparingly (e.g. on permission-mutating routes themselves) so a perm
 * revocation takes effect immediately rather than waiting for token refresh.
 */
export async function authMiddlewareFresh(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw new UnauthorizedError('Missing bearer token');
    const token = header.slice('Bearer '.length).trim();
    const payload = await verifyAccessToken(token);
    const fresh = await resolveUser(payload.sub);
    if (!fresh) throw new UnauthorizedError('Session no longer valid');
    req.user = {
      userId: fresh.id,
      tenantId: fresh.tenantId,
      shopId: fresh.shopId ?? undefined,
      roleId: fresh.roleId,
      roleSlug: fresh.roleSlug,
      perms: fresh.permissions,
      mustChangePassword: payload.mustChangePassword,
    };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
