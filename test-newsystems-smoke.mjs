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

// garage panel: neon/rims swatches + air dealership list
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(100);
const neonSwatches = await page.evaluate(() => document.querySelectorAll('#car-neon-row .swatch').length);
const rimSwatches = await page.evaluate(() => document.querySelectorAll('#car-rims-row .swatch').length);
const airRows = await page.evaluate(() => document.querySelectorAll('#air-dealership-list .dealer-item').length);
console.log('neonSwatches', neonSwatches, 'rimSwatches', rimSwatches, 'airRows', airRows);
await page.evaluate(() => document.querySelectorAll('#car-neon-row .swatch')[1].click());
await page.evaluate(() => document.querySelectorAll('#car-rims-row .swatch')[1].click());
await page.evaluate(() => document.querySelector('#panel-garage .panel-close').click());

// give cash via the cheat-code voucher system (real UI path, not a test-only
// backdoor), buy an air tier, verify ownership + entering it doesn't crash
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(100);
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    document.getElementById('cheat-input').value = 'CASH100K';
    document.getElementById('cheat-submit').click();
  });
}
const cashAfterAdd = await page.evaluate(() => window.__debug().cash);
console.log('cash after vouchers:', cashAfterAdd);
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(100);
await page.evaluate(() => {
  const rows = document.querySelectorAll('#air-dealership-list .dealer-item .dealer-btn');
  if (rows[0]) rows[0].click();
});
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('#panel-garage .panel-close').click());

// force wanted level to trigger the police helicopter, step frames, check for crash
await page.evaluate(() => { window.__testSetWanted && window.__testSetWanted(5); });
await page.evaluate(() => window.__stepFrames(120));
const afterHeli = await page.evaluate(() => window.__debug());
console.log('wanted after set:', afterHeli.wanted, 'policeCars:', afterHeli.policeCars);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
