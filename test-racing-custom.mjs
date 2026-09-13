import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelectorAll('#race-length-opts .race-opt-btn')[0].click());
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelectorAll('#race-diff-opts .race-opt-btn')[2].click());
await page.waitForTimeout(100);
await page.evaluate(() => document.getElementById('race-custom-start').click());
await page.waitForTimeout(200);
const customDebug = await page.evaluate(() => window.__debug());
console.log('mode after custom race start:', customDebug.mode);
const customHudVisible = await page.evaluate(() => { window.__stepFrames(5); return !document.getElementById('race-hud').classList.contains('hidden'); });
console.log('custom race hud visible:', customHudVisible);
console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
