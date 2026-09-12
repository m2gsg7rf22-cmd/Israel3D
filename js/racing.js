// Street racing: a menu of 5 hand-picked races plus a procedural custom
// track (length + difficulty), 7 AI bot cars, lap/checkpoint tracking and
// a HUD info object consumed by game.js.
//
// Honesty note (same pattern as the prison escape missions): all 5 races
// and every custom track share one real race engine -- rectilinear
// checkpoint loops driven over by the *same* buildCar()/updateVehicle()
// physics the player's own car uses, with 7 AI cars steering toward their
// next checkpoint. What actually differs between races is real: the route
// shape/length, lap count, bot speed & aggressiveness, and (race 5) forced
// night lighting. There is no separate elevation/terrain system (no real
// "hills") and no vehicle-damage/condition system -- "mountain" and
// "endurance" flavor come from route shape, lap count and bot behavior,
// not new physics, and that's disclosed rather than faked.

let THREE_, scene_, opts_;
let raceActive = false;
let currentRace = null;
let checkpoints = [];
let bots = [];
let playerProgress = { cp: 0, laps: 0, finished: false };
let placements = [];
let prevDayTime = null;

const CHECKPOINT_RADIUS = 9;

// builds a valid closed rectilinear loop: alternates a horizontal then a
// vertical hop of `stepSize` blocks, `steps` times, then a straight hop
// back under the start column and an implicit closing hop back to start --
// works for any steps/stepSize, so it also powers the custom-track generator
function staircaseRoute(bx0, bz0, steps, stepSize) {
  const pts = [[bx0, bz0]];
  let bx = bx0, bz = bz0;
  for (let i = 0; i < steps; i++) {
    bx += stepSize; pts.push([bx, bz]);
    bz += stepSize; pts.push([bx, bz]);
  }
  pts.push([bx0, bz]);
  return pts;
}

function toWorldRoute(gridPts) {
  const { BLOCK, CITY_HALF } = opts_;
  return gridPts.map(([bx, bz]) => ({ x: bx * BLOCK - CITY_HALF, z: bz * BLOCK - CITY_HALF }));
}

export const DIFFICULTIES = [
  { id: 'easy', label: 'קל', speedMul: 0.72, aggro: 0.5 },
  { id: 'normal', label: 'רגיל', speedMul: 0.85, aggro: 0.7 },
  { id: 'advanced', label: 'מתקדם', speedMul: 0.96, aggro: 0.85 },
  { id: 'pro', label: 'פרו', speedMul: 1.08, aggro: 1.0 },
];

export const LENGTHS = [
  { id: 'short', label: 'קצר', steps: 2, stepSize: 3, laps: 2 },
  { id: 'medium', label: 'בינוני', steps: 4, stepSize: 3, laps: 2 },
  { id: 'long', label: 'ארוך', steps: 6, stepSize: 3, laps: 3 },
];

// route grid coordinates chosen to stay inside a 14x14 city grid (indices 0-14)
export const RACES = [
  {
    id: 'ayalon', name: 'ספרינט נתיבי איילון',
    description: 'מרוץ מהיר וקצר על כביש ישר עם מעט פניות חדות — מי שהכי מהיר מנצח.',
    difficulty: 'קל', laps: 2, night: false, grip: 1,
    route: () => staircaseRoute(1, 1, 1, 11),
  },
  {
    id: 'urban', name: 'סיבוב פרימה עירוני',
    description: 'מסלול מעוקל בין שדרות העיר והרחובות הצרים — דורש שליטה מדויקת בהיגוי ובבלמים.',
    difficulty: 'רגיל', laps: 3, night: false, grip: 1,
    route: () => staircaseRoute(2, 2, 3, 2),
  },
  {
    id: 'hills', name: 'אתגר ההרים והסיבובים',
    description: 'מסלול ארוך ומפותל בשכונת הגבעות עם המון פניות — הבוטים אגרסיביים יותר, והכביש חלקלק יותר.',
    difficulty: 'מתקדם', laps: 2, night: false, grip: 0.85,
    route: () => staircaseRoute(7, 7, 6, 1),
  },
  {
    id: 'industrial', name: 'מרוץ הסיבולת התעשייתי',
    description: 'מסלול ארוך במיוחד עם 3 סבבים מתישים — מרוץ התמדה, לא ספרינט.',
    difficulty: 'פרו', laps: 3, night: false, grip: 1,
    route: () => staircaseRoute(1, 1, 2, 6),
  },
  {
    id: 'nightgp', name: 'גרנד פרי הלילה',
    description: 'מרוץ רב-שלבי בתנאי תאורה מאתגרים — קטעים מהירים לצד מקטעים טכניים בחשכה.',
    difficulty: 'פרו', laps: 2, night: true, grip: 0.92,
    route: () => staircaseRoute(1, 1, 4, 3),
  },
];

