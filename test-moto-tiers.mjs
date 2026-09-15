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

await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(100);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => {
    document.getElementById('cheat-input').value = 'CASH100K';
    document.getElementById('cheat-submit').click();
  });
}
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(150);
const motoRows = await page.evaluate(() => document.querySelectorAll('#moto-dealership-list .dealer-item').length);
console.log('moto dealer rows:', motoRows);

// buy the sport tier, by name (row order shifts once the active row has no button)
await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('#moto-dealership-list .dealer-item'));
  const sportItem = items.find((i) => i.querySelector('.dealer-name')?.textContent === 'Apex R Sport');
  sportItem?.querySelector('.dealer-btn')?.click();
});
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('#panel-garage .panel-close').click());

// force into moto mode, verify top speed changed to sport's maxV (31, vs street's 24)
await page.evaluate(() => { window.__forceMode('moto'); window.__setVehiclePos('moto', 0, 0, 0, 0); });
const paramsAfterBuy = await page.evaluate(() => window.__debug().motoParams);
console.log('motoParams right after buying sport (accel/maxV/brake should differ from the street defaults 26/24/-30):', JSON.stringify(paramsAfterBuy));
await page.evaluate(() => window.__setKeys({ up: true }));
// stop well before the moto could reach a building at this speed/heading
await page.evaluate(() => window.__stepFrames(220));
const d = await page.evaluate(() => window.__debug().moto);
console.log('sport moto speed after ~3.7s full throttle (should clearly exceed street\'s 24 cap):', d.speed);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
