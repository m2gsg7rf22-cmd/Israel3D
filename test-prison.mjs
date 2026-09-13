import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

// Force arrest directly (mission pick / teleport / HUD)
const d1 = await page.evaluate(() => window.__testForceArrest());
console.log('after forceArrest:', JSON.stringify(d1.prison), 'foot:', JSON.stringify(d1.foot));

const hudVisible = await page.evaluate(() => !document.getElementById('prison-hud').classList.contains('hidden'));
console.log('prison-hud visible:', hudVisible);
const prisonTextContent = await page.evaluate(() => document.getElementById('prison-text').textContent);
console.log('prison-text:', prisonTextContent);

// Make sure guard detection doesn't immediately trigger a false catch at entry (step a few frames)
await page.evaluate(() => window.__stepFrames(30));
const afterFrames = await page.evaluate(() => window.__debug());
console.log('inPrison after 30 frames:', afterFrames.prison.inPrison, 'activeMission:', JSON.stringify(afterFrames.prison.activeMission));

// screenshot of compound from above
await page.evaluate(() => window.__stepFrames(5));
await page.screenshot({ path: '/tmp/prison-1-entry.png' });

// Walk toward mission target using __walkTo, watching for guard catch or success
const target = await page.evaluate(() => window.__testMissionTarget());
console.log('mission target:', JSON.stringify(target));

if (target) {
  const walkResult = await page.evaluate(async (t) => {
    return window.__walkTo(t.x, t.z, 3.5, 500);
  }, target);
  console.log('walkTo result foot:', JSON.stringify(walkResult.foot), 'prison state:', JSON.stringify(walkResult.prison));
}

await page.screenshot({ path: '/tmp/prison-2-afterwalk.png' });

const finalState = await page.evaluate(() => window.__debug());
console.log('FINAL prison state:', JSON.stringify(finalState.prison));
console.log('FINAL cash:', finalState.cash);
console.log('prison-hud hidden now:', await page.evaluate(() => document.getElementById('prison-hud').classList.contains('hidden')));

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');

await browser.close();
