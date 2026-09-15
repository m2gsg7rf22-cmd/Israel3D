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

// Pause the real rAF-driven game loop so only our explicit __stepFrames
// calls advance physics -- otherwise the live loop keeps ticking in real
// wall-clock time between each awaited page.evaluate() round-trip and
// silently adds extra, uncontrolled physics steps on top of the ones this
// test asks for, making "after N frames" meaningless.
await page.evaluate(() => window.__setRunning(false));

// Drive a car straight past the map's +X boundary at real speed, facing
// straight into it (yaw = PI/2 -> sin(yaw)=1, fully perpendicular).
// Previously the edge clamp multiplied speed by 0.3 every single frame
// while pinned there, collapsing to near-zero within a handful of frames
// regardless of framerate (0.3^3 < 3%) -- looked/felt like slamming an
// invisible wall. The fix should feel like resistance, not a wall: still
// meaningful speed after a few frames, decaying smoothly over real time.
await page.evaluate(() => {
  window.__forceMode('car');
  window.__setVehiclePos('car', 280, 0, Math.PI / 2, 40);
});
await page.evaluate(() => window.__stepFrames(3));
const after3 = await page.evaluate(() => window.__debug().car);
console.log('after 3 frames pinned at the edge (should retain most of 40, NOT collapse near 0):', after3.speed, 'x:', after3.x);

await page.evaluate(() => window.__stepFrames(57)); // 60 total (~1s)
const after60 = await page.evaluate(() => window.__debug().car);
console.log('after ~1s continuously pinned (should have decayed meaningfully but not instantly):', after60.speed);

const noInstantCollapse = after3.speed > 40 * 0.5; // still holds most of its speed after just 3 frames
const stillBounded = after3.x <= 276.001; // position clamp still works (no clipping past the boundary)
console.log('PASS/FAIL:', { noInstantCollapse, stillBounded });

// sanity: a glancing approach (nearly parallel to the edge, mostly along Z
// not X) should barely slow down at all, since almost none of its
// velocity actually faces outward through the +X boundary
await page.evaluate(() => window.__setVehiclePos('car', 280, 0, 0.1, 40));
await page.evaluate(() => window.__stepFrames(10));
const glancing = await page.evaluate(() => window.__debug().car);
console.log('near-parallel approach after 10 frames (should barely change from 40):', glancing.speed);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
