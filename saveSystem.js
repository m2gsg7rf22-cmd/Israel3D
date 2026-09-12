// localStorage-backed persistence: cash, lifetime stats, purchased vehicle
// upgrades, and the chosen character outfit colors survive a page reload.
const KEY = 'openCity.save.v1';

const DEFAULTS = {
  cash: 0,
  deliveriesCompleted: 0,
  bestStuntHeight: 0,
  carUpgrades: { accel: 0, maxV: 0, steerSpeed: 0 },
  motoUpgrades: { accel: 0, maxV: 0, steerSpeed: 0 },
  outfit: { shirt: '#2f5fa8', pants: '#33384a' },
};

let state = { ...DEFAULTS };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    // private browsing / storage disabled -- fall back to in-memory defaults
  }
  return { ...state };
}

export function saveState(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // ignore write failures (quota, private mode)
  }
  return { ...state };
}

export function getSave() { return { ...state }; }
