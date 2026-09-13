import { loadSave, saveState } from './saveSystem.js';
import { addXP } from './xpSystem.js';
import { isAdminUnlocked } from './cheatCodes.js';

let THREE_, scene_;
const ramps = [];
const markers = [];
let delivery = null; // { toIdx, timeLeft, reward, kind: 'delivery'|'taxi' }
let score = loadSave().cash;
let splashTimer = 0;
let splashText = '';
let airborne = { active: false, startYaw: 0, spin: 0, startX: 0, startZ: 0 };

// coordinates keep at least one axis on a street centerline (multiple of the
// 40m block pitch) so markers and ramps land clear of building footprints.
// Alternating kinds means the same marker set serves both mission types --
// there's no separate warehouse/passenger content in this build.
const DELIVERY_LOCAL_POINTS = [
  { x: 0, z: 120, kind: 'delivery' }, { x: -160, z: 0, kind: 'taxi' },
  { x: 120, z: -40, kind: 'delivery' }, { x: -40, z: -160, kind: 'taxi' },
  { x: 160, z: 160, kind: 'delivery' },
];
const DELIVERY_TIME = 60;
const TAXI_TIME = 55;
const MARKER_RADIUS = 5;

export function initMissions(scene, THREE) {
  THREE_ = THREE;
  scene_ = scene;

  const markerGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.1, 16);
  for (const p of DELIVERY_LOCAL_POINTS) {
    const color = p.kind === 'taxi' ? '#43c6ff' : '#ffd23f';
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.75 });
    const mesh = new THREE.Mesh(markerGeo, mat);
    mesh.position.set(p.x, 0.1, p.z);
    scene.add(mesh);
    const beam = new THREE.PointLight(color, 2.2, 10);
    beam.position.set(p.x, 2, p.z);
    scene.add(beam);
    markers.push({ x: p.x, z: p.z, kind: p.kind, mesh, beam });
  }

  const rampGeo = new THREE.BoxGeometry(3.6, 1.2, 6);
  rampGeo.translate(0, 0, 3);
  const rampMat = new THREE.MeshStandardMaterial({ color: '#8a6a3c', roughness: 0.8 });
  const RAMP_DEFS = [
    { x: 0, z: 80, yaw: 0 },       // main avenue
    { x: -40, z: 0, yaw: Math.PI / 2 }, // central cross street
    { x: 80, z: -80, yaw: Math.PI },    // docklands
    { x: -160, z: -40, yaw: -Math.PI / 2 }, // back alley
  ];
  for (const r of RAMP_DEFS) {
    const group = new THREE.Group();
    group.position.set(r.x, 0, r.z);
    group.rotation.y = r.yaw;
    const wedge = new THREE.Mesh(rampGeo, rampMat);
    wedge.rotation.x = -Math.PI / 10;
    wedge.castShadow = true;
    group.add(wedge);
    scene.add(group);
    ramps.push({ x: r.x, z: r.z, yaw: r.yaw, cooldown: 0 });
  }
}

function pickDestination(exclude) {
  let idx;
  do { idx = Math.floor(Math.random() * markers.length); } while (idx === exclude && markers.length > 1);
  return idx;
}

function showSplash(text, duration = 2.2) {
  splashText = text;
  splashTimer = duration;
}

let lastLevelUp = null;

export function addCash(amount) {
  score += amount;
  saveState({ cash: score });
  const xpResult = addXP(Math.round(amount / 20));
  if (xpResult.leveledUp) lastLevelUp = xpResult.level;
}

// one-shot: returns the new level if the last addCash() crossed a level
// boundary, then clears it, so the caller can show a "level up" message
// exactly once per level-up rather than every frame
export function consumeLevelUp() {
  const lvl = lastLevelUp;
  lastLevelUp = null;
  return lvl;
}

// used by the mod shop: returns false (and spends nothing) if the player
// can't afford it, so callers never need to check getScore() first
export function spendCash(amount) {
  if (isAdminUnlocked()) return true; // infinite money -- nothing is ever deducted
  if (score < amount) return false;
  score -= amount;
  saveState({ cash: score });
  return true;
}

// marker proximity now offers a mission instead of silently auto-starting
// one -- pendingMarkerIdx is set while parked in a zone with no active job,
// and acceptPendingMission() (called from game.js on a keypress) is what
// actually starts it
let pendingMarkerIdx = null;

