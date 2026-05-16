// User-management routes. Gated by users.* permissions which only the
// SUPER_ADMIN role carries by default. Custom roles can be granted these
// permissions via the role-management screen.

import { Router } from 'express';
import { z } from 'zod';
import { UserCreateSchema, UserUpdateSchema, ResetPasswordSchema, UserPermissionOverrideSchema } from '@goldos/shared/schemas';
import { requirePermission } from '../../middleware/require-permission.js';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  resetUserPassword,
  setUserPermissionOverrides,
} from './users.service.js';

export const usersRouter: Router = Router();

const ListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  roleId: z.string().optional(),
  shopId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

usersRouter.get('/', requirePermission('users.read'), async (req, res, next) => {
  try {
    const q = ListQuerySchema.parse(req.query);
    res.json({ data: await listUsers(q) });
  } catch (err) {
    next(err);
  }
});

usersRouter.get('/:id', requirePermission('users.read'), async (req, res, next) => {
  try {
    res.json({ data: await getUser(req.params.id!) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/', requirePermission('users.write'), async (req, res, next) => {
  try {
    const body = UserCreateSchema.parse(req.body);
    const result = await createUser(body, req.user!.userId);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id', requirePermission('users.write'), async (req, res, next) => {
  try {
    const body = UserUpdateSchema.parse(req.body);
    res.json({ data: await updateUser(req.params.id!, body) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/:id/reset-password', requirePermission('users.reset_password'), async (req, res, next) => {
  try {
    const body = ResetPasswordSchema.parse({ ...req.body, userId: req.params.id });
    const result = await resetUserPassword(req.params.id!, {
      newPassword: body.newPassword,
      forceChangeOnNextLogin: body.forceChangeOnNextLogin,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

usersRouter.put('/:id/permissions', requirePermission('roles.assign'), async (req, res, next) => {
  try {
    const body = UserPermissionOverrideSchema.parse({ ...req.body, userId: req.params.id });
    await setUserPermissionOverrides(body.userId, body.grants, body.denies, body.reason ?? null);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
