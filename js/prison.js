// Prison compound + escape system. Reserves a 3x3 block cluster (game.js
// adds these to cityArchitecture's skipBlocks) for a walled compound: a
// perimeter concrete wall topped with barbed wire, four corner guard towers
// with rotating spotlights, a main gate, an interior yard with benches and
// a basketball hoop, a cell block, and a small HQ building.
//
// The five escape missions share one real mechanic rather than five unique
// ones: reach a mission-specific target point inside the compound without
// being caught in a patrolling guard's forward detection cone. What differs
// per mission is the narrative (shown as on-screen text), the target
// location, and which guard you have to avoid -- reusing one proven
// mechanic five times, honestly, beats faking five different minigames.
export const PRISON_X = -140;
export const PRISON_Z = 180;
const HALF = 55; // compound footprint half-extent
const WALL_HEIGHT = 9;

const MISSIONS = [
  { id: 'lockpick', title: 'פריצת המנעול האלקטרוני', text: 'התגנב אל חדר הבקרה מבלי שהזרקור יתפוס אותך, ולחץ על מתג החירום.', targetLocal: { x: 0, z: -HALF + 14 } },
  { id: 'keys', title: 'גניבת מפתחות השומר', text: 'התקרב מאחורי השומר המסתובב בחצר מבלי שיבחין בך, ורוץ אל השער הראשי.', targetLocal: { x: -HALF + 10, z: 0 } },
  { id: 'tunnel', title: 'חפירת תעלת המפלט', text: 'הגע לפינה הנסתרת ליד בלוק התאים מבלי שהשומר בסיור יבחין בך.', targetLocal: { x: HALF - 12, z: -10 } },
  { id: 'riot', title: 'המרד הגדול בחצר', text: 'נצל את ההמולה בחצר וטפס על גדר התיל האחורית מבלי שיתפסו אותך.', targetLocal: { x: 0, z: HALF - 8 } },
  { id: 'carjack', title: 'גניבת ניידת משטרה חונה', text: 'התגנב לחניה הפנימית והגע לניידת החונה מבלי שהשומר יבחין בך.', targetLocal: { x: HALF - 10, z: HALF - 15 } },
];

const DETECT_RANGE = 12;
const DETECT_HALF_ANGLE_COS = 0.55; // guard's forward cone (~56.6 degrees each side)
const TARGET_RADIUS = 4;

let THREE_, scene_;
let towers = [];
let guard = null;
let spotAngle = 0;

function wallSegment(THREE, w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildTower(THREE, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const postMat = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.9 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, WALL_HEIGHT + 4, 8), postMat);
  post.position.y = (WALL_HEIGHT + 4) / 2;
  post.castShadow = true;
  group.add(post);
  const cabinMat = new THREE.MeshStandardMaterial({ color: '#20242c', roughness: 0.6 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 3.4), cabinMat);
  cabin.position.y = WALL_HEIGHT + 4 + 1.2;
  cabin.castShadow = true;
  group.add(cabin);

  const spot = new THREE.SpotLight('#fffbe0', 4, 70, Math.PI / 8, 0.4, 1.2);
  spot.position.set(0, WALL_HEIGHT + 4 + 1.2, 0);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(20, 0, 0);
  group.add(spotTarget);
  spot.target = spotTarget;
  group.add(spot);

  scene_.add(group);
  return { group, spot, spotTarget, phase: Math.random() * Math.PI * 2 };
}

function buildGuard(THREE, x, z) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: '#3a2f1c', roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c68863', roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), uniform);
  torso.position.y = 1.24;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), skin);
  head.position.y = 1.62;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.08, 8), new THREE.MeshStandardMaterial({ color: '#1c1c1c' }));
  cap.position.y = 1.74;
  group.add(cap);
  // a visible "eye" wedge on the front so the guard's facing direction reads clearly
  const visor = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffd23f', emissiveIntensity: 0.6 }));
  visor.rotation.x = Math.PI / 2;
  visor.position.set(0, 1.62, 0.18);
  group.add(visor);
  group.position.set(x, 0, z);
  scene_.add(group);
  return { group, x, z, yaw: 0, pathIndex: 0 };
}

