import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => { document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);

// direct entry: clicking the active world should start the game immediately, no start screen
await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(300);
const debugAfterEnter = await page.evaluate(() => window.__debug ? window.__debug() : null);
console.log('direct entry -- game running immediately:', !!debugAfterEnter);
const startScreenHidden = await page.evaluate(() => document.getElementById('screen-start').classList.contains('hidden'));
console.log('screen-start stayed hidden (never shown):', startScreenHidden);

// police difficulty setting persists + applies
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelector('[data-diff="pro"]').click());
const diffApplied = await page.evaluate(() => localStorage.getItem('openCity.policeDifficulty'));
console.log('police difficulty saved as:', diffApplied);

// arrest radial fill: force arrest range and check geometry sweep grows over time
await page.evaluate(() => { document.getElementById('panel-settings').classList.add('hidden'); });
await page.evaluate(() => window.__testSetWanted(5));
await page.evaluate(() => window.__stepFrames(30));
const info1 = await page.evaluate(() => window.__debug());
console.log('police cars after setWanted(5):', info1.policeCars);

// light count check
const lightCount = await page.evaluate(() => window.__lightCount());
console.log('active light count in scene:', lightCount, '(expect well under 100)');

// ESC -> pause -> return to world select
await page.evaluate(() => window.__setKeys && window.__setKeys({}));
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const pauseVisible = await page.evaluate(() => !document.getElementById('screen-pause').classList.contains('hidden'));
console.log('pause screen visible after Escape:', pauseVisible);
const backBtnText = await page.evaluate(() => document.getElementById('btn-restart-pause').textContent);
console.log('back-to-worlds button text:', backBtnText);

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
