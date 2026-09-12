// Car Dealership: 5 unlockable car tiers. This build has exactly one real
// licensed car model (the Ferrari sample glTF) plus its procedural
// fallback, not five separate models -- so tiers are differentiated
// honestly by body color and base performance stats (accel/top speed/
// braking) rather than pretending five distinct 3D cars exist. Prices
// match the requested economy; the "required level" from the spec is
// dropped since this build has no separate XP/level system, only cash --
// price alone gates each tier.
import { getSave, saveState } from './saveSystem.js';
import { setCarBase } from './modShop.js';

export const CAR_TIERS = [
  { tier: 1, name: 'Urban Hatch', price: 2000, color: '#5aa9e6', accel: 16, maxV: 24, brake: -24 },
  { tier: 2, name: 'Street Cruiser', price: 7500, color: '#e6b85a', accel: 19, maxV: 28, brake: -27 },
  { tier: 3, name: 'Muscle V8', price: 18000, color: '#c0392b', accel: 23, maxV: 33, brake: -30 },
  { tier: 4, name: 'Apex GT', price: 45000, color: '#2ecc71', accel: 27, maxV: 39, brake: -34 },
  { tier: 5, name: 'Hyperion Hypercar', price: 120000, color: '#f1c40f', accel: 32, maxV: 46, brake: -38 },
];
// tier 1 is the free starter car, already owned
export const TIER_COST_MULTIPLIER = [1, 2, 3.5, 6, 9];

let carRig_, carState_, spendCash_, panelEl_;

function tierDef(id) { return CAR_TIERS.find((t) => t.tier === id); }

function applyTierVisualsAndStats(tier) {
  const def = tierDef(tier);
  if (!def) return;
  carRig_.group.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.set(def.color); });
  const newBase = { accel: def.accel, maxV: def.maxV, brake: def.brake };
  Object.assign(carState_.CAR_PARAMS, newBase);
  setCarBase(carState_.CAR_PARAMS);
}

export function getActiveTierCostMultiplier() {
  const save = getSave();
  const idx = CAR_TIERS.findIndex((t) => t.tier === save.activeCarTier);
  return TIER_COST_MULTIPLIER[idx >= 0 ? idx : 0];
}

export function initDealership(panelEl, { carRig, carParams, spendCash }) {
  panelEl_ = panelEl;
  carRig_ = carRig;
  carState_ = { CAR_PARAMS: carParams };
  spendCash_ = spendCash;
  applyTierVisualsAndStats(getSave().activeCarTier);
}

function buyOrSelectTier(tier) {
  const save = getSave();
  const owned = save.ownedCarTiers.includes(tier);
  if (!owned) {
    const def = tierDef(tier);
    if (!spendCash_(def.price)) return false;
    saveState({ ownedCarTiers: [...save.ownedCarTiers, tier] });
  }
  saveState({ activeCarTier: tier });
  applyTierVisualsAndStats(tier);
  return true;
}

export function renderDealership() {
  if (!panelEl_) return;
  const listEl = panelEl_.querySelector('#dealership-list');
  const save = getSave();
  listEl.innerHTML = '';
  for (const def of CAR_TIERS) {
    const owned = save.ownedCarTiers.includes(def.tier);
    const active = save.activeCarTier === def.tier;
    const item = document.createElement('div');
    item.className = 'dealer-item';
    item.innerHTML = `
      <div class="dealer-swatch" style="background:${def.color}"></div>
      <div class="dealer-info">
        <div class="dealer-name"></div>
        <div class="dealer-stats">האצה ${def.accel} • מהירות ${def.maxV} • בלימה ${Math.abs(def.brake)}</div>
      </div>
      ${active ? '<span class="world-active-badge">פעיל</span>' : `<button class="dealer-btn" type="button">${owned ? 'בחר' : '₪' + def.price.toLocaleString()}</button>`}
    `;
    item.querySelector('.dealer-name').textContent = def.name;
    const btn = item.querySelector('.dealer-btn');
    if (btn) btn.addEventListener('click', () => { if (buyOrSelectTier(def.tier)) renderDealership(); });
    listEl.appendChild(item);
  }
}
