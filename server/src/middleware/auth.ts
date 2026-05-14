// server/src/middleware/auth.ts — JWT verify, attaches req.user.
// Per specs/api-design.md: Authorization: Bearer <accessToken>.

import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { UnauthorizedError } from '../lib/errors.js';
import { env } from '../env.js';
import { rawPrisma } from '../lib/prisma.js';
import type { Role } from '@goldos/shared/constants';

export interface AuthUser {
  userId: string;
  tenantId: string;
  shopId?: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

// Cached admin tenantId — resolved on first admin request when ADMIN_TENANT_ID isn't pinned.
// We re-validate the cached id every request, because the seed script deletes &
// recreates the demo tenant — a stale cached id would silently 0-out queries
// AND break writes (foreign-key violation on Lead.tenantId etc.).
let cachedAdminTenantId: string | null = null;

async function resolveAdminTenantId(): Promise<string> {
  if (env.ADMIN_TENANT_ID) return env.ADMIN_TENANT_ID;
  if (cachedAdminTenantId) {
    const stillExists = await rawPrisma.tenant.findUnique({
      where: { id: cachedAdminTenantId },
      select: { id: true },
    });
    if (stillExists) return cachedAdminTenantId;
    cachedAdminTenantId = null; // fall through and re-resolve
  }
  // Prefer the canonical demo tenant if present (the one the seed script owns),
  // otherwise fall back to whichever tenant exists.
  const seedTenant = await rawPrisma.tenant.findUnique({
    where: { ownerEmail: 'owner@goldos.dev' },
    select: { id: true },
  });
  const tenant =
    seedTenant ??
    (await rawPrisma.tenant.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }));
  if (!tenant) throw new UnauthorizedError('No tenant provisioned for admin session');
  cachedAdminTenantId = tenant.id;
  return tenant.id;
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    // Admin sentinel bypass — client-only login flow (see client/src/features/auth/LoginPage.tsx).
    if (env.ADMIN_API_TOKEN && token === env.ADMIN_API_TOKEN) {
      const tenantId = await resolveAdminTenantId();
      req.user = { userId: 'admin', tenantId, role: 'OWNER' };
      return next();
    }

    const { payload } = await jwtVerify(token, accessSecret, { algorithms: ['HS256'] });
    if (!payload.sub || !payload['tenantId'] || !payload['role']) {
      throw new UnauthorizedError('Malformed token');
    }
    req.user = {
      userId: String(payload.sub),
      tenantId: String(payload['tenantId']),
      shopId: payload['shopId'] ? String(payload['shopId']) : undefined,
      role: payload['role'] as Role,
    };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowed.includes(req.user.role)) {
      return next(new UnauthorizedError('Insufficient role'));
    }
    next();
  };
}
