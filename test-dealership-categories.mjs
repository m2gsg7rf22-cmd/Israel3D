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

await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(150);

const counts = await page.evaluate(() => ({
  cars: document.querySelectorAll('#dealership-list .dealer-item').length,
  motos: document.querySelectorAll('#moto-dealership-list .dealer-item').length,
  aircraft: document.querySelectorAll('#aircraft-dealership-list .dealer-item').length,
  helicopters: document.querySelectorAll('#helicopter-dealership-list .dealer-item').length,
}));
console.log('category counts:', JSON.stringify(counts));

const aircraftNames = await page.evaluate(() => Array.from(document.querySelectorAll('#aircraft-dealership-list .dealer-name')).map(e => e.textContent));
const heliNames = await page.evaluate(() => Array.from(document.querySelectorAll('#helicopter-dealership-list .dealer-name')).map(e => e.textContent));
console.log('aircraft list contains only planes:', aircraftNames, '-- helicopter list contains only helis:', heliNames);

// buy the aircraft, verify entering it as a plane works (real connection, not fake UI)
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(100);
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => { document.getElementById('cheat-input').value = 'CASH100K'; document.getElementById('cheat-submit').click(); });
}
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('#aircraft-dealership-list .dealer-btn')?.click());
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('#panel-garage .panel-close').click());
await page.evaluate(() => { window.__setFootPos(250, -250, 0); window.__pressF(); });
await page.evaluate(() => window.__stepFrames(5));
const mode = await page.evaluate(() => window.__debug().mode);
console.log('mode after buying aircraft-only and walking to plane spot:', mode, '(should be plane)');

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
