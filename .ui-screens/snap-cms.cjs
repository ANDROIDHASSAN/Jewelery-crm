// End-to-end: login (fake) -> /website -> edit hero -> verify on /store.
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://localhost:3000';

async function findBase() {
  // dev may be on 3000 or 3001
  const http = require('http');
  function ping(port) {
    return new Promise((res) => {
      const req = http.get(`http://localhost:${port}/`, (r) => { res(r.statusCode); r.destroy(); });
      req.on('error', () => res(0));
      req.setTimeout(800, () => { req.destroy(); res(0); });
    });
  }
  for (const p of [3001, 3002, 3000]) {
    const s = await ping(p);
    if (s) return `http://localhost:${p}`;
  }
  return BASE;
}

(async () => {
  const base = await findBase();
  console.log('using', base);
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1) Login via fake OTP
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input#phone', '+919876543210');
  await page.click('button:has-text("Send OTP")');
  await page.waitForSelector('input#code', { timeout: 5000 });
  await page.fill('input#code', '123456');
  await page.click('button:has-text("Verify")');
  await page.waitForURL((u) => !u.toString().endsWith('/login'), { timeout: 5000 });
  console.log('logged in →', page.url());

  // 2) Click the Website sidebar link (stay within SPA so auth state survives)
  await page.click('a[href="/website"]');
  await page.waitForSelector('button:has-text("Hero")');
  await page.screenshot({ path: path.join(__dirname, 'admin-website.png'), fullPage: true });
  console.log('saved admin-website.png');

  // 3) Open Hero tab, change title
  await page.click('button:has-text("Hero")');
  const titleArea = page.locator('textarea').first();
  await titleArea.click();
  await titleArea.fill('Diwali Edit · Lighter weights, brighter pieces.');
  await titleArea.blur();
  await page.screenshot({ path: path.join(__dirname, 'admin-hero-edited.png'), fullPage: true });

  // 4) Open Brand tab and change brand name
  await page.click('button:has-text("Brand")');
  const nameInput = page.locator('input').first();
  await nameInput.click();
  await nameInput.fill('Kamal Jewellers');
  await nameInput.blur();

  // 5) Open storefront in new tab and verify
  const sf = await ctx.newPage();
  await sf.goto(base + '/store', { waitUntil: 'domcontentloaded' });
  await sf.waitForTimeout(700);
  await sf.screenshot({ path: path.join(__dirname, 'storefront-after-edit.png'), fullPage: true });
  console.log('saved storefront-after-edit.png');

  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(2); });
