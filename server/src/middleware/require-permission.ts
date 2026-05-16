// Permission gate. Use AFTER authMiddleware so req.user.perms is populated.
//
// Usage on a route group:
//   const r = Router();
//   r.use(authMiddleware);
//   r.get('/', requirePermission('inventory.read'), handler);
//   r.post('/', requirePermission('inventory.write'), handler);
//
// Multiple-permission semantics: `requirePermission('a', 'b')` requires both
// (AND). For OR semantics use `requireAnyPermission('a', 'b')`.

import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import type { PermissionKey } from '@goldos/shared/constants';

export function requirePermission(...required: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    for (const key of required) {
      if (!req.user.perms.includes(key)) {
        return next(new ForbiddenError(`Missing permission: ${key}`));
      }
    }
    next();
  };
}

export function requireAnyPermission(...required: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (required.some((k) => req.user!.perms.includes(k))) return next();
    next(new ForbiddenError(`Missing any of: ${required.join(', ')}`));
  };
}

/** SUPER_ADMIN-only routes (user mgmt, role mgmt, tenant settings). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.roleSlug !== 'SUPER_ADMIN') return next(new ForbiddenError('Super admin only'));
  next();
}
