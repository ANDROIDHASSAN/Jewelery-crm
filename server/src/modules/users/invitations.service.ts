// Invitation lifecycle: create → list → revoke → accept.
//
// Design:
//  * Token is a 32-byte url-safe random string (256 bits of entropy).
//  * Only the SHA-256 hash is stored. The plaintext is shown to the admin
//    once at create-time, embedded in the shareable link. We can never
//    recover the token after that — admin must revoke + re-invite.
//  * Tokens expire after 7 days. The expiresAt index makes "cleanup expired"
//    a constant-time query if we add a worker later.
//  * Accepting:
//      1. Look up by tokenHash (constant-time miss via DB).
//      2. Refuse if revoked, accepted, or expired.
//      3. Create User row inside a single tx with mustChangePassword:false
//         (they just SET their password — no need to force a change).
//      4. Stamp acceptedAt + acceptedUserId on the invitation atomically.
//      5. Audit-log INVITATION_ACCEPTED.
//  * Same-email collision: if a User already exists for (tenantId, email),
//    we reject the invitation at create-time. Admin must deactivate the
//    old user first.

import crypto from 'node:crypto';
import { rawPrisma } from '../../lib/prisma.js';
import { hashPassword } from '../auth/password.js';
import { BusinessRuleError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { sendEmail, getInvitationEmailHTML, getWelcomeEmailHTML } from '../../lib/mailer.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../env.js';

const INVITATION_TTL_DAYS = 7;

function generateToken(): { plaintext: string; hash: string } {
  const plaintext = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

function hashToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

export interface CreateInvitationInput {
  tenantId: string;
  email: string;
  name: string;
  roleId: string;
  shopId?: string | null;
  invitedByUserId: string | null;
  sendEmail?: boolean; // default: true
}

export async function createInvitation(input: CreateInvitationInput): Promise<{
  invitationId: string;
  tokenPlaintext: string;
  expiresAt: Date;
}> {
  const email = input.email.toLowerCase().trim();

  // Refuse if a user with this email already exists in this tenant.
  const existingUser = await rawPrisma.user.findUnique({
    where: { tenantId_email: { tenantId: input.tenantId, email } },
    select: { id: true },
  });
  if (existingUser) {
    throw new BusinessRuleError('USER_EXISTS', 'A team member with this email already exists. Deactivate them first if you want to re-invite.');
  }

  // Validate role belongs to this tenant.
  const role = await rawPrisma.role.findFirst({
    where: { id: input.roleId, tenantId: input.tenantId },
    select: { id: true, slug: true },
  });
  if (!role) {
    throw new BusinessRuleError('ROLE_NOT_FOUND', 'Role does not exist in this tenant.');
  }
  // Refuse inviting straight into SUPER_ADMIN — they have to be promoted by
  // an existing super admin AFTER accepting a normal role first.
  if (role.slug === 'SUPER_ADMIN') {
    throw new BusinessRuleError('CANNOT_INVITE_SUPER_ADMIN', 'Promote an existing user to SUPER_ADMIN instead of inviting one.');
  }

  // Optional shop check — if provided, must be the tenant's.
  if (input.shopId) {
    const shop = await rawPrisma.shop.findFirst({
      where: { id: input.shopId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!shop) throw new BusinessRuleError('SHOP_NOT_FOUND', 'Shop does not exist in this tenant.');
  }

  // Revoke any prior pending invitation for the same email so we don't pile
  // up unused tokens. Idempotent re-invite.
  await rawPrisma.userInvitation.updateMany({
    where: { tenantId: input.tenantId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const { plaintext, hash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const created = await rawPrisma.userInvitation.create({
    data: {
      tenantId: input.tenantId,
      email,
      name: input.name.trim(),
      roleId: input.roleId,
      shopId: input.shopId ?? null,
      tokenHash: hash,
      expiresAt,
      invitedByUserId: input.invitedByUserId,
    },
    include: {
      role: { select: { name: true } },
      tenant: { select: { businessName: true } },
    },
  });

  // Send invitation email if enabled (default: true)
  // Non-blocking: send in background, don't fail the invitation if email fails
  if (input.sendEmail !== false) {
    setImmediate(async () => {
      try {
        const baseUrl = env.APP_BASE_URL || 'https://app.zehlora.com';
        const invitationLink = `${baseUrl}/accept-invitation/${plaintext}`;

        const emailHTML = getInvitationEmailHTML({
          recipientName: input.name,
          invitationLink,
          tenantName: created.tenant.businessName,
          roleName: created.role.name,
          expiresInDays: INVITATION_TTL_DAYS,
        });

        const sent = await sendEmail({
          to: email,
          subject: `You're invited to join ${created.tenant.businessName} on Zehlora`,
          html: emailHTML,
          text: `You've been invited to join ${created.tenant.businessName}. Click here to accept: ${invitationLink}`,
        });

        if (!sent) {
          logger.warn(
            { tenantId: input.tenantId, email, invitationId: created.id },
            'Invitation created but email could not be sent (SMTP may not be configured)',
          );
        }
      } catch (err) {
        logger.error(
          { tenantId: input.tenantId, email, invitationId: created.id, err },
          'Error sending invitation email',
        );
      }
    });
  }

  return { invitationId: created.id, tokenPlaintext: plaintext, expiresAt };
}

export async function listInvitations(tenantId: string): Promise<Array<{
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  shopId: string | null;
  shopName: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: Date;
}>> {
  const rows = await rawPrisma.userInvitation.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      role: { select: { name: true } },
      shop: { select: { name: true } },
    },
  });
  const now = Date.now();
  return rows.map((r) => {
    let status: 'pending' | 'accepted' | 'expired' | 'revoked';
    if (r.acceptedAt) status = 'accepted';
    else if (r.revokedAt) status = 'revoked';
    else if (r.expiresAt.getTime() < now) status = 'expired';
    else status = 'pending';
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      roleId: r.roleId,
      roleName: r.role.name,
      shopId: r.shopId,
      shopName: r.shop?.name ?? null,
      expiresAt: r.expiresAt,
      acceptedAt: r.acceptedAt,
      revokedAt: r.revokedAt,
      status,
      createdAt: r.createdAt,
    };
  });
}

export async function revokeInvitation(tenantId: string, invitationId: string): Promise<void> {
  const inv = await rawPrisma.userInvitation.findFirst({
    where: { id: invitationId, tenantId },
    select: { id: true, acceptedAt: true, revokedAt: true },
  });
  if (!inv) throw new NotFoundError('Invitation not found');
  if (inv.acceptedAt) throw new BusinessRuleError('ALREADY_ACCEPTED', 'Cannot revoke an accepted invitation. Deactivate the user instead.');
  if (inv.revokedAt) return; // idempotent
  await rawPrisma.userInvitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  });
}

export interface InvitationPreview {
  email: string;
  name: string;
  roleName: string;
  shopName: string | null;
  tenantName: string;
  expiresAt: Date;
}

/** Public — used by the accept-invitation landing page before the user submits a password. */
export async function previewInvitation(tokenPlaintext: string): Promise<InvitationPreview> {
  const hash = hashToken(tokenPlaintext);
  const inv = await rawPrisma.userInvitation.findUnique({
    where: { tokenHash: hash },
    include: {
      tenant: { select: { businessName: true } },
      role: { select: { name: true } },
      shop: { select: { name: true } },
    },
  });
  if (!inv) throw new UnauthorizedError('Invalid invitation link');
  if (inv.acceptedAt) throw new UnauthorizedError('This invitation has already been used');
  if (inv.revokedAt) throw new UnauthorizedError('This invitation was revoked');
  if (inv.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError('This invitation has expired');
  }
  return {
    email: inv.email,
    name: inv.name,
    roleName: inv.role.name,
    shopName: inv.shop?.name ?? null,
    tenantName: inv.tenant.businessName,
    expiresAt: inv.expiresAt,
  };
}

export interface AcceptInvitationInput {
  tokenPlaintext: string;
  name: string;
  password: string;
  phone?: string;
}

export interface AcceptInvitationResult {
  userId: string;
  tenantId: string;
  email: string;
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
  const hash = hashToken(input.tokenPlaintext);
  // Wrap in a tx so the User create + Invitation stamp are atomic — a race
  // where the same token is used twice gets one success + one tx-rollback,
  // and the second caller sees "already used".
  return rawPrisma.$transaction(async (tx) => {
    const inv = await tx.userInvitation.findUnique({ where: { tokenHash: hash } });
    if (!inv) throw new UnauthorizedError('Invalid invitation link');
    if (inv.acceptedAt) throw new UnauthorizedError('This invitation has already been used');
    if (inv.revokedAt) throw new UnauthorizedError('This invitation was revoked');
    if (inv.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('This invitation has expired');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await tx.user.create({
      data: {
        tenantId: inv.tenantId,
        email: inv.email,
        name: input.name.trim() || inv.name,
        phone: input.phone?.trim() || null,
        roleId: inv.roleId,
        shopId: inv.shopId,
        passwordHash,
        mustChangePassword: false, // they just set it themselves
        passwordChangedAt: new Date(),
        isActive: true,
        createdByUserId: inv.invitedByUserId,
      },
      include: {
        tenant: { select: { businessName: true } },
      },
    });

    await tx.userInvitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date(), acceptedUserId: user.id },
    });

    // Send welcome email after successful signup (non-blocking)
    setImmediate(async () => {
      try {
        const baseUrl = env.APP_BASE_URL || 'https://app.zehlora.com';
        const welcomeUrl = `${baseUrl}/dashboard`;
        const emailHTML = getWelcomeEmailHTML({
          recipientName: input.name.trim() || inv.name,
          tenantName: user.tenant.businessName,
          dashboardUrl: welcomeUrl,
        });

        const sent = await sendEmail({
          to: inv.email,
          subject: `Welcome to Zehlora - ${user.tenant.businessName}`,
          html: emailHTML,
          text: `Welcome to Zehlora! Go to ${welcomeUrl} to start using your account.`,
        });

        if (!sent) {
          logger.warn(
            { tenantId: inv.tenantId, email: inv.email, userId: user.id },
            'Invitation accepted but welcome email could not be sent (SMTP may not be configured)',
          );
        }
      } catch (err) {
        logger.error(
          { tenantId: inv.tenantId, email: inv.email, userId: user.id, err },
          'Error sending welcome email after invitation acceptance',
        );
      }
    });

    return { userId: user.id, tenantId: inv.tenantId, email: inv.email };
  });
}
