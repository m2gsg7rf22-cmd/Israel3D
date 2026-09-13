import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => { document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(300);

await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelectorAll('.race-start-btn')[0].click());
await page.waitForTimeout(200);

await page.evaluate(() => { window.__setKeys({ up: true }); window.__stepFrames(60); });
await page.screenshot({ path: '/tmp/checkpoint-view.png' });

// minimap check
const canvasDataBefore = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  return c.toDataURL().length; // just a sanity proxy that something was drawn
});
console.log('minimap dataURL length (sanity, expect nonzero):', canvasDataBefore);

await page.screenshot({ path: '/tmp/checkpoint-minimap.png', clip: { x: 1180, y: 40, width: 100, height: 100 } });

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
