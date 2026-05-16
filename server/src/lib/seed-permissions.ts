// Idempotent permission catalog sync. Runs on app boot so adding a new
// permission key in shared/constants.ts auto-inserts it on next deploy.
// Removing a key here does NOT delete it from the DB — keep it around so
// RolePermission rows referencing it don't ghost-orphan.

import { rawPrisma } from './prisma.js';
import { PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, type RoleSlug } from '@goldos/shared/constants';
import { logger } from './logger.js';

export async function syncPermissionCatalog(): Promise<void> {
  const existing = await rawPrisma.permission.findMany({ select: { key: true, id: true } });
  const byKey = new Map(existing.map((p) => [p.key, p.id] as const));
  const toCreate = PERMISSIONS.filter((p) => !byKey.has(p.key));
  if (toCreate.length > 0) {
    await rawPrisma.permission.createMany({
      data: toCreate.map((p) => ({
        key: p.key,
        module: p.module,
        action: p.action,
        description: p.description,
      })),
      skipDuplicates: true,
    });
    logger.info({ added: toCreate.length }, 'Permission catalog synced');
  }
}

/**
 * For every tenant, ensure the 4 built-in roles exist and their default
 * permission set is applied. Used on app boot to self-heal after adding new
 * permission keys.
 *
 * For SUPER_ADMIN we always re-link every catalog permission. For others we
 * only ADD missing default permissions — never remove, so tenant edits stick.
 */
export async function syncBuiltInRoles(): Promise<void> {
  const tenants = await rawPrisma.tenant.findMany({ select: { id: true } });
  const perms = await rawPrisma.permission.findMany({ select: { id: true, key: true } });
  const permByKey = new Map(perms.map((p) => [p.key, p.id] as const));

  for (const tenant of tenants) {
    await ensureBuiltInRoles(tenant.id, permByKey);
  }
}

const BUILT_INS: Array<{ slug: RoleSlug; name: string; description: string }> = [
  { slug: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full access across every module.' },
  { slug: 'ACCOUNTANT', name: 'Accountant', description: 'Stock, finance, accounting, and reports.' },
  { slug: 'EMPLOYEE', name: 'Employee', description: 'Stock, e-commerce, leads, and reports.' },
  { slug: 'POS_USER', name: 'POS Cashier', description: 'Offline POS subdomain only.' },
];

export async function ensureBuiltInRoles(
  tenantId: string,
  permByKey?: Map<string, string>,
): Promise<void> {
  const perms = permByKey ?? new Map(
    (await rawPrisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id] as const),
  );

  for (const def of BUILT_INS) {
    const role = await rawPrisma.role.upsert({
      where: { tenantId_slug: { tenantId, slug: def.slug } },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { tenantId, slug: def.slug, name: def.name, description: def.description, isSystem: true },
      select: { id: true },
    });

    const defaultKeys = ROLE_DEFAULT_PERMISSIONS[def.slug];
    const existing = await rawPrisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingIds = new Set(existing.map((e) => e.permissionId));

    if (def.slug === 'SUPER_ADMIN') {
      // Force-sync: super admin always has every catalog perm. (Resolver
      // also short-circuits, but the DB row should reflect reality.)
      const allIds = [...perms.values()];
      const missing = allIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        await rawPrisma.rolePermission.createMany({
          data: missing.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
    } else {
      const toAdd = defaultKeys
        .map((k) => perms.get(k))
        .filter((id): id is string => id !== undefined && !existingIds.has(id));
      if (toAdd.length > 0) {
        await rawPrisma.rolePermission.createMany({
          data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
    }
  }
}
