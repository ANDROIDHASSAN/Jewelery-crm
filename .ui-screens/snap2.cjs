// Mobile/tablet visual verification only.
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
  { name: '768', w: 768, h: 1024 },
  { name: '375', w: 375, h: 812 },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      try {
        await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // scroll through to trigger lazy images
        await page.evaluate(async () => {
          await new Promise((r) => setTimeout(r, 200));
          const total = document.body.scrollHeight;
          for (let y = 0; y < total; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 300));
        });
        const file = path.join(__dirname, `${p.name}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log('saved', file);
      } catch (e) {
        console.log('FAIL', p.name, vp.name, e.message);
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
