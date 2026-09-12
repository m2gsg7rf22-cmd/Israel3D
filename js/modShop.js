// Mod Shop: 3 upgrades per vehicle (engine/top speed/handling), 3 levels
// each, paid for out of the same cash balance missions.js pays into. Levels
// persist via saveSystem and are re-applied on load. This is a simplified
// stand-in for the full 20-vehicle garage/catalog economy the original spec
// asked for -- both vehicles already exist in the world, so "shopping" here
// means upgrading them in place rather than buying new ones.
import { getSave, saveState } from './saveSystem.js';

const UPGRADE_DEFS = [
  { key: 'accel', label: 'מנוע (תאוצה)' },
  { key: 'maxV', label: "מהירות מקס'" },
  { key: 'steerSpeed', label: 'שליטה בהיגוי' },
];
const MAX_LEVEL = 3;
const PER_LEVEL_BONUS = 0.15;
function costFor(level) { return 3000 + level * 3500; }

const base = { car: null, moto: null };
const params = { car: null, moto: null };
let getScore_, spendCash_, panelEl_, badgeEl_;

function levelsFor(kind) {
  const save = getSave();
  return kind === 'car' ? save.carUpgrades : save.motoUpgrades;
}

function applyAll() {
  for (const kind of ['car', 'moto']) {
    const levels = levelsFor(kind);
    for (const def of UPGRADE_DEFS) {
      const lvl = levels[def.key] || 0;
      params[kind][def.key] = base[kind][def.key] * (1 + lvl * PER_LEVEL_BONUS);
    }
  }
}

function buy(kind, key) {
  const save = getSave();
  const levels = kind === 'car' ? { ...save.carUpgrades } : { ...save.motoUpgrades };
  const lvl = levels[key] || 0;
  if (lvl >= MAX_LEVEL) return;
  if (!spendCash_(costFor(lvl))) return;
  levels[key] = lvl + 1;
  saveState(kind === 'car' ? { carUpgrades: levels } : { motoUpgrades: levels });
  applyAll();
  refreshShopPanel();
}

export function initModShop(panelEl, { carParams, motoParams, getScore, spendCash, badgeEl }) {
  panelEl_ = panelEl;
  badgeEl_ = badgeEl;
  params.car = carParams;
  params.moto = motoParams;
  base.car = { ...carParams };
  base.moto = { ...motoParams };
  getScore_ = getScore;
  spendCash_ = spendCash;
  applyAll();

  panelEl.querySelectorAll('.shop-buy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-kind]');
      buy(row.dataset.kind, row.dataset.key);
    });
  });
  refreshShopBadge();
}

function computeAffordable() {
  const cash = getScore_ ? getScore_() : 0;
  for (const kind of ['car', 'moto']) {
    const levels = levelsFor(kind);
    for (const def of UPGRADE_DEFS) {
      const lvl = levels[def.key] || 0;
      if (lvl < MAX_LEVEL && cash >= costFor(lvl)) return true;
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
        const cost = costFor(lvl);
        btn.textContent = `שדרג — ₪${cost}`;
        btn.disabled = cash < cost;
      }
    }
  }
  refreshShopBadge();
}
