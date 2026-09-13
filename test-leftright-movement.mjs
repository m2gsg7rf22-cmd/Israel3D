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

await page.evaluate(() => window.__forceMode('foot'));
await page.evaluate(() => window.__setCameraYawOffset(0));

// character facing +z (yaw=0), camera not rotated (default, directly
// behind). Pushing the joystick strictly RIGHT (joy.x = +1, joy.y = 0)
// must move the character to screen-right. With the camera directly
// behind a character facing +z, screen-right is world -x (see the fix's
// own comment in game.js for why: Three.js derives camera axes from
// eye-target, the reverse of "forward", which flips the naive cross
// product). So pushing right should end with x < 0, NOT x > 0.
await page.evaluate(() => window.__setFootPos(0, 0, 0));
await page.evaluate(() => window.__setJoy(1, 0, true));
await page.evaluate(() => window.__stepFrames(30));
const afterRight = await page.evaluate(() => window.__debug().foot);
console.log('pushed joystick RIGHT (x should be negative -- screen-right with this camera setup):', JSON.stringify(afterRight));

// and strictly LEFT should mirror it: x > 0. Reset the camera yaw offset
// too, not just position -- turning the character (as the RIGHT case just
// did) shifts the offset via nudgeCameraYawOffset's conservation law (see
// game.js), so leaving it as-is would start this second case from a
// different effective camera angle than the first, breaking the mirror
await page.evaluate(() => window.__setJoy(0, 0, false));
await page.evaluate(() => window.__setFootPos(0, 0, 0));
await page.evaluate(() => window.__setCameraYawOffset(0));
await page.evaluate(() => window.__setJoy(-1, 0, true));
await page.evaluate(() => window.__stepFrames(30));
const afterLeft = await page.evaluate(() => window.__debug().foot);
console.log('pushed joystick LEFT (x should be positive, mirroring the right case):', JSON.stringify(afterLeft));

await page.evaluate(() => window.__setJoy(0, 0, false));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
