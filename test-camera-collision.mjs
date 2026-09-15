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

const b = await page.evaluate(() => window.__nearbyBuildings(20, 20)[0]);
console.log('sample building AABB:', JSON.stringify(b));

const midX = (b.minX + b.maxX) / 2;
const midZ = (b.minZ + b.maxZ) / 2;
const zoom = 8;
const horiz = zoom * Math.cos(0.12); // matches cameraRig's default pitch offset
const clearance = 3; // player stands well clear of the wall, not touching it
const playerZ = b.maxZ + clearance;

// Position the player clearly outside the building, facing straight at
// it (yaw=0 -> camera sits behind, at playerZ - horiz), with a zoom
// chosen so the *uncollided* desired camera position lands well inside
// the building -- guaranteed penetration if collision avoidance did
// nothing at all.
console.log('uncollided desired camera z would be', (playerZ - horiz).toFixed(2), '-- inside building range?', (playerZ - horiz) > b.minZ && (playerZ - horiz) < b.maxZ);
await page.evaluate(({ x, z }) => {
  window.__forceMode('foot');
  window.__setFootPos(x, z, 0); // yaw=0: facing +Z, straight at the building
  window.__setCameraYawOffset(0);
  window.__setCameraZoomTarget(8);
}, { x: midX, z: playerZ });
await page.evaluate(() => window.__stepFrames(90));
const d = await page.evaluate(() => window.__debug());
console.log('player:', JSON.stringify({ x: d.foot.x, z: d.foot.z }));
console.log('building z-range:', b.minZ, '..', b.maxZ, '(uncollided camera would sit at z=', midZ, ')');
console.log('actual camera pos:', JSON.stringify(d.camera.pos));

const cameraInsideBuilding = d.camera.pos.x >= b.minX && d.camera.pos.x <= b.maxX && d.camera.pos.z >= b.minZ && d.camera.pos.z <= b.maxZ;
console.log('camera clipped into the building footprint:', cameraInsideBuilding, '(should be false)');

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
