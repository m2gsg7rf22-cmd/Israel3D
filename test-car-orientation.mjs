import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
// bypass world-select gating: create a world so save data is happy, then start
await page.evaluate(() => { document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

// force car mode, put it in open ground, wait for the real model to load
await page.evaluate(() => window.__forceMode('car'));
await page.evaluate(() => window.__setVehiclePos('car', 0, 0, 0, 0));
await page.waitForTimeout(1500); // give the ferrari.glb + draco decode time to land
const debugInfo = await page.evaluate(() => window.__debug());
console.log('car state before driving:', JSON.stringify(debugInfo.car));

// side-on screenshot while stationary, facing +z (yaw=0)
await page.evaluate(() => window.__setCameraZoomTarget(12));
await page.evaluate(() => window.__stepFrames(10));
await page.screenshot({ path: '/tmp/car-orient-stationary.png' });

// now drive forward (W) and confirm it moves in +z (matches yaw=0 forward)
// and take a screenshot showing the car's nose pointed the way it's moving
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(90));
await page.evaluate(() => window.__setKeys({ up: false }));
const afterDrive = await page.evaluate(() => window.__debug());
console.log('car state after driving forward:', JSON.stringify(afterDrive.car));
console.log('moved in +z as expected:', afterDrive.car.z > debugInfo.car.z);

await page.screenshot({ path: '/tmp/car-orient-driving.png' });

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
