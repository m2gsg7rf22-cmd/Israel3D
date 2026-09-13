import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('[console] ' + msg.text()); });
page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));

function log(step) { console.log('OK:', step); }

await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
log('page loaded');

await page.evaluate(() => { document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);
log('created world');

await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(300);
const debugOk = await page.evaluate(() => !!window.__debug);
if (!debugOk) throw new Error('game did not boot into playable state');
log('entered world directly (no start screen)');

await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));

// garage + dealership
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(100);
await page.evaluate(() => document.getElementById('garage-car-spawn').click());
await page.evaluate(() => document.getElementById('garage-car-repair').click());
await page.evaluate(() => document.getElementById('garage-moto-spawn').click());
await page.evaluate(() => document.getElementById('garage-moto-repair').click());
log('garage buttons (spawn/repair car+moto)');
await page.evaluate(() => document.querySelector('.panel-close').click());

// map
await page.evaluate(() => document.getElementById('menu-map').click());
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('#panel-map .panel-close').click());
log('map panel open/close');

// mod shop
await page.evaluate(() => document.getElementById('menu-shop').click());
await page.waitForTimeout(100);
const shopRowCount = await page.evaluate(() => document.querySelectorAll('.shop-row').length);
if (shopRowCount !== 8) throw new Error('expected 8 shop rows (4 cats x 2 vehicles), got ' + shopRowCount);
await page.evaluate(() => document.querySelector('#panel-shop .panel-close').click());
log('mod shop panel (8 rows confirmed)');

// race panel
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(100);
const raceCount = await page.evaluate(() => document.querySelectorAll('.race-item').length);
if (raceCount !== 5) throw new Error('expected 5 races, got ' + raceCount);
await page.evaluate(() => document.querySelector('#panel-race .panel-close').click());
log('race panel (5 races confirmed)');

// settings: wardrobe, presets, touch size, police difficulty, mute, skip-time
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(100);
await page.evaluate(() => document.getElementById('settings-mute').click());
await page.evaluate(() => document.getElementById('settings-mute').click());
await page.evaluate(() => document.getElementById('settings-skip-time').click());
await page.evaluate(() => document.getElementById('settings-knife').click());
await page.evaluate(() => document.querySelectorAll('.size-btn')[2].click());
await page.evaluate(() => document.querySelectorAll('.diff-btn')[3].click());
log('settings buttons (mute/skip-time/knife-toggle/touch-size/difficulty)');
await page.evaluate(() => document.getElementById('settings-wardrobe').click());
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelectorAll('.preset-btn')[0].click());
await page.evaluate(() => document.querySelectorAll('.swatch')[0].click());
log('wardrobe presets + swatches');
await page.evaluate(() => document.querySelector('#panel-customizer .panel-close').click());

// pause menu -> resume, then -> back to world select
await page.evaluate(() => document.getElementById('btn-pause').click());
await page.waitForTimeout(100);
const pauseVisible = await page.evaluate(() => !document.getElementById('screen-pause').classList.contains('hidden'));
if (!pauseVisible) throw new Error('pause screen did not show');
await page.evaluate(() => document.getElementById('btn-resume').click());
log('pause -> resume');

// core gameplay: walk, punch, drive, jump
await page.evaluate(() => { window.__setKeys({ up: true }); window.__stepFrames(30); window.__setKeys({ up: false }); });
await page.evaluate(() => window.__pressPunch());
await page.evaluate(() => window.__pressSpace());
await page.evaluate(() => window.__stepFrames(20));
await page.evaluate(() => window.__forceMode('car'));
await page.evaluate(() => { window.__setKeys({ up: true }); window.__stepFrames(60); window.__setKeys({ up: false }); });
log('core gameplay (walk/punch/jump/drive)');

const finalDebug = await page.evaluate(() => window.__debug());
console.log('final state sanity: mode=' + finalDebug.mode + ' cash=' + finalDebug.cash + ' peds=' + finalDebug.pedCount);

console.log('TOTAL ERRORS:', errors.length);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
