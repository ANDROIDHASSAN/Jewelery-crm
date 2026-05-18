// Auth-event audit log writer. Fire-and-forget — a failed audit write must
// NEVER break the request that triggered it. Reads request metadata (IP +
// user-agent) defensively; both are optional.
//
// Writes use rawPrisma because AuthEvent is intentionally NOT tenant-scoped:
// pre-login failures (wrong email, locked account, malformed credentials)
// happen before any tenant is known. tenantId is populated when we can.

import type { Request } from 'express';
import { rawPrisma } from './prisma.js';
import { logger } from './logger.js';
import type { AuthEventType } from '@prisma/client';

export interface AuthEventInput {
  type: AuthEventType;
  tenantId?: string | null;
  userId?: string | null;
  email?: string | null;
  req?: Request | null;
  meta?: Record<string, unknown> | null;
}

export function recordAuthEvent(input: AuthEventInput): void {
  const ip =
    input.req?.ip ??
    (input.req?.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    null;
  const ua = (input.req?.headers['user-agent'] as string | undefined) ?? null;

  // Fire-and-forget. If the audit write fails the user's actual request
  // still completes — we just log the audit failure for the operator.
  rawPrisma.authEvent
    .create({
      data: {
        type: input.type,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        email: input.email?.toLowerCase().trim() ?? null,
        ipAddress: ip,
        userAgent: ua ? ua.slice(0, 500) : null,
        meta: input.meta ? (input.meta as object) : undefined,
      },
    })
    .catch((err) => {
      logger.error({ err, eventType: input.type }, '[auth-events] failed to persist auth event');
    });
}
