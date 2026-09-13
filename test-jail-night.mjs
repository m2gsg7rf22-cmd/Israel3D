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

await page.evaluate(() => window.__setDayTime(0.75)); // deep night
await page.evaluate(() => window.__testForceArrest());
await page.evaluate(() => window.__stepFrames(10));
await page.evaluate(() => window.__setCameraZoomTarget(20));
await page.evaluate(() => window.__stepFrames(10));
await page.screenshot({ path: '/tmp/jail-night.png' });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
