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
await page.evaluate(() => window.__forceMode('foot'));
await page.evaluate(() => window.__setFootPos(0, 0, 0));

// before unlocking the world's admin code, a double-tap should just be two
// normal jumps -- never lift into fly mode
await page.evaluate(() => window.__pressSpace());
await page.evaluate(() => window.__stepFrames(6));
await page.evaluate(() => window.__pressSpace());
await page.evaluate(() => window.__stepFrames(20));
const beforeUnlock = await page.evaluate(() => window.__debug().foot);
console.log('double-tap before admin unlock (should NOT be flying -- y should follow normal jump arc, not climb far):', JSON.stringify(beforeUnlock));

// unlock this world's admin code (1st world ever created in a fresh profile -> MERIDIAN-ALPHA)
await page.evaluate(() => document.getElementById('side-menu').classList.remove('hidden'));
await page.evaluate(() => document.getElementById('menu-settings').click());
await page.evaluate(() => {
  document.getElementById('cheat-input').value = 'MERIDIAN-ALPHA';
  document.getElementById('cheat-submit').click();
});
console.log('cheat result:', await page.evaluate(() => document.getElementById('cheat-msg').textContent));
await page.evaluate(() => document.getElementById('panel-settings').querySelector('.panel-close').click());

// back on the ground, tap once (normal jump), then tap again while
// airborne, within the double-tap window -- should lift into fly mode
await page.evaluate(() => window.__setFootPos(0, 0, 0));
await page.evaluate(() => window.__stepFrames(3)); // let foot.grounded settle true
await page.evaluate(() => window.__pressSpace());
await page.evaluate(() => window.__stepFrames(6)); // still airborne from the jump arc
const midJump = await page.evaluate(() => window.__debug().foot);
console.log('mid-air after first tap (grounded should be false, not yet flying):', JSON.stringify(midJump));
await page.evaluate(() => window.__pressSpace());
await page.evaluate(() => window.__stepFrames(3));
const justLifted = await page.evaluate(() => window.__debug().foot);
console.log('right after the second tap (should now be flying):', JSON.stringify(justLifted));

// hold Space to climb
await page.evaluate(() => window.__setKeys({ space: true }));
await page.evaluate(() => window.__stepFrames(40));
const afterClimb = await page.evaluate(() => window.__debug().foot);
console.log('after holding Space 40 frames while flying (y should have climbed a lot):', JSON.stringify(afterClimb));
await page.evaluate(() => window.__setKeys({ space: false }));

// hold F to descend
await page.evaluate(() => window.__setKeys({ f: true }));
await page.evaluate(() => window.__stepFrames(60));
const afterDescend = await page.evaluate(() => window.__debug().foot);
console.log('after holding F 60 frames while flying (y should drop, possibly landing and ending flight):', JSON.stringify(afterDescend));
await page.evaluate(() => window.__setKeys({ f: false }));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
