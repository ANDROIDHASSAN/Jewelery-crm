// Migration utility to upload all local images in storefront content to Cloudinary.
// Usage: Run this script via a CLI command or admin endpoint to migrate all data URLs
// and local file paths to Cloudinary URLs in the StorefrontContent.

import { rawPrisma } from './prisma.js';
import { signCloudinaryUpload, isCloudinaryServerConfigured } from './cloudinary.js';

interface ImageFieldPath {
  fieldName: string;
  path: string[]; // For nested objects, e.g., ['brand', 'logo']
}

// All image fields in StorefrontContent that need migration
const IMAGE_FIELDS: ImageFieldPath[] = [
  { fieldName: 'brand.logo', path: ['brand', 'logo'] },
  { fieldName: 'brand.favicon', path: ['brand', 'favicon'] },
  { fieldName: 'brand.ogImage', path: ['brand', 'ogImage'] },
  { fieldName: 'hero.image', path: ['hero', 'image'] },
  { fieldName: 'hero.videoSrc', path: ['hero', 'videoSrc'] },
  { fieldName: 'story.image', path: ['story', 'image'] },
  { fieldName: 'shopByOccasion[].img', path: ['shopByOccasion'] },
  { fieldName: 'browseCategories[].img', path: ['browseCategories'] },
  { fieldName: 'reels[].poster', path: ['reels'] },
  { fieldName: 'deals[].img', path: ['deals'] },
  { fieldName: 'doorCards[].img', path: ['doorCards'] },
  { fieldName: 'locations[].image', path: ['locations'] },
  { fieldName: 'testimonial.quote', path: ['testimonial', 'quote'] }, // text, not image
];

function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

function isLocalPath(url: string): boolean {
  return !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//') && url.length > 0;
}

function isLocalImage(url: string): boolean {
  return isDataUrl(url) || isLocalPath(url);
}

// Convert data URL to Buffer for upload
function dataUrlToBuffer(dataUrl: string): Buffer {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches || !matches[2]) {
    throw new Error('Invalid data URL format');
  }
  return Buffer.from(matches[2] as string, 'base64');
}

// Upload a single image to Cloudinary
async function uploadImageToCDN(imageUrl: string, folder = 'zelora/migrations'): Promise<string> {
  if (!isLocalImage(imageUrl)) {
    return imageUrl; // Already a CDN URL
  }

  try {
    if (!isDataUrl(imageUrl)) {
      // Local path — not supported
      throw new Error(`Cannot migrate local file path: ${imageUrl}. Please use data URLs.`);
    }

    // Convert data URL to Buffer
    const buffer = dataUrlToBuffer(imageUrl);

    // Create FormData for Cloudinary upload using native FormData
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob);

    // Get signed upload payload from server
    const signedPayload = signCloudinaryUpload(folder);
    formData.append('api_key', signedPayload.apiKey);
    formData.append('timestamp', String(signedPayload.timestamp));
    formData.append('signature', signedPayload.signature);
    formData.append('folder', signedPayload.folder);

    // Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signedPayload.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error(`Cloudinary upload failed: ${response.statusText}`);
    }

    const result = (await response.json()) as { secure_url?: string };
    if (!result.secure_url) {
      throw new Error('No secure_url in Cloudinary response');
    }
    return result.secure_url;
  } catch (err) {
    console.error(`Failed to upload image: ${err}`);
    throw err;
  }
}

// Get value from nested object using path
function getNestedValue(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

// Set value in nested object using path
function setNestedValue(obj: any, path: string[], value: any): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i] as string;
    if (current == null) return;
    if (current[key] == null) current[key] = {};
    current = current[key];
  }
  const lastKey = path[path.length - 1] as string;
  if (current != null) {
    current[lastKey] = value;
  }
}

