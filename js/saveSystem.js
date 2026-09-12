// localStorage-backed persistence, now with multiple named "worlds" (save
// slots): cash, lifetime stats, purchased vehicle upgrades, and the chosen
// character outfit colors survive a page reload, per world.
//
// Architectural note: several modules (missions.js, safehouse.js, ...) call
// loadSave()/getSave() from their own top-level code, which runs the moment
// the module is imported -- before game.js gets a chance to show any UI.
// That means the active world has to be known synchronously, before any
// module's top-level code runs, which rules out an in-page "pick a world
// first" flow that loads data only after a choice is made. Instead, the
// active world id is just read from localStorage at import time (defaulting
// to the last one played), and switching worlds sets a new active id and
// reloads the page so every module re-evaluates fresh against it.
const WORLDS_INDEX_KEY = 'openCity.worlds';
const ACTIVE_WORLD_KEY = 'openCity.activeWorld';
const LEGACY_KEY = 'openCity.save.v1';

const DEFAULTS = {
  cash: 0,
  deliveriesCompleted: 0,
  bestStuntHeight: 0,
  carUpgrades: { accel: 0, maxV: 0, steerSpeed: 0 },
  motoUpgrades: { accel: 0, maxV: 0, steerSpeed: 0 },
  outfit: { shirt: '#d62828', pants: '#12161c' },
  ownedTiers: [1],
  activeVehicle: 'car',
  lastLocation: null,
  inPrison: false,
  activeMissionId: null,
  jailTimerRemaining: 0,
  wantedLevel: 0,
};

function readWorldsIndex() {
  try {
    const raw = localStorage.getItem(WORLDS_INDEX_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* private mode / corrupt data -- fall through to a fresh index */ }
  return null;
}

function writeWorldsIndex(list) {
  try { localStorage.setItem(WORLDS_INDEX_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

// one-time migration: a returning player with the old single-slot save
// (openCity.save.v1) gets it registered as their first world instead of
// silently losing it once multi-world support ships
function ensureWorldsIndex() {
  let list = readWorldsIndex();
  if (list) return list;
  list = [];
  try {
    if (localStorage.getItem(LEGACY_KEY) !== null) {
      list.push({ id: 'v1', name: 'העולם הראשון', createdAt: Date.now(), lastPlayedAt: Date.now() });
    }
  } catch (e) { /* ignore */ }
  writeWorldsIndex(list);
  return list;
}

function resolveActiveWorldId() {
  const list = ensureWorldsIndex();
  let active = null;
  try { active = localStorage.getItem(ACTIVE_WORLD_KEY); } catch (e) { /* ignore */ }
  if (active && list.some((w) => w.id === active)) return active;
  if (list.length) return list[0].id;
  return null; // no world yet -- game.js must show the world-select screen
}

let activeWorldId = resolveActiveWorldId();
let KEY = activeWorldId ? `openCity.save.${activeWorldId}` : null;
let state = { ...DEFAULTS };
if (KEY) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
}

export function hasActiveWorld() { return !!activeWorldId; }
export function getActiveWorldId() { return activeWorldId; }
export function getActiveWorldName() {
  const w = readWorldsIndex()?.find((x) => x.id === activeWorldId);
  return w ? w.name : '';
}

export function listWorlds() {
  return (readWorldsIndex() || []).slice().sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

// creates a new empty world, makes it active, and returns its id -- the
// caller (game.js) must reload the page for the new active world to take
// effect, since every module's save data is already loaded at this point
export function createWorld(name) {
  const list = ensureWorldsIndex();
  const id = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  list.push({ id, name: name || `עולם ${list.length + 1}`, createdAt: Date.now(), lastPlayedAt: Date.now() });
  writeWorldsIndex(list);
  try { localStorage.setItem(ACTIVE_WORLD_KEY, id); } catch (e) { /* ignore */ }
  try { localStorage.setItem(`openCity.save.${id}`, JSON.stringify(DEFAULTS)); } catch (e) { /* ignore */ }
  return id;
}

// marks a world active (bumping its last-played time) -- caller reloads if
// it wasn't already the active world so the fresh save data actually loads
export function switchWorld(id) {
  const list = ensureWorldsIndex();
  const w = list.find((x) => x.id === id);
  if (!w) return false;
  w.lastPlayedAt = Date.now();
  writeWorldsIndex(list);
  try { localStorage.setItem(ACTIVE_WORLD_KEY, id); } catch (e) { /* ignore */ }
  return true;
}

export function deleteWorld(id) {
  const list = ensureWorldsIndex().filter((w) => w.id !== id);
  writeWorldsIndex(list);
  try { localStorage.removeItem(`openCity.save.${id}`); } catch (e) { /* ignore */ }
  if (id === 'v1') { try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ } }
  if (activeWorldId === id) {
    try { localStorage.removeItem(ACTIVE_WORLD_KEY); } catch (e) { /* ignore */ }
  }
}

export function loadSave() {
  try {
    if (KEY) {
      const raw = localStorage.getItem(KEY);
      if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch (e) {
    // private browsing / storage disabled -- fall back to in-memory defaults
  }
  return { ...state };
}

export function saveState(patch) {
  state = { ...state, ...patch };
  try {
    if (KEY) localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // ignore write failures (quota, private mode)
  }
  return { ...state };
}

export function getSave() { return { ...state }; }
