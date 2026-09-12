let THREE_;
let scene_;
const peds = [];
const parts = {};

const SKIN_TONES = ['#e0b28e', '#c68863', '#8d5524', '#f1c27d', '#5c3a21', '#a9744f'];
const SHIRT_COLORS = ['#2f5fa8', '#b5442e', '#3f8f5f', '#c9a227', '#6a4c93', '#3a3f47', '#d1d1d1', '#8a3b5e'];
const PANTS_COLORS = ['#33384a', '#5b4636', '#2b2b2b', '#4a5568', '#6b6b6b'];
const HAIR_COLORS = ['#1c1410', '#3b2a1a', '#6b4a2a', '#c9a876', '#0e0e0e', '#8a8a8a'];

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

function blockCenter(bx, bz, grid, block) {
  return { x: (bx - grid / 2 + 0.5) * block, z: (bz - grid / 2 + 0.5) * block };
}
function blockLoop(cx, cz, r) {
  return [
    { x: cx - r, z: cz - r },
    { x: cx + r, z: cz - r },
    { x: cx + r, z: cz + r },
    { x: cx - r, z: cz + r },
  ];
}

function makePartMesh(geo, count) {
  const mat = new THREE_.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.02 });
  const mesh = new THREE_.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE_.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene_.add(mesh);
  return mesh;
}

// scratch objects reused every frame to avoid per-instance/per-part allocation
let _root, _localM, _partM, _q, _rootPos, _rootEuler, _rootScale, _localPos, _localEuler, _localScale, _tmpColor;

export function spawnPedestrians(scene, THREE, opts) {
  THREE_ = THREE;
  scene_ = scene;
  _root = new THREE.Matrix4();
  _localM = new THREE.Matrix4();
  _partM = new THREE.Matrix4();
  _q = new THREE.Quaternion();
  _rootPos = new THREE.Vector3();
  _rootEuler = new THREE.Euler();
  _rootScale = new THREE.Vector3();
  _localPos = new THREE.Vector3();
  _localEuler = new THREE.Euler();
  _localScale = new THREE.Vector3();
  _tmpColor = new THREE.Color();

  const { grid, block, lot, seed = 1234, count = 32 } = opts;

  parts.torso = makePartMesh(new THREE.BoxGeometry(0.4, 0.55, 0.22), count);
  parts.head = makePartMesh(new THREE.SphereGeometry(0.15, 10, 8), count);
  parts.hair = makePartMesh(new THREE.SphereGeometry(0.155, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), count);
  parts.legL = makePartMesh(new THREE.BoxGeometry(0.13, 0.8, 0.13), count);
  parts.legR = makePartMesh(new THREE.BoxGeometry(0.13, 0.8, 0.13), count);
  parts.armL = makePartMesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), count);
  parts.armR = makePartMesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), count);
  parts.hat = makePartMesh(new THREE.CylinderGeometry(0.17, 0.19, 0.1, 10), count);
  parts.backpack = makePartMesh(new THREE.BoxGeometry(0.26, 0.32, 0.14), count);

  const rng = mulberry32(seed + 555);

  // sidewalk loops around a cluster of blocks near the spawn area; a few
  // adjacent pairs are merged so a pedestrian occasionally crosses the street
  const centerB = grid / 2;
  const candidateBlocks = [];
  for (let bx = centerB - 3; bx <= centerB + 3; bx++) {
    for (let bz = centerB - 3; bz <= centerB + 3; bz++) {
      if (bx < 0 || bz < 0 || bx >= grid || bz >= grid) continue;
      candidateBlocks.push({ bx, bz });
    }
  }
  const r = lot / 2 + 2.2;
  const loops = [];
  for (const b of candidateBlocks) {
    const c = blockCenter(b.bx, b.bz, grid, block);
    loops.push(blockLoop(c.x, c.z, r));
  }
  for (let i = 0; i < loops.length - 1 && i < 6; i += 2) {
    loops[i] = loops[i].concat(loops[i + 1]);
    loops[i + 1] = null;
  }
  const walkPaths = loops.filter(Boolean);

  const idleAnchors = [];
  for (let i = 0; i < 4; i++) {
    const b = candidateBlocks[Math.floor(rng() * candidateBlocks.length)];
    const c = blockCenter(b.bx, b.bz, grid, block);
    const ang = rng() * Math.PI * 2;
    idleAnchors.push({ x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r });
  }

  const idleCount = Math.round(count * 0.25);
  for (let i = 0; i < count; i++) {
    const isIdle = i < idleCount;
    const ped = {
      idx: i,
      skin: pick(rng, SKIN_TONES),
      shirt: pick(rng, SHIRT_COLORS),
      pants: pick(rng, PANTS_COLORS),
      hair: pick(rng, HAIR_COLORS),
      hasHat: rng() < 0.22,
      hasBackpack: rng() < 0.3,
      heightScale: 0.94 + rng() * 0.14,
      walkSpeed: 1.1 + rng() * 0.5,
      fleeSpeed: 3.6 + rng() * 0.8,
      phase: rng() * Math.PI * 2,
      state: isIdle ? 'idle' : 'walk',
      swayPhase: rng() * Math.PI * 2,
      tilt: 0,
      knockDir: { x: 0, z: 1 },
      downTimer: 0,
      fleeTimer: 0,
      fleeDir: { x: 0, z: 1 },
      speed: 0,
      yaw: 0,
    };
    if (isIdle) {
      const a = idleAnchors[i % idleAnchors.length];
      ped.x = a.x + (rng() - 0.5) * 2.5;
      ped.z = a.z + (rng() - 0.5) * 2.5;
      ped.yaw = rng() * Math.PI * 2;
      ped.path = null;
    } else {
      const path = walkPaths[i % walkPaths.length];
      const startIdx = Math.floor(rng() * path.length);
      ped.path = path;
      ped.pathIndex = startIdx;
      ped.x = path[startIdx].x;
      ped.z = path[startIdx].z;
      ped.speed = ped.walkSpeed;
    }
    peds.push(ped);
  }

  return peds;
}