export function initPrison(scene, THREE) {
  THREE_ = THREE;
  scene_ = scene;

  const wallMat = new THREE.MeshStandardMaterial({ color: '#6b6f76', roughness: 0.95 });
  const wireMat = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.6, metalness: 0.4 });
  const thickness = 1.4;
  const walls = [
    wallSegment(THREE, HALF * 2, WALL_HEIGHT, thickness, 0, WALL_HEIGHT / 2, -HALF, wallMat),
    wallSegment(THREE, HALF * 2, WALL_HEIGHT, thickness, 0, WALL_HEIGHT / 2, HALF, wallMat),
    wallSegment(THREE, thickness, WALL_HEIGHT, HALF * 2, -HALF, WALL_HEIGHT / 2, 0, wallMat),
    // east wall has a gate gap in the middle -- built as two shorter segments
    wallSegment(THREE, thickness, WALL_HEIGHT, HALF - 8, HALF, WALL_HEIGHT / 2, -(HALF - (HALF - 8) / 2), wallMat),
    wallSegment(THREE, thickness, WALL_HEIGHT, HALF - 8, HALF, WALL_HEIGHT / 2, (HALF - (HALF - 8) / 2), wallMat),
  ];
  const group = new THREE.Group();
  group.position.set(PRISON_X, 0, PRISON_Z);
  for (const w of walls) group.add(w);

  // barbed wire: a thin ring strip along the top of each wall segment
  for (const w of walls) {
    const wireGeo = new THREE.TorusGeometry(0.15, 0.04, 4, 8);
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.rotation.x = Math.PI / 2;
    wire.scale.set(Math.max(w.geometry.parameters.width, w.geometry.parameters.depth) / 0.3, 1, 1);
    wire.position.set(w.position.x, WALL_HEIGHT + 0.3, w.position.z);
    group.add(wire);
  }

  // interior yard ground
  const yardMat = new THREE.MeshStandardMaterial({ color: '#8a8a86', roughness: 1 });
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 - thickness * 2, HALF * 2 - thickness * 2), yardMat);
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = 0.02;
  yard.receiveShadow = true;
  group.add(yard);

  // cell block
  const cellMat = new THREE.MeshStandardMaterial({ color: '#4a4a4e', roughness: 0.9 });
  const cellBlock = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 16), cellMat);
  cellBlock.position.set(0, 5, -HALF + 22);
  cellBlock.castShadow = true;
  group.add(cellBlock);
  const doorMat = new THREE.MeshStandardMaterial({ color: '#20211f', roughness: 0.5, metalness: 0.6 });
  for (let i = -2; i <= 2; i++) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 3.2, 0.3), doorMat);
    door.position.set(i * 5, 1.8, -HALF + 22 - 8.1);
    group.add(door);
  }

  // HQ building near the gate, offset to the side so it doesn't block the
  // gate's sightline (the entry point faces straight into the yard)
  const hqMat = new THREE.MeshStandardMaterial({ color: '#5a5248', roughness: 0.85 });
  const hq = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 10), hqMat);
  hq.position.set(HALF - 14, 3, 22);
  hq.castShadow = true;
  group.add(hq);

  // yard furniture: benches + a basketball hoop
  const benchMat = new THREE.MeshStandardMaterial({ color: '#5a4130', roughness: 0.85 });
  for (const [bx, bz] of [[-10, 5], [10, 5], [-10, -5], [10, -5]]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.5), benchMat);
    bench.position.set(bx, 0.2, bz);
    group.add(bench);
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.5, metalness: 0.6 });
  const hoopPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8), poleMat);
  hoopPole.position.set(0, 1.6, 5);
  group.add(hoopPole);
  const backboard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: '#e8e8e8' }));
  backboard.position.set(0, 3, 5.3);
  group.add(backboard);

  scene.add(group);

  // corner towers, at the four compound corners
  towers = [
    buildTower(THREE, PRISON_X - HALF + 2, PRISON_Z - HALF + 2),
    buildTower(THREE, PRISON_X + HALF - 2, PRISON_Z - HALF + 2),
    buildTower(THREE, PRISON_X - HALF + 2, PRISON_Z + HALF - 2),
    buildTower(THREE, PRISON_X + HALF - 2, PRISON_Z + HALF - 2),
  ];

  // one patrolling guard, walking a fixed loop through the yard -- the core
  // detection mechanic every escape mission is checked against
  guard = buildGuard(THREE, PRISON_X - 10, PRISON_Z);
  guard.path = [
    { x: PRISON_X - 15, z: PRISON_Z - 15 },
    { x: PRISON_X + 15, z: PRISON_Z - 15 },
    { x: PRISON_X + 15, z: PRISON_Z + 15 },
    { x: PRISON_X - 15, z: PRISON_Z + 15 },
  ];
}

