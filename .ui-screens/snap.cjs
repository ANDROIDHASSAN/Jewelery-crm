// Visual verification script — snapshots storefront at 1440/1024/768/375.
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://localhost:3000';
const PAGES = [
  { name: 'home', path: '/store' },
  { name: 'collection', path: '/store/collections/bridal' },
  { name: 'pdp', path: '/store/products/mira-bangle' },
  { name: 'locations', path: '/store/locations' },
];
const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '1024', w: 1024, h: 768 },
  { name: '768',  w: 768,  h: 1024 },
  { name: '375',  w: 375,  h: 812 },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const errors = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${vp.name}] pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${vp.name}] console.error: ${msg.text()}`);
    });
    for (const p of PAGES) {
      await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(400); // settle fonts
      const file = path.join(__dirname, `${p.name}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('saved', file);
    }
    await ctx.close();
  }
  await browser.close();
  if (errors.length) {
    console.log('\n--- ERRORS ---');
    for (const e of errors) console.log(e);
    process.exit(2);
  }
  console.log('\nNo runtime errors.');
})();
