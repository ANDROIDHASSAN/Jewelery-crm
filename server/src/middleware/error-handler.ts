// server/src/middleware/error-handler.ts — uniform error envelope per specs/api-design.md.
// Must accept 4 args to be recognized as Express error middleware.

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
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

  logger.error({ err, traceId }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error', traceId },
  });
}

function randomTraceId(): string {
  return 'req-' + Math.random().toString(36).slice(2, 10);
}
