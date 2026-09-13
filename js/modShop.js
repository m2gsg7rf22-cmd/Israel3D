// Mod Shop: 4 performance categories (top speed, braking, grip, boost),
// levels 0-6, paid for out of the same cash balance missions.js pays into.
// Pricing scales with which car tier (from the dealership) is currently
// active -- the cheap starter car's upgrades cost roughly ₪1,000-10,000,
// the endgame hypercar's cost roughly ₪25,000-50,000, matching how a real
// tuning shop would price parts for a cheap vs. an exotic car.
import { getSave, saveState } from './saveSystem.js';

const UPGRADE_DEFS = [
  { key: 'topSpeed', label: "מהירות מקס'" },
  { key: 'braking', label: 'בלימה' },
  { key: 'grip', label: 'אחיזת כביש' },
  { key: 'boost', label: 'בוסט (Shift)' },
];
const MAX_LEVEL = 6;
const PER_LEVEL_BONUS = 0.09;

const base = { car: null, moto: null };
const params = { car: null, moto: null };
let getScore_, spendCash_, panelEl_, badgeEl_, getCarTierMultiplier_;

function levelsFor(kind) {
  const save = getSave();
  return kind === 'car' ? save.carUpgrades : save.motoUpgrades;
}

function costFor(kind, level) {
  const tierMul = kind === 'car' && getCarTierMultiplier_ ? getCarTierMultiplier_() : 1;
  return Math.round((1000 + level * 1200) * tierMul);
}

function applyAll() {
  for (const kind of ['car', 'moto']) {
    const levels = levelsFor(kind);
    const p = params[kind], b = base[kind];
    const topSpeedLvl = levels.topSpeed || 0, brakingLvl = levels.braking || 0, gripLvl = levels.grip || 0, boostLvl = levels.boost || 0;
    p.maxV = b.maxV * (1 + topSpeedLvl * PER_LEVEL_BONUS);
    p.brake = b.brake * (1 + brakingLvl * PER_LEVEL_BONUS);
    p.steerSpeed = b.steerSpeed * (1 + gripLvl * PER_LEVEL_BONUS);
    p.boostLevel = boostLvl;
  }
}

function buy(kind, key) {
  const save = getSave();
  const levels = kind === 'car' ? { ...save.carUpgrades } : { ...save.motoUpgrades };
  const lvl = levels[key] || 0;
  if (lvl >= MAX_LEVEL) return;
  if (!spendCash_(costFor(kind, lvl))) return;
  levels[key] = lvl + 1;
  saveState(kind === 'car' ? { carUpgrades: levels } : { motoUpgrades: levels });
  applyAll();
  refreshShopPanel();
}

export function initModShop(panelEl, { carParams, motoParams, getScore, spendCash, badgeEl, getCarTierMultiplier }) {
  panelEl_ = panelEl;
  badgeEl_ = badgeEl;
  params.car = carParams;
  params.moto = motoParams;
  base.car = { ...carParams };
  base.moto = { ...motoParams };
  getScore_ = getScore;
  spendCash_ = spendCash;
  getCarTierMultiplier_ = getCarTierMultiplier;
  applyAll();

  panelEl.querySelectorAll('.shop-buy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-kind]');
      buy(row.dataset.kind, row.dataset.key);
    });
  });
  refreshShopBadge();
}

// called after a dealership purchase/switch changes the car's base stats,
// so upgrade percentages recompute off the new tier's base numbers
export function setCarBase(carParams) {
  base.car = { ...carParams };
  applyAll();
}

function computeAffordable() {
  const cash = getScore_ ? getScore_() : 0;
  for (const kind of ['car', 'moto']) {
    const levels = levelsFor(kind);
    for (const def of UPGRADE_DEFS) {
      const lvl = levels[def.key] || 0;
      if (lvl < MAX_LEVEL && cash >= costFor(kind, lvl)) return true;
    }
  }
  return false;
}

export function refreshShopBadge() {
  if (badgeEl_) badgeEl_.classList.toggle('hidden', !computeAffordable());
}

export function refreshShopPanel() {
  if (!panelEl_) return;
  const cash = getScore_ ? getScore_() : 0;
  panelEl_.querySelector('#shop-cash').textContent = '₪' + cash;
  for (const kind of ['car', 'moto']) {
    const levels = levelsFor(kind);
    for (const def of UPGRADE_DEFS) {
      const lvl = levels[def.key] || 0;
      const row = panelEl_.querySelector(`[data-kind="${kind}"][data-key="${def.key}"]`);
      if (!row) continue;
      row.querySelector('.shop-level').textContent = `Lv ${lvl}/${MAX_LEVEL}`;
      const btn = row.querySelector('.shop-buy');
      if (lvl >= MAX_LEVEL) {
        btn.textContent = 'מקסימום';
        btn.disabled = true;
      } else {
        const cost = costFor(kind, lvl);
        btn.textContent = `שדרג — ₪${cost}`;
        btn.disabled = cash < cost;
      }
    }
  }
  refreshShopBadge();
}
