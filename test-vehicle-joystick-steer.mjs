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

// Unlike on-foot movement, vehicle steering is NOT camera-relative -- it's a
// direct turn-rate applied to the car's own yaw (steer>0 turns the car
// toward its own left), same as every real driving game. With the chase cam
// sitting directly behind the car (yaw offset 0, the default), the car's
// own left/right and screen left/right coincide, so this still verifies
// what the player actually perceives: push the joystick left, the car
// should visibly turn left on screen.
await page.evaluate(() => {
  window.__forceMode('car');
  window.__setVehiclePos('car', 0, 0, 0, 0);
  window.__setCameraYawOffset(0);
});

// build up some speed (steering has no effect at speed 0), then steer LEFT
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(60));
await page.evaluate(() => window.__setJoy(-1, 0, true));
await page.evaluate(() => window.__stepFrames(60));
const afterLeft = await page.evaluate(() => window.__debug().car);
console.log('joystick LEFT:', JSON.stringify(afterLeft));

// reset and steer RIGHT -- should mirror exactly
await page.evaluate(() => {
  window.__setJoy(0, 0, false);
  window.__setVehiclePos('car', 0, 0, 0, 0);
});
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(60));
await page.evaluate(() => window.__setJoy(1, 0, true));
await page.evaluate(() => window.__stepFrames(60));
const afterRight = await page.evaluate(() => window.__debug().car);
console.log('joystick RIGHT:', JSON.stringify(afterRight));
await page.evaluate(() => window.__setJoy(0, 0, false));

// exact mirroring isn't expected over 60 physics-stepped frames -- the city
// grid isn't symmetric about x=0, so building/lamp-post collisions along
// the two paths can differ slightly. The direction (sign) is what matters.
const leftTurnedLeft = afterLeft.yaw > 0.05 && afterLeft.x > 0.05;
const rightTurnedRight = afterRight.yaw < -0.05 && afterRight.x < -0.05;
const roughlyMirrored = Math.abs(Math.abs(afterLeft.yaw) - Math.abs(afterRight.yaw)) < 0.2;
console.log('PASS/FAIL:', { leftTurnedLeft, rightTurnedRight, roughlyMirrored });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
