import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
page.on('dialog', async (d) => { console.log('DIALOG:', d.message()); await d.dismiss(); });
await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => { document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));

function step(label, promise, ms = 25000) {
  return Promise.race([
    promise.then((v) => { console.log('OK:', label); return v; }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: ' + label)), ms)),
  ]);
}

for (let i = 0; i < 5; i++) {
  await step(`menu-race click ${i}`, page.evaluate(() => document.getElementById('menu-race').click()));
  await page.waitForTimeout(120);
  await step(`race-start-btn click ${i}`, page.evaluate((idx) => document.querySelectorAll('.race-start-btn')[idx].click(), i));
  await step(`stepFrames ${i}`, page.evaluate(() => window.__stepFrames(20)));
  const info = await step(`testRaceTheme ${i}`, page.evaluate(() => window.__testRaceTheme()));
  console.log(`race[${i}]`, JSON.stringify(info));
  await step(`screenshot ${i}`, page.screenshot({ path: `/tmp/race-theme-${i}.png` }));
  await step(`race-exit click ${i}`, page.evaluate(() => document.getElementById('race-exit').click()));
  await page.waitForTimeout(150);
}

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
