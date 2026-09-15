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

// give enough cash to cross the 100k achievement threshold, then advance
// game time deterministically (not real wall-clock, which this sandbox's
// slow software rendering makes unreliable -- see dt clamping in loop())
// past the 1.5s achievement-check timer
await page.evaluate(() => window.__setRunning(false));
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.waitForTimeout(100);
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => { document.getElementById('cheat-input').value = 'CASH100K'; document.getElementById('cheat-submit').click(); });
}
await page.evaluate(() => window.__stepFrames(200, 20));

const unlocked = await page.evaluate(() => {
  const raw = Object.keys(localStorage).find(k => k.startsWith('openCity.save.'));
  return raw ? JSON.parse(localStorage.getItem(raw)).unlockedAchievements : null;
});
console.log('unlocked achievements:', unlocked);
console.log('PASS:', Array.isArray(unlocked) && unlocked.includes('cash100k'));

// reload and confirm it stays unlocked (doesn't re-fire/reset)
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
const unlockedAfterReload = await page.evaluate(() => {
  const raw = Object.keys(localStorage).find(k => k.startsWith('openCity.save.'));
  return raw ? JSON.parse(localStorage.getItem(raw)).unlockedAchievements : null;
});
console.log('still unlocked after reload:', unlockedAfterReload);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
