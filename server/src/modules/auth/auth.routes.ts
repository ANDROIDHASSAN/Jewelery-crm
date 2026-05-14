// server/src/modules/auth/auth.routes.ts — OTP + token endpoints per specs/api-design.md.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { OtpRequestSchema, OtpVerifySchema } from '@goldos/shared/schemas';
import {
  findUserForLogin,
  issueAccessToken,
  issueRefreshToken,
  sendOtp,
  verifyRefreshToken,
} from './auth.service.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { authRateLimit } from '../../middleware/rate-limit.js';

export const authRouter: Router = Router();

authRouter.post('/otp/request', authRateLimit, async (req, res, next) => {
  try {
    const { phone } = OtpRequestSchema.parse(req.body);
    const result = await sendOtp(phone);
    res.json({ data: { sent: true, ...(result.devCode ? { devCode: result.devCode } : {}) } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/otp/verify', authRateLimit, async (req, res, next) => {
  try {
    const { phone, code } = OtpVerifySchema.parse(req.body);
    // Day 1 stub: accept dev code 123456. D3 replaces with Redis-backed OTP store.
    if (code !== '123456') throw new UnauthorizedError('Invalid OTP');
    const user = await findUserForLogin(phone);
    if (!user) throw new UnauthorizedError('No account for this phone');

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      shopId: user.shopId ?? undefined,
    };
    const accessToken = await issueAccessToken(payload);
    const refreshToken = await issueRefreshToken(payload);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });
    res.json({ data: { accessToken } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.refresh_token;
    if (!token) throw new UnauthorizedError('No refresh token');
    const payload = await verifyRefreshToken(token);
    const accessToken = await issueAccessToken(payload);
    // Refresh rotation: re-issue refresh too, invalidate old (D3 wires Redis blacklist).
    const refreshToken = await issueRefreshToken(payload);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });
    res.json({ data: { accessToken } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('refresh_token', { path: '/api/v1/auth' });
  res.status(204).end();
});
