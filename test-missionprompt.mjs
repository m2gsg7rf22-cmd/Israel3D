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

const d0 = await page.evaluate(() => window.__debug());
const marker = d0.markers[0];
console.log('driving to marker:', JSON.stringify(marker));

await page.evaluate(() => window.__forceMode('car'));
await page.evaluate((m) => window.__setVehiclePos('car', m.x, m.z, 0, 0), marker);
const drove = await page.evaluate(() => window.__debug());
console.log('car pos after teleport to marker:', JSON.stringify(drove.car));

await page.evaluate(() => window.__stepFrames(10));
const promptVisible1 = await page.evaluate(() => !document.getElementById('mission-prompt').classList.contains('hidden'));
console.log('mission prompt visible near marker (before accepting):', promptVisible1);
const promptText = await page.evaluate(() => document.getElementById('mission-prompt-text').textContent);
console.log('prompt text:', promptText);

// press F to accept
await page.evaluate(() => window.__pressF());
await page.evaluate(() => window.__stepFrames(10));
const d1 = await page.evaluate(() => window.__debug());
console.log('mode after accepting (should stay car, not exit vehicle):', d1.mode);
const promptGone = await page.evaluate(() => document.getElementById('mission-prompt').classList.contains('hidden'));
console.log('prompt hidden after accept:', promptGone);
console.log('missionWaypoint now set:', JSON.stringify(d1.missionWaypoint));

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
