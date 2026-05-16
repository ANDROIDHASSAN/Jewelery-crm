// Effective-permission resolver.
//
// The contract:
//   effective(user) = (role.permissions ∪ user.overrides[granted=true])
//                     \ user.overrides[granted=false]
//
// SUPER_ADMIN is a special-case: the role always carries every permission
// in the catalog, but we short-circuit on `role.slug === 'SUPER_ADMIN'` so
// new permissions added in code automatically apply without re-seeding.
//
// We resolve in a single SQL round-trip per login using Prisma's $queryRaw —
// avoids N+1 from the role → rolePermissions → permission → user.overrides
// → permission chain. Result is then cached on the JWT for 15 minutes so
// per-request middleware checks are O(1) string lookups against a Set.

import { rawPrisma } from '../../lib/prisma.js';
import { PERMISSION_KEYS, type PermissionKey } from '@goldos/shared/constants';

export interface ResolvedUser {
  id: string;
  tenantId: string;
  shopId: string | null;
  roleId: string;
  roleSlug: string;
  roleName: string;
  permissions: PermissionKey[];
}

/**
 * Single-query resolve: fetch the user, role slug, and effective permission
 * keys. Returns null if the user doesn't exist, is inactive, or has no role.
 *
 * Implementation note: this hits Postgres with one parameterised raw query
 * that joins User → Role → RolePermission → Permission and applies the
 * UserPermission override left-anti-join logic inline. Faster than three
 * Prisma queries + an in-memory merge, and the query plan uses indexes
 * (RolePermission.roleId, UserPermission.userId).
 */
export async function resolveUser(userId: string): Promise<ResolvedUser | null> {
  type Row = {
    id: string;
    tenantId: string;
    shopId: string | null;
    roleId: string;
    roleSlug: string;
    roleName: string;
    permissionKey: string | null;
  };

  const rows = await rawPrisma.$queryRaw<Row[]>`
    WITH effective AS (
      SELECT rp."permissionId"
      FROM "RolePermission" rp
      WHERE rp."roleId" = (SELECT u."roleId" FROM "User" u WHERE u.id = ${userId})
      UNION
      SELECT up."permissionId"
      FROM "UserPermission" up
      WHERE up."userId" = ${userId} AND up."granted" = true
      EXCEPT
      SELECT up."permissionId"
      FROM "UserPermission" up
      WHERE up."userId" = ${userId} AND up."granted" = false
    )
    SELECT u.id, u."tenantId", u."shopId",
           u."roleId", r."slug" AS "roleSlug", r."name" AS "roleName",
           p."key" AS "permissionKey"
    FROM "User" u
    INNER JOIN "Role" r ON r.id = u."roleId"
    LEFT JOIN effective e ON true
    LEFT JOIN "Permission" p ON p.id = e."permissionId"
    WHERE u.id = ${userId} AND u."isActive" = true
  `;

  if (rows.length === 0) return null;
  const first = rows[0]!;

  // SUPER_ADMIN shortcut: catalog membership trumps stored RolePermissions.
  // Lets us add a new perm in code without a re-seed (and prevents accidental
  // de-permissioning of the super admin if a custom role edit script bugs out).
  let perms: string[];
  if (first.roleSlug === 'SUPER_ADMIN') {
    perms = PERMISSION_KEYS.slice();
  } else {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.permissionKey) set.add(row.permissionKey);
    }
    perms = [...set];
  }

  return {
    id: first.id,
    tenantId: first.tenantId,
    shopId: first.shopId,
    roleId: first.roleId,
    roleSlug: first.roleSlug,
    roleName: first.roleName,
    permissions: perms as PermissionKey[],
  };
}

/**
 * Cheap in-memory check used by `requirePermission` middleware. Treats
 * permissions as a Set lookup (O(1)) for hot path performance.
 */
export function userHasPermission(perms: readonly string[], key: PermissionKey): boolean {
  return perms.includes(key);
}
