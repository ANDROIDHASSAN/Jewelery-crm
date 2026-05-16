import { Router } from 'express';
import { RoleCreateSchema, RoleUpdateSchema } from '@goldos/shared/schemas';
import { requirePermission } from '../../middleware/require-permission.js';
import { listRoles, listPermissions, createRole, updateRole, deleteRole } from './roles.service.js';

export const rolesRouter: Router = Router();

rolesRouter.get('/', requirePermission('roles.read'), async (_req, res, next) => {
  try {
    res.json({ data: await listRoles() });
  } catch (err) {
    next(err);
  }
});

rolesRouter.get('/permissions', requirePermission('roles.read'), async (_req, res, next) => {
  try {
    res.json({ data: await listPermissions() });
  } catch (err) {
    next(err);
  }
});

rolesRouter.post('/', requirePermission('roles.write'), async (req, res, next) => {
  try {
    const body = RoleCreateSchema.parse(req.body);
    res.status(201).json({ data: await createRole(body) });
  } catch (err) {
    next(err);
  }
});

rolesRouter.patch('/:id', requirePermission('roles.write'), async (req, res, next) => {
  try {
    const body = RoleUpdateSchema.parse(req.body);
    res.json({ data: await updateRole(req.params.id!, body) });
  } catch (err) {
    next(err);
  }
});

rolesRouter.delete('/:id', requirePermission('roles.write'), async (req, res, next) => {
  try {
    await deleteRole(req.params.id!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
