// server/src/middleware/error-handler.ts — uniform error envelope per specs/api-design.md.
// Must accept 4 args to be recognized as Express error middleware.

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const traceId = (req.headers['x-request-id'] as string | undefined) ?? randomTraceId();

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || '_';
      fields[path] = issue.message;
    }
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields, traceId },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, fields: err.fields, traceId },
    });
    return;
  }

  // Prisma errors expose typed codes (P1001 unreachable, P1002 timeout,
  // P2025 not found, P2002 unique violation, P2021 table missing — i.e.
  // schema drift between client and DB). Surfacing the bare code + short
  // message in the response lets us diagnose "the server is up but every
  // DB-touching request 500s" failures from a browser without needing
  // Render dashboard access. We do NOT leak stack traces, query SQL, or
  // model metadata (`meta` may include column/table names which is fine,
  // but no secrets are stored there).
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    const code = 'code' in err && typeof err.code === 'string' ? err.code : 'PRISMA_ERROR';
    logger.error({ err, traceId, prismaCode: code }, 'prisma error');
    res.status(500).json({
      error: {
        code: `DB_${code}`,
        message: err.message.split('\n')[0] ?? 'Database error',
        traceId,
      },
    });
    return;
  }

  // Bubble up the runtime error message (single line, no stack) so generic
  // 500s are diagnosable from the browser. Stack traces still only land in
  // the server logs, where the operator can pull them via Render UI.
  const message =
    err instanceof Error
      ? (err.message.split('\n')[0] ?? 'Internal server error')
      : 'Internal server error';
  logger.error({ err, traceId }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message, traceId },
  });
}

function randomTraceId(): string {
  return 'req-' + Math.random().toString(36).slice(2, 10);
}