// Main migration function
export async function migrateStorefrontImagesToCloudinary(tenantId?: string): Promise<{
  success: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  if (!isCloudinaryServerConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_URL in server env.');
  }

  const stats = { success: 0, skipped: 0, failed: 0, errors: [] as string[] };

  const tenants = tenantId
    ? await rawPrisma.tenant.findMany({ where: { id: tenantId } })
    : await rawPrisma.tenant.findMany();

  for (const tenant of tenants) {
    console.log(`\n=== Migrating images for tenant: ${tenant.businessName} (${tenant.id}) ===`);

    const storefront = await rawPrisma.storefrontContent.findUnique({
      where: { tenantId: tenant.id },
    });

    if (!storefront) {
      console.log(`No storefront content found for tenant ${tenant.id}`);
      continue;
    }

    const content = storefront.content as any;
    const updates: any = {};
    let hasChanges = false;

    // Process scalar image fields
    const scalarFields = [
      ['brand', 'logo'],
      ['brand', 'favicon'],
      ['brand', 'ogImage'],
      ['hero', 'image'],
      ['hero', 'videoSrc'],
      ['story', 'image'],
    ];

    for (const path of scalarFields) {
      const currentValue = getNestedValue(content, path);

      if (currentValue && isLocalImage(currentValue)) {
        try {
          console.log(`Uploading ${path.join('.')}...`);
          const newUrl = await uploadImageToCDN(currentValue);
          setNestedValue(updates, path, newUrl);
          hasChanges = true;
          stats.success++;
          console.log(`✓ ${path.join('.')}: migrated`);
        } catch (err) {
          const errMsg = `Failed to migrate ${path.join('.')}: ${err}`;
          console.error(errMsg);
          stats.errors.push(errMsg);
          stats.failed++;
        }
      } else if (!currentValue || !isLocalImage(currentValue)) {
        stats.skipped++;
      }
    }

    // Process array image fields (shopByOccasion, browseCategories, etc.)
    const arrayFields = [
      { key: 'shopByOccasion', imageKey: 'img' },
      { key: 'browseCategories', imageKey: 'img' },
      { key: 'reels', imageKey: 'poster' },
      { key: 'deals', imageKey: 'img' },
      { key: 'doorCards', imageKey: 'img' },
      { key: 'locations', imageKey: 'image' },
    ];

    for (const { key, imageKey } of arrayFields) {
      const items = content[key];
      if (!Array.isArray(items)) continue;

      const updatedItems = [];
      let arrayHasChanges = false;

      for (let i = 0; i < items.length; i++) {
        const item = { ...items[i] };
        const currentValue = item[imageKey];

        if (currentValue && isLocalImage(currentValue)) {
          try {
            console.log(`Uploading ${key}[${i}].${imageKey}...`);
            const newUrl = await uploadImageToCDN(currentValue);
            item[imageKey] = newUrl;
            arrayHasChanges = true;
            stats.success++;
            console.log(`✓ ${key}[${i}].${imageKey}: migrated`);
          } catch (err) {
            const errMsg = `Failed to migrate ${key}[${i}].${imageKey}: ${err}`;
            console.error(errMsg);
            stats.errors.push(errMsg);
            stats.failed++;
          }
        } else if (!currentValue || !isLocalImage(currentValue)) {
          stats.skipped++;
        }

        updatedItems.push(item);
      }

      if (arrayHasChanges) {
        updates[key] = updatedItems;
        hasChanges = true;
      }
    }

    // Save updated content if there are changes
    if (hasChanges) {
      const mergedContent = { ...content, ...updates };
      await rawPrisma.storefrontContent.update({
        where: { tenantId: tenant.id },
        data: { content: mergedContent, version: (storefront.version ?? 1) + 1 },
      });
      console.log(`✓ Tenant ${tenant.id}: storefront content updated`);
    } else {
      console.log(`No changes needed for tenant ${tenant.id}`);
    }
  }

  console.log(`\n=== Migration Summary ===`);
  console.log(`✓ Successful: ${stats.success}`);
  console.log(`⊘ Skipped: ${stats.skipped}`);
  console.log(`✗ Failed: ${stats.failed}`);
  if (stats.errors.length > 0) {
    console.log(`\nErrors:\n${stats.errors.join('\n')}`);
  }

  return stats;
}