export function updatePrison(dt) {
  for (const t of towers) {
    t.phase += dt * 0.5;
    const ang = Math.sin(t.phase) * Math.PI * 0.9; // sweeps back and forth, not a full circle
    t.spotTarget.position.set(Math.sin(ang) * 25, -8, Math.cos(ang) * 25);
  }
  if (guard) {
    const wp = guard.path[guard.pathIndex];
    const dx = wp.x - guard.x, dz = wp.z - guard.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) {
      guard.pathIndex = (guard.pathIndex + 1) % guard.path.length;
    } else {
      const targetYaw = Math.atan2(dx, dz);
      const diff = ((targetYaw - guard.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      guard.yaw += Math.max(-2 * dt, Math.min(2 * dt, diff));
      guard.x += Math.sin(guard.yaw) * 2.2 * dt;
      guard.z += Math.cos(guard.yaw) * 2.2 * dt;
    }
    guard.group.position.set(guard.x, 0, guard.z);
    guard.group.rotation.y = guard.yaw;
  }
}

// true if the guard's forward cone currently covers (x,z) within DETECT_RANGE
export function isSeenByGuard(x, z) {
  if (!guard) return false;
  const dx = x - guard.x, dz = z - guard.z;
  const dist = Math.hypot(dx, dz);
  if (dist > DETECT_RANGE || dist < 0.01) return false;
  const dot = (dx / dist) * Math.sin(guard.yaw) + (dz / dist) * Math.cos(guard.yaw);
  return dot > DETECT_HALF_ANGLE_COS;
}

export function pickRandomMission() {
  return MISSIONS[Math.floor(Math.random() * MISSIONS.length)];
}

export function getMissionTargetWorld(mission) {
  return { x: PRISON_X + mission.targetLocal.x, z: PRISON_Z + mission.targetLocal.z };
}

export function distanceToMissionTarget(mission, x, z) {
  const t = getMissionTargetWorld(mission);
  return Math.hypot(t.x - x, t.z - z);
}

export const TARGET_REACH_RADIUS = TARGET_RADIUS;

// entry point just inside the main gate, facing into the yard
export function getPrisonEntryPoint() {
  return { x: PRISON_X + HALF - 6, z: PRISON_Z, yaw: -Math.PI / 2 };
}

// true once the player has walked back out past the gate line without
// actually completing an escape mission -- there's no free walk-out, per spec
export function isOutsideCompound(x) {
  return x > PRISON_X + HALF - 2;
}

// four thin wall-segment AABBs (with a gap for the east gate), NOT one solid
// box over the whole compound -- a solid box would also cover the yard, and
// resolveCircleVsBuildings would eject the player the instant they're
// teleported inside for an arrest, since it always pushes toward the
// nearest edge regardless of which direction something entered from
export function getPrisonWallAABBs(block, cityHalf) {
  const t = 1.4;
  const segs = [
    { minX: -HALF, maxX: HALF, minZ: -HALF - t / 2, maxZ: -HALF + t / 2 }, // south
    { minX: -HALF, maxX: HALF, minZ: HALF - t / 2, maxZ: HALF + t / 2 },   // north
    { minX: -HALF - t / 2, maxX: -HALF + t / 2, minZ: -HALF, maxZ: HALF }, // west
    { minX: HALF - t / 2, maxX: HALF + t / 2, minZ: -HALF, maxZ: -8 },     // east, south of the gate gap
    { minX: HALF - t / 2, maxX: HALF + t / 2, minZ: 8, maxZ: HALF },       // east, north of the gate gap
  ];
  return segs.map((s) => {
    const worldMinX = PRISON_X + s.minX, worldMaxX = PRISON_X + s.maxX;
    const worldMinZ = PRISON_Z + s.minZ, worldMaxZ = PRISON_Z + s.maxZ;
    const cx = (worldMinX + worldMaxX) / 2, cz = (worldMinZ + worldMaxZ) / 2;
    const bx = Math.round((cx + cityHalf) / block - 0.5);
    const bz = Math.round((cz + cityHalf) / block - 0.5);
    return { minX: worldMinX, maxX: worldMaxX, minZ: worldMinZ, maxZ: worldMaxZ, bx, bz };
  });
}