function composeRoot(ped) {
  _rootPos.set(ped.x, 0, ped.z);
  _rootEuler.set(ped.tilt, ped.yaw, 0, 'YXZ');
  _q.setFromEuler(_rootEuler);
  _rootScale.setScalar(ped.heightScale);
  _root.compose(_rootPos, _q, _rootScale);
}

function setPart(name, index, px, py, pz, ex, visible = true) {
  _localPos.set(px, py, pz);
  _localEuler.set(ex, 0, 0);
  _q.setFromEuler(_localEuler);
  _localScale.setScalar(visible ? 1 : 0.0001);
  _localM.compose(_localPos, _q, _localScale);
  _partM.multiplyMatrices(_root, _localM);
  parts[name].setMatrixAt(index, _partM);
}

function setPartColor(name, index, hex) {
  _tmpColor.set(hex);
  parts[name].setColorAt(index, _tmpColor);
}

function separationPush(ped, dt) {
  let px = 0, pz = 0;
  for (const other of peds) {
    if (other === ped || other.state === 'down' || other.state === 'gettingUp') continue;
    const dx = ped.x - other.x, dz = ped.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 0.9) {
      const f = (0.9 - d) / 0.9;
      px += (dx / d) * f;
      pz += (dz / d) * f;
    }
  }
  ped.x += px * dt * 1.2;
  ped.z += pz * dt * 1.2;
}

