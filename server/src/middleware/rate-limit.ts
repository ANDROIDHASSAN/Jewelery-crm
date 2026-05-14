// server/src/middleware/rate-limit.ts — per spec api-design.md.
// 100 req/min default per JWT, 30 req/min per IP unauth.

import rateLimit from 'express-rate-limit';

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  max: (req) => (req.user ? 100 : 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? req.ip ?? 'unknown',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const authRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many auth attempts' } },
});
