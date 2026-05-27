// Cloudinary upload helper.
//
// Three upload paths, tried in priority order so a deployment "just works"
// once any one of them is wired:
//
//   1. SIGNED (preferred — production):
//        Server holds CLOUDINARY_URL and signs each upload via
//        POST /api/v1/uploads/cloudinary-sign. Browser then POSTs the file
//        directly to Cloudinary with the returned signature — no image
//        bytes touch our API server. Zero dashboard setup required from
//        the merchant; the single env var is enough.
//
//   2. UNSIGNED-PRESET (legacy / unauthenticated callers):
//        VITE_CLOUDINARY_CLOUD_NAME + VITE_CLOUDINARY_UPLOAD_PRESET set in
//        client/.env. Used when /uploads/cloudinary-sign returns 503 or the
//        caller is on the public storefront (where no auth header exists).
//
//   3. BASE64 DATA URL (dev fallback):
//        Nothing configured. We embed the image inline so the UI still
//        works. Not for prod — bloats the DB.
//
// At runtime: callers do
//   const result = await uploadImageToCloudinary(file)
// and store result.secureUrl on the entity (Item.images, Product.images, etc.).

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

// One-shot per session: once we discover the server doesn't sign uploads we
// stop trying so every subsequent upload falls straight to the unsigned/dev
// path without paying a wasted round-trip.
let signedPathDisabled = false;

interface SignedPayload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

// Reads the access token the same way RTK Query does (auth slice → Redux
// state). Done lazily via a function ref the store registers at boot so
// this module avoids importing the store directly (which would create a
// load-order cycle).
let readAccessToken: () => string | null = () => null;
export function registerCloudinaryAuthSource(fn: () => string | null): void {
  readAccessToken = fn;
}

async function fetchSignedPayload(folder: string): Promise<SignedPayload | null> {
  if (signedPathDisabled) return null;
  const token = readAccessToken();
  if (!token) return null; // public/unauth caller — skip signed path
  try {
    const res = await fetch('/api/v1/uploads/cloudinary-sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify({ folder }),
    });
    if (res.status === 503) {
      // Server not configured — remember and stop retrying for this session.
      signedPathDisabled = true;
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as { data: SignedPayload };
    return json.data;
  } catch {
    return null;
  }
}

export function isCloudinaryConfigured(): boolean {
  // True if either the unsigned-preset env is set OR the server signs
  // uploads. We can't synchronously know the latter, so callers that want
  // the "is configured?" check before showing the upload UI default to
  // showing it — uploads still degrade to base64 in the worst case.
  return Boolean(CLOUD_NAME && UPLOAD_PRESET) || !signedPathDisabled;
}

// Read a File as a base64 data URL so we can embed it directly into an
// entity's images[] when Cloudinary isn't configured. This is the dev
// fallback path — fine for small catalogs, not recommended for prod (data
// URLs bloat the DB row + every storefront response).
function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.onerror = (): void => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

// Posts a FormData to Cloudinary's upload endpoint, wired to onProgress.
// Used by both the signed and unsigned paths — only the FormData contents
// and the cloud name differ between them.
function postToCloudinary(
  cloudName: string,
  form: FormData,
  onProgress?: (pct: number) => void,
): Promise<CloudinaryUploadResult> {
  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
    xhr.upload.onprogress = (e): void => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = (): void => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) {
          const err = JSON.parse(xhr.responseText || '{}') as { error?: { message?: string } };
          reject(new Error(err.error?.message ?? `Cloudinary upload failed (${xhr.status})`));
          return;
        }
        const json = JSON.parse(xhr.responseText) as {
          secure_url: string;
          public_id: string;
          width: number;
          height: number;
          bytes: number;
          format: string;
        };
        resolve({
          secureUrl: json.secure_url,
          publicId: json.public_id,
          width: json.width,
          height: json.height,
          bytes: json.bytes,
          format: json.format,
        });
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = (): void => reject(new Error('Network error uploading to Cloudinary'));
    xhr.send(form);
  });
}

export async function uploadImageToCloudinary(
  file: File,
  opts: { folder?: string; onProgress?: (pct: number) => void } = {},
): Promise<CloudinaryUploadResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image must be under 8 MB');
  }
  const folder = opts.folder ?? 'zelora/uploads';

  // 1. Signed path — preferred. Server has CLOUDINARY_URL; we ask it for a
  //    one-shot signature, then POST the file straight to Cloudinary.
  const signed = await fetchSignedPayload(folder);
  if (signed) {
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signed.apiKey);
    form.append('timestamp', String(signed.timestamp));
    form.append('signature', signed.signature);
    form.append('folder', signed.folder);
    return postToCloudinary(signed.cloudName, form, opts.onProgress);
  }

  // 2. Unsigned preset — legacy / public storefront. Needs the merchant to
  //    have created an unsigned upload preset in the Cloudinary dashboard.
  if (CLOUD_NAME && UPLOAD_PRESET) {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', UPLOAD_PRESET);
    form.append('folder', folder);
    return postToCloudinary(CLOUD_NAME, form, opts.onProgress);
  }

  // 3. Dev fallback — base64 data URL. Bloats DB rows so we never want this
  //    in prod, but it keeps the upload widget functional without any setup.
  opts.onProgress?.(50);
  const dataUrl = await fileToDataUrl(file);
  opts.onProgress?.(100);
  return {
    secureUrl: dataUrl,
    publicId: `local/${file.name}`,
    width: 0,
    height: 0,
    bytes: file.size,
    format: file.type.replace('image/', ''),
  };
}

/**
 * Returns a Cloudinary URL with `f_auto,q_auto,w_<w>,c_limit` transform
 * appended. Drop-in for `<img src=…>` to serve the right size on the right
 * device + WebP where supported.
 *
 * If the URL is not a Cloudinary URL, it's returned unchanged so the
 * function is safe to call on storefront product URLs from Unsplash etc.
 */
export function cloudinaryThumb(url: string | null | undefined, width = 400): string | null {
  if (!url) return null;
  // Only transform our own Cloudinary URLs — leave 3rd-party CDNs alone.
  const marker = '/upload/';
  if (!url.includes('res.cloudinary.com') || !url.includes(marker)) return url;
  return url.replace(marker, `${marker}f_auto,q_auto,w_${width},c_limit/`);
}
