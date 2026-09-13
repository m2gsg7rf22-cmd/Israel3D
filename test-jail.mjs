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

await page.evaluate(() => window.__testForceArrest());
await page.waitForTimeout(100);

// race blocked while jailed
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-race').click());
await page.evaluate(() => document.querySelectorAll('.race-start-btn')[0].click());
const d0 = await page.evaluate(() => window.__debug());
console.log('mode after trying to race while jailed (expect foot, not car):', d0.mode);

// no free walkout: try to walk straight out through the gate x-boundary
const walk = await page.evaluate(() => window.__walkTo(-70, 180, 3, 300));
console.log('after trying to walk out the gate, foot pos:', JSON.stringify(walk.foot), 'inPrison:', walk.prison.inPrison);

// jail auto-release: jump the clock near the end via repeated large steps
let d = await page.evaluate(() => window.__debug());
console.log('prison status text after entering:', undefined);
const text1 = await page.evaluate(() => document.getElementById('prison-status').textContent);
console.log('status text sample:', text1);

await browser.close();
console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
