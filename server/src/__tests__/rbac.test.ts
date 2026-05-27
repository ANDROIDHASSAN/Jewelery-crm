// RBAC checks: requirePermission middleware behaviour + permission catalog
// integrity. No DB.

import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requirePermission, requireAnyPermission, requireSuperAdmin } from '../middleware/require-permission.js';
import { PERMISSIONS, PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS } from '@goldos/shared/constants';

function makeReq(perms: string[], roleSlug = 'EMPLOYEE'): Request {
  return {
    user: {
      userId: 'u_test',
      tenantId: 't_test',
      roleId: 'r_test',
      roleSlug,
      perms,
      mustChangePassword: false,
    },
  } as unknown as Request;
}

describe('requirePermission', () => {
  it('passes when the user has the permission', () => {
    const req = makeReq(['inventory.read']);
    const next = vi.fn() as unknown as NextFunction;
    requirePermission('inventory.read')(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('forbids when the user lacks the permission', () => {
    const req = makeReq(['inventory.read']);
    const next = vi.fn() as unknown as NextFunction;
    requirePermission('inventory.write')(req, {} as Response, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('requires ALL permissions when multiple are passed (AND)', () => {
    const req = makeReq(['inventory.read']);
    const next = vi.fn() as unknown as NextFunction;
    requirePermission('inventory.read', 'inventory.write')(req, {} as Response, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err.status).toBe(403);
  });

  it('requireAnyPermission passes if at least one matches (OR)', () => {
    const req = makeReq(['finance.read']);
    const next = vi.fn() as unknown as NextFunction;
    requireAnyPermission('inventory.read', 'finance.read')(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireSuperAdmin gates by role slug, not perm list', () => {
    const employee = makeReq(PERMISSION_KEYS.slice(), 'EMPLOYEE');
    const employeeNext = vi.fn() as unknown as NextFunction;
    requireSuperAdmin(employee, {} as Response, employeeNext);
    expect((employeeNext as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0].code).toBe('FORBIDDEN');

    const admin = makeReq([], 'SUPER_ADMIN');
    const adminNext = vi.fn() as unknown as NextFunction;
    requireSuperAdmin(admin, {} as Response, adminNext);
    expect(adminNext).toHaveBeenCalledWith();
  });

  it('returns 401 when req.user is missing', () => {
    const req = {} as Request;
    const next = vi.fn() as unknown as NextFunction;
    requirePermission('inventory.read')(req, {} as Response, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err.status).toBe(401);
  });
});

describe('permission catalog integrity', () => {
  it('all keys are unique', () => {
    const seen = new Set<string>();
    for (const p of PERMISSIONS) {
      expect(seen.has(p.key)).toBe(false);
      seen.add(p.key);
    }
  });

  it('all keys follow the module.action convention', () => {
    for (const p of PERMISSIONS) {
      expect(p.key).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(p.key).toBe(`${p.module}.${p.action}`);
    }
  });

  it('ACCOUNTANT defaults grant nothing that does not exist in the catalog', () => {
    const allKeys = new Set(PERMISSION_KEYS);
    for (const k of ROLE_DEFAULT_PERMISSIONS.ACCOUNTANT) {
      expect(allKeys.has(k)).toBe(true);
    }
  });

  it('SUPER_ADMIN default = full catalog', () => {
    expect(new Set(ROLE_DEFAULT_PERMISSIONS.SUPER_ADMIN)).toEqual(new Set(PERMISSION_KEYS));
  });

  it('POS_USER cannot manage users, roles, or finance writes', () => {
    const forbidden = ['users.write', 'roles.write', 'finance.payroll_write', 'inventory.write'];
    for (const k of forbidden) {
      expect(ROLE_DEFAULT_PERMISSIONS.POS_USER).not.toContain(k);
    }
  });

  it('EMPLOYEE gets ecommerce + crm but NOT finance writes', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.EMPLOYEE).toContain('ecommerce.product_write');
    expect(ROLE_DEFAULT_PERMISSIONS.EMPLOYEE).toContain('crm.write');
    expect(ROLE_DEFAULT_PERMISSIONS.EMPLOYEE).not.toContain('finance.expense_write');
    expect(ROLE_DEFAULT_PERMISSIONS.EMPLOYEE).not.toContain('finance.payroll_write');
  });

  it('ACCOUNTANT gets finance writes but NOT pos.bill_create', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.ACCOUNTANT).toContain('finance.expense_write');
    expect(ROLE_DEFAULT_PERMISSIONS.ACCOUNTANT).toContain('finance.ledger_export');
    expect(ROLE_DEFAULT_PERMISSIONS.ACCOUNTANT).not.toContain('pos.bill_create');
  });

  // POST /inventory/items/:id/add-stock is gated by inventory.write — both
  // SuperAdmin (full catalog) and Accountant must have it so SuperAdmin and
  // Accountant can both restock items per the hybrid-inventory spec.
  it('ACCOUNTANT can hit POST /inventory/items/:id/add-stock (inventory.write)', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.ACCOUNTANT).toContain('inventory.write');
  });
});
