import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

// 1) map edge no longer snaps/jumps: drive the car straight toward the edge for a long time
await page.evaluate(() => window.__forceMode('car'));
await page.evaluate(() => window.__setVehiclePos('car', 0, 0, 0, 40)); // yaw 0 = +z direction, decent speed
const posLog = [];
await page.evaluate(() => { window.__setKeys({ up: true }); });
for (let i = 0; i < 8; i++) {
  const d = await page.evaluate(() => { window.__stepFrames(60); return window.__debug(); });
  posLog.push(Math.round(d.car.z));
}
console.log('z positions while driving toward edge:', posLog.join(', '));
const maxJumpBack = Math.max(...posLog.slice(1).map((z, i) => posLog[i] - z));
console.log('largest single-step backward jump:', maxJumpBack, '(expect small, not ~40)');

// 2) open the map panel, check POIs render + tooltip appears on hover
await page.evaluate(() => { window.__setKeys({ up: false }); });
await page.evaluate(() => document.getElementById('menu-settings') && null);
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-map').click());
await page.waitForTimeout(200);
const mapVisible = await page.evaluate(() => !document.getElementById('panel-map').classList.contains('hidden'));
console.log('map panel visible:', mapVisible);

const poiCount = await page.evaluate(() => window.__debug ? null : null); // placeholder, real check below
const poiWorld = await page.evaluate(() => {
  // reach into the module via a debug hook isn't exposed; instead just confirm canvas drew something
  const canvas = document.getElementById('map-canvas');
  return { w: canvas.width, h: canvas.height };
});
console.log('map canvas size:', JSON.stringify(poiWorld));

// hover near a known POI world coord: Garage Motors at bx1,bz10 -> need pixel coords.
// CITY_SIZE now 14*40=560, cityHalf=280. bx=1,bz=10 -> cx=(1-7+0.5)*40=-220, cz=(10-7+0.5)*40=140
const rect = await page.evaluate(() => {
  const el = document.getElementById('map-canvas');
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
const citySize = 560, cityHalf = 280;
const worldX = -220, worldZ = 140;
const px = rect.left + ((worldX + cityHalf) / citySize) * rect.width;
const pz = rect.top + ((worldZ + cityHalf) / citySize) * rect.height;
await page.mouse.move(px, pz);
await page.waitForTimeout(150);
const tooltipVisible = await page.evaluate(() => !document.getElementById('map-tooltip').classList.contains('hidden'));
const tooltipText = await page.evaluate(() => document.getElementById('map-tooltip').textContent);
console.log('tooltip visible on POI hover:', tooltipVisible, 'text:', tooltipText);

await page.screenshot({ path: '/tmp/map-tooltip.png' });

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
