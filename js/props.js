import { setHydrantSpray } from './audio.js';

let THREE_, scene_;

// ---------------------------------------------------------------
// shared particle pool (debris, sparks, smoke, water spray)
// ---------------------------------------------------------------
const MAX_PARTICLES = 220;
const particles = [];
let particleMesh;
let pM, pQ, pPos, pScale, pColor;

function initParticles() {
  const geo = new THREE_.BoxGeometry(1, 1, 1);
  const mat = new THREE_.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  particleMesh = new THREE_.InstancedMesh(geo, mat, MAX_PARTICLES);
  particleMesh.instanceMatrix.setUsage(THREE_.DynamicDrawUsage);
  particleMesh.frustumCulled = false;
  scene_.add(particleMesh);
  pM = new THREE_.Matrix4();
  pQ = new THREE_.Quaternion();
  pPos = new THREE_.Vector3();
  pScale = new THREE_.Vector3();
  pColor = new THREE_.Color();
  for (let i = 0; i < MAX_PARTICLES; i++) particles.push({ active: false });
}

function spawnParticle(x, y, z, vx, vy, vz, size, color, life, gravity) {
  const p = particles.find(p => !p.active);
  if (!p) return;
  p.active = true;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.size = size; p.color = color; p.life = life; p.maxLife = life;
  p.gravity = gravity;
}

export function spawnDebrisBurst(x, y, z, color = '#888', count = 10) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 3;
    spawnParticle(x, y, z, Math.cos(ang) * spd, 2 + Math.random() * 3, Math.sin(ang) * spd, 0.08 + Math.random() * 0.1, color, 0.8 + Math.random() * 0.6, 9);
  }
}
export function spawnSparks(x, y, z, dirX = 0, dirZ = 1, count = 8) {
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 1.4;
    spawnParticle(x, y, z, dirX * 2 + spread, 1 + Math.random() * 2, dirZ * 2 + spread, 0.04, '#ffcf6b', 0.35 + Math.random() * 0.2, 6);
  }
}
export function spawnSmoke(x, y, z, count = 2) {
  for (let i = 0; i < count; i++) {
    spawnParticle(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.2, '#8a8a8a', 1.2, 0.5);
  }
}
export function spawnSpray(x, y, z, count = 3) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spread = Math.random() * 0.5;
    spawnParticle(x + Math.cos(ang) * spread, y, z + Math.sin(ang) * spread, Math.cos(ang) * 0.8, 6 + Math.random() * 2, Math.sin(ang) * 0.8, 0.07, '#bfe4ff', 1.0, 9);
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    if (!p.active) continue;
    p.vy -= p.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.life -= dt;
    if (p.y < 0 || p.life <= 0) { p.active = false; }
  }
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[i];
    if (p.active) {
      const fade = clamp01(p.life / p.maxLife);
      pPos.set(p.x, p.y, p.z);
      pScale.setScalar(p.size * (0.5 + fade * 0.5));
      pM.compose(pPos, pQ, pScale);
      particleMesh.setMatrixAt(i, pM);
      pColor.set(p.color);
      particleMesh.setColorAt(i, pColor);
    } else {
      pPos.set(0, -50, 0);
      pScale.setScalar(0.0001);
      pM.compose(pPos, pQ, pScale);
      particleMesh.setMatrixAt(i, pM);
    }
  }
  particleMesh.instanceMatrix.needsUpdate = true;
  if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ---------------------------------------------------------------
// destructible props: hydrants, trash cans, cones (instanced pools)
// ---------------------------------------------------------------
const hydrants = [], cans = [], cones = [];
let hydrantMesh, canMesh, coneMesh;
let sprayActiveCount = 0;

