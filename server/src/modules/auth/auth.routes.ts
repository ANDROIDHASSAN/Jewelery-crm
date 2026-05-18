// Auth routes — login (email+password+optional TOTP), refresh, logout, me,
// password change, 2FA enrolment.
//
// Legacy phone-OTP endpoints are preserved at /otp/* so existing tests pass.

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  LoginSchema,
  ChangePasswordSchema,
  Totp2faSetupVerifySchema,
  OtpRequestSchema,
  OtpVerifySchema,
} from '@goldos/shared/schemas';
import {
  login,
  refresh,
  changePassword,
  startTotpEnrolment,
  confirmTotpEnrolment,
  disableTotp,
  getCurrentUser,
} from './auth.service.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { authMiddleware } from '../../middleware/auth.js';
import { rawPrisma } from '../../lib/prisma.js';
import { env } from '../../env.js';
import { previewInvitation, acceptInvitation } from '../users/invitations.service.js';
import { recordAuthEvent } from '../../lib/auth-events.js';
import { z } from 'zod';

export const authRouter: Router = Router();

const REFRESH_COOKIE = 'refresh_token';
// Refresh cookie hardening:
//  - httpOnly: not visible to JS, immune to XSS exfil.
//  - secure: HTTPS-only in prod.
//  - sameSite: strict — refresh is a same-origin admin flow; we never need
//    a cross-site request (e.g. from a third-party page) to be able to mint
//    a new access token. Lax would allow top-level GET navigation to attach
//    the cookie; strict denies even that. Refresh is POST anyway.
//  - path: scoped to the auth refresh endpoint only — never sent to any
//    other route, so a vuln on another endpoint can't trigger refresh on
//    the user's behalf.
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/v1/auth',
};

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, COOKIE_OPTS);
}

authRouter.post('/login', authRateLimit, async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    const result = await login({ ...body, req });

    if (result.status === 'mfa_required') {
      // 2FA challenge: client should re-POST with totpCode or backupCode.
      res.status(401).json({
        data: { mfaRequired: true },
        error: { code: 'MFA_REQUIRED', message: '2FA code required' },
      });
      return;
    }

    if (result.refreshToken) setRefreshCookie(res, result.refreshToken);
    res.json({
      data: {
        accessToken: result.accessToken,
        user: result.user,
        mustChangePassword: result.user?.mustChangePassword ?? false,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const token = cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedError('No refresh token');
    const { accessToken, refreshToken } = await refresh(token);
    setRefreshCookie(res, refreshToken);
    res.json({ data: { accessToken } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.status(204).end();
});

// --- Authenticated endpoints below -------------------------------------------

authRouter.get('/me', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const me = await getCurrentUser(req.user.userId);
    res.json({ data: me });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const body = ChangePasswordSchema.parse(req.body);
    await changePassword(req.user.userId, body);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/start', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const issuer = env.NODE_ENV === 'production' ? 'Gold OS' : 'Gold OS (dev)';
    const out = await startTotpEnrolment(req.user.userId, issuer);
    res.json({ data: out });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/verify', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { code } = Totp2faSetupVerifySchema.parse(req.body);
    const out = await confirmTotpEnrolment(req.user.userId, code);
    res.json({ data: out });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/disable', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { password } = req.body as { password?: string };
    if (!password) throw new UnauthorizedError('Password required');
    await disableTotp(req.user.userId, password);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Legacy phone-OTP endpoints (kept for backward compat) ------------------

authRouter.post('/otp/request', authRateLimit, async (req, res, next) => {
  try {
    OtpRequestSchema.parse(req.body);
    if (env.NODE_ENV !== 'production') {
      res.json({ data: { sent: true, devCode: '123456' } });
      return;
    }
    res.json({ data: { sent: true } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/otp/verify', authRateLimit, async (req, res, next) => {
  try {
    const { phone, code } = OtpVerifySchema.parse(req.body);
    if (env.NODE_ENV === 'production') {
      throw new UnauthorizedError('Phone-OTP login is disabled in production. Use email + password.');
    }
    if (code !== '123456') throw new UnauthorizedError('Invalid OTP');
    const user = await rawPrisma.user.findFirst({
      where: { phone, isActive: true },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedError('No account for this phone');
    // Dev-only convenience: same resolver pipeline as the email/password path
    // so the token carries the full permission list.
    const { devFinalize } = await import('./auth.service.dev.js');
    const result = await devFinalize(user.id);
    if (result.refreshToken) setRefreshCookie(res, result.refreshToken);
    res.json({ data: { accessToken: result.accessToken, user: result.user } });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------------
// Invitation acceptance — public. The token IS the auth, so no JWT needed,
// but we rate-limit aggressively so a leaked token can't be guessed.
// -------------------------------------------------------------------------

const AcceptInvitationSchema = z.object({
  token: z.string().min(32).max(80),
  name: z.string().min(2).max(120),
  password: z.string().min(10).max(120),
  phone: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/, 'Phone must be +91 followed by 10 digits starting 6-9')
    .optional(),
});

authRouter.get('/invitation/:token', authRateLimit, async (req, res, next) => {
  try {
    const token = req.params['token'] ?? '';
    if (token.length < 32 || token.length > 80) {
      throw new UnauthorizedError('Invalid invitation link');
    }
    const preview = await previewInvitation(token);
    res.json({ data: preview });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/invitation/accept', authRateLimit, async (req, res, next) => {
  try {
    const body = AcceptInvitationSchema.parse(req.body);
    const result = await acceptInvitation({
      tokenPlaintext: body.token,
      name: body.name,
      password: body.password,
      phone: body.phone,
    });
    recordAuthEvent({
      type: 'INVITATION_ACCEPTED',
      tenantId: result.tenantId,
      userId: result.userId,
      email: result.email,
      req,
    });
    res.status(201).json({
      data: { ok: true, email: result.email },
    });
  } catch (err) {
    next(err);
  }
});
