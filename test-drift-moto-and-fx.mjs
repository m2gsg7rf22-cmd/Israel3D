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

// motorcycle drift, using the same shared updateVehicle() as the car
await page.evaluate(() => {
  window.__forceMode('moto');
  window.__setVehiclePos('moto', 0, 0, 0, 0);
});
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(90));
await page.evaluate(() => window.__setKeys({ up: true, space: true }));
await page.evaluate(() => window.__setJoy(1, 0, true));
await page.evaluate(() => window.__stepFrames(60));
const d = await page.evaluate(() => window.__debug());
console.log('moto after handbrake+turn:', JSON.stringify(d.moto));
await page.evaluate(() => { window.__setKeys({ up: false, space: false }); window.__setJoy(0, 0, false); });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
