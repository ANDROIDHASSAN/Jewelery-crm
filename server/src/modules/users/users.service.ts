// User-management service. SUPER_ADMIN-only operations to create, list,
// update, deactivate staff, and reset passwords.

import { prisma, rawPrisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError, BadRequestError } from '../../lib/errors.js';
import { hashPassword, generateTempPassword } from '../auth/password.js';
import { getTenantId } from '../../lib/async-context.js';
import { sendEmail, getMemberAddedEmailHTML } from '../../lib/mailer.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../env.js';

function tenantIdOrThrow(): string {
  const id = getTenantId();
  if (!id) throw new BadRequestError('No tenant context');
  return id;
}

export async function listUsers(filters: { q?: string; roleId?: string; shopId?: string; isActive?: boolean }) {
  const where: Record<string, unknown> = {};
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { email: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  if (filters.roleId) where.roleId = filters.roleId;
  if (filters.shopId) where.shopId = filters.shopId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  return prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      shopId: true,
      roleId: true,
      isActive: true,
      mustChangePassword: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      role: { select: { slug: true, name: true } },
      shop: { select: { name: true } },
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      shopId: true,
      roleId: true,
      isActive: true,
      mustChangePassword: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      role: { select: { id: true, slug: true, name: true } },
      shop: { select: { id: true, name: true } },
      permissionOverrides: {
        select: { permissionId: true, granted: true, permission: { select: { key: true } } },
      },
    },
  });
  if (!user) throw new NotFoundError('User');
  return user;
}

