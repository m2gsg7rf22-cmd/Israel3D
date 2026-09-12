let THREE_, scene_;
const ramps = [];
const markers = [];
let delivery = null; // { fromIdx, toIdx, timeLeft, reward }
let score = 0;
let splashTimer = 0;
let splashText = '';
let airborne = { active: false, startYaw: 0, spin: 0 };

// coordinates keep at least one axis on a street centerline (multiple of the
// 40m block pitch) so markers and ramps land clear of building footprints
const DELIVERY_LOCAL_POINTS = [
  { x: 0, z: 120 }, { x: -160, z: 0 }, { x: 120, z: -40 }, { x: -40, z: -160 }, { x: 160, z: 160 },
];
const DELIVERY_TIME = 45;
const MARKER_RADIUS = 5;

export function initMissions(scene, THREE) {
  THREE_ = THREE;
  scene_ = scene;

  const markerGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.1, 16);
  const markerMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffd23f', emissiveIntensity: 1.6, transparent: true, opacity: 0.75 });
  for (const p of DELIVERY_LOCAL_POINTS) {
    const mesh = new THREE.Mesh(markerGeo, markerMat.clone());
    mesh.position.set(p.x, 0.1, p.z);
    scene.add(mesh);
    const beam = new THREE.PointLight('#ffd23f', 2.2, 10);
    beam.position.set(p.x, 2, p.z);
    scene.add(beam);
    markers.push({ x: p.x, z: p.z, mesh, beam });
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

export function updateMissions(dt, playerX, playerZ, isVehicle) {
  const pulse = 0.6 + Math.sin(performance.now() * 0.004) * 0.4;
  for (const m of markers) m.mesh.material.emissiveIntensity = 1.2 + pulse;

  if (!delivery && isVehicle) {
    for (let i = 0; i < markers.length; i++) {
      const d = Math.hypot(markers[i].x - playerX, markers[i].z - playerZ);
      if (d < MARKER_RADIUS) {
        const toIdx = pickDestination(i);
        delivery = { toIdx, timeLeft: DELIVERY_TIME, reward: 80 + Math.floor(Math.random() * 60) };
        showSplash('משלוח החל! הגיעו ליעד בזמן', 1.8);
        break;
      }
    }
  } else if (delivery) {
    delivery.timeLeft -= dt;
    const dest = markers[delivery.toIdx];
    const d = Math.hypot(dest.x - playerX, dest.z - playerZ);
    if (d < MARKER_RADIUS) {
      score += delivery.reward;
      showSplash(`המשלוח הושלם! +₪${delivery.reward}`, 2.0);
      delivery = null;
    } else if (delivery.timeLeft <= 0) {
      showSplash('המשלוח נכשל — נגמר הזמן', 1.8);
      delivery = null;
    }
  }

  if (splashTimer > 0) splashTimer -= dt;

  let waypoint = null;
  if (delivery) {
    const dest = markers[delivery.toIdx];
    waypoint = { x: dest.x, z: dest.z, dist: Math.hypot(dest.x - playerX, dest.z - playerZ), timeLeft: Math.max(0, delivery.timeLeft) };
  }

  for (const r of ramps) if (r.cooldown > 0) r.cooldown -= dt;

  return { score, waypoint, splash: splashTimer > 0 ? splashText : null };
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

export function onAirborneStart(yaw) {
  airborne.active = true;
  airborne.startYaw = yaw;
  airborne.spin = 0;
}
export function onAirborneFrame(prevYaw, currentYaw) {
  if (!airborne.active) return;
  let d = ((currentYaw - prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  airborne.spin += Math.abs(d);
}
export function onAirborneEnd() {
  if (!airborne.active) return;
  airborne.active = false;
  if (airborne.spin > 0.9) {
    showSplash('STUNT JUMP COMPLETED!', 2.2);
  }
}

export function getScore() { return score; }
export function getMarkers() { return markers.map(m => ({ x: m.x, z: m.z })); }
export function getRamps() { return ramps.map(r => ({ x: r.x, z: r.z, yaw: r.yaw })); }
