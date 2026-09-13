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
let checkpointMarkers = [];
let startBanner = null;
let bots = [];
let playerProgress = { cp: 0, laps: 0, finished: false };
let placements = [];
let prevDayTime = null;

const CHECKPOINT_RADIUS = 9;
// half-width of the invisible corridor walls on either side of the route
// centerline, in meters -- close to the game's own STREET_W/2 (streets are
// 10m wide) so the barrier reads as "stay on the road", not an arbitrary cage
const TRACK_HALF_WIDTH = 5;
// distance between successive dense checkpoints along each route leg, in
// meters -- corner points from the coarse route are always kept exactly
// (each leg starts at one), so this only fills in the gaps between them.
// Wider than the very first version: fewer checkpoint rings means fewer
// meshes in the scene and less per-frame work (see buildCheckpointMarkers/
// updateRacing's spin animation), and reads as a clearer, less cluttered
// sequence of gates to aim for.
const CHECKPOINT_SPACING = 30;
// radius (meters) used to round off each 90-degree corner of the route
// into a quarter-circle arc instead of a sharp pivot -- both the visual
// path and the invisible-wall corridor (which follows these same points)
// curve smoothly through turns this way, instead of the corridor direction
// abruptly flipping 90 degrees the instant a car crosses the corner point
const CORNER_RADIUS = 9;

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

// replaces one sharp vertex with a handful of points along a quarter-circle
// arc of `radius`, tangent to both the incoming and outgoing leg -- trims
// back along each leg by `radius` (never more than 40% of either leg's own
// length, so a short leg still gets a real straight stretch) and sweeps the
// shortest angle between the two trimmed points around their shared center
function roundCorner(prev, vertex, next, radius) {
  const inX = vertex.x - prev.x, inZ = vertex.z - prev.z;
  const inLen = Math.hypot(inX, inZ) || 1;
  const uInX = inX / inLen, uInZ = inZ / inLen;
  const outX = next.x - vertex.x, outZ = next.z - vertex.z;
  const outLen = Math.hypot(outX, outZ) || 1;
  const uOutX = outX / outLen, uOutZ = outZ / outLen;
  const r = Math.min(radius, inLen * 0.4, outLen * 0.4);
  const ax = vertex.x - uInX * r, az = vertex.z - uInZ * r;
  const bx = vertex.x + uOutX * r, bz = vertex.z + uOutZ * r;
  const cx = vertex.x + uOutX * r - uInX * r, cz = vertex.z + uOutZ * r - uInZ * r;
  const startAngle = Math.atan2(ax - cx, az - cz);
  let endAngle = Math.atan2(bx - cx, bz - cz);
  let diff = endAngle - startAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steps = Math.max(2, Math.round(Math.abs(diff) / (Math.PI / 8)));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + diff * (i / steps);
    pts.push({ x: cx + Math.sin(angle) * r, z: cz + Math.cos(angle) * r });
  }
  return pts;
}

// rounds every corner of a closed loop except the very first vertex, so
// both the visual route and the invisible-wall corridor (built from these
// same points) curve through turns instead of pivoting on a sharp
// 90-degree point. Vertex 0 stays sharp and exact -- it's the start/finish
// line, and beginRace() positions the player, the bots and the start
// banner from checkpoints[0]/[1] directly, which needs to be the real
// corner, not an arc point offset and rotated away from it
function roundRouteCorners(worldPts) {
  const n = worldPts.length;
  const rounded = [worldPts[0]];
  for (let i = 1; i < n; i++) {
    const prev = worldPts[i - 1];
    const vertex = worldPts[i];
    const next = worldPts[(i + 1) % n];
    rounded.push(...roundCorner(prev, vertex, next, CORNER_RADIUS));
  }
  return rounded;
}

