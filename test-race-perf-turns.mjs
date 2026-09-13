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

// ayalon (index 0) previously had 112 dense checkpoints at 16m spacing;
// should now be meaningfully fewer with 30m spacing
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelectorAll('.race-start-btn')[0].click());
await page.evaluate(() => window.__stepFrames(5));
const track = await page.evaluate(() => window.__testRaceTrack());
console.log('checkpoint count for ayalon (was 112 before, expect well under half):', track.checkpointCount);

// let bots (which drive themselves regardless of player input) run for a
// while -- if the rounded corners or the wider checkpoint spacing broke
// anything, this is where a bot would get stuck or the sim would throw
await page.evaluate(() => window.__stepFrames(600)); // ~10s of simulated bot driving
console.log('survived 600 frames of bot driving with no errors so far');

// now try the hills race (index 2) -- its route has 6 turns per lap
// (staircaseRoute(7,7,6,1)), the most turn-dense of the 5, so it's the
// best stress test for the corner-rounding logic
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelectorAll('.race-start-btn')[2].click());
await page.evaluate(() => window.__stepFrames(5));
const hillsTrack = await page.evaluate(() => window.__testRaceTrack());
console.log('checkpoint count for hills (6 turns/lap):', hillsTrack.checkpointCount);
await page.evaluate(() => window.__stepFrames(300));
console.log('survived 300 more frames on the hills route');

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
