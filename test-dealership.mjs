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
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(150);
let items = await page.evaluate(() => Array.from(document.querySelectorAll('.dealer-item')).map(i => ({
  name: i.querySelector('.dealer-name').textContent,
  btnText: i.querySelector('.dealer-btn')?.textContent,
  active: !!i.querySelector('.world-active-badge'),
})));
console.log('dealership items (initial, gated by price only -- every tier should show a buy price, none locked):', JSON.stringify(items));

// buying tier 2 without enough cash should fail (no change) -- price-only
// gating means the button is always there, but spendCash_ itself refuses
await page.evaluate(() => document.querySelectorAll('.dealer-btn')[0].click());
items = await page.evaluate(() => Array.from(document.querySelectorAll('.dealer-item')).map(i => !!i.querySelector('.world-active-badge')));
console.log('active flags after failed buy (tier1 should stay active, no cash yet):', JSON.stringify(items));

// give cash and buy tier 2 -- no level requirement to satisfy anymore
await page.evaluate(() => window.__testAddCash(10000));
await page.evaluate(() => document.getElementById('menu-garage').click()); // reopen to re-render with fresh cash display
await page.evaluate(() => document.querySelectorAll('.dealer-btn')[0].click());
items = await page.evaluate(() => Array.from(document.querySelectorAll('.dealer-item')).map(i => ({ btnText: i.querySelector('.dealer-btn')?.textContent, active: !!i.querySelector('.world-active-badge') })));
console.log('items after buying tier2:', JSON.stringify(items));

const d = await page.evaluate(() => window.__debug());
console.log('car color after tier switch (procedural fallback) -- car params maxV should now be tier2 value ~28ish scaled by upgrades');

// mod shop: check 4 categories present and upgrade cost reflects tier2 multiplier
await page.evaluate(() => document.getElementById('menu-shop').click());
await page.waitForTimeout(150);
const shopRows = await page.evaluate(() => Array.from(document.querySelectorAll('.shop-row[data-kind="car"]')).map(r => ({ key: r.dataset.key, btn: r.querySelector('.shop-buy').textContent })));
console.log('car shop rows:', JSON.stringify(shopRows));

// buy topSpeed level once, verify boost meter appears while driving
await page.evaluate(() => document.querySelector('.shop-row[data-kind="car"][data-key="boost"] .shop-buy').click());
await page.evaluate(() => window.__forceMode('car'));
await page.evaluate(() => window.__setVehiclePos('car', 0, 0, 0, 0));
await page.evaluate(() => window.__setKeys({ up: true, shift: true }));
await page.evaluate(() => window.__stepFrames(60));
const boostVisible = await page.evaluate(() => !document.getElementById('boost-hud').classList.contains('hidden'));
const boostWidth = await page.evaluate(() => document.getElementById('boost-fill').style.width);
console.log('boost hud visible:', boostVisible, 'boost fill width after boosting 1s:', boostWidth);

console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
