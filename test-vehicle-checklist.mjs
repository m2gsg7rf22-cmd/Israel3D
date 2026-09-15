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

const results = {};

// 1. spawn near the city boundary -- no crash, no stuck state
await page.evaluate(() => { window.__forceMode('car'); window.__setVehiclePos('car', 270, 270, 0, 0); });
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(30));
let d = await page.evaluate(() => window.__debug().car);
results.spawnNearBoundary = { ok: isFinite(d.x) && isFinite(d.z) && isFinite(d.speed), speed: d.speed };

// 2. high speed straight at the boundary -- no teleport, no NaN, no violent lock
await page.evaluate(() => window.__setVehiclePos('car', 200, 0, Math.PI / 2, 32));
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(120));
d = await page.evaluate(() => window.__debug().car);
results.highSpeedAtBoundary = { ok: isFinite(d.x) && d.x <= 276.01 && d.speed >= 0, x: d.x, speed: d.speed };

// 3. reverse near the boundary
await page.evaluate(() => window.__setVehiclePos('car', 274, 0, Math.PI / 2, 0));
await page.evaluate(() => window.__setKeys({ up: false, down: true }));
await page.evaluate(() => window.__stepFrames(60));
d = await page.evaluate(() => window.__debug().car);
results.reverseNearBoundary = { ok: isFinite(d.x) && isFinite(d.speed), x: d.x, speed: d.speed };
await page.evaluate(() => window.__setKeys({ down: false }));

// 4. drift near the boundary (handbrake + turn while pinned)
await page.evaluate(() => window.__setVehiclePos('car', 274, 0, Math.PI / 2, 25));
await page.evaluate(() => window.__setKeys({ up: true, space: true }));
await page.evaluate(() => window.__setJoy(-1, 0, true));
await page.evaluate(() => window.__stepFrames(60));
d = await page.evaluate(() => window.__debug().car);
results.driftNearBoundary = { ok: isFinite(d.x) && isFinite(d.z) && isFinite(d.speed) };
await page.evaluate(() => { window.__setKeys({ up: false, space: false }); window.__setJoy(0, 0, false); });

// 5. motorcycle near the boundary
await page.evaluate(() => { window.__forceMode('moto'); window.__setVehiclePos('moto', 274, 0, Math.PI / 2, 20); });
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(60));
d = await page.evaluate(() => window.__debug().moto);
results.motoNearBoundary = { ok: isFinite(d.x) && isFinite(d.speed), x: d.x, speed: d.speed };
await page.evaluate(() => window.__setKeys({ up: false }));

// 6. category ownership persists across a save/reload cycle
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(50);
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { document.getElementById('cheat-input').value = 'CASH100K'; document.getElementById('cheat-submit').click(); });
}
const cashBeforeBuy = await page.evaluate(() => window.__debug().cash);
console.log('cash before buying helicopter (needs >= 200000):', cashBeforeBuy);
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(50);
await page.evaluate(() => document.querySelector('#helicopter-dealership-list .dealer-btn')?.click());
await page.waitForTimeout(50);
await page.evaluate(() => window.__setRunning(true));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
const heliOwnedAfterReload = await page.evaluate(() => {
  const raw = Object.keys(localStorage).find(k => k.startsWith('openCity.save.'));
  return raw ? JSON.parse(localStorage.getItem(raw)).ownedAirTiers : null;
});
results.ownershipPersistsAcrossReload = { ok: Array.isArray(heliOwnedAfterReload) && heliOwnedAfterReload.includes('heli'), value: heliOwnedAfterReload };

console.log('RESULTS:', JSON.stringify(results, null, 2));
const allOk = Object.values(results).every(r => r.ok);
console.log('ALL PASS:', allOk);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
