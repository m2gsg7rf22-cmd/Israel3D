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
await page.evaluate(() => window.__setRunning(false));

// dry-road steering baseline
await page.evaluate(() => { window.__forceMode('car'); window.__setVehiclePos('car', 0, 0, 0, 0); window.__setCameraYawOffset(0); });
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(90));
await page.evaluate(() => window.__setJoy(-1, 0, true));
await page.evaluate(() => window.__stepFrames(40));
const dry = await page.evaluate(() => window.__debug().car);

// wet-road steering (rain forced on) from the identical setup
await page.evaluate(() => { window.__setJoy(0, 0, false); window.__setRaining(true); window.__setVehiclePos('car', 0, 0, 0, 0); });
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(90));
await page.evaluate(() => window.__setJoy(-1, 0, true));
await page.evaluate(() => window.__stepFrames(40));
const wet = await page.evaluate(() => window.__debug().car);
await page.evaluate(() => window.__setRaining(false));

console.log('dry yaw:', dry.yaw, 'wet yaw:', wet.yaw, '(wet should turn less)');
console.log('PASS:', Math.abs(wet.yaw) < Math.abs(dry.yaw) && isFinite(wet.x) && isFinite(wet.z));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
