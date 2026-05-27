// Cloudinary signed-upload helper.
//
// Why server-signed (not unsigned-preset): with just CLOUDINARY_URL the
// merchant is fully configured — no Cloudinary dashboard work required to
// create an "unsigned" upload preset. The server holds the API secret;
// each upload request gets a short-lived signature the browser uses to
// POST straight to Cloudinary (no image bytes touch our server).
//
// Format expected for CLOUDINARY_URL:
//   cloudinary://<api_key>:<api_secret>@<cloud_name>
//
// Signature recipe (Cloudinary spec):
//   sha1(<param1>=<val1>&<param2>=<val2>... + <api_secret>)
// where params are SORTED alphabetically and the api_secret is appended
// raw (no separator). For our use we sign only `folder` + `timestamp`.

import crypto from 'node:crypto';
import { env } from '../env.js';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

let cached: CloudinaryConfig | null = null;

function parseCloudinaryUrl(url: string): CloudinaryConfig | null {
  if (!url) return null;
  // cloudinary://<key>:<secret>@<cloud>
  const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!match) return null;
  return {
    apiKey: match[1]!,
    apiSecret: match[2]!,
    cloudName: match[3]!,
  };
}

function getConfig(): CloudinaryConfig | null {
  if (cached) return cached;
  cached = parseCloudinaryUrl(env.CLOUDINARY_URL);
  return cached;
}

export function isCloudinaryServerConfigured(): boolean {
  return getConfig() !== null;
}

export interface CloudinarySignedPayload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Returns a signed payload the client uses to POST a file to
 * https://api.cloudinary.com/v1_1/<cloudName>/image/upload directly. The
 * signature is valid for ~1 hour (Cloudinary default tolerance) but in
 * practice the client uploads within seconds of fetching it.
 *
 * Throws if CLOUDINARY_URL isn't set — the route layer should 503 in that
 * case so the client falls back to its dev/unsigned path.
 */
export function signCloudinaryUpload(folder: string): CloudinarySignedPayload {
  const config = getConfig();
  if (!config) {
    throw new Error('CLOUDINARY_URL not configured');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  // Cloudinary signature: sha1 over sorted "key=value" pairs joined by '&',
  // with the api_secret appended raw at the end.
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha1')
    .update(toSign + config.apiSecret)
    .digest('hex');
  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature,
    folder,
  };
}
