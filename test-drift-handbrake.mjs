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

await page.evaluate(() => {
  window.__forceMode('car');
  window.__setVehiclePos('car', 0, 0, 0, 0);
  window.__setCameraYawOffset(0);
});

// build up speed, no steering
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(90));
let d = await page.evaluate(() => window.__debug().car);
console.log('speed built up:', d.speed);

// NO handbrake: turn hard and confirm slipAngle stays ~0 (grip driving, unchanged old behavior)
await page.evaluate(() => window.__setJoy(-1, 0, true));
await page.evaluate(() => window.__stepFrames(30));
let dGrip = await page.evaluate(() => window.__debug().car);
console.log('grip turn (no handbrake) slipAngle should be ~0:', dGrip.slipAngle);

// reset, build speed, THEN hold handbrake (space) while turning -- slipAngle should grow
await page.evaluate(() => { window.__setJoy(0, 0, false); window.__setVehiclePos('car', 0, 0, 0, 0); });
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(90));
await page.evaluate(() => window.__setKeys({ up: true, space: true }));
await page.evaluate(() => window.__setJoy(-1, 0, true));
await page.evaluate(() => window.__stepFrames(40));
let dDrift = await page.evaluate(() => window.__debug().car);
console.log('handbrake+turn -- slipAngle should be meaningfully nonzero, drifting=true:', JSON.stringify(dDrift));

// release handbrake, confirm it converges back toward 0 and drifting flips false
await page.evaluate(() => window.__setKeys({ up: true, space: false }));
await page.evaluate(() => window.__stepFrames(60));
let dRecover = await page.evaluate(() => window.__debug().car);
console.log('after releasing handbrake:', JSON.stringify(dRecover));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