export async function createUser(input: {
  name: string;
  email: string;
  phone?: string | null;
  shopId?: string | null;
  roleId: string;
  initialPassword?: string;
  sendEmail?: boolean; // default: true
}, createdByUserId: string) {
  const tenantId = tenantIdOrThrow();
  const email = input.email.toLowerCase().trim();

  // Confirm the role belongs to this tenant — defence-in-depth, the
  // tenant-scoped Prisma client already filters but a free-form roleId
  // could otherwise reference another tenant's row.
  const role = await rawPrisma.role.findFirst({
    where: { id: input.roleId, tenantId },
    select: { id: true, slug: true, name: true },
  });
  if (!role) throw new BadRequestError('Role not found for this tenant');

  // POS_USER must be tied to a shop — they can't roam tenants without a till.
  if (role.slug === 'POS_USER' && !input.shopId) {
    throw new BadRequestError('POS users must be assigned to a shop');
  }

  // Pre-check uniqueness for a nicer error than the DB constraint.
  const dup = await rawPrisma.user.findFirst({
    where: { tenantId, email },
    select: { id: true },
  });
  if (dup) throw new ConflictError('Email already in use within this tenant');

  const plain = input.initialPassword ?? generateTempPassword();
  const passwordHash = await hashPassword(plain);

  const user = await prisma.user.create({
    data: {
      tenantId,
      name: input.name,
      email,
      phone: input.phone ?? null,
      shopId: input.shopId ?? null,
      roleId: input.roleId,
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      createdByUserId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      shopId: true,
      roleId: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  // Send welcome email with temporary credentials if enabled (default: true)
  // Non-blocking: send in background, don't fail user creation if email fails
  if (input.sendEmail !== false && !input.initialPassword) {
    // Only send auto-generated password email, not if a custom password was provided
    setImmediate(async () => {
      try {
        const baseUrl = env.APP_BASE_URL || 'https://app.zehlora.com';
        const loginUrl = `${baseUrl}/login`;
        const emailHTML = getMemberAddedEmailHTML({
          recipientName: input.name,
          tempUsername: email,
          tempPassword: plain,
          loginUrl,
          roleName: role.name,
        });

        const sent = await sendEmail({
          to: email,
          subject: `Your ${role.name} account is ready - Zehlora`,
          html: emailHTML,
          text: `Your account is ready. Username: ${email}\nTemporary Password: ${plain}\nLogin: ${loginUrl}`,
        });

        if (!sent) {
          logger.warn(
            { tenantId, email, userId: user.id },
            'User created but welcome email could not be sent (SMTP may not be configured)',
          );
        }
      } catch (err) {
        logger.error(
          { tenantId, email, userId: user.id, err },
          'Error sending welcome email after user creation',
        );
      }
    });
  }

  // Return the generated password ONCE so the admin can hand it off. We
  // never store it elsewhere and never expose it again.
  return { user, initialPassword: input.initialPassword ? undefined : plain };
}

export async function updateUser(userId: string, input: {
  name?: string;
  phone?: string | null;
  shopId?: string | null;
  roleId?: string;
  isActive?: boolean;
}) {
  const tenantId = tenantIdOrThrow();

  if (input.roleId) {
    const role = await rawPrisma.role.findFirst({
      where: { id: input.roleId, tenantId },
      select: { id: true, slug: true },
    });
    if (!role) throw new BadRequestError('Role not found for this tenant');
  }

  // Guard: can't deactivate the last SUPER_ADMIN.
  if (input.isActive === false || input.roleId) {
    await assertNotLastSuperAdmin(userId, tenantId, input);
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      phone: input.phone ?? undefined,
      shopId: input.shopId ?? undefined,
      roleId: input.roleId,
      isActive: input.isActive,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      shopId: true,
      roleId: true,
      isActive: true,
      role: { select: { slug: true, name: true } },
    },
  });
}

async function assertNotLastSuperAdmin(
  userIdBeingChanged: string,
  tenantId: string,
  input: { isActive?: boolean; roleId?: string },
): Promise<void> {
  const superAdminRole = await rawPrisma.role.findFirst({
    where: { tenantId, slug: 'SUPER_ADMIN' },
    select: { id: true },
  });
  if (!superAdminRole) return; // tenant has no super admin role at all — caller's problem

  const currentUser = await rawPrisma.user.findUnique({
    where: { id: userIdBeingChanged },
    select: { roleId: true },
  });
  if (!currentUser || currentUser.roleId !== superAdminRole.id) return; // not changing a super admin

  const losing =
    (input.isActive === false) ||
    (input.roleId !== undefined && input.roleId !== superAdminRole.id);

  if (!losing) return;

  const count = await rawPrisma.user.count({
    where: { tenantId, roleId: superAdminRole.id, isActive: true },
  });
  if (count <= 1) {
    throw new ConflictError('Cannot remove or demote the last active super admin');
  }
}

export async function resetUserPassword(userId: string, opts: { newPassword?: string; forceChangeOnNextLogin: boolean }) {
  const plain = opts.newPassword ?? generateTempPassword();
  const hash = await hashPassword(plain);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hash,
      mustChangePassword: opts.forceChangeOnNextLogin,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  return { temporaryPassword: opts.newPassword ? undefined : plain };
}

export async function setUserPermissionOverrides(
  userId: string,
  grants: string[],
  denies: string[],
  reason?: string | null,
): Promise<void> {
  // Resolve permission keys to ids first (single query).
  const allKeys = [...new Set([...grants, ...denies])];
  if (allKeys.length === 0) {
    await rawPrisma.userPermission.deleteMany({ where: { userId } });
    return;
  }
  const perms = await rawPrisma.permission.findMany({
    where: { key: { in: allKeys } },
    select: { id: true, key: true },
  });
  const byKey = new Map(perms.map((p) => [p.key, p.id] as const));
  for (const k of allKeys) {
    if (!byKey.has(k)) throw new BadRequestError(`Unknown permission key: ${k}`);
  }

  await rawPrisma.$transaction([
    rawPrisma.userPermission.deleteMany({ where: { userId } }),
    rawPrisma.userPermission.createMany({
      data: [
        ...grants.map((k) => ({ userId, permissionId: byKey.get(k)!, granted: true, reason: reason ?? null })),
        ...denies.map((k) => ({ userId, permissionId: byKey.get(k)!, granted: false, reason: reason ?? null })),
      ],
    }),
  ]);
}
