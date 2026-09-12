import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await page.evaluate(() => { document.getElementById('world-new-btn').click(); });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.world-info').click());
await page.waitForTimeout(300);

await page.evaluate(() => window.__testSetWanted(1));
await page.evaluate(() => window.__testMovePoliceCarNear(2));
await page.evaluate(() => window.__setCameraZoomTarget(9));

await page.evaluate(() => window.__stepFrames(30));
let d = await page.evaluate(() => window.__debug());
console.log('~0.5s progress:', d.prison.arrestProgress.toFixed(2));
await page.screenshot({ path: '/tmp/arrest-25pct.png' });

await page.evaluate(() => window.__stepFrames(90));
d = await page.evaluate(() => window.__debug());
console.log('~2s progress:', d.prison.arrestProgress.toFixed(2));
await page.screenshot({ path: '/tmp/arrest-50pct.png' });

await page.evaluate(() => window.__stepFrames(60));
d = await page.evaluate(() => window.__debug());
console.log('~3s progress:', d.prison.arrestProgress.toFixed(2), 'inPrison:', d.prison.inPrison);
await page.screenshot({ path: '/tmp/arrest-75pct.png' });

await browser.close();
