// Player level/XP progression, separate from the Shekels cash economy.
// Every cash reward also grants a slice of XP (amount/20, rounded), so
// levels rise naturally from playing (missions, races, stunts, escapes)
// without a second currency to grind -- simple, but a real, persisted
// progression stat the dealership's level requirements can actually check.
import { getSave, saveState } from './saveSystem.js';

const XP_PER_LEVEL = 800;

export function getXP() { return getSave().xp || 0; }
export function getLevel() { return 1 + Math.floor(getXP() / XP_PER_LEVEL); }
export function xpIntoLevel() { return getXP() % XP_PER_LEVEL; }
export function xpPerLevel() { return XP_PER_LEVEL; }

// returns whether this award crossed a level boundary, so callers can show
// a "level up" message when it did
export function addXP(amount) {
  if (amount <= 0) return { xp: getXP(), level: getLevel(), leveledUp: false };
  const beforeLevel = getLevel();
  const xp = getXP() + Math.round(amount);
  saveState({ xp });
  const level = 1 + Math.floor(xp / XP_PER_LEVEL);
  return { xp, level, leveledUp: level > beforeLevel };
}
