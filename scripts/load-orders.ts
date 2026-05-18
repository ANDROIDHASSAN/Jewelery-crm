/**
 * Load + stress test for the storefront checkout + tracking lookup path.
 *
 * Runs THREE phases against the local API:
 *
 *   1. WARMUP     — 5 sequential orders so the connection pool stabilises
 *                   and prisma can JIT the prepared statements.
 *   2. LOAD       — N concurrent orders (default 100). Measures p50/p95/p99
 *                   latency + throughput. Pass if p95 < 1500ms.
 *   3. STRESS     — Ramps concurrency until error rate > 5% OR p95 > 5s.
 *                   Reports the breaking point.
 *
 * Plus: every 10th order, hit /lookup to verify the read path also holds
 * up under write pressure (this is what the customer's polling does).
 *
 * Usage:   npx tsx scripts/load-orders.ts
 *          CONCURRENCY=200 npx tsx scripts/load-orders.ts
 *          STRESS=1 npx tsx scripts/load-orders.ts
 *
 * Pre-reqs:
 *   - Server running on http://localhost:4000 (or set API_BASE)
 *   - At least one published product exists
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 100);
const RUN_STRESS = process.env.STRESS === '1';

function color(c: string, s: string): string {
  return `\x1b[${c}m${s}\x1b[0m`;
}
const green = (s: string): string => color('32', s);
const red = (s: string): string => color('31', s);
const yellow = (s: string): string => color('33', s);
const dim = (s: string): string => color('90', s);
const bold = (s: string): string => color('1', s);

function fmtMs(n: number): string {
  return `${n.toFixed(0)}ms`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx]!;
}

interface RunResult {
  successful: number;
  failed: number;
  latencies: number[];
  errors: string[];
  totalMs: number;
}

async function runWave(
  productId: string,
  concurrency: number,
  testRunId: string,
): Promise<RunResult> {
  const start = Date.now();
  const latencies: number[] = [];
  const errors: string[] = [];
  let successful = 0;
  let failed = 0;

  const tasks: Array<Promise<void>> = [];
  for (let i = 0; i < concurrency; i++) {
    const t = (async () => {
      // Each request gets a unique phone so we don't pile every order onto
      // one customer (which would skew lookup latency tests).
      const phone = `+91${(8000000000 + Math.floor(Math.random() * 1e9)).toString().slice(0, 10)}`;
      const t0 = performance.now();
      try {
        const res = await fetch(`${API_BASE}/website/orders`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            customer: { name: `Load Buyer ${testRunId}-${i}`, phone },
            items: [{ productId, qty: 1 }],
            paymentMethod: 'cod',
          }),
        });
        const ms = performance.now() - t0;
        latencies.push(ms);
        if (res.status !== 201) {
          failed++;
          const text = await res.text().catch(() => '<no body>');
          errors.push(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        } else {
          successful++;
          // Every 10th: also exercise the lookup path so we know reads hold
          // up while writes are pounding the same tables.
          if (i % 10 === 0) {
            const { data } = await res.json();
            await fetch(
              `${API_BASE}/website/orders/lookup?id=${data.id.slice(-6)}&phone=${encodeURIComponent(phone)}`,
            ).catch(() => null);
          }
        }
      } catch (err) {
        const ms = performance.now() - t0;
        latencies.push(ms);
        failed++;
        errors.push(`Network: ${(err as Error).message}`);
      }
    })();
    tasks.push(t);
  }
  await Promise.all(tasks);
  return { successful, failed, latencies, errors, totalMs: Date.now() - start };
}

function report(result: RunResult, label: string): void {
  const sorted = [...result.latencies].sort((a, b) => a - b);
  const p50 = quantile(sorted, 0.5);
  const p95 = quantile(sorted, 0.95);
  const p99 = quantile(sorted, 0.99);
  const max = sorted.at(-1) ?? 0;
  const min = sorted[0] ?? 0;
  const avg = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
  const total = result.successful + result.failed;
  const throughput = total / (result.totalMs / 1000);
  const errRate = (result.failed / Math.max(1, total)) * 100;

  console.log(`\n${bold(label)}`);
  console.log(`  ${dim('orders')}        ${total} (${green(`${result.successful} ok`)}, ${result.failed > 0 ? red(`${result.failed} fail`) : '0 fail'})`);
  console.log(`  ${dim('duration')}      ${(result.totalMs / 1000).toFixed(2)}s`);
  console.log(`  ${dim('throughput')}    ${throughput.toFixed(1)} req/s`);
  console.log(`  ${dim('error rate')}    ${errRate.toFixed(1)}%`);
  console.log(`  ${dim('latency min')}   ${fmtMs(min)}`);
  console.log(`  ${dim('latency avg')}   ${fmtMs(avg)}`);
  console.log(`  ${dim('latency p50')}   ${fmtMs(p50)}`);
  console.log(`  ${dim('latency p95')}   ${fmtMs(p95)} ${p95 > 1500 ? yellow('(>1.5s)') : ''}`);
  console.log(`  ${dim('latency p99')}   ${fmtMs(p99)}`);
  console.log(`  ${dim('latency max')}   ${fmtMs(max)}`);
  if (result.errors.length > 0) {
    console.log(`  ${dim('sample error')} ${result.errors[0]}`);
  }
}

async function main(): Promise<void> {
  console.log(bold('Load + stress test — Zelora order tracking'));
  console.log(dim(`API: ${API_BASE}`));

  // Resolve a product
  const res = await fetch(`${API_BASE}/website/products`);
  if (!res.ok) {
    console.error(red('Failed to fetch products'), res.status);
    process.exit(1);
  }
  const { data: products } = await res.json();
  if (!products || products.length === 0) {
    console.error(red('No published products. Seed the catalog first.'));
    process.exit(1);
  }
  const productId = products[0].id as string;
  console.log(dim(`Using product: ${products[0].name}`));

  // 1. Warmup
  const runId = Math.random().toString(36).slice(2, 6);
  console.log(`\n${bold('Phase 1: Warmup')} ${dim('(5 sequential)')}`);
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await runWave(productId, 1, `warm-${runId}-${i}`);
    process.stdout.write(`.${fmtMs(performance.now() - t0)} `);
  }
  console.log();

  // 2. Load
  console.log(`\n${bold('Phase 2: Load')} ${dim(`(${CONCURRENCY} concurrent)`)}`);
  const loadResult = await runWave(productId, CONCURRENCY, `load-${runId}`);
  report(loadResult, `Load · ${CONCURRENCY} concurrent`);
  const loadSorted = [...loadResult.latencies].sort((a, b) => a - b);
  const loadP95 = quantile(loadSorted, 0.95);
  const loadErrRate = (loadResult.failed / Math.max(1, loadResult.failed + loadResult.successful)) * 100;
  const loadPass = loadErrRate < 1 && loadP95 < 1500;
  console.log(
    `\n  ${loadPass ? green('✓ LOAD PASS') : yellow('⚠ LOAD WARN')} ${dim(`(target: p95 < 1500ms, err < 1%)`)}`,
  );

  // 3. Optional stress ramp
  if (RUN_STRESS) {
    console.log(`\n${bold('Phase 3: Stress ramp')} ${dim('(doubling concurrency until break)')}`);
    let conc = CONCURRENCY;
    let breakingPoint: number | null = null;
    while (conc <= 1600 && !breakingPoint) {
      const r = await runWave(productId, conc, `stress-${runId}-${conc}`);
      const sorted = [...r.latencies].sort((a, b) => a - b);
      const p95 = quantile(sorted, 0.95);
      const errRate = (r.failed / Math.max(1, r.failed + r.successful)) * 100;
      console.log(
        `  conc=${String(conc).padStart(4)} → p95 ${fmtMs(p95).padStart(7)}, err ${errRate.toFixed(1)}%, throughput ${(((r.successful + r.failed) / r.totalMs) * 1000).toFixed(1)}/s`,
      );
      if (errRate > 5 || p95 > 5000) {
        breakingPoint = conc;
        report(r, `Stress · ${conc} concurrent (breaking point)`);
      }
      conc *= 2;
    }
    if (!breakingPoint) {
      console.log(green('  Did not break up to 1600 concurrent. Server is solid 🎉'));
    } else {
      console.log(yellow(`\n  ⚠ Breaking point: ${breakingPoint} concurrent`));
    }
  } else {
    console.log(dim('\nSkip stress ramp. Run with STRESS=1 to find the breaking point.'));
  }
}

main().catch((err) => {
  console.error(red('\nFatal:'), err);
  process.exit(1);
});
