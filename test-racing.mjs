import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

// open side menu + race panel, verify 5 races listed
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
const raceCount = await page.evaluate(() => document.querySelectorAll('.race-item').length);
console.log('races listed in panel:', raceCount, '(expect 5)');
const panelVisible = await page.evaluate(() => !document.getElementById('panel-race').classList.contains('hidden'));
console.log('race panel visible:', panelVisible);

// start the first built-in race via its button
await page.evaluate(() => document.querySelectorAll('.race-start-btn')[0].click());
await page.waitForTimeout(200);

const afterStart = await page.evaluate(() => window.__debug());
console.log('mode after starting race:', afterStart.mode);
const raceHudVisible1 = await page.evaluate(() => !document.getElementById('race-hud').classList.contains('hidden'));
console.log('race-hud visible right after start (should still be hidden until first stepSim tick):', raceHudVisible1);

// drive forward for a while and see checkpoint/lap progress advance
await page.evaluate(() => window.__setKeys({ up: true }));
let lastText = '';
for (let i = 0; i < 4; i++) {
  lastText = await page.evaluate(() => {
    window.__stepFrames(60);
    return {
      lap: document.getElementById('race-lap').textContent,
      pos: document.getElementById('race-position').textContent,
      fill: document.getElementById('race-progress-fill').style.width,
    };
  });
  console.log(`t=${i}s`, JSON.stringify(lastText));
}

await page.screenshot({ path: '/tmp/race-driving.png' });

// exit the race, confirm HUD hides and bots are gone from debug (police units unaffected)
await page.evaluate(() => document.getElementById('race-exit').click());
await page.waitForTimeout(150);
const raceHudHiddenAfterExit = await page.evaluate(() => document.getElementById('race-hud').classList.contains('hidden'));
console.log('race-hud hidden after exit:', raceHudHiddenAfterExit);

// now try the custom track generator
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelectorAll('#race-length-opts .race-opt-btn')[0].click());
await page.evaluate(() => document.querySelectorAll('#race-diff-opts .race-opt-btn')[2].click());
await page.evaluate(() => document.getElementById('race-custom-start').click());
await page.waitForTimeout(200);
const customDebug = await page.evaluate(() => window.__debug());
console.log('mode after custom race start:', customDebug.mode);
const customHudVisible = await page.evaluate(() => { window.__stepFrames(5); return !document.getElementById('race-hud').classList.contains('hidden'); });
console.log('custom race hud visible:', customHudVisible);

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
