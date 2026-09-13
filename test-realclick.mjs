import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => console.log('[console.' + msg.type() + ']', msg.text()));
page.on('pageerror', (err) => { errors.push(err.message); console.log('[pageerror]', err.message); });

const t0 = Date.now();
await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
console.log('page load event at', Date.now() - t0, 'ms');

// don't wait at all -- click immediately, as fast as a real impatient user might
try {
  await page.click('#btn-start', { timeout: 15000 });
  console.log('real click succeeded at', Date.now() - t0, 'ms');
} catch (e) {
  console.log('real click FAILED:', e.message);
}

const screenHidden = await page.evaluate(() => document.getElementById('screen-start').classList.contains('hidden'));
console.log('screen-start hidden after click:', screenHidden);
const debugAvailable = await page.evaluate(() => typeof window.__debug === 'function');
console.log('window.__debug available:', debugAvailable);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
