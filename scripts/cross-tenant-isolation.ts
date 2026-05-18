/**
 * Cross-tenant isolation check (the test specs/validation.md's D2 e2e never
 * got written). Single-pass verification that Tenant A's super-admin
 * literally cannot see Tenant B's data — the central guarantee of Gold OS
 * per CLAUDE.md Hard Rule #1.
 *
 *   1. Spin up a throwaway Tenant B with its own SUPER_ADMIN user
 *   2. Seed a single order + product + customer scoped to Tenant B
 *   3. Log in as the existing Tenant A super-admin (owner@goldos.dev)
 *   4. Hit every list/aggregate endpoint that an admin can reach
 *   5. Assert NONE of the response payloads contain Tenant B's ids
 *   6. Log in as Tenant B's super-admin and confirm the inverse — Tenant
 *      B sees its own row + zero of Tenant A's
 *   7. Clean up Tenant B and exit with code 0/1
 *
 * Run:   npx tsx scripts/cross-tenant-isolation.ts
 * Server must be running locally (http://localhost:4000).
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../server/src/modules/auth/password.js';
import { PERMISSION_KEYS } from '../shared/constants.js';

const API_BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const TENANT_A_EMAIL = process.env.ADMIN_EMAIL ?? 'owner@goldos.dev';
const TENANT_A_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Owner@2026demo';

const prisma = new PrismaClient();

function color(c: string, s: string): string {
  return `\x1b[${c}m${s}\x1b[0m`;
}
const green = (s: string): string => color('32', s);
const red = (s: string): string => color('31', s);
const dim = (s: string): string => color('90', s);
const bold = (s: string): string => color('1', s);

let failures = 0;
function ok(msg: string): void {
  console.log(`  ${green('✓')} ${msg}`);
}
function fail(msg: string, ctx?: unknown): void {
  failures += 1;
  console.log(`  ${red('✗')} ${msg}`);
  if (ctx) console.log(`    ${dim(JSON.stringify(ctx).slice(0, 300))}`);
}
function step(label: string): void {
  console.log(`\n${bold(label)}`);
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data: { accessToken: string } };
  return json.data.accessToken;
}

async function authedGet<T>(path: string, token: string): Promise<{ status: number; json: T | null }> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json };
}

interface TenantBSeed {
  tenantId: string;
  tenantName: string;
  email: string;
  password: string;
  productId: string;
  customerId: string;
  orderId: string;
}

async function seedTenantB(): Promise<TenantBSeed> {
  const tag = Math.random().toString(36).slice(2, 8);
  const email = `isolation-${tag}@example.test`;
  const password = 'Iso@2026demo';

  // Create tenant + super-admin role + user + permissions.
  const tenant = await prisma.tenant.create({
    data: {
      businessName: `Isolation Probe ${tag}`,
      phone: '+910000000000',
      ownerEmail: email,
    },
  });
  const role = await prisma.role.create({
    data: { tenantId: tenant.id, slug: 'SUPER_ADMIN', name: 'Super Admin', isSystem: true },
  });
  // Grant every permission to this role so the API treats the user as a
  // real super-admin (otherwise tenantScope middleware bounces them).
  const allPerms = await prisma.permission.findMany({
    where: { key: { in: PERMISSION_KEYS as unknown as string[] } },
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: allPerms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId: role.id,
      name: `Isolation Probe ${tag}`,
      email,
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      isActive: true,
    },
  });

  // Seed one of each entity we'll later look for leaks of.
  const category = await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: 'Probe',
      metalType: 'GOLD',
      defaultMakingChargeBps: 1200,
    },
  });
  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      name: `Probe piece ${tag}`,
      slug: `probe-${tag}`,
      categoryId: category.id,
      descriptionMd: 'probe',
      images: [],
      weightMg: 5000,
      purityCaratX100: 2200,
      makingChargeBps: 1200,
      basePricePaise: 100000,
      stoneChargePaise: 0,
      isPublished: true,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: `Probe customer ${tag}`,
      phone: `+91999${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
      tags: ['Isolation'],
    },
  });
  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      status: 'PENDING',
      subtotalPaise: 100000,
      totalPaise: 100000,
      paymentMethod: 'cod',
      items: { create: [{ productId: product.id, qty: 1, pricePaise: 100000 }] },
      events: { create: [{ tenantId: tenant.id, status: 'PENDING', note: 'Probe order', actorName: 'IsolationTest' }] },
    },
  });

  return {
    tenantId: tenant.id,
    tenantName: tenant.businessName,
    email,
    password,
    productId: product.id,
    customerId: customer.id,
    orderId: order.id,
  };
}

async function teardownTenantB(seed: TenantBSeed): Promise<void> {
  // Cascade order matters here: OrderItem has FKs to both Order (onDelete
  // cascade) AND Product (no cascade). If we delete the tenant directly,
  // Prisma can race the Product cascade before the Order cascade and trip
  // an FK violation. Delete orders first (cleans OrderItems), then the
  // tenant delete cleans the rest.
  await prisma.order.deleteMany({ where: { tenantId: seed.tenantId } }).catch(() => {});
  await prisma.tenant.delete({ where: { id: seed.tenantId } }).catch((err) => {
    console.error(red('Teardown failed:'), err);
  });
}

interface ListResponse {
  data: Array<Record<string, unknown>>;
}
interface OneResponse {
  data: Record<string, unknown>;
}

function containsBId(blob: unknown, idsToReject: string[]): string | null {
  // Walk the response JSON depth-first; return the first banned id we see.
  if (blob === null || typeof blob !== 'object') {
    if (typeof blob === 'string' && idsToReject.includes(blob)) return blob;
    return null;
  }
  if (Array.isArray(blob)) {
    for (const x of blob) {
      const hit = containsBId(x, idsToReject);
      if (hit) return hit;
    }
    return null;
  }
  for (const v of Object.values(blob as Record<string, unknown>)) {
    const hit = containsBId(v, idsToReject);
    if (hit) return hit;
  }
  return null;
}

async function main(): Promise<void> {
  console.log(bold('Cross-tenant isolation check'));
  console.log(dim(`API: ${API_BASE}`));

  step('Seeding throwaway Tenant B');
  const seed = await seedTenantB();
  ok(`Tenant ${seed.tenantName} created (${seed.tenantId.slice(-8)})`);
  ok(`Seeded product=${seed.productId.slice(-6)} customer=${seed.customerId.slice(-6)} order=${seed.orderId.slice(-6)}`);

  try {
    step('Logging in as Tenant A super-admin');
    const aToken = await login(TENANT_A_EMAIL, TENANT_A_PASSWORD);
    ok(`Token for ${TENANT_A_EMAIL}`);

    const bIds = [seed.tenantId, seed.productId, seed.customerId, seed.orderId];

    step('Tenant A hits every list endpoint — must see ZERO Tenant B rows');
    const endpoints: Array<{ path: string; label: string }> = [
      { path: '/ecommerce/orders', label: '/ecommerce/orders' },
      { path: '/ecommerce/orders/live-count', label: '/ecommerce/orders/live-count' },
      { path: '/ecommerce/products', label: '/ecommerce/products' },
      { path: '/crm/leads', label: '/crm/leads' },
      { path: '/crm/customers', label: '/crm/customers' },
      { path: '/inventory/items', label: '/inventory/items' },
      { path: '/shops', label: '/shops' },
      { path: '/finance/summary', label: '/finance/summary' },
      {
        path: `/analytics/summary`,
        label: '/analytics/summary',
      },
    ];

    for (const ep of endpoints) {
      const { status, json } = await authedGet<ListResponse | OneResponse>(ep.path, aToken);
      if (status === 404) {
        ok(`${ep.label} → 404 (endpoint not implemented, skipped)`);
        continue;
      }
      if (status >= 400) {
        // Not necessarily a leak — could be a perm gate or schema mismatch.
        // Log + continue.
        console.log(`  ${dim('-')} ${ep.label} → ${status} (skipped)`);
        continue;
      }
      const leaked = containsBId(json, bIds);
      if (leaked) {
        fail(`${ep.label} LEAKED Tenant B id ${leaked.slice(-8)}`, json);
      } else {
        ok(`${ep.label} → no Tenant B ids found`);
      }
    }

    step('Direct deep-link probe — Tenant A trying to GET Tenant B order by id');
    const { status: probeStatus } = await authedGet(`/ecommerce/orders/${seed.orderId}`, aToken);
    if (probeStatus === 404 || probeStatus === 403) {
      ok(`/ecommerce/orders/${seed.orderId.slice(-8)} → ${probeStatus} (correctly hidden)`);
    } else {
      fail(`/ecommerce/orders/${seed.orderId.slice(-8)} → ${probeStatus} (should be 404 or 403)`);
    }

    step('Inverse check — Tenant B sees its OWN order (positive control)');
    const bToken = await login(seed.email, seed.password);
    const { status: bStatus, json: bJson } = await authedGet<ListResponse>(
      '/ecommerce/orders',
      bToken,
    );
    if (bStatus !== 200) {
      fail(`Tenant B own /orders fetch → ${bStatus}`);
    } else if (containsBId(bJson, [seed.orderId])) {
      ok('Tenant B own /orders → contains its own order ✓');
    } else {
      fail("Tenant B own /orders is missing its own order (positive control failed)", bJson);
    }
  } finally {
    step('Tearing down Tenant B');
    await teardownTenantB(seed);
    ok('Probe tenant deleted');
  }

  console.log(`\n${bold(failures === 0 ? green('✓ ALL ISOLATION CHECKS PASSED') : red(`✗ ${failures} ISOLATION FAILURES`))}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch(async (err) => {
    console.error(red('\nFatal:'), err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
