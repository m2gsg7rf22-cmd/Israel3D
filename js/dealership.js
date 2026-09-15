// Car Dealership: 5 unlockable car tiers, each a genuinely different 3D
// model (see vehicleController.js's CAR_MODELS) rather than one mesh
// recolored -- ToyCar, CesiumMilkTruck, CarConcept and Buggy (Khronos glTF
// sample assets) for tiers 1-4, and the project's own Ferrari sample as the
// tier-5 flagship. Body color is still applied per tier/choice on top of
// whichever model is active, via the rig's own applyColor() so it reliably
// survives the async model swap (see vehicleController.js's comment on why
// that used to silently fail).
import { getSave, saveState } from './saveSystem.js';
import { setCarBase, setMotoBase } from './modShop.js';
import { swapCarModel, CAR_MODELS, MOTO_TIERS } from './vehicleController.js';

// gated by price alone -- no player-level requirement, so any tier is
// available to buy the moment you can afford it
export const CAR_TIERS = [
  { tier: 1, name: 'Urban Hatch', price: 2000, color: '#5aa9e6', accel: 16, maxV: 24, brake: -24 },
  { tier: 2, name: 'Street Cruiser', price: 7500, color: '#e6b85a', accel: 19, maxV: 28, brake: -27 },
  { tier: 3, name: 'Muscle V8', price: 18000, color: '#c0392b', accel: 23, maxV: 33, brake: -30 },
  { tier: 4, name: 'Apex GT', price: 45000, color: '#2ecc71', accel: 27, maxV: 39, brake: -34 },
  { tier: 5, name: 'Hyperion Hypercar', price: 120000, color: '#f1c40f', accel: 32, maxV: 46, brake: -38 },
];
// tier 1 is the free starter car, already owned
export const TIER_COST_MULTIPLIER = [1, 2, 3.5, 6, 9];

let THREE_, carRig_, carParams_, motoRig_, motoParams_, spendCash_, panelEl_;
// buildCar() in vehicleController.js already loads CAR_MODELS[0] (tier 1)
// by default before this module ever runs, so starting this at that same
// tier avoids redundantly reloading the identical model a second time the
// instant initDealership() applies the saved tier
let currentTier_ = CAR_MODELS[0].tier;

function tierDef(id) { return CAR_TIERS.find((t) => t.tier === id); }
function modelFor(id) { return CAR_MODELS.find((m) => m.tier === id); }

function applyTierVisualsAndStats(tier, color) {
  const def = tierDef(tier);
  if (!def) return;
  if (tier !== currentTier_) {
    currentTier_ = tier;
    const modelConfig = modelFor(tier);
    if (modelConfig) swapCarModel(THREE_, carRig_, modelConfig);
  }
  carRig_.applyColor(color || def.color);
  const newBase = { accel: def.accel, maxV: def.maxV, brake: def.brake };
  Object.assign(carParams_, newBase);
  setCarBase(carParams_);
}

export function getActiveTierCostMultiplier() {
  const save = getSave();
  const idx = CAR_TIERS.findIndex((t) => t.tier === save.activeCarTier);
  return TIER_COST_MULTIPLIER[idx >= 0 ? idx : 0];
}

