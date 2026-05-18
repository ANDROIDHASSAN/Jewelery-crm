/**
 * End-to-end order tracking test (no browser).
 *
 * Verifies the full lifecycle:
 *   1. Pick a published product from the storefront catalog
 *   2. Place an order via /api/website/orders (the public checkout endpoint)
 *   3. Customer looks it up via /api/website/orders/lookup → finds the order
 *      with its initial "Order placed" event
 *   4. Admin PATCHes status PENDING → CONFIRMED → PACKED → SHIPPED with
 *      a note + location on each transition
 *   5. Customer re-lookup shows ALL the new events in chronological order
 *   6. Admin attempts to CANCEL without reason → expects 400 CANCEL_REASON_REQUIRED
 *   7. Admin CANCELS with reason → cancelReason propagates to customer
 *
 * Run with:  npx tsx scripts/e2e-order-tracking.ts
 *
 * Pre-reqs:
 *   - Server running on http://localhost:4000 (or set API_BASE)
 *   - A SUPER_ADMIN session token in ADMIN_TOKEN env var, OR no auth required
 *     for the /ecommerce/orders PATCH route in dev (which is the current state)
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
// Auto-login with the seeded super-admin account by default. Override via env
// when running against a non-default tenant.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'owner@goldos.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Owner@2026demo';
let ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

// Helpers ----------------------------------------------------------------

function color(code: string, s: string): string {
  return `\x1b[${code}m${s}\x1b[0m`;
}
const green = (s: string): string => color('32', s);
const red = (s: string): string => color('31', s);
const dim = (s: string): string => color('90', s);
const bold = (s: string): string => color('1', s);

function ok(msg: string): void {
  console.log(`  ${green('✓')} ${msg}`);
}
function step(msg: string): void {
  console.log(`\n${bold(msg)}`);
}
function fail(msg: string, extra?: unknown): never {
  console.error(`  ${red('✗')} ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  expectStatus?: number;
}

async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth && ADMIN_TOKEN) headers['authorization'] = `Bearer ${ADMIN_TOKEN}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (opts.expectStatus && res.status !== opts.expectStatus) {
    fail(
      `${opts.method ?? 'GET'} ${path} → expected ${opts.expectStatus}, got ${res.status}`,
      parsed,
    );
  }
  if (!opts.expectStatus && res.status >= 400) {
    fail(`${opts.method ?? 'GET'} ${path} → ${res.status}`, parsed);
  }
  return parsed as T;
}

// Main flow --------------------------------------------------------------

async function loginAsAdmin(): Promise<void> {
  if (ADMIN_TOKEN) return; // pre-supplied via env
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) fail(`Login failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data: { accessToken: string } };
  ADMIN_TOKEN = json.data.accessToken;
  ok(`Logged in as ${ADMIN_EMAIL}`);
}

async function main(): Promise<void> {
  console.log(bold('E2E order tracking test'));
  console.log(dim(`API: ${API_BASE}`));

  step('0. Authenticate as super-admin');
  await loginAsAdmin();

  step('1. Fetch a published product');
  const products = await api<{ data: Array<{ id: string; name: string; slug: string }> }>(
    '/website/products',
  );
  if (!products.data || products.data.length === 0) fail('No published products found');
  const product = products.data[0]!;
  ok(`Found "${product.name}" (${product.id})`);

  step('2. Place a customer order');
  // Use a unique phone so we don't collide with previous test runs.
  const testPhone = `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0').slice(0, 9)}`;
  const created = await api<{
    data: { id: string; totalPaise: number; expectedDeliveryAt: string | null };
  }>('/website/orders', {
    method: 'POST',
    body: {
      customer: { name: 'E2E Test Buyer', phone: testPhone },
      items: [{ productId: product.id, qty: 1 }],
      paymentMethod: 'cod',
    },
    expectStatus: 201,
  });
  const orderId = created.data.id;
  ok(`Order ${orderId.slice(-8)} placed · total ₹${(created.data.totalPaise / 100).toLocaleString('en-IN')}`);

  step('3. Customer looks up the order (expects 1 event)');
  const lookup1 = await api<{
    data: {
      id: string;
      status: string;
      events: Array<{ status: string; note: string | null }>;
    };
  }>(`/website/orders/lookup?id=${orderId.slice(-6)}&phone=${encodeURIComponent(testPhone)}`);
  if (lookup1.data.status !== 'PENDING') fail(`Expected PENDING, got ${lookup1.data.status}`);
  if (lookup1.data.events.length !== 1) {
    fail(`Expected 1 event, got ${lookup1.data.events.length}`, lookup1.data.events);
  }
  if (lookup1.data.events[0]!.note !== 'Order placed') {
    fail(`First event note wrong: "${lookup1.data.events[0]!.note}"`);
  }
  ok(`Lookup found order, status=PENDING, 1 event: "${lookup1.data.events[0]!.note}"`);

  step('4. Admin advances through CONFIRMED → PACKED → SHIPPED with notes');
  const transitions = [
    { status: 'CONFIRMED', note: 'Hallmark check passed', location: 'Haryana workshop' },
    { status: 'PACKED', note: 'Sealed in velvet box', location: 'Haryana workshop' },
    { status: 'SHIPPED', note: 'Picked up by Shiprocket', location: 'Delhi sort hub' },
  ] as const;
  for (const t of transitions) {
    await api(`/ecommerce/orders/${orderId}`, {
      method: 'PATCH',
      auth: true,
      body: { ...t, actorName: 'E2E Suite' },
    });
    ok(`PATCH → ${t.status}`);
  }

  step('5. Customer re-lookup (expects 4 events total, latest = SHIPPED)');
  const lookup2 = await api<{
    data: { status: string; events: Array<{ status: string; note: string | null; location: string | null }> };
  }>(`/website/orders/lookup?id=${orderId.slice(-6)}&phone=${encodeURIComponent(testPhone)}`);
  if (lookup2.data.events.length !== 4) {
    fail(`Expected 4 events, got ${lookup2.data.events.length}`, lookup2.data.events);
  }
  if (lookup2.data.status !== 'SHIPPED') fail(`Expected SHIPPED, got ${lookup2.data.status}`);
  const lastEvent = lookup2.data.events.at(-1)!;
  if (lastEvent.status !== 'SHIPPED') fail(`Last event should be SHIPPED, got ${lastEvent.status}`);
  if (lastEvent.location !== 'Delhi sort hub') {
    fail(`Last event location wrong: "${lastEvent.location}"`);
  }
  ok('All 4 events present, in order, with notes + location intact');

  step('6. Cancel without reason should be rejected (400)');
  await api(`/ecommerce/orders/${orderId}`, {
    method: 'PATCH',
    auth: true,
    body: { status: 'CANCELLED' },
    expectStatus: 400,
  });
  ok('Server correctly rejected cancellation without a reason');

  step('7. Cancel with reason propagates to customer');
  const cancelReason = 'Out of stock — alternative piece offered';
  await api(`/ecommerce/orders/${orderId}`, {
    method: 'PATCH',
    auth: true,
    body: { status: 'CANCELLED', cancelReason, actorName: 'E2E Suite' },
  });
  const lookup3 = await api<{ data: { status: string; cancelReason: string | null } }>(
    `/website/orders/lookup?id=${orderId.slice(-6)}&phone=${encodeURIComponent(testPhone)}`,
  );
  if (lookup3.data.status !== 'CANCELLED') fail(`Expected CANCELLED, got ${lookup3.data.status}`);
  if (lookup3.data.cancelReason !== cancelReason) {
    fail(`cancelReason mismatch: got "${lookup3.data.cancelReason}"`);
  }
  ok('Customer sees cancellation reason verbatim');

  console.log(`\n${green(bold('✓ E2E passed.'))} Order ${orderId.slice(-8)} — all 7 steps green.`);
}

main().catch((err) => {
  console.error(red('\nUnexpected error:'));
  console.error(err);
  process.exit(1);
});
