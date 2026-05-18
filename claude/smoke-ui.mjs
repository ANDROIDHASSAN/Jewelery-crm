// Smoke-test critical UI flows. Run from repo root: `node claude/smoke-ui.mjs`
// Reports console errors, network failures, and obvious render breakages.

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const EMAIL = 'owner@goldos.dev';
const PASSWORD = 'Owner@2026demo';

const issues = [];

function record(scope, msg) {
  issues.push({ scope, msg });
  console.log(`  [${scope}] ${msg}`);
}

async function smokePage(page, label, url, { authed = false } = {}) {
  console.log(`\n--- ${label}: ${url} ---`);
  const consoleErrs = [];
  const netErrs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrs.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (req) => {
    netErrs.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) {
      netErrs.push(`HTTP ${res.status()} ${res.url()}`);
    }
  });

  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => {
    record(label, `navigation failed: ${e.message}`);
    return null;
  });
  if (resp && resp.status() >= 400) record(label, `HTTP ${resp.status()} on initial load`);

  // Wait for React to settle.
  await page.waitForTimeout(800);

  const title = await page.title();
  const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
  console.log(`  title="${title}" textLen=${bodyText.length}`);

  if (bodyText.length < 50) record(label, `body text suspiciously short (${bodyText.length} chars)`);
  if (/error|something went wrong/i.test(bodyText) && !/login|404|not found/i.test(url)) {
    // Heuristic — only flag if "Error" appears at the top of the rendered page.
    const heading = await page.locator('h1, h2').first().textContent().catch(() => '');
    if (heading && /error/i.test(heading)) record(label, `error heading: ${heading.trim()}`);
  }

  for (const e of consoleErrs) record(label, `console.error: ${e.slice(0, 220)}`);
  for (const n of netErrs) record(label, `network: ${n.slice(0, 220)}`);

  // Take screenshot for the report.
  const file = `claude/smoke-screenshots/${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return { consoleErrs, netErrs };
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // Try common selectors.
  const emailInput = page.locator('input[type=email], input[name=email]').first();
  const passInput = page.locator('input[type=password], input[name=password]').first();
  if (!(await emailInput.count())) {
    record('login', 'no email input found on /login');
    return false;
  }
  await emailInput.fill(EMAIL);
  await passInput.fill(PASSWORD);
  const submit = page.locator('button[type=submit], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")').first();
  await submit.click();
  await page.waitForURL((u) => !u.toString().endsWith('/login'), { timeout: 10000 }).catch(() => {});
  const finalUrl = page.url();
  console.log(`  after-login URL: ${finalUrl}`);
  return !finalUrl.endsWith('/login');
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Storefront (public).
  await smokePage(page, 'storefront-home', `${BASE}/store`);
  await smokePage(page, 'storefront-collection', `${BASE}/store/collections/all`);
  await smokePage(page, 'storefront-cart', `${BASE}/store/cart`);
  await smokePage(page, 'storefront-account', `${BASE}/store/account`);

  // 2. Login.
  console.log('\n--- LOGIN ---');
  const ok = await login(page);
  if (!ok) {
    record('login', 'login flow did not redirect off /login');
  }

  // 3. Admin pages (authed).
  await smokePage(page, 'admin-dashboard', `${BASE}/admin`, { authed: true });
  await smokePage(page, 'admin-inventory', `${BASE}/admin/inventory`, { authed: true });
  await smokePage(page, 'admin-pos-monitor', `${BASE}/admin/pos`, { authed: true });
  await smokePage(page, 'admin-finance', `${BASE}/admin/finance`, { authed: true });
  await smokePage(page, 'admin-crm', `${BASE}/admin/crm`, { authed: true });
  await smokePage(page, 'admin-ecommerce', `${BASE}/admin/ecommerce`, { authed: true });
  await smokePage(page, 'admin-website', `${BASE}/admin/website`, { authed: true });
  await smokePage(page, 'admin-analytics', `${BASE}/admin/analytics`, { authed: true });
  await smokePage(page, 'admin-team', `${BASE}/admin/team`, { authed: true });
  await smokePage(page, 'admin-settings', `${BASE}/admin/settings`, { authed: true });
  await smokePage(page, 'admin-counter', `${BASE}/admin/counter`, { authed: true });
  await smokePage(page, 'pos-app', `${BASE}/pos`, { authed: true });

  await browser.close();

  console.log('\n========== SUMMARY ==========');
  if (!issues.length) console.log('No issues found.');
  else {
    for (const i of issues) console.log(`[${i.scope}] ${i.msg}`);
    console.log(`\n${issues.length} issues total.`);
  }
})().catch((e) => {
  console.error('SMOKE CRASHED:', e);
  process.exit(1);
});
