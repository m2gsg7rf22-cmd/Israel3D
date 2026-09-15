import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, hasTouch: true });
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
console.log('mode:', await page.evaluate(() => window.__debug().mode));

// simulate the joystick throttle via __setJoy (as a real touch would set it)
await page.evaluate(() => window.__setJoy(0, -1, true)); // push up = throttle forward
await page.evaluate(() => window.__stepFrames(180));
let d = await page.evaluate(() => window.__debug().plane);
console.log('after joystick-throttle 3s (speed should be well above 0):', JSON.stringify(d));

// simulate holding the t-jump button (real touchstart, not __setKeys) for ascend
await page.evaluate(() => {
  const btn = document.getElementById('t-jump');
  btn.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
});
await page.evaluate(() => window.__stepFrames(120));
d = await page.evaluate(() => window.__debug().plane);
console.log('after holding t-jump touch 2s (y should be > 0 if climb worked):', JSON.stringify(d));

// release t-jump, hold t-run for descend
await page.evaluate(() => {
  document.getElementById('t-jump').dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
  document.getElementById('t-run').dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
});
await page.evaluate(() => window.__stepFrames(180));
d = await page.evaluate(() => window.__debug().plane);
console.log('after holding t-run touch 3s (y should be lower / back toward 0):', JSON.stringify(d));
await page.evaluate(() => {
  document.getElementById('t-run').dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
  window.__setJoy(0, 0, false);
});

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
