// Canonical tenant resolver — the single source of truth for "which tenant
// is this request implicitly about?" when the request itself doesn't carry
// a tenantId (admin sentinel session, public storefront enquiry, etc).
//
// Why centralised: previously the public website routes resolved via
// `createdAt: 'asc'` (oldest tenant) while the admin sentinel resolved via
// `ownerEmail = owner@goldos.dev` then `createdAt: 'desc'` (newest). With
// >1 tenant in the DB those return different ids — a storefront reservation
// would land on tenant A while the admin CRM reads from tenant B and the
// merchant never sees the lead. One file, one resolver, one tenant.
//
// Resolution order:
//   1. The seed/demo tenant by ownerEmail (always wins if present).
//   2. The most recently created tenant.
// We re-validate the cache on every call; the seed script deletes & recreates
// the demo tenant, so a stale cache would point at a row that no longer
// exists and silently break tenant-scoped writes (foreign-key violation).

import { rawPrisma } from './prisma.js';

const SEED_OWNER_EMAIL = 'owner@goldos.dev';

let cached: string | null = null;

export async function resolveCanonicalTenantId(): Promise<string> {
  if (cached) {
    const stillExists = await rawPrisma.tenant.findUnique({
      where: { id: cached },
      select: { id: true },
    });
    if (stillExists) return cached;
    cached = null;
  }
  const seedTenant = await rawPrisma.tenant.findUnique({
    where: { ownerEmail: SEED_OWNER_EMAIL },
    select: { id: true },
  });
  const tenant =
    seedTenant ??
    (await rawPrisma.tenant.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }));
  if (!tenant) {
    throw new Error('No tenant configured. Run `npm run db:seed`.');
  }
  cached = tenant.id;
  return tenant.id;
}

/** Test-only — clear the cache so unit tests don't leak state. */
export function _resetCanonicalTenantCache(): void {
  cached = null;
}
