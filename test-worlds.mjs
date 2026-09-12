import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.waitForTimeout(500);

const worldsScreenVisible1 = await page.evaluate(() => !document.getElementById('screen-worlds').classList.contains('hidden'));
console.log('world-select screen visible on fresh load:', worldsScreenVisible1);
const startScreenHidden1 = await page.evaluate(() => document.getElementById('screen-start').classList.contains('hidden'));
console.log('start screen hidden on fresh load:', startScreenHidden1);
const emptyHintShown = await page.evaluate(() => !!document.querySelector('.world-empty-hint'));
console.log('empty-worlds hint shown (no worlds yet):', emptyHintShown);

// create a new world
await page.evaluate(() => { document.getElementById('world-new-name').value = 'עולם הבדיקה'; });
await page.evaluate(() => document.getElementById('world-new-btn').click());
await page.waitForTimeout(800); // page reloads

const worldsScreenVisible2 = await page.evaluate(() => !document.getElementById('screen-worlds').classList.contains('hidden'));
console.log('world-select screen visible after creating+reload:', worldsScreenVisible2);
const worldItemCount = await page.evaluate(() => document.querySelectorAll('.world-item').length);
console.log('world items listed after creation:', worldItemCount);
const worldName = await page.evaluate(() => document.querySelector('.world-name')?.textContent);
console.log('world name shown:', worldName);
const activeBadge = await page.evaluate(() => !!document.querySelector('.world-active-badge'));
console.log('active badge shown:', activeBadge);

// click the world to enter it (should NOT reload since it's already active)
await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(200);
const startScreenVisible = await page.evaluate(() => !document.getElementById('screen-start').classList.contains('hidden'));
console.log('start screen visible after selecting active world:', startScreenVisible);

// click start
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);
const debug = await page.evaluate(() => window.__debug ? window.__debug() : null);
console.log('game running after start click:', !!debug, debug ? 'mode=' + debug.mode : '');

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
