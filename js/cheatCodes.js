// Cheat code system: a single text box (wired in game.js) that checks
// whatever the player typed against four independent code tables.
//
// World-admin codes are matched by "world slot", not by the world's own
// randomly-generated id: ids are unpredictable strings assigned only once
// a world is actually created (see saveSystem.js's createWorld()), so
// there's no way to hand out 10 fixed strings tied to specific ids in
// advance. Instead each code corresponds to a fixed *position* -- the 1st,
// 2nd, ... 10th world ever created (oldest-first) -- and only accepting
// the code while that exact world is the active one is what makes each
// code "belong" to one specific world, matching the request.
import { getSave, saveState, listWorlds, getActiveWorldId } from './saveSystem.js';

export const WORLD_ADMIN_CODES = [
  'MERIDIAN-ALPHA', 'MERIDIAN-BRAVO', 'MERIDIAN-CHARLIE', 'MERIDIAN-DELTA', 'MERIDIAN-ECHO',
  'MERIDIAN-FOXTROT', 'MERIDIAN-GOLF', 'MERIDIAN-HOTEL', 'MERIDIAN-INDIA', 'MERIDIAN-JULIET',
];

export const GLOBAL_MONEY_CODE = 'MONEYGOD';

// tier numbers match vehicleController.js's CAR_MODELS / dealership.js's CAR_TIERS
export const CAR_CODES = {
  'CAR-HATCH': 1,
  'CAR-CRUISER': 2,
  'CAR-MUSCLE': 3,
  'CAR-APEX': 4,
  'CAR-HYPERION': 5,
};

export const VOUCHER_CODES = { 'CASH50K': 50000, 'CASH100K': 100000 };

function worldSlotIndex() {
  const byAge = listWorlds().slice().sort((a, b) => a.createdAt - b.createdAt);
  return byAge.findIndex((w) => w.id === getActiveWorldId());
}

export function isAdminUnlocked() { return !!getSave().adminUnlocked; }

// applies a typed code; `addCash` and `ownCarTier` are injected by the
// caller (game.js) rather than imported directly, so this module never
// needs to depend on missions.js/dealership.js and can't form an import
// cycle with either
export function applyCheatCode(raw, { addCash, ownCarTier } = {}) {
  const code = (raw || '').trim().toUpperCase();
  if (!code) return { ok: false, message: 'הקלד קוד קודם.' };

  if (code === GLOBAL_MONEY_CODE) {
    if (addCash) addCash(1000000);
    return { ok: true, message: '💰 קוד כסף גלובלי הופעל — מיליון ₪ נוספו!' };
  }

  const slot = WORLD_ADMIN_CODES.indexOf(code);
  if (slot !== -1) {
    if (worldSlotIndex() === slot) {
      saveState({ adminUnlocked: true });
      return { ok: true, message: '👑 קוד מנהל הופעל לעולם הזה! כסף אינסופי, וטיסה/היעלמות זמינים בהגדרות.' };
    }
    return { ok: false, message: 'הקוד הזה שייך לעולם אחר — הוא לא יעבוד בעולם הנוכחי.' };
  }

  if (code in CAR_CODES) {
    const tier = CAR_CODES[code];
    if (ownCarTier) ownCarTier(tier);
    return { ok: true, message: `🚗 קוד רכב הופעל — שכבה ${tier} נפתחה באולם התצוגה!` };
  }

  if (code in VOUCHER_CODES) {
    const amount = VOUCHER_CODES[code];
    if (addCash) addCash(amount);
    return { ok: true, message: `🎟️ שובר הופעל — ₪${amount.toLocaleString()} נוספו!` };
  }

  return { ok: false, message: 'קוד לא מוכר.' };
}
