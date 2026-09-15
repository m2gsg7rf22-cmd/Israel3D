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
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    document.getElementById('cheat-input').value = 'CASH100K';
    document.getElementById('cheat-submit').click();
  });
}
await page.evaluate(() => document.getElementById('menu-garage').click());
await page.waitForTimeout(100);
await page.evaluate(() => {
  document.querySelectorAll('#aircraft-dealership-list .dealer-item .dealer-btn, #helicopter-dealership-list .dealer-item .dealer-btn').forEach((b) => b.click());
});
await page.evaluate(() => document.querySelector('#panel-garage .panel-close').click());

await page.evaluate(() => window.__setFootPos(250, -250, 0));
await page.evaluate(() => window.__pressF());
await page.evaluate(() => window.__stepFrames(5));

// throttle to build speed past stall, then hold space to climb
await page.evaluate(() => window.__setKeys({ up: true }));
await page.evaluate(() => window.__stepFrames(180));
await page.evaluate(() => window.__setKeys({ up: true, space: true }));
await page.evaluate(() => window.__stepFrames(120));
let d = await page.evaluate(() => window.__debug());
console.log('after climb 2s:', JSON.stringify(d.plane));

// now shift to descend
await page.evaluate(() => window.__setKeys({ up: true, space: false, shift: true }));
await page.evaluate(() => window.__stepFrames(180));
d = await page.evaluate(() => window.__debug());
console.log('after descend 3s:', JSON.stringify(d.plane));
await page.evaluate(() => window.__setKeys({ up: false, shift: false }));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
