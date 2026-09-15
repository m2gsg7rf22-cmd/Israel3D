// Achievements: checked periodically against real, already-tracked save
// data (level, cash, deliveries, stunt distance, vehicle ownership) --
// no separate fake counters. Each fires its toast once and persists.
import { getSave, saveState } from './saveSystem.js';

const DEFS = [
  { id: 'level5', label: '🆙 רמה 5', check: (ctx) => ctx.level >= 5 },
  { id: 'level10', label: '🆙 רמה 10', check: (ctx) => ctx.level >= 10 },
  { id: 'cash100k', label: '💰 ₪100,000 בכיס', check: (ctx) => ctx.cash >= 100000 },
  { id: 'deliveries5', label: '📦 5 משלוחים הושלמו', check: (ctx) => ctx.deliveries >= 5 },
  { id: 'deliveries20', label: '📦 20 משלוחים הושלמו', check: (ctx) => ctx.deliveries >= 20 },
  { id: 'bigStunt', label: '🚀 קפיצת סטאנט ענקית', check: (ctx) => ctx.bestStunt >= 60 },
  { id: 'allMotos', label: '🏍️ כל האופנועים נרכשו', check: (ctx) => ctx.save.ownedMotoTiers.length >= 3 },
  { id: 'allAir', label: '✈️ מטוס ומסוק נרכשו', check: (ctx) => ctx.save.ownedAirTiers.includes('plane') && ctx.save.ownedAirTiers.includes('heli') },
  { id: 'allCars', label: '🚗 כל המכוניות נרכשו', check: (ctx) => ctx.save.ownedCarTiers.length >= 5 },
];

// returns newly-unlocked achievement labels (usually empty) so the caller
// can show a toast -- checked from live values, not just the save snapshot
export function checkAchievements(ctx) {
  const save = getSave();
  const unlocked = save.unlockedAchievements || [];
  const fresh = [];
  for (const def of DEFS) {
    if (unlocked.includes(def.id)) continue;
    if (def.check({ ...ctx, save })) fresh.push(def);
  }
  if (fresh.length) {
    saveState({ unlockedAchievements: [...unlocked, ...fresh.map((f) => f.id)] });
  }
  return fresh.map((f) => f.label);
}
