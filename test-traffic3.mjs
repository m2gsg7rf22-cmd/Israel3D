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

await page.evaluate(() => window.__stepFrames(120)); // let the real Ferrari model + traffic settle
await page.evaluate(() => window.__forceMode('car'));
await page.evaluate(() => window.__setVehiclePos('car', 0, 0, 0, 6));
await page.evaluate(() => { window.__setKeys({ up: true }); window.__stepFrames(240); });
const d = await page.evaluate(() => window.__debug());
console.log('car pos after long drive (expect no crash/getting stuck permanently):', JSON.stringify(d.car));
await page.evaluate(() => window.__setCameraZoomTarget(45));
await page.evaluate(() => window.__stepFrames(10));
await page.screenshot({ path: '/tmp/traffic-view3.png' });
console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
