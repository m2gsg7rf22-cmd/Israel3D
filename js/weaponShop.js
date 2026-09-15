// Weapons Shop: purchasable melee tools, each a real upgrade over fists --
// longer reach and a different wanted-level cost -- rather than reskins of
// the same punch. Same owned/active pattern as the car dealership.
import { getSave, saveState } from './saveSystem.js';

export const WEAPONS = [
  { key: 'fist', label: 'אגרופים', price: 0, range: 1.5, wantedBonus: 1 },
  { key: 'bat', label: 'אלת בייסבול', price: 800, range: 1.9, wantedBonus: 1 },
  { key: 'knife', label: 'סכין', price: 2500, range: 2.1, wantedBonus: 2 },
  { key: 'taser', label: 'טייזר', price: 6000, range: 2.4, wantedBonus: 2 },
];

let panelEl_, spendCash_;

function weaponDef(key) { return WEAPONS.find((w) => w.key === key); }

export function getActiveWeapon() {
  return weaponDef(getSave().activeWeapon) || WEAPONS[0];
}

function buyOrSelect(key) {
  const save = getSave();
  const owned = save.ownedWeapons.includes(key);
  if (!owned) {
    const def = weaponDef(key);
    if (!spendCash_(def.price)) return false;
    saveState({ ownedWeapons: [...save.ownedWeapons, key] });
  }
  saveState({ activeWeapon: key });
  return true;
}

export function initWeaponShop(panelEl, { spendCash }) {
  panelEl_ = panelEl;
  spendCash_ = spendCash;
}

export function renderWeaponShop() {
  if (!panelEl_) return;
  const listEl = panelEl_.querySelector('#weapon-list');
  const save = getSave();
  listEl.innerHTML = '';
  for (const def of WEAPONS) {
    const owned = save.ownedWeapons.includes(def.key);
    const active = save.activeWeapon === def.key;
    const item = document.createElement('div');
    item.className = 'dealer-item';
    const action = active
      ? '<span class="world-active-badge">פעיל</span>'
      : `<button class="dealer-btn" type="button">${owned ? 'בחר' : '₪' + def.price.toLocaleString()}</button>`;
    item.innerHTML = `
      <div class="dealer-info">
        <div class="dealer-name"></div>
        <div class="dealer-stats">טווח ${def.range} • רמת חיפוש +${def.wantedBonus}</div>
      </div>
      ${action}
    `;
    item.querySelector('.dealer-name').textContent = def.label;
    const btn = item.querySelector('.dealer-btn');
    if (btn) btn.addEventListener('click', () => { if (buyOrSelect(def.key)) renderWeaponShop(); });
    listEl.appendChild(item);
  }
}