// fills in extra checkpoints every CHECKPOINT_SPACING meters along each leg
// of a closed loop, so the player drives through a steady sequence of gates
// (like a rally corridor) instead of only seeing one far-off ring per corner
// -- every original corner point is preserved exactly (each leg starts on one)
function densifyRoute(worldPts) {
  const dense = [];
  const n = worldPts.length;
  for (let i = 0; i < n; i++) {
    const a = worldPts[i], b = worldPts[(i + 1) % n];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(segLen / CHECKPOINT_SPACING));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      dense.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return dense;
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
    difficulty: 'קל', laps: 2, night: false, grip: 1, fogTint: '#f2d98a', fogDensityMul: 0.6,
    route: () => staircaseRoute(1, 1, 1, 11),
  },
  {
    id: 'urban', name: 'סיבוב פרימה עירוני',
    description: 'מסלול מעוקל בין שדרות העיר והרחובות הצרים — דורש שליטה מדויקת בהיגוי ובבלמים.',
    difficulty: 'רגיל', laps: 3, night: false, grip: 1, fogTint: '#9fb0c2', fogDensityMul: 1,
    route: () => staircaseRoute(2, 2, 3, 2),
  },
  {
    id: 'hills', name: 'אתגר ההרים והסיבובים',
    description: 'מסלול ארוך ומפותל בשכונת הגבעות עם המון פניות — הבוטים אגרסיביים יותר, והכביש חלקלק יותר.',
    difficulty: 'מתקדם', laps: 2, night: false, grip: 0.85, fogTint: '#8fae8a', fogDensityMul: 1.7,
    route: () => staircaseRoute(7, 7, 6, 1),
  },
  {
    id: 'industrial', name: 'מרוץ הסיבולת התעשייתי',
    description: 'מסלול ארוך במיוחד עם 3 סבבים מתישים — מרוץ התמדה, לא ספרינט.',
    difficulty: 'פרו', laps: 3, night: false, grip: 1, fogTint: '#7a6a55', fogDensityMul: 1.9,
    route: () => staircaseRoute(1, 1, 2, 6),
  },
  {
    id: 'nightgp', name: 'גרנד פרי הלילה',
    description: 'מרוץ רב-שלבי בתנאי תאורה מאתגרים — קטעים מהירים לצד מקטעים טכניים בחשכה.',
    difficulty: 'פרו', laps: 2, night: true, grip: 0.92, fogTint: '#2a1a4a', fogDensityMul: 1.15,
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
      __stuckTimer: 0, __wallContact: 0,
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

function clearCheckpointMarkers() {
  // every marker shares one geometry (see buildCheckpointMarkers) -- dispose
  // it once rather than once per marker
  if (checkpointMarkers.length) checkpointMarkers[0].geometry.dispose();
  for (const m of checkpointMarkers) {
    m.material.dispose();
    scene_.remove(m);
  }
  checkpointMarkers = [];
}

// a green ring standing upright at each checkpoint, like a gate to drive
// through -- the player's current target glows brighter than the rest so
// it always reads clearly which one to head for next. All markers share one
// TorusGeometry (only the material differs per marker, for independent
// highlight color/opacity) -- with a whole route's worth of checkpoints now
// in the scene at once, allocating a separate geometry per ring was pure
// waste since they're all the exact same shape.
function buildCheckpointMarkers() {
  clearCheckpointMarkers();
  const geo = new THREE_.TorusGeometry(3.2, 0.35, 8, 16);
  for (const cp of checkpoints) {
    const mat = new THREE_.MeshBasicMaterial({ color: '#3ddc5a', transparent: true, opacity: 0.22, side: THREE_.DoubleSide });
    const mesh = new THREE_.Mesh(geo, mat);
    mesh.position.set(cp.x, 1.6, cp.z);
    scene_.add(mesh);
    checkpointMarkers.push(mesh);
  }
}

function beginRace(raceDef, playerCarState) {
  const gridRoute = raceDef.route();
  checkpoints = densifyRoute(roundRouteCorners(toWorldRoute(gridRoute)));
  currentRace = raceDef;
  placements = [];
  playerProgress = { cp: 0, laps: 0, finished: false };
  playerCarState.__stuckTimer = 0;
  playerCarState.__wallContact = 0;
  buildCheckpointMarkers();
  if (checkpointMarkers[0]) { checkpointMarkers[0].material.opacity = 0.55; checkpointMarkers[0].material.color.set('#7dffa0'); }

  // teleport the player's car to the start line, facing the first->second checkpoint direction
  const start = checkpoints[0], next = checkpoints[1];
  const yaw = Math.atan2(next.x - start.x, next.z - start.z);
  playerCarState.x = start.x; playerCarState.z = start.z; playerCarState.y = 0;
  playerCarState.yaw = yaw; playerCarState.speed = 0; playerCarState.vy = 0;

  // a start/finish arch, colored by this race's own theme -- a visible,
  // track-specific landmark rather than just another green checkpoint ring
  if (startBanner) scene_.remove(startBanner);
  startBanner = new THREE_.Group();
  const bannerColor = raceDef.fogTint || '#ff5f5f';
  const postMat = new THREE_.MeshStandardMaterial({ color: '#333' });
  const bannerMat = new THREE_.MeshStandardMaterial({ color: bannerColor, emissive: bannerColor, emissiveIntensity: 0.8 });
  for (const side of [-1, 1]) {
    const post = new THREE_.Mesh(new THREE_.CylinderGeometry(0.25, 0.25, 7, 8), postMat);
    post.position.set(side * 6, 3.5, 0);
    startBanner.add(post);
  }
  const bar = new THREE_.Mesh(new THREE_.BoxGeometry(12.6, 1, 0.4), bannerMat);
  bar.position.set(0, 6.7, 0);
  startBanner.add(bar);
  startBanner.position.set(start.x, 0, start.z);
  startBanner.rotation.y = yaw;
  scene_.add(startBanner);

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
  clearCheckpointMarkers();
  if (startBanner) {
    startBanner.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    scene_.remove(startBanner);
    startBanner = null;
  }
  raceActive = false;
  currentRace = null;
  if (prevDayTime !== null && opts_.setDayTime) opts_.setDayTime(prevDayTime);
  prevDayTime = null;
}

// route + player's current checkpoint index, for the side minimap; null
// when no race is active so the minimap can fall back to its normal view
export function getMinimapRoute() {
  if (!raceActive) return null;
  return { points: checkpoints, currentCp: playerProgress.cp };
}

export function isRaceActive() { return raceActive; }

// per-race sky/fog theming so each track reads visually different, on top
// of the route/laps/difficulty differences -- e.g. a hazy green tint for
// the "hills" race, a smoggy brown one for the industrial endurance race
export function getActiveRaceTheme() {
  if (!raceActive) return null;
  return { fogTint: currentRace.fogTint, fogDensityMul: currentRace.fogDensityMul };
}

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

// a paved-feeling buffer beyond the lane's own half-width where a car can
// drift freely (no clamp, no speed penalty) before the actual invisible
// wall kicks in -- lets the player and bots cut a corner onto the "shoulder"
// like a real road edge instead of bouncing off a hard line the instant
// they touch it, which is what made the raw lane edge feel glitchy
const TRACK_SHOULDER_WIDTH = 2.5;

// invisible walls: clamps `state` to within TRACK_HALF_WIDTH + the shoulder
// buffer of the straight line between the checkpoint the car just left and
// the one it's heading to, so neither the player nor the bots can drive off
// the designated route -- decomposing into an along-track + across-track
// component (rather than a signed-distance-and-push) sidesteps sign-
// convention bugs and works the same regardless of which way the leg is oriented
function resolveTrackBounds(state, cpIndex) {
  const n = checkpoints.length;
  const prev = checkpoints[(cpIndex - 1 + n) % n];
  const target = checkpoints[cpIndex];
  const dx = target.x - prev.x, dz = target.z - prev.z;
  const segLen = Math.hypot(dx, dz) || 1;
  const ux = dx / segLen, uz = dz / segLen;
  const px = state.x - prev.x, pz = state.z - prev.z;
  const along = px * ux + pz * uz;
  let perpX = px - along * ux, perpZ = pz - along * uz;
  const perpDist = Math.hypot(perpX, perpZ);
  const hardLimit = TRACK_HALF_WIDTH + TRACK_SHOULDER_WIDTH;
  if (perpDist > hardLimit) {
    const scale = hardLimit / perpDist;
    perpX *= scale; perpZ *= scale;
    state.x = prev.x + along * ux + perpX;
    state.z = prev.z + along * uz + perpZ;
    if (state.speed !== undefined) state.speed *= 0.6;
    // "touching a wall" grace window, consumed by updateStuckRecovery below
    // -- only a car that's both against a wall AND barely moving counts as
    // stuck, so a deliberate stop mid-track never triggers an auto-nudge
    state.__wallContact = 0.5;
  }
  return { ux, uz };
}

// auto-recovery for a car wedged against an invisible wall (or a building --
// state.speed already reads near-zero either way): after half a second of
// wall contact with almost no speed, nudge it back onto the corridor's own
// centerline and give it a small forward push along the track direction, so
// a crash never turns into a permanent dead stop
function updateStuckRecovery(state, dt, trackDir) {
  if (state.__wallContact > 0) state.__wallContact -= dt;
  const touchingWall = (state.__wallContact || 0) > 0;
  const barelyMoving = Math.abs(state.speed || 0) < 1.2;
  state.__stuckTimer = (touchingWall && barelyMoving) ? (state.__stuckTimer || 0) + dt : 0;
  if (state.__stuckTimer > 0.9) {
    state.x -= trackDir.ux * 1.5;
    state.z -= trackDir.uz * 1.5;
    state.yaw = Math.atan2(trackDir.ux, trackDir.uz);
    state.speed = 5;
    state.vy = 0;
    state.__stuckTimer = 0;
    state.__wallContact = 0;
  }
}

// manual "get me unstuck" assist -- puts the player back on the corridor
// centerline a little behind their last passed checkpoint, facing the next
// one, so a single tap always works even if the auto-recovery hasn't kicked
// in yet (e.g. the player is still moving, just wedged at an odd angle)
export function unstickPlayer(playerCarState) {
  if (!raceActive) return false;
  const n = checkpoints.length;
  const prev = checkpoints[(playerProgress.cp - 1 + n) % n];
  const target = checkpoints[playerProgress.cp];
  const dx = target.x - prev.x, dz = target.z - prev.z;
  const segLen = Math.hypot(dx, dz) || 1;
  const ux = dx / segLen, uz = dz / segLen;
  playerCarState.x = prev.x + ux * 2;
  playerCarState.z = prev.z + uz * 2;
  playerCarState.yaw = Math.atan2(ux, uz);
  playerCarState.speed = 5;
  playerCarState.vy = 0;
  playerCarState.__stuckTimer = 0;
  playerCarState.__wallContact = 0;
  return true;
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
// object game.js drives with the player's own input. Besides reading it for
// progress, this also clamps it to the track corridor (resolveTrackBounds)
// and can nudge it free if it's wedged against a wall (updateStuckRecovery)
// -- both run on top of game.js's own physics step, the same way race start
// teleports the player to the start line before this ever runs.
export function updateRacing(dt, playerCarState) {
  if (!raceActive) return { active: false };
  const params = makeCarParamsWithGrip(currentRace.grip);
  for (const b of bots) {
    if (b.finished) continue;
    opts_.updateVehicle(b.state, dt, params, botCtx(b));
    const botDir = resolveTrackBounds(b.state, b.cp);
    updateStuckRecovery(b.state, dt, botDir);
    advanceProgress(b, b.state.x, b.state.z);
    b.rig.group.position.set(b.state.x, b.state.y, b.state.z);
    b.rig.group.rotation.y = b.state.yaw;
    const spin = b.state.speed * dt / 0.35;
    for (const w of [...b.rig.wheels, ...b.rig.steerWheels]) w.rotation.x += spin;
  }

  const cpBefore = playerProgress.cp;
  if (!playerProgress.finished) {
    const playerDir = resolveTrackBounds(playerCarState, playerProgress.cp);
    updateStuckRecovery(playerCarState, dt, playerDir);
    advanceProgress(playerProgress, playerCarState.x, playerCarState.z);
  }
  if (playerProgress.cp !== cpBefore) {
    for (let i = 0; i < checkpointMarkers.length; i++) {
      const isCurrent = i === playerProgress.cp;
      checkpointMarkers[i].material.opacity = isCurrent ? 0.55 : 0.22;
      checkpointMarkers[i].material.color.set(isCurrent ? '#7dffa0' : '#3ddc5a');
    }
  }
  // only the current target ring spins -- with checkpoints now spanning a
  // whole route, animating every single one every frame (most of them far
  // behind or well ahead of the player) was pure wasted per-frame work
  const targetMarker = checkpointMarkers[playerProgress.cp];
  if (targetMarker) targetMarker.rotation.y += dt * 0.6;

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
