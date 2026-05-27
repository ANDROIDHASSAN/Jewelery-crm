// Uploads — small route group for asset upload helpers.
//
// Today: Cloudinary signed-upload endpoint. The browser fetches a signed
// payload from here, then POSTs the file directly to Cloudinary so we
// never proxy image bytes. The server holds the API secret (parsed once
// from CLOUDINARY_URL at boot); the browser only ever sees a short-lived
// signature + timestamp.

import { Router } from 'express';
import { z } from 'zod';
import {
  isCloudinaryServerConfigured,
  signCloudinaryUpload,
} from '../../lib/cloudinary.js';

export const uploadsRouter: Router = Router();

const SignRequest = z.object({
  // Folder namespace inside the Cloudinary bucket. Defaults to
  // "zelora/uploads" so callers that don't care still end up tidy.
  folder: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_\-\/]+$/, 'folder must be slug-safe')
    .optional(),
});

uploadsRouter.post('/cloudinary-sign', (req, res) => {
  if (!isCloudinaryServerConfigured()) {
    res.status(503).json({
      error: {
        code: 'CLOUDINARY_NOT_CONFIGURED',
        message: 'Set CLOUDINARY_URL in the server env to enable signed uploads.',
      },
    });
    return;
  }
  const body = SignRequest.parse(req.body ?? {});
  const folder = body.folder ?? 'zelora/uploads';
  const payload = signCloudinaryUpload(folder);
  res.json({ data: payload });
});