export function initDealership(panelEl, { THREE, carRig, carParams, motoRig, motoParams, spendCash }) {
  panelEl_ = panelEl;
  THREE_ = THREE;
  carRig_ = carRig;
  carParams_ = carParams;
  motoRig_ = motoRig;
  motoParams_ = motoParams;
  spendCash_ = spendCash;
  const save = getSave();
  applyTierVisualsAndStats(save.activeCarTier, save.carColor);
  if (save.carNeon) carRig_.setNeon(save.carNeon);
  if (save.carRims) carRig_.applyRimColor(save.carRims);
  applyMotoTierVisualsAndStats(save.activeMotoTier);
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

export function setCarColor(color) {
  saveState({ carColor: color });
  carRig_.applyColor(color);
}

export function setCarNeon(color) {
  saveState({ carNeon: color || null });
  carRig_.setNeon(color || null);
}

export function setCarRims(color) {
  saveState({ carRims: color || null });
  carRig_.applyRimColor(color || null);
}

// a cheat-code car unlock: same end state as buying the tier (owned +
// active), but skips the level/price gate entirely -- used by cheatCodes.js
export function grantCarTier(tier) {
  const save = getSave();
  if (!tierDef(tier)) return false;
  if (!save.ownedCarTiers.includes(tier)) {
    saveState({ ownedCarTiers: [...save.ownedCarTiers, tier] });
  }
  saveState({ activeCarTier: tier });
  applyTierVisualsAndStats(tier);
  return true;
}

// Air vehicles: unlike the 5 car tiers (one model, re-skinned per tier),
// there's exactly one airplane model and one helicopter model -- so "tiers"
// here just means "own the plane" / "own the helicopter", each its own
// permanent unlock rather than a swappable line of models. Priced within
// the spec's stated ranges (airplane ₪80k-250k, helicopter ₪150k-300k) but
// gated by cash alone, same as the cars (no player-level requirement).
export const AIR_TIERS = [
  { key: 'plane', name: 'Skyhawk Cruiser (מטוס)', price: 120000, kind: 'airplane', desc: 'מטוס — דורש מהירות המראה' },
  { key: 'heli', name: 'Bay Ranger (מסוק)', price: 200000, kind: 'helicopter', desc: 'מסוק — טיסה אנכית (VTOL)' },
];

function airDef(key) { return AIR_TIERS.find((t) => t.key === key); }

function buyOrSelectAir(key) {
  const save = getSave();
  const owned = save.ownedAirTiers.includes(key);
  if (!owned) {
    const def = airDef(key);
    if (!spendCash_(def.price)) return false;
    saveState({ ownedAirTiers: [...save.ownedAirTiers, key] });
  }
  saveState({ activeAirTier: key });
  return true;
}

// cheat-code unlock for an air vehicle, mirroring grantCarTier()
export function grantAirTier(key) {
  const save = getSave();
  if (!airDef(key)) return false;
  if (!save.ownedAirTiers.includes(key)) saveState({ ownedAirTiers: [...save.ownedAirTiers, key] });
  saveState({ activeAirTier: key });
  return true;
}

// Renders one air-vehicle category into its own container -- aircraft and
// helicopters used to share a single combined list, but the catalog is
// supposed to be 4 strictly separate categories (Cars/Motorcycles/
// Aircraft/Helicopters), each showing only its own vehicles.
function renderAirCategory(listId, kind) {
  if (!panelEl_) return;
  const listEl = panelEl_.querySelector(listId);
  if (!listEl) return;
  const save = getSave();
  listEl.innerHTML = '';
  for (const def of AIR_TIERS.filter((t) => t.kind === kind)) {
    const owned = save.ownedAirTiers.includes(def.key);
    const active = save.activeAirTier === def.key;
    const item = document.createElement('div');
    item.className = 'dealer-item';
    const action = active
      ? '<span class="world-active-badge">פעיל</span>'
      : `<button class="dealer-btn" type="button">${owned ? 'בחר' : '₪' + def.price.toLocaleString()}</button>`;
    item.innerHTML = `
      <div class="dealer-swatch" style="background:${def.kind === 'airplane' ? '#c0392b' : '#2e6b8f'}"></div>
      <div class="dealer-info">
        <div class="dealer-name"></div>
        <div class="dealer-stats"></div>
      </div>
      ${action}
    `;
    item.querySelector('.dealer-name').textContent = def.name;
    item.querySelector('.dealer-stats').textContent = def.desc;
    const btn = item.querySelector('.dealer-btn');
    if (btn) btn.addEventListener('click', () => { if (buyOrSelectAir(def.key)) renderAirCategory(listId, kind); });
    listEl.appendChild(item);
  }
}
export function renderAircraftDealership() { renderAirCategory('#aircraft-dealership-list', 'airplane'); }
export function renderHelicopterDealership() { renderAirCategory('#helicopter-dealership-list', 'helicopter'); }

// Motorcycles: 3 genuinely different tiers (street/sport/off-road), see
// MOTO_TIERS in vehicleController.js for the physics + visual differences.
// Same owned/active/price-gated pattern as the car tiers.
function motoTierDef(tier) { return MOTO_TIERS.find((t) => t.tier === tier); }

function applyMotoTierVisualsAndStats(tier) {
  const def = motoTierDef(tier);
  if (!def || !motoRig_) return;
  motoRig_.setMotoTier(def.kind);
  motoRig_.applyColor(def.color);
  const newBase = { accel: def.accel, maxV: def.maxV, brake: def.brake, steerBase: def.steerBase, steerSpeed: def.steerSpeed, turnDenom: def.turnDenom, drag: def.drag };
  Object.assign(motoParams_, newBase);
  setMotoBase(motoParams_);
}

function buyOrSelectMotoTier(tier) {
  const save = getSave();
  const owned = save.ownedMotoTiers.includes(tier);
  if (!owned) {
    const def = motoTierDef(tier);
    if (!spendCash_(def.price)) return false;
    saveState({ ownedMotoTiers: [...save.ownedMotoTiers, tier] });
  }
  saveState({ activeMotoTier: tier });
  applyMotoTierVisualsAndStats(tier);
  return true;
}

// cheat-code unlock, mirroring grantCarTier()
export function grantMotoTier(tier) {
  const save = getSave();
  if (!motoTierDef(tier)) return false;
  if (!save.ownedMotoTiers.includes(tier)) saveState({ ownedMotoTiers: [...save.ownedMotoTiers, tier] });
  saveState({ activeMotoTier: tier });
  applyMotoTierVisualsAndStats(tier);
  return true;
}

export function renderMotoDealership() {
  if (!panelEl_) return;
  const listEl = panelEl_.querySelector('#moto-dealership-list');
  if (!listEl) return;
  const save = getSave();
  listEl.innerHTML = '';
  for (const def of MOTO_TIERS) {
    const owned = save.ownedMotoTiers.includes(def.tier);
    const active = save.activeMotoTier === def.tier;
    const item = document.createElement('div');
    item.className = 'dealer-item';
    const action = active
      ? '<span class="world-active-badge">פעיל</span>'
      : `<button class="dealer-btn" type="button">${owned ? 'בחר' : '₪' + def.price.toLocaleString()}</button>`;
    item.innerHTML = `
      <div class="dealer-swatch" style="background:${def.color}"></div>
      <div class="dealer-info">
        <div class="dealer-name"></div>
        <div class="dealer-stats">האצה ${def.accel} • מהירות ${def.maxV} • בלימה ${Math.abs(def.brake)}</div>
      </div>
      ${action}
    `;
    item.querySelector('.dealer-name').textContent = def.name;
    const btn = item.querySelector('.dealer-btn');
    if (btn) btn.addEventListener('click', () => { if (buyOrSelectMotoTier(def.tier)) renderMotoDealership(); });
    listEl.appendChild(item);
  }
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
    const action = active
      ? '<span class="world-active-badge">פעיל</span>'
      : `<button class="dealer-btn" type="button">${owned ? 'בחר' : '₪' + def.price.toLocaleString()}</button>`;
    item.innerHTML = `
      <div class="dealer-swatch" style="background:${def.color}"></div>
      <div class="dealer-info">
        <div class="dealer-name"></div>
        <div class="dealer-stats">האצה ${def.accel} • מהירות ${def.maxV} • בלימה ${Math.abs(def.brake)}</div>
      </div>
      ${action}
    `;
    item.querySelector('.dealer-name').textContent = def.name;
    const btn = item.querySelector('.dealer-btn');
    if (btn) btn.addEventListener('click', () => { if (buyOrSelectTier(def.tier)) renderDealership(); });
    listEl.appendChild(item);
  }
}
