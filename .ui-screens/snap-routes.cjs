// Verify: / -> storefront, /admin/login -> login, login flow lands on /admin.
const { chromium } = require('playwright-core');
const path = require('path');
const http = require('http');

function ping(port) {
  return new Promise((res) => {
    const req = http.get(`http://localhost:${port}/`, (r) => { res(r.statusCode); r.destroy(); });
    req.on('error', () => res(0));
    req.setTimeout(800, () => { req.destroy(); res(0); });
  });
}

(async () => {
  let base = 'http://localhost:3000';
  for (const p of [3000, 3001, 3002, 3003]) {
    if (await ping(p)) { base = `http://localhost:${p}`; break; }
  }
  console.log('using', base);

  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1) / -> storefront
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(__dirname, 'route-root.png'), fullPage: false });
  console.log('root URL', page.url());

  // 2) /admin -> redirects to /admin/login (no auth)
  await page.goto(base + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  console.log('/admin URL', page.url());
  await page.screenshot({ path: path.join(__dirname, 'route-admin-unauth.png'), fullPage: false });

  // 3) Wrong password
  await page.fill('input#email', 'wrong@x.com');
  await page.fill('input#password', 'bad');
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(500);
  console.log('after wrong creds', page.url());

  // 4) Correct password (from .env)
  await page.fill('input#email', 'admin@goldos.in');
  await page.fill('input#password', 'goldos123');
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(__dirname, 'route-admin-dashboard.png'), fullPage: false });
  console.log('after login', page.url());

  // 5) Click Website link, confirm tabs render
  await page.click('a[href="/admin/website"]');
  await page.waitForSelector('button:has-text("Hero")', { timeout: 5000 });
  await page.screenshot({ path: path.join(__dirname, 'route-admin-website.png'), fullPage: false });
  console.log('website url', page.url());

  await browser.close();
  console.log('OK');
})().catch((e) => { console.error('FAIL', e.message); process.exit(2); });