export function getRaceList() {
  return RACES.map((r) => ({ id: r.id, name: r.name, description: r.description, difficulty: r.difficulty, laps: r.laps, night: r.night }));
}

export function initRacing(scene, THREE, opts) {
  THREE_ = THREE;
  scene_ = scene;
  opts_ = opts; // { BLOCK, CITY_HALF, buildCar, updateVehicle, CAR_PARAMS, resolveCircleVsBuildings, hitLampPoles, gravity, addCash, setDayTime, getDayTime }
}

function spawnBots(count, startPt, dirPt, speedMul, aggro) {
  const { buildCar } = opts_;
  const dx = dirPt.x - startPt.x, dz = dirPt.z - startPt.z;
  const baseYaw = Math.atan2(dx, dz);
  const perpX = Math.cos(baseYaw), perpZ = -Math.sin(baseYaw);
  const list = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2) + 1;
    const side = i % 2 === 0 ? 1 : -1;
    const rig = buildCar(THREE_, scene_, { loadModel: false });
    const state = {
      x: startPt.x + perpX * side * 2.2, z: startPt.z + perpZ * side * 2.2 - row * 4,
      y: 0, vy: 0, yaw: baseYaw, speed: 0, steer: 0, boosting: false, wallCooldown: 0,
    };
    list.push({
      rig, state, cp: 0, laps: 0, finished: false,
      speedMul: speedMul * (0.9 + Math.random() * 0.2),
      aggro,
    });
  }
  return list;
}

function botCtx(bot) {
  const params = opts_;
  return {
    keys: { shift: false, space: false },
    steerThrottle: () => {
      const target = checkpoints[bot.cp];
      const dx = target.x - bot.state.x, dz = target.z - bot.state.z;
      const desiredYaw = Math.atan2(dx, dz);
      let diff = ((desiredYaw - bot.state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      const throttle = Math.abs(diff) > 1.0 ? 0.35 * bot.aggro + 0.15 : 1;
      return { steer, throttle };
    },
    resolveCircleVsBuildings: params.resolveCircleVsBuildings,
    hitLampPoles: params.hitLampPoles,
    gravity: params.gravity,
  };
}

function makeCarParamsWithGrip(grip) {
  if (grip === 1) return opts_.CAR_PARAMS;
  const p = opts_.CAR_PARAMS;
  return { ...p, steerBase: p.steerBase * grip, steerSpeed: p.steerSpeed * grip, drag: p.drag * (2 - grip) };
}

function beginRace(raceDef, playerCarState) {
  const gridRoute = raceDef.route();
  checkpoints = toWorldRoute(gridRoute);
  currentRace = raceDef;
  placements = [];
  playerProgress = { cp: 0, laps: 0, finished: false };

  // teleport the player's car to the start line, facing the first->second checkpoint direction
  const start = checkpoints[0], next = checkpoints[1];
  const yaw = Math.atan2(next.x - start.x, next.z - start.z);
  playerCarState.x = start.x; playerCarState.z = start.z; playerCarState.y = 0;
  playerCarState.yaw = yaw; playerCarState.speed = 0; playerCarState.vy = 0;

  for (const b of bots) disposeBot(b.rig);
  // derive bot speed/aggressiveness from the race's own difficulty label, so
  // hand-picked races and the custom generator both funnel through the same
  // bot-tuning table instead of each needing their own numbers
  const diffPreset = DIFFICULTIES.find((d) => d.label === raceDef.difficulty) || DIFFICULTIES[1];
  bots = spawnBots(7, start, next, diffPreset.speedMul, diffPreset.aggro);

  if (raceDef.night && opts_.setDayTime) {
    prevDayTime = opts_.getDayTime ? opts_.getDayTime() : null;
    opts_.setDayTime(0.75); // deep night
  } else {
    prevDayTime = null;
  }

  raceActive = true;
}

export function startRace(id, playerCarState) {
  const def = RACES.find((r) => r.id === id);
  if (!def) return false;
  beginRace(def, playerCarState);
  return true;
}

export function startCustomRace(lengthId, difficultyId, playerCarState) {
  const length = LENGTHS.find((l) => l.id === lengthId) || LENGTHS[1];
  const diff = DIFFICULTIES.find((d) => d.id === difficultyId) || DIFFICULTIES[1];
  const def = {
    id: 'custom', name: `מסלול מותאם אישית (${length.label} / ${diff.label})`,
    description: 'מסלול שנוצר אוטומטית לפי האורך ורמת הקושי שבחרת.',
    difficulty: diff.label, laps: length.laps, night: false, grip: 1,
    route: () => staircaseRoute(1, 1, length.steps, length.stepSize),
  };
  beginRace(def, playerCarState);
  return true;
}

// bot cars are rebuilt fresh (new geometries/materials) every race start, so
// they must be disposed on exit -- scene.remove() alone leaks GPU buffers,
// and repeated race start/exit cycles over a play session would add up
function disposeBot(rig) {
  rig.group.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m?.dispose();
    }
  });
  scene_.remove(rig.group);
}

