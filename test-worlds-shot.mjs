import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/worlds-empty.png' });

await page.evaluate(() => { document.getElementById('world-new-name').value = 'העיר שלי'; document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);
await page.evaluate(() => { document.getElementById('world-new-name').value = 'משחק שני'; document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/worlds-list.png' });
await browser.close();
