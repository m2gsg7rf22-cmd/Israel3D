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
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(150);

function applyCode(page, code) {
  return page.evaluate((c) => {
    document.getElementById('cheat-input').value = c;
    document.getElementById('cheat-submit').click();
    return document.getElementById('cheat-msg').textContent;
  }, code);
}

// wrong world-admin code (this is the 1st world created -> only MERIDIAN-ALPHA works)
console.log('wrong-slot admin code (MERIDIAN-BRAVO on 1st world):', await applyCode(page, 'MERIDIAN-BRAVO'));
console.log('admin controls hidden before correct code:', await page.evaluate(() => document.getElementById('admin-controls').classList.contains('hidden')));

// correct world-admin code for the first-ever world
console.log('correct-slot admin code (MERIDIAN-ALPHA):', await applyCode(page, 'MERIDIAN-ALPHA'));
console.log('admin controls visible after correct code:', await page.evaluate(() => !document.getElementById('admin-controls').classList.contains('hidden')));

// infinite money: spend a huge amount via the mod shop-style spendCash path
const afterAdmin = await page.evaluate(() => { window.__forceMode('car'); return window.__testAddCash(0); });
console.log('cash right after admin unlock (should still work normally, addCash still adds):', afterAdmin);
const spendResult = await page.evaluate(() => window.__testSpendCash ? window.__testSpendCash(999999999) : 'no-hook');
console.log('spend huge amount while admin unlocked:', spendResult);

// car code -- the Ferrari model is a real multi-MB glTF, give it real time
// to finish loading in this sandbox's slow software-rendered chromium
// before checking whether it actually swapped in
console.log('car code (CAR-HYPERION):', await applyCode(page, 'CAR-HYPERION'));
await page.waitForTimeout(20000);
const carInfo = await page.evaluate(() => window.__testCarModelInfo ? window.__testCarModelInfo() : null);
console.log('car model info after CAR-HYPERION (20s later):', JSON.stringify(carInfo));

// voucher code
console.log('voucher code (CASH50K):', await applyCode(page, 'CASH50K'));

// unknown code
console.log('unknown code:', await applyCode(page, 'NOT-A-REAL-CODE'));

// invisible toggle -- fly mode's own double-tap-jump mechanic has its own
// dedicated test (test-fly-doubletap.mjs), not repeated here
await page.evaluate(() => window.__forceMode('foot'));
await page.evaluate(() => document.getElementById('admin-invisible-toggle').click());

const wantedAfterInvisible = await page.evaluate(() => { window.__testForceArrest ? null : null; return window.__debug().wanted; });
console.log('wanted level with invisibility on (should be 0 regardless):', wantedAfterInvisible);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
