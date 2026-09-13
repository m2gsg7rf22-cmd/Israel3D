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

// grant enough cash for every tier and unlock all 5 cheat-code car unlocks
// one at a time, driving forward briefly after each so the chase camera
// (which trails BEHIND the car, showing its back/rear when heading is
// correct) reveals a reversed model immediately: if the model's "front"
// faces the camera while moving forward, that's a backward spawn/heading
await page.evaluate(() => window.__forceMode('car'));
await page.evaluate(() => window.__setVehiclePos('car', 0, 0, 0, 0));
await page.evaluate(() => window.__setCameraZoomTarget(9));

const carCodes = ['CAR-HATCH', 'CAR-CRUISER', 'CAR-MUSCLE', 'CAR-APEX', 'CAR-HYPERION'];
for (let i = 0; i < carCodes.length; i++) {
  await page.evaluate((code) => {
    document.getElementById('side-menu').classList.remove('hidden');
    document.getElementById('menu-settings').click();
    document.getElementById('cheat-input').value = code;
    document.getElementById('cheat-submit').click();
  }, carCodes[i]);
  // give the (possibly multi-MB) model real time to load in this sandbox
  await page.waitForTimeout(20000);
  await page.evaluate(() => document.getElementById('panel-settings').querySelector('.panel-close').click());
  await page.evaluate(() => window.__setVehiclePos('car', 0, 0, 0, 0));
  await page.evaluate(() => window.__setKeys({ up: true }));
  await page.evaluate(() => window.__stepFrames(60));
  await page.evaluate(() => window.__setKeys({ up: false }));
  const info = await page.evaluate(() => window.__testCarModelInfo ? window.__testCarModelInfo() : null);
  console.log(`tier ${i + 1} (${carCodes[i]}) after driving forward 1s:`, JSON.stringify({ hasRealModel: info?.hasRealModel, meshCount: info?.realModelMeshNames?.length }));
  await page.screenshot({ path: `/tmp/heading-tier-${i + 1}.png` });
}

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
