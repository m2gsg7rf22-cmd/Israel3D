import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

const d1 = await page.evaluate(() => window.__testForceArrest());
console.log('mission:', d1.prison.activeMission.id, 'foot:', JSON.stringify(d1.foot));
await page.evaluate(() => window.__stepFrames(10));
await page.screenshot({ path: '/tmp/prison-entry-fixed.png' });

// look around a bit by rotating camera isn't directly testable; take a top-down-ish shot instead
await page.evaluate(() => window.__setCameraZoomTarget(40));
await page.evaluate(() => window.__stepFrames(60));
await page.screenshot({ path: '/tmp/prison-topdown.png' });

// verify guard detection actually can trigger: walk player right up to the guard's front
const gpos = await page.evaluate(() => {
  return fetch('./js/prison.js').then(() => null); // no-op, guard pos not exported directly
});
// use __isSeenByGuard by scanning a grid to confirm it returns true somewhere and false elsewhere
const scan = await page.evaluate(() => {
  const results = [];
  for (let x = -160; x <= -120; x += 4) {
    for (let z = 160; z <= 200; z += 4) {
      if (window.__isSeenByGuard(x, z)) results.push({ x, z });
    }
  }
  return results;
});
console.log('cells currently seen by guard:', JSON.stringify(scan));

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
