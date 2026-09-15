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

// airport zone should be clear of buildings
const airportBuildings = await page.evaluate(() => window.__nearbyBuildings(250, -250));
console.log('buildings near airfield (should be 0):', airportBuildings.length);

// downtown core (near map center, 0,0) should now include real skyscrapers
const downtownBuildings = await page.evaluate(() => window.__nearbyBuildings(0, 0));
console.log('buildings near city center:', downtownBuildings.length, JSON.stringify(downtownBuildings.slice(0, 3)));

// tallest building anywhere -- estimate height from AABB footprint count is
// not directly available (no height field), so instead sample the known
// landmark + a few other spots via a quick building-count/size sanity check
const totalBuildings = await page.evaluate(() => {
  let total = 0;
  for (let x = -260; x <= 260; x += 40) for (let z = -260; z <= 260; z += 40) total += window.__nearbyBuildings(x, z).length;
  return total;
});
console.log('rough building AABB sample count across the grid (sanity, not zero):', totalBuildings);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
