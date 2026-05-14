// server/src/lib/logger.ts — pino with PII redaction. No phone/GST/address/name in logs.

import pino from 'pino';
import { env } from '../env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.phone',
      'req.body.password',
      'req.body.code',
      'req.body.gstNumber',
      'req.body.address',
      'req.body.name',
      'req.body.email',
      'res.headers["set-cookie"]',
      '*.phone',
      '*.gstNumber',
      '*.address',
      '*.ownerEmail',
    ],
    censor: '[redacted]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

/** Best-effort PII redact for ad-hoc string logging. */
export function redact(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\+91[6-9]\d{9}/g, '+91XXXXXXXXXX')
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d Z[A-Z\d]\b/g, 'XXGSTINXXXXXXXX');
}
