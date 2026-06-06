# Cloudinary Image Migration Guide

This guide explains how to migrate all local images in the CMS to Cloudinary.

## Overview

The migration utility automatically finds all image URLs that are:
- **Data URLs** (embedded base64, e.g., `data:image/jpeg;base64,...`)
- **Local file paths** (not starting with http/https)

And uploads them to Cloudinary, replacing the URLs in the StorefrontContent database.

## What Gets Migrated

All image fields in the storefront content:
- Brand: logo, favicon, OG share image
- Hero: hero image, hero video source
- Story: story image
- Shop by occasion: tile images
- Browse categories: category tile images
- Reels: poster images
- Deals: product images
- Door cards: card images
- Store locations: location images

## Prerequisites

1. **Cloudinary configured** - Ensure `CLOUDINARY_URL` is set in `.env.server`:
   ```
   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
   ```

2. **Database access** - The server must have access to PostgreSQL to read/write StorefrontContent

## Migration Methods

### Method 1: CLI Command (Recommended for one-time bulk migration)

Run from the server directory:

```bash
# Migrate all tenants
npx ts-node src/scripts/migrate-cloudinary-images.ts

# Migrate specific tenant
npx ts-node src/scripts/migrate-cloudinary-images.ts <tenant-id>
```

**Output Example:**
```
Starting image migration to Cloudinary...

=== Migrating images for tenant: Zehlora (cly7x8q....) ===
Uploading brand.logo...
✓ brand.logo: migrated
Uploading hero.image...
✓ hero.image: migrated
Uploading shopByOccasion[0].img...
✓ shopByOccasion[0].img: migrated
...

=== Migration Summary ===
✓ Successful: 24
⊘ Skipped: 8
✗ Failed: 0
```

### Method 2: REST API (Via Admin Endpoint)

Send a POST request to the admin:

```bash
curl -X POST http://localhost:4000/api/v1/website/migrate-images-to-cloudinary \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"tenant": "<tenant-id>"}'
```

**Response:**
```json
{
  "data": {
    "message": "Image migration completed",
    "success": 24,
    "skipped": 8,
    "failed": 0,
    "errors": []
  }
}
```

### Method 3: Programmatic (In Node.js code)

```typescript
import { migrateStorefrontImagesToCloudinary } from './src/lib/migrate-images-cloudinary.js';

const result = await migrateStorefrontImagesToCloudinary(tenantId);
console.log(`Migrated ${result.success} images, ${result.failed} failed`);
```

## What Happens During Migration

For each local image:
1. ✅ Read the data URL or local path from the database
2. ✅ Convert base64 data to a buffer (if data URL)
3. ✅ Upload to Cloudinary (`zelora/migrations` folder)
4. ✅ Replace the original URL with the Cloudinary secure_url
5. ✅ Update the StorefrontContent in the database
6. ✅ Increment the `version` counter

## Error Handling

If an image fails to upload:
- The error is logged and reported
- The original URL is **NOT** changed
- Migration continues for other images
- Check server logs for detailed error messages

Common issues:
- **Cloudinary not configured** - Set `CLOUDINARY_URL` in `.env.server`
- **Network timeout** - Retry the migration
- **Large file size** - The script enforces a 2 MB limit per image

## Verifying the Migration

### Check Database
```sql
SELECT tenantId, content FROM "StorefrontContent" LIMIT 1;
```

Look for `res.cloudinary.com` URLs (Cloudinary URLs) instead of `data:` or local paths.

### Check Cloudinary Dashboard
1. Log in to [Cloudinary Dashboard](https://cloudinary.com/console)
2. Navigate to **Media Library**
3. Go to the `zelora/migrations` folder
4. Verify uploaded images appear there

## Rollback (if needed)

If you need to revert to original URLs:
1. Restore the database from a backup (before migration)
2. Or manually update StorefrontContent with original URLs

**There is no automated rollback** - plan your migration carefully.

## Performance Notes

- **Typical time**: ~500ms per image (depends on file size + network)
- **Rate limit**: No strict limits, but Cloudinary may throttle at 100+ uploads/min
- **Database**: Migration is transactional - all or nothing per tenant

## FAQ

**Q: Will this affect the live storefront?**
A: No. Migration updates happen after upload completes. There's a brief moment where the database is updated, but the storefront uses cached content.

**Q: Can I migrate specific image types only?**
A: Currently, the utility migrates all local images. Selective migration would require code changes.

**Q: What if an image upload fails halfway?**
A: Failed images retain their original URLs. Rerun the migration to retry them.

**Q: Can I use this on production?**
A: Yes, but test on staging first. The migration is safe and non-destructive (original URLs are preserved on failure).

## Support

If migration fails:
1. Check Cloudinary is configured: `CLOUDINARY_URL` in `.env.server`
2. Verify database connectivity
3. Check server logs for detailed error messages
4. Ensure images are valid base64 (for data URLs)
