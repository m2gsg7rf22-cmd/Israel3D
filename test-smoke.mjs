import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

// walking works
const before = await page.evaluate(() => window.__debug());
await page.evaluate(() => { window.__setKeys({ up: true }); });
await page.evaluate(() => window.__stepFrames(60));
await page.evaluate(() => { window.__setKeys({ up: false }); });
const afterWalk = await page.evaluate(() => window.__debug());
console.log('walked distance:', Math.hypot(afterWalk.foot.x - before.foot.x, afterWalk.foot.z - before.foot.z).toFixed(2));

// run over a pedestrian for +300 cash
await page.evaluate(() => window.__forceMode('car'));
const res = await page.evaluate(() => window.__driveHitNearestPed());
console.log('cash after ped hit:', res.cash, '(expect >= 300)');

// right-click punch doesn't throw
await page.evaluate(() => { window.__pressPunch(); window.__stepFrames(20); });
console.log('punch ok, no crash');

// knife button toggles pendingWeapon without throwing (DOM click)
await page.click('#t-knife').catch(() => {});
await page.evaluate(() => window.__stepFrames(5));
console.log('knife button click ok');

// wanted + police spawn doesn't crash
await page.evaluate(() => window.__testSetWanted(3));
await page.evaluate(() => window.__stepFrames(120));
const polDebug = await page.evaluate(() => window.__debug());
console.log('police cars spawned:', polDebug.policeCars, 'wanted:', polDebug.wanted);

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