export function acceptPendingMission() {
  if (pendingMarkerIdx === null || delivery) return false;
  const i = pendingMarkerIdx;
  const kind = markers[i].kind;
  const toIdx = pickDestination(i);
  if (kind === 'taxi') {
    delivery = { toIdx, timeLeft: TAXI_TIME, totalTime: TAXI_TIME, kind };
    showSplash('נוסע עלה לרכב! קחו אותו ליעד', 1.8);
  } else {
    const reward = 2000 + Math.floor(Math.random() * 6000);
    delivery = { toIdx, timeLeft: DELIVERY_TIME, totalTime: DELIVERY_TIME, reward, kind };
    showSplash('משלוח החל! הגיעו ליעד בזמן', 1.8);
  }
  pendingMarkerIdx = null;
  return true;
}

export function updateMissions(dt, playerX, playerZ, isVehicle) {
  const pulse = 0.6 + Math.sin(performance.now() * 0.004) * 0.4;
  for (const m of markers) m.mesh.material.emissiveIntensity = 1.2 + pulse;

  let prompt = null;
  if (!delivery && isVehicle) {
    pendingMarkerIdx = null;
    for (let i = 0; i < markers.length; i++) {
      const d = Math.hypot(markers[i].x - playerX, markers[i].z - playerZ);
      if (d < MARKER_RADIUS) {
        pendingMarkerIdx = i;
        prompt = { kind: markers[i].kind, text: markers[i].kind === 'taxi' ? 'נוסע ממתין — לחצו F כדי לקחת אותו' : 'משלוח זמין כאן — לחצו F כדי לקבל אותו' };
        break;
      }
    }
  } else if (delivery) {
    delivery.timeLeft -= dt;
    const dest = markers[delivery.toIdx];
    const d = Math.hypot(dest.x - playerX, dest.z - playerZ);
    if (d < MARKER_RADIUS) {
      if (delivery.kind === 'taxi') {
        // "smooth driving" proxy: arriving with time to spare pays a bigger tip
        const tip = Math.round(5000 * Math.max(0, delivery.timeLeft / delivery.totalTime));
        const reward = 1500 + tip;
        addCash(reward);
        showSplash(`הנוסע הגיע! +₪${reward} (כולל טיפ ₪${tip})`, 2.0);
      } else {
        addCash(delivery.reward);
        showSplash(`המשלוח הושלם! +₪${delivery.reward}`, 2.0);
      }
      delivery = null;
    } else if (delivery.timeLeft <= 0) {
      showSplash(delivery.kind === 'taxi' ? 'הנוסע ירד — נגמר הזמן' : 'המשלוח נכשל — נגמר הזמן', 1.8);
      delivery = null;
    }
  }

  if (splashTimer > 0) splashTimer -= dt;

  let waypoint = null;
  if (delivery) {
    const dest = markers[delivery.toIdx];
    waypoint = { x: dest.x, z: dest.z, dist: Math.hypot(dest.x - playerX, dest.z - playerZ), timeLeft: Math.max(0, delivery.timeLeft), kind: delivery.kind };
  }

  for (const r of ramps) if (r.cooldown > 0) r.cooldown -= dt;

  return { score, waypoint, splash: splashTimer > 0 ? splashText : null, prompt };
}

export function checkRampLaunch(state) {
  for (const r of ramps) {
    if (r.cooldown > 0) continue;
    const dx = state.x - r.x, dz = state.z - r.z;
    const localX = dx * Math.cos(-r.yaw) - dz * Math.sin(-r.yaw);
    const localZ = dx * Math.sin(-r.yaw) + dz * Math.cos(-r.yaw);
    if (Math.abs(localX) < 2 && localZ > 0 && localZ < 6.5 && Math.abs(state.speed) > 9) {
      r.cooldown = 1.5;
      return { vy: 6 + Math.abs(state.speed) * 0.18 };
    }
  }
  return null;
}

export function onAirborneStart(yaw, x, z) {
  airborne.active = true;
  airborne.startYaw = yaw;
  airborne.spin = 0;
  airborne.startX = x;
  airborne.startZ = z;
}
export function onAirborneFrame(prevYaw, currentYaw) {
  if (!airborne.active) return;
  let d = ((currentYaw - prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  airborne.spin += Math.abs(d);
}
export function onAirborneEnd(x, z) {
  if (!airborne.active) return;
  airborne.active = false;
  const dist = Math.hypot(x - airborne.startX, z - airborne.startZ);
  if (airborne.spin < 0.5 && dist < 4) return; // too small a hop to count as a stunt
  const reward = 500 + Math.round(Math.min(1, dist / 100) * 9500);
  addCash(reward);
  showSplash(`STUNT JUMP COMPLETED! +₪${reward}`, 2.2);
}

export function getScore() { return score; }
export function getMarkers() { return markers.map(m => ({ x: m.x, z: m.z, kind: m.kind })); }
export function getRamps() { return ramps.map(r => ({ x: r.x, z: r.z, yaw: r.yaw })); }
