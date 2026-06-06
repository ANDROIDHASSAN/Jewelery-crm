// CLI script to migrate all storefront images to Cloudinary.
// Run with: npx ts-node src/scripts/migrate-cloudinary-images.ts [tenantId]

import { migrateStorefrontImagesToCloudinary } from '../lib/migrate-images-cloudinary.js';

async function main() {
  const tenantId = process.argv[2]; // Optional tenant ID filter

  try {
    console.log('Starting image migration to Cloudinary...\n');
    const result = await migrateStorefrontImagesToCloudinary(tenantId);

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
