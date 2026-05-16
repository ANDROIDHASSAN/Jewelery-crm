// Role-management service.
//
// Built-in roles (isSystem=true) live alongside custom roles in the same
// table, scoped per-tenant. Super admins can edit any role's permission
// set — including built-ins — for their tenant.
//
// Hard rules:
//   * Cannot delete a system role.
//   * Cannot delete a role that has users assigned. UI should reassign first.
//   * Cannot rename a system role's slug.
//   * Modifying the SUPER_ADMIN role's permissions has no runtime effect
//     (resolver short-circuits) — we still allow the DB update so an
//     audit-log "before/after" makes sense, but it's a soft op.

import { prisma, rawPrisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError, BadRequestError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';

function tenantIdOrThrow(): string {
  const id = getTenantId();
  if (!id) throw new BadRequestError('No tenant context');
  return id;
}

export async function listRoles() {
  return prisma.role.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      isSystem: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { users: true } },
      permissions: { select: { permission: { select: { key: true } } } },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

export async function listPermissions() {
  return rawPrisma.permission.findMany({
    select: { id: true, key: true, module: true, action: true, description: true },
    orderBy: [{ module: 'asc' }, { action: 'asc' }],
  });
}

export async function createRole(input: {
  slug: string;
  name: string;
  description?: string | null;
  permissionKeys: string[];
}) {
  const tenantId = tenantIdOrThrow();

  const existing = await rawPrisma.role.findUnique({
    where: { tenantId_slug: { tenantId, slug: input.slug } },
    select: { id: true },
  });
  if (existing) throw new ConflictError('A role with that slug already exists');

  const perms = await rawPrisma.permission.findMany({
    where: { key: { in: input.permissionKeys } },
    select: { id: true, key: true },
  });
  const byKey = new Map(perms.map((p) => [p.key, p.id] as const));
  for (const k of input.permissionKeys) {
    if (!byKey.has(k)) throw new BadRequestError(`Unknown permission key: ${k}`);
  }

  return rawPrisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        tenantId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
      },
    });
    if (input.permissionKeys.length > 0) {
      await tx.rolePermission.createMany({
        data: input.permissionKeys.map((k) => ({ roleId: role.id, permissionId: byKey.get(k)! })),
      });
    }
    return role;
  });
}

export async function updateRole(roleId: string, input: {
  name?: string;
  description?: string | null;
  permissionKeys?: string[];
}) {
  const tenantId = tenantIdOrThrow();
  const role = await rawPrisma.role.findFirst({
    where: { id: roleId, tenantId },
    select: { id: true, slug: true, isSystem: true },
  });
  if (!role) throw new NotFoundError('Role');

  return rawPrisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        description: input.description ?? undefined,
      },
    });

    if (input.permissionKeys !== undefined) {
      const perms = await tx.permission.findMany({
        where: { key: { in: input.permissionKeys } },
        select: { id: true, key: true },
      });
      const byKey = new Map(perms.map((p) => [p.key, p.id] as const));
      for (const k of input.permissionKeys) {
        if (!byKey.has(k)) throw new BadRequestError(`Unknown permission key: ${k}`);
      }
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (input.permissionKeys.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissionKeys.map((k) => ({ roleId, permissionId: byKey.get(k)! })),
        });
      }
    }

    return tx.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
  });
}

export async function deleteRole(roleId: string): Promise<void> {
  const tenantId = tenantIdOrThrow();
  const role = await rawPrisma.role.findFirst({
    where: { id: roleId, tenantId },
    select: { id: true, isSystem: true, _count: { select: { users: true } } },
  });
  if (!role) throw new NotFoundError('Role');
  if (role.isSystem) throw new ConflictError('Cannot delete a system role');
  if (role._count.users > 0) {
    throw new ConflictError('Cannot delete a role with users assigned — reassign them first');
  }
  await rawPrisma.role.delete({ where: { id: roleId } });
}
