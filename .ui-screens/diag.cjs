const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push('PAGEERR ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ' ' + m.text()); });
  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input#phone', '+919876543210');
  await page.click('button:has-text("Send OTP")');
  await page.waitForSelector('input#code');
  await page.fill('input#code', '123456');
  await page.click('button:has-text("Verify")');
  await page.waitForTimeout(1000);
  await page.goto('http://localhost:3001/website', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, 'diag-website.png'), fullPage: true });
  const headings = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,button')).slice(0, 30).map(e => e.textContent?.trim()).filter(Boolean));
  console.log('headings:', headings);
  console.log('--- logs ---');
  logs.forEach(l => console.log(l));
  await browser.close();
})();