function placeProps(grid, block, lot, cityHalf, seed) {
  const rng = mulberrySeeded(seed + 3021);
  const r = lot / 2 + 1.6;
  for (let bx = 0; bx < grid; bx++) {
    for (let bz = 0; bz < grid; bz++) {
      const cx = (bx - grid / 2 + 0.5) * block, cz = (bz - grid / 2 + 0.5) * block;
      if (rng() < 0.12) {
        const corner = Math.floor(rng() * 4);
        hydrants.push(propAt(cx, cz, corner, r));
      }
      if (rng() < 0.18) {
        const corner = Math.floor(rng() * 4);
        cans.push(propAt(cx, cz, corner, r + 0.6));
      }
      if (rng() < 0.1) {
        const corner = Math.floor(rng() * 4);
        cones.push(propAt(cx, cz, corner, r - 0.8));
      }
    }
  }
}
function propAt(cx, cz, corner, r) {
  const x = cx + (corner % 2 === 0 ? -r : r);
  const z = cz + (corner < 2 ? -r : r);
  return { x, z, alive: true, broken: false, tilt: 0, knockVx: 0, knockVz: 0, sprayTimer: 0 };
}
function mulberrySeeded(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syncPropMesh(mesh, list, baseHeight) {
  const m = new THREE_.Matrix4();
  const q = new THREE_.Quaternion();
  const pos = new THREE_.Vector3();
  const scale = new THREE_.Vector3(1, 1, 1);
  const euler = new THREE_.Euler();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) {
      scale.setScalar(0.0001);
      pos.set(p.x, -5, p.z);
      m.compose(pos, q, scale);
    } else {
      pos.set(p.x, baseHeight, p.z);
      euler.set(p.tilt, 0, p.tilt * 0.3);
      q.setFromEuler(euler);
      scale.setScalar(1);
      m.compose(pos, q, scale);
    }
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function initProps(scene, THREE, opts) {
  THREE_ = THREE;
  scene_ = scene;
  initParticles();
  placeProps(opts.grid, opts.block, opts.lot, opts.cityHalf, opts.seed);

  const hydrantGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.55, 8);
  const hydrantMat = new THREE.MeshStandardMaterial({ color: '#c8352b', roughness: 0.6, metalness: 0.2 });
  hydrantMesh = new THREE.InstancedMesh(hydrantGeo, hydrantMat, Math.max(1, hydrants.length));
  hydrantMesh.castShadow = true;
  scene.add(hydrantMesh);

  const canGeo = new THREE.CylinderGeometry(0.22, 0.2, 0.5, 10);
  const canMat = new THREE.MeshStandardMaterial({ color: '#5a6672', roughness: 0.8, metalness: 0.1 });
  canMesh = new THREE.InstancedMesh(canGeo, canMat, Math.max(1, cans.length));
  canMesh.castShadow = true;
  scene.add(canMesh);

  const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
  const coneMat = new THREE.MeshStandardMaterial({ color: '#e0722a', roughness: 0.7 });
  coneMesh = new THREE.InstancedMesh(coneGeo, coneMat, Math.max(1, cones.length));
  coneMesh.castShadow = true;
  scene.add(coneMesh);

  syncPropMesh(hydrantMesh, hydrants, 0.28);
  syncPropMesh(canMesh, cans, 0.25);
  syncPropMesh(coneMesh, cones, 0.25);
}

function tryHit(list, x, z, radius, speed, onHit) {
  const speedKmh = Math.abs(speed) * 3.6;
  if (speedKmh < 8) return false;
  let hitAny = false;
  for (const p of list) {
    if (!p.alive || p.broken) continue;
    const dist = Math.hypot(p.x - x, p.z - z);
    if (dist > radius) continue;
    p.broken = true;
    const dirLen = dist || 0.01;
    p.knockVx = ((p.x - x) / dirLen) * 4;
    p.knockVz = ((p.z - z) / dirLen) * 4;
    onHit(p);
    hitAny = true;
  }
  return hitAny;
}

export function vehicleHitProps(x, z, speed) {
  let anySpark = false;
  const hydrantHit = tryHit(hydrants, x, z, 1.1, speed, (p) => {
    p.sprayTimer = 6;
    spawnDebrisBurst(p.x, 0.5, p.z, '#c8352b', 6);
  });
  tryHit(cans, x, z, 0.9, speed, (p) => {
    spawnDebrisBurst(p.x, 0.4, p.z, '#5a6672', 8);
  });
  tryHit(cones, x, z, 0.7, speed, (p) => {
    spawnDebrisBurst(p.x, 0.3, p.z, '#e0722a', 5);
  });
  return { hydrantHit };
}

export function scrapeSparks(x, z, dirX, dirZ) {
  spawnSparks(x, 0.5, z, dirX, dirZ, 6);
}

export function updateProps(dt) {
  updateParticles(dt);

  let anySpraying = false;
  for (const p of hydrants) {
    if (p.broken) {
      p.x += p.knockVx * dt; p.z += p.knockVz * dt;
      p.knockVx *= (1 - 3 * dt); p.knockVz *= (1 - 3 * dt);
      p.tilt = Math.min(p.tilt + dt * 6, Math.PI / 2);
      if (p.sprayTimer > 0) {
        p.sprayTimer -= dt;
        anySpraying = true;
        if (Math.random() < 0.8) spawnSpray(p.x, 0.5, p.z, 2);
      } else {
        p.alive = false;
      }
    }
  }
  if (anySpraying !== sprayActiveCount > 0) setHydrantSpray(anySpraying);
  sprayActiveCount = anySpraying ? 1 : 0;

  for (const p of cans) {
    if (p.broken) {
      p.x += p.knockVx * dt; p.z += p.knockVz * dt;
      p.knockVx *= (1 - 4 * dt); p.knockVz *= (1 - 4 * dt);
      p.tilt = Math.min(p.tilt + dt * 8, Math.PI / 2);
      p.aliveTimer = (p.aliveTimer || 3) - dt;
      if (p.aliveTimer <= 0) p.alive = false;
    }
  }
  for (const p of cones) {
    if (p.broken) {
      p.x += p.knockVx * dt; p.z += p.knockVz * dt;
      p.knockVx *= (1 - 4 * dt); p.knockVz *= (1 - 4 * dt);
      p.tilt = Math.min(p.tilt + dt * 10, Math.PI / 2);
      p.aliveTimer = (p.aliveTimer || 2.5) - dt;
      if (p.aliveTimer <= 0) p.alive = false;
    }
  }

  syncPropMesh(hydrantMesh, hydrants, 0.28);
  syncPropMesh(canMesh, cans, 0.25);
  syncPropMesh(coneMesh, cones, 0.25);
}

export function getProps() { return { hydrants, cans, cones }; }
