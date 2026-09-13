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

// walk somewhere distinctive, force arrest into prison with a known mission, then "exit to world select"
await page.evaluate(() => window.__setFootPos(55, -33, 1.2));
await page.evaluate(() => window.__testForceArrest());
await page.evaluate(() => window.__stepFrames(120)); // let the jail timer tick down a bit
const before = await page.evaluate(() => window.__debug());
console.log('before reload -- inPrison:', before.prison.inPrison, 'mission:', before.prison.activeMission?.id);

// simulate "return to world selection" (which now saves first) then re-enter the same world
await page.evaluate(() => document.getElementById('btn-restart-pause').click());
await page.waitForTimeout(800); // reload

const afterReloadScreen = await page.evaluate(() => !document.getElementById('screen-worlds').classList.contains('hidden'));
console.log('world-select shown again after reload:', afterReloadScreen);
await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(300);

const after = await page.evaluate(() => window.__debug());
console.log('after re-entry -- inPrison:', after.prison.inPrison, 'mission:', after.prison.activeMission?.id, 'foot:', JSON.stringify(after.foot));
const statusText = await page.evaluate(() => document.getElementById('prison-status').textContent);
console.log('restored status text (should show a release countdown well under 7:00):', statusText);

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
