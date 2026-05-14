// server/src/middleware/tenant-scope.ts — Wraps the rest of the request in AsyncLocalStorage
// so the Prisma extension can find tenantId. MUST run AFTER auth.

import type { NextFunction, Request, Response } from 'express';
import { tenantStorage } from '../lib/async-context.js';
import { UnauthorizedError } from '../lib/errors.js';

export function tenantScope(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  tenantStorage.run(
    { tenantId: req.user.tenantId, userId: req.user.userId, shopId: req.user.shopId },
    () => next(),
  );
}
