import { setSirenActive } from './audio.js';

let THREE_, scene_;
const cars = [];
const officers = [];
let wanted = 0;
let evadeTimer = 0;
let flashTimer = 0;
let hitCooldown = 0;
let roadblockTimer = 0;

const CAR_KIND = {
  cruiser: { maxSpeed: 24, accel: 18, color: '#0c0c10' },
  interceptor: { maxSpeed: 30, accel: 24, color: '#141418' },
};
const EVADE_SECONDS = 15;
const EVADE_DIST = 34;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }
function angDiff(a, b) { return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }

function buildPoliceCar(kind) {
  const spec = CAR_KIND[kind];
  const group = new THREE_.Group();
  const bodyMat = new THREE_.MeshStandardMaterial({ color: spec.color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE_.Mesh(new THREE_.BoxGeometry(1.8, 0.55, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const doorMat = new THREE_.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4 });
  const doorPanel = new THREE_.Mesh(new THREE_.BoxGeometry(1.82, 0.2, 1.6), doorMat);
  doorPanel.position.set(0, 0.55, 0);
  group.add(doorPanel);
  const cabin = new THREE_.Mesh(new THREE_.BoxGeometry(1.4, 0.5, 2.0), new THREE_.MeshStandardMaterial({ color: '#0d1620', roughness: 0.2, metalness: 0.3 }));
  cabin.position.set(0, 0.98, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  const barBase = new THREE_.Mesh(new THREE_.BoxGeometry(0.9, 0.14, 0.4), new THREE_.MeshStandardMaterial({ color: '#111' }));
  barBase.position.set(0, 1.3, -0.1);
  group.add(barBase);
  const redMat = new THREE_.MeshStandardMaterial({ color: '#ff2020', emissive: '#ff2020', emissiveIntensity: 2 });
  const blueMat = new THREE_.MeshStandardMaterial({ color: '#2050ff', emissive: '#2050ff', emissiveIntensity: 2 });
  const redLight = new THREE_.Mesh(new THREE_.BoxGeometry(0.4, 0.12, 0.36), redMat);
  redLight.position.set(-0.22, 1.4, -0.1);
  const blueLight = new THREE_.Mesh(new THREE_.BoxGeometry(0.4, 0.12, 0.36), blueMat);
  blueLight.position.set(0.22, 1.4, -0.1);
  group.add(redLight, blueLight);
  const beacon = new THREE_.PointLight('#ff3030', 0, 12);
  beacon.position.set(0, 1.5, -0.1);
  group.add(beacon);

  const wheelGeo = new THREE_.CylinderGeometry(0.35, 0.35, 0.32, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE_.MeshStandardMaterial({ color: '#111' });
  const wPos = [[-0.9, 0.35, 1.5], [0.9, 0.35, 1.5], [-0.9, 0.35, -1.5], [0.9, 0.35, -1.5]];
  const wheels = wPos.map(([x, y, z]) => {
    const w = new THREE_.Mesh(wheelGeo, wheelMat);
    w.position.set(x, y, z);
    w.castShadow = true;
    group.add(w);
    return w;
  });

  scene_.add(group);
  return { group, redMat, blueMat, beacon, wheels };
}

function buildOfficer() {
  const group = new THREE_.Group();
  const uniform = new THREE_.MeshStandardMaterial({ color: '#1c2b4a', roughness: 0.85 });
  const skin = new THREE_.MeshStandardMaterial({ color: '#d9a679', roughness: 0.8 });
  const torso = new THREE_.Mesh(new THREE_.BoxGeometry(0.42, 0.55, 0.24), uniform);
  torso.position.y = 1.24;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE_.Mesh(new THREE_.SphereGeometry(0.15, 8, 8), skin);
  head.position.y = 1.62;
  group.add(head);
  const cap = new THREE_.Mesh(new THREE_.CylinderGeometry(0.16, 0.17, 0.08, 8), new THREE_.MeshStandardMaterial({ color: '#0d1626' }));
  cap.position.y = 1.74;
  group.add(cap);
  function limb(x, y, len) {
    const pivot = new THREE_.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE_.Mesh(new THREE_.BoxGeometry(0.13, len, 0.13), uniform);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const legL = limb(-0.11, 0.9, 0.8);
  const legR = limb(0.11, 0.9, 0.8);
  const baton = new THREE_.Mesh(new THREE_.CylinderGeometry(0.03, 0.03, 0.5, 6), new THREE_.MeshStandardMaterial({ color: '#222' }));
  baton.rotation.z = Math.PI / 2;
  baton.position.set(0.32, 1.1, 0);
  group.add(baton);
  scene_.add(group);
  return { group, legL, legR, phase: Math.random() * Math.PI * 2 };
}

function despawnAll() {
  for (const c of cars) scene_.remove(c.group);
  cars.length = 0;
  for (const o of officers) scene_.remove(o.group);
  officers.length = 0;
}

function ensureUnits(playerX, playerZ, playerYaw) {
  const wantCars = wanted <= 0 ? 0 : wanted <= 2 ? 1 + (wanted - 1) : wanted <= 4 ? 2 + (wanted - 3) : 4;
  const wantOfficers = wanted >= 3 ? Math.min(2, wanted - 2) : 0;

  while (cars.length < wantCars) {
    const kind = wanted >= 3 ? 'interceptor' : 'cruiser';
    const built = buildPoliceCar(kind);
    const isRoadblock = wanted >= 5 && cars.length >= 3;
    const ang = Math.random() * Math.PI * 2;
    const dist = 26 + Math.random() * 14;
    built.x = playerX + Math.sin(ang) * dist;
    built.z = playerZ + Math.cos(ang) * dist;
    built.yaw = ang + Math.PI;
    built.speed = 0;
    built.kind = kind;
    built.roadblock = isRoadblock;
    cars.push(built);
  }
  while (cars.length > wantCars) {
    const c = cars.pop();
    scene_.remove(c.group);
  }
  while (officers.length < wantOfficers) {
    const built = buildOfficer();
    const ang = Math.random() * Math.PI * 2;
    built.x = playerX + Math.sin(ang) * 14;
    built.z = playerZ + Math.cos(ang) * 14;
    built.yaw = 0;
    built.speed = 0;
    officers.push(built);
  }
  while (officers.length > wantOfficers) {
    const o = officers.pop();
    scene_.remove(o.group);
  }
}

export function initPolice(scene, THREE) {
  THREE_ = THREE;
  scene_ = scene;
}

export function getWantedLevel() { return wanted; }
export function isFlashing() { return flashTimer > 0; }

export function increaseWanted(playerX, playerZ, amount = 1) {
  if (hitCooldown > 0) return;
  hitCooldown = 2.5;
  wanted = clamp(wanted + amount, 0, 5);
  evadeTimer = 0;
  ensureUnits(playerX, playerZ);
}

// playerState: { x, z, yaw, speed } of whatever the player currently controls (car/moto/foot)
// isVehicle: true if player is in a car/moto (used for ramming + roadblocks)
export function updatePolice(dt, playerState, isVehicle) {
  if (hitCooldown > 0) hitCooldown -= dt;
  if (flashTimer > 0) flashTimer -= dt;

  if (wanted <= 0) {
    if (cars.length || officers.length) despawnAll();
    setSirenActive(false);
    return { wanted: 0, flashing: false, nearestDist: Infinity, rammed: false };
  }

  let nearestDist = Infinity;
  let rammed = false;
  let pushX = 0, pushZ = 0;

  for (const c of cars) {
    const dx = playerState.x - c.x, dz = playerState.z - c.z;
    const dist = Math.hypot(dx, dz);
    nearestDist = Math.min(nearestDist, dist);

    if (!c.roadblock) {
      const spec = CAR_KIND[c.kind];
      const desiredYaw = Math.atan2(dx, dz);
      const diff = angDiff(c.yaw, desiredYaw);
      const steer = clamp(diff * 2.2, -1, 1);
      const speedFrac = Math.min(Math.abs(c.speed) / 7, 1);
      c.yaw += steer * (0.5 + Math.min(Math.abs(c.speed) / 30, 1) * 0.6) * speedFrac * Math.sign(c.speed || 1) * dt;
      const wantSpeed = dist > 4 ? spec.maxSpeed * (0.7 + Math.min(wanted / 5, 1) * 0.3) : spec.maxSpeed * 0.25;
      c.speed = damp(c.speed, wantSpeed, 2.2, dt);
      c.x += Math.sin(c.yaw) * c.speed * dt;
      c.z += Math.cos(c.yaw) * c.speed * dt;
    }

    for (const w of c.wheels) w.rotation.x += c.speed * dt / 0.35;
    const blink = Math.sin(performance.now() * 0.02) > 0;
    c.redMat.emissiveIntensity = blink ? 2.4 : 0.2;
    c.blueMat.emissiveIntensity = blink ? 0.2 : 2.4;
    c.beacon.intensity = 3;
    c.beacon.color.set(blink ? '#ff3030' : '#3060ff');
    c.group.position.set(c.x, 0, c.z);
    c.group.rotation.y = c.yaw;

    if (isVehicle && dist < 2.6 && wanted >= 3) {
      rammed = true;
      pushX += dx / (dist || 1);
      pushZ += dz / (dist || 1);
    }
  }

  for (const o of officers) {
    const dx = playerState.x - o.x, dz = playerState.z - o.z;
    const dist = Math.hypot(dx, dz);
    nearestDist = Math.min(nearestDist, dist);
    if (dist < 22) {
      const targetYaw = Math.atan2(dx, dz);
      o.yaw = damp(o.yaw, targetYaw, 6, dt);
      o.speed = damp(o.speed, 3.4, 4, dt);
    } else {
      o.speed = damp(o.speed, 0, 4, dt);
    }
    o.x += Math.sin(o.yaw) * o.speed * dt;
    o.z += Math.cos(o.yaw) * o.speed * dt;
    o.phase += dt * (2 + o.speed);
    const swing = Math.sin(o.phase) * 0.5 * clamp(o.speed / 3.4, 0, 1);
    o.legL.rotation.x = swing;
    o.legR.rotation.x = -swing;
    o.group.position.set(o.x, 0, o.z);
    o.group.rotation.y = o.yaw;
  }

  // roadblocks at max wanted: periodically drop stationary cruisers ahead of the player
  if (wanted >= 5 && isVehicle) {
    roadblockTimer -= dt;
    if (roadblockTimer <= 0) {
      roadblockTimer = 9;
      const ahead = 22;
      const rx = playerState.x + Math.sin(playerState.yaw) * ahead;
      const rz = playerState.z + Math.cos(playerState.yaw) * ahead;
      const idx = cars.findIndex(c => c.roadblock);
      if (idx >= 0) { cars[idx].x = rx; cars[idx].z = rz; cars[idx].yaw = playerState.yaw + Math.PI / 2; cars[idx].speed = 0; }
    }
  }

  // evasion: if every unit stays far away for EVADE_SECONDS, clear one star and flash
  if (nearestDist > EVADE_DIST) {
    evadeTimer += dt;
    if (evadeTimer >= EVADE_SECONDS) {
      wanted = clamp(wanted - 1, 0, 5);
      flashTimer = 1.2;
      evadeTimer = 0;
      ensureUnits(playerState.x, playerState.z);
    }
  } else {
    evadeTimer = 0;
  }

  setSirenActive(true, clamp(1 - nearestDist / 60, 0.15, 1));

  return { wanted, flashing: flashTimer > 0, nearestDist, rammed, pushX, pushZ };
}

export function getPoliceUnits() { return { cars, officers }; }

// test-only: set wanted level directly, bypassing the per-hit cooldown
export function __testSetWanted(level, x, z) {
  wanted = clamp(level, 0, 5);
  evadeTimer = 0;
  ensureUnits(x, z);
}
