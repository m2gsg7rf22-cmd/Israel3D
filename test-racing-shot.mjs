import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => document.getElementById('btn-start').click());
await page.waitForTimeout(300);

await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-race').click());
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/race-panel.png' });

await page.evaluate(() => document.querySelectorAll('.race-start-btn')[1].click());
await page.evaluate(() => { window.__setKeys({ up: true }); window.__stepFrames(60); });
await page.screenshot({ path: '/tmp/race-active.png' });

await browser.close();