export function exitRace() {
  if (!raceActive) return;
  for (const b of bots) disposeBot(b.rig);
  bots = [];
  raceActive = false;
  currentRace = null;
  if (prevDayTime !== null && opts_.setDayTime) opts_.setDayTime(prevDayTime);
  prevDayTime = null;
}

export function isRaceActive() { return raceActive; }

function advanceProgress(entry, x, z) {
  const target = checkpoints[entry.cp];
  if (Math.hypot(target.x - x, target.z - z) < CHECKPOINT_RADIUS) {
    entry.cp++;
    if (entry.cp >= checkpoints.length) {
      entry.cp = 0;
      entry.laps++;
      if (entry.laps >= currentRace.laps) entry.finished = true;
    }
  }
}

function totalRacers() { return bots.length + 1; }

function computeRank(x, z) {
  // player's own rank among bots, by (laps, checkpoints, distance-to-next) descending
  const distToNext = Math.hypot(checkpoints[playerProgress.cp].x - x, checkpoints[playerProgress.cp].z - z);
  const playerScore = playerProgress.laps * checkpoints.length * 1000 + playerProgress.cp * 1000 - distToNext;
  let rank = 1;
  for (const b of bots) {
    const d = Math.hypot(checkpoints[b.cp].x - b.state.x, checkpoints[b.cp].z - b.state.z);
    const score = b.laps * checkpoints.length * 1000 + b.cp * 1000 - d;
    if (score > playerScore) rank++;
  }
  return rank;
}

// called every frame while a race is active; playerCarState is the same
// object game.js drives with the player's own input -- this function only
// reads it (for progress) except at race start, where it's teleported
export function updateRacing(dt, playerCarState) {
  if (!raceActive) return { active: false };
  const params = makeCarParamsWithGrip(currentRace.grip);
  for (const b of bots) {
    if (b.finished) continue;
    opts_.updateVehicle(b.state, dt, params, botCtx(b));
    advanceProgress(b, b.state.x, b.state.z);
    b.rig.group.position.set(b.state.x, b.state.y, b.state.z);
    b.rig.group.rotation.y = b.state.yaw;
    const spin = b.state.speed * dt / 0.35;
    for (const w of [...b.rig.wheels, ...b.rig.steerWheels]) w.rotation.x += spin;
  }

  if (!playerProgress.finished) advanceProgress(playerProgress, playerCarState.x, playerCarState.z);

  const justFinished = playerProgress.finished && placements.indexOf('player') === -1;
  if (justFinished) {
    // reward scales with how well the player placed
    const rank = computeRank(playerCarState.x, playerCarState.z);
    const reward = Math.max(200, 1500 - (rank - 1) * 250);
    if (opts_.addCash) opts_.addCash(reward);
    placements.push('player');
  }

  const rank = computeRank(playerCarState.x, playerCarState.z);
  const nextCp = checkpoints[playerProgress.cp];
  const prevCp = checkpoints[(playerProgress.cp - 1 + checkpoints.length) % checkpoints.length];
  const legLen = Math.hypot(nextCp.x - prevCp.x, nextCp.z - prevCp.z) || 1;
  const distToNext = Math.hypot(nextCp.x - playerCarState.x, nextCp.z - playerCarState.z);
  const legProgress = Math.max(0, Math.min(1, 1 - distToNext / legLen));
  const progressPct = Math.round(((playerProgress.cp + legProgress) / checkpoints.length) * 100);

  return {
    active: true,
    raceName: currentRace.name,
    lap: playerProgress.laps + 1,
    totalLaps: currentRace.laps,
    progressPct,
    position: rank,
    totalRacers: totalRacers(),
    finished: playerProgress.finished,
    justFinished,
  };
}
