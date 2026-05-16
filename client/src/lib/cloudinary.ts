// Cloudinary unsigned upload helper.
//
// Why unsigned (not signed): we want cashiers + storefront editors to upload
// product images from the browser without round-tripping a signed-upload
// request through our own server first. Cloudinary's unsigned-preset model
// is the right shape — create a preset in Cloudinary with `Unsigned` mode +
// `Auto` folder + a transformation that resizes / compresses on the fly,
// and reference it here.
//
// Setup (one-time, per project):
//   1. Cloudinary dashboard → Settings → Upload → Add upload preset
//        - Signing mode: Unsigned
//        - Folder: zelora/products (recommended — namespaces this app's
//          uploads so you can lifecycle-manage them later)
//        - Allowed formats: jpg, jpeg, png, webp
//        - Transformations: w_1200,c_limit,q_auto,f_auto (capped + optimised)
//   2. Copy the preset name + your cloud name into client/.env:
//        VITE_CLOUDINARY_CLOUD_NAME=zelora
//        VITE_CLOUDINARY_UPLOAD_PRESET=zelora_unsigned
//
// At runtime: callers do
//   const url = await uploadImageToCloudinary(file)
// and store the returned URL on the entity (Item.images, Product.images, etc.).

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export async function uploadImageToCloudinary(
  file: File,
  opts: { folder?: string; onProgress?: (pct: number) => void } = {},
): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in client/.env.',
    );
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image must be under 8 MB');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  if (opts.folder) form.append('folder', opts.folder);

  // We use XHR (not fetch) only to get progress events for the upload spinner.
  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.upload.onprogress = (e): void => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
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
