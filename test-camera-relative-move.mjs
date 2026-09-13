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
await page.evaluate(() => window.__setFootPos(0, 0, 0)); // facing +z (yaw=0)

// with no camera orbit, pushing "forward" (joy.y negative) should walk in
// the direction the camera looks -- which, with yawOffset=0, is the same
// as the character's own initial yaw (+z), so this just confirms the
// baseline works before we rotate the camera
await page.evaluate(() => window.__setJoy(0, -1, true));
await page.evaluate(() => window.__stepFrames(30));
const baseline = await page.evaluate(() => window.__debug().foot);
console.log('baseline forward-push (camera not rotated):', JSON.stringify(baseline));

// now rotate the camera 90 degrees (simulating a swipe) WITHOUT touching
// the joystick's own left/right axis, reset position, and push "forward"
// again -- the character should now walk along the NEW camera direction
// (roughly +x instead of +z), not continue along its old yaw
await page.evaluate(() => window.__setJoy(0, 0, false));
await page.evaluate(() => window.__setFootPos(0, 0, 0));
await page.evaluate(() => window.__setCameraYawOffset(Math.PI / 2));

await page.evaluate(() => window.__setJoy(0, -1, true));
await page.evaluate(() => window.__stepFrames(30));
const afterRotate = await page.evaluate(() => window.__debug().foot);
console.log('forward-push after rotating camera 90deg:', JSON.stringify(afterRotate));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
