// Minimal localStorage-backed persistence: cash and a couple of lifetime
// stats survive a page reload. No vehicle/mod/outfit data yet -- there is no
// garage, mod shop, or customizer in this build to have state worth saving.
const KEY = 'openCity.save.v1';

const DEFAULTS = {
  cash: 0,
  deliveriesCompleted: 0,
  bestStuntHeight: 0,
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
