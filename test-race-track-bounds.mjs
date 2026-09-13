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
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));

// start the ayalon race (index 0) -- previously just 2 far-apart corner
// checkpoints over a ~440m straight, now should be densified
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelectorAll('.race-start-btn')[0].click());
await page.evaluate(() => window.__stepFrames(5));
const track = await page.evaluate(() => window.__testRaceTrack());
console.log('dense checkpoint count (expect way more than 4 corners):', track.checkpointCount);

// the ayalon route's first leg runs along +x (checkpoints[0]->[1] differ in
// x, not z), so the corridor's perpendicular axis here is z -- shove the car
// 40m sideways in z (off the route) with zero speed and confirm the wall
// clamp pulls it back within TRACK_HALF_WIDTH (5m) of the centerline
const before = await page.evaluate(() => window.__testRaceTrack());
console.log('car pos before off-track teleport:', JSON.stringify(before.car));

await page.evaluate(() => {
  const d = window.__debug();
  window.__setVehiclePos('car', d.car.x, d.car.z + 40, d.car.yaw, 0);
});
await page.evaluate(() => window.__stepFrames(3));
const afterShove = await page.evaluate(() => window.__testRaceTrack());
console.log('car pos after 40m sideways (z) shove + 3 frames (z should snap back near start.z +/- 5):', JSON.stringify(afterShove.car));

// now test auto stuck-recovery: point the car straight at the wall (yaw=0
// drives along +z here) and hold throttle, so it keeps trying to push
// further past the boundary every frame -- each frame's clamp bleeds speed,
// so it should stay "barely moving" against the wall until the ~0.9s
// stuck timer fires an automatic nudge back onto the corridor
await page.evaluate(() => {
  const d = window.__debug();
  window.__setVehiclePos('car', d.car.x, d.car.z + 10, 0, 0.1);
});
await page.evaluate(() => window.__setKeys({ up: true }));
let stuckSnapshots = [];
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => window.__stepFrames(10));
  const snap = await page.evaluate(() => window.__testRaceTrack());
  stuckSnapshots.push(snap.car);
}
console.log('positions while pinned against the wall (expect z hovering near the boundary, then an auto-nudge jump back):', JSON.stringify(stuckSnapshots));
await page.evaluate(() => window.__setKeys({ up: false }));

// manual unstick button, from an off-course position
await page.evaluate(() => {
  const d = window.__debug();
  window.__setVehiclePos('car', d.car.x, d.car.z + 40, d.car.yaw, 0);
});
const beforeManual = await page.evaluate(() => window.__debug().car);
await page.evaluate(() => document.getElementById('race-unstick').click());
const afterManual = await page.evaluate(() => window.__debug().car);
console.log('manual unstick: before', JSON.stringify(beforeManual), 'after', JSON.stringify(afterManual));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