function advanceWalk(ped, dt) {
  const wp = ped.path[ped.pathIndex];
  const dx = wp.x - ped.x, dz = wp.z - ped.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.6) {
    ped.pathIndex = (ped.pathIndex + 1) % ped.path.length;
  } else {
    const targetYaw = Math.atan2(dx, dz);
    const diff = ((targetYaw - ped.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    ped.yaw += clamp(diff, -3 * dt, 3 * dt);
    ped.speed = damp(ped.speed, ped.walkSpeed, 4, dt);
    ped.x += Math.sin(ped.yaw) * ped.speed * dt;
    ped.z += Math.cos(ped.yaw) * ped.speed * dt;
  }
  separationPush(ped, dt);
}

export function updatePedestrians(dt) {
  for (const ped of peds) {
    if (ped.state === 'idle') {
      ped.swayPhase += dt * 1.4;
      ped.speed = 0;
    } else if (ped.state === 'walk') {
      advanceWalk(ped, dt);
      ped.phase += dt * (2.2 + ped.speed * 1.1);
    } else if (ped.state === 'flee') {
      ped.yaw = Math.atan2(ped.fleeDir.x, ped.fleeDir.z);
      ped.speed = damp(ped.speed, ped.fleeSpeed, 6, dt);
      ped.x += ped.fleeDir.x * ped.speed * dt;
      ped.z += ped.fleeDir.z * ped.speed * dt;
      ped.phase += dt * (2.2 + ped.speed * 1.3);
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) {
        ped.state = ped.path ? 'walk' : 'idle';
        ped.speed = 0;
      }
    } else if (ped.state === 'down') {
      ped.speed = damp(ped.speed, 0, 3, dt);
      ped.x += ped.knockDir.x * ped.speed * dt;
      ped.z += ped.knockDir.z * ped.speed * dt;
      ped.tilt = damp(ped.tilt, -Math.PI / 2, 8, dt);
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.state = 'gettingUp';
    } else if (ped.state === 'gettingUp') {
      ped.tilt = damp(ped.tilt, 0, 5, dt);
      if (Math.abs(ped.tilt) < 0.05) {
        ped.tilt = 0;
        ped.state = 'flee';
        ped.fleeTimer = 2.5 + Math.random() * 2;
        ped.yaw = Math.atan2(ped.knockDir.x, ped.knockDir.z);
        ped.fleeDir = { x: ped.knockDir.x, z: ped.knockDir.z };
      }
    }

    composeRoot(ped);
    const i = ped.idx;
    setPartColor('torso', i, ped.shirt);
    setPartColor('head', i, ped.skin);
    setPartColor('hair', i, ped.hair);
    setPartColor('legL', i, ped.pants);
    setPartColor('legR', i, ped.pants);
    setPartColor('armL', i, ped.shirt);
    setPartColor('armR', i, ped.shirt);
    setPartColor('hat', i, '#20242c');
    setPartColor('backpack', i, '#2c3e50');

    let swing = 0, armSwing = 0, sway = 0;
    if (ped.state === 'idle') {
      sway = Math.sin(ped.swayPhase) * 0.05;
    } else if (ped.state === 'walk' || ped.state === 'flee') {
      const speedFactor = clamp(ped.speed / ped.walkSpeed, 0, 1.6);
      swing = Math.sin(ped.phase) * 0.5 * speedFactor;
      armSwing = swing * 0.8;
    }

    setPart('torso', i, 0, 1.24 + sway * 0.2, 0, sway);
    setPart('head', i, 0, 1.62, 0, 0);
    setPart('hair', i, 0, 1.68, -0.02, -0.2);
    setPart('legL', i, -0.11, 0.9, 0, swing);
    setPart('legR', i, 0.11, 0.9, 0, -swing);
    setPart('armL', i, -0.28, 1.42, 0, -armSwing);
    setPart('armR', i, 0.28, 1.42, 0, armSwing);
    setPart('hat', i, 0, 1.78, 0, 0, ped.hasHat);
    setPart('backpack', i, 0, 1.3, -0.16, 0, ped.hasBackpack);
  }

  for (const key in parts) {
    parts[key].instanceMatrix.needsUpdate = true;
    if (parts[key].instanceColor) parts[key].instanceColor.needsUpdate = true;
  }
}

export function punchNear(x, z, yaw, range = 1.5, halfAngleCos = 0.45) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  let hitAny = false;
  for (const p of peds) {
    if (p.state === 'down' || p.state === 'gettingUp') continue;
    const dx = p.x - x, dz = p.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || dist < 0.01) continue;
    const dot = (dx / dist) * fx + (dz / dist) * fz;
    if (dot < halfAngleCos) continue;
    hitAny = true;
    p.state = 'flee';
    p.fleeTimer = 3 + Math.random() * 2;
    p.fleeDir = { x: dx / dist, z: dz / dist };
    for (const q of peds) {
      if (q === p || q.state === 'down' || q.state === 'gettingUp') continue;
      const qd = Math.hypot(q.x - x, q.z - z);
      if (qd < 4) {
        q.state = 'flee';
        q.fleeTimer = 2 + Math.random() * 1.5;
        const qdx = q.x - x, qdz = q.z - z, qdist = Math.hypot(qdx, qdz) || 1;
        q.fleeDir = { x: qdx / qdist, z: qdz / qdist };
      }
    }
  }
  return hitAny;
}

export function vehicleHitPedestrians(vx, vz, vspeed, radius = 1.15, speedThresholdKmh = 5) {
  const speedKmh = Math.abs(vspeed) * 3.6;
  if (speedKmh < speedThresholdKmh) return false;
  let hitAny = false;
  for (const p of peds) {
    if (p.state === 'down' || p.state === 'gettingUp') continue;
    const dx = p.x - vx, dz = p.z - vz;
    const dist = Math.hypot(dx, dz);
    if (dist > radius) continue;
    hitAny = true;
    p.state = 'down';
    p.downTimer = 2.5 + Math.random() * 1.5;
    const dirLen = dist || 0.01;
    p.knockDir = { x: dx / dirLen, z: dz / dirLen };
    p.speed = Math.min(6, Math.abs(vspeed) * 0.6);
  }
  return hitAny;
}

export function getPedestrians() { return peds; }
