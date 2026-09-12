import { vehicleHitPedestrians } from './pedestrians.js';
import { increaseWanted } from './police.js';
import { vehicleHitProps, scrapeSparks, spawnSmoke } from './props.js';
import { checkRampLaunch, onAirborneStart, onAirborneFrame, onAirborneEnd } from './missions.js';
import { playImpact } from './audio.js';

export const CAR_PARAMS = { accel: 20, maxV: 32, brake: -32, steerBase: 0.5, steerSpeed: 0.6, turnDenom: 7, drag: 0.11, radius: 2.3 };
export const MOTO_PARAMS = { accel: 26, maxV: 24, brake: -30, steerBase: 0.62, steerSpeed: 0.75, turnDenom: 5, drag: 0.14, radius: 1.1 };

export function buildCar(THREE, scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#287e91', roughness: 0.3, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.0), new THREE.MeshStandardMaterial({ color: '#15272e', roughness: 0.2, metalness: 0.3 }));
  cabin.position.set(0, 0.98, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#111' });
  const wheels = [];
  const wPos = [[-0.9, 0.35, 1.5], [0.9, 0.35, 1.5], [-0.9, 0.35, -1.5], [0.9, 0.35, -1.5]];
  for (const [x, y, z] of wPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff8e0', emissive: '#fff8e0', emissiveIntensity: 1.4 });
  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.05), headMat);
  headL.position.set(-0.6, 0.6, 2.12);
  const headR = headL.clone(); headR.position.x = 0.6;
  group.add(headL, headR);
  const tailMat = new THREE.MeshStandardMaterial({ color: '#ff2b2b', emissive: '#ff2b2b', emissiveIntensity: 0.6 });
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.05), tailMat);
  tailL.position.set(-0.6, 0.6, -2.12);
  const tailR = tailL.clone(); tailR.position.x = 0.6;
  group.add(tailL, tailR);
  scene.add(group);
  return { group, wheels: [wheels[2], wheels[3]], steerWheels: [wheels[0], wheels[1]], tailMat };
}

export function buildMoto(THREE, scene) {
  // "Street Hawk 1000": exposed-engine naked bike
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#b6404a', roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 2.0), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.8), new THREE.MeshStandardMaterial({ color: '#181818' }));
  seat.position.set(0, 1.02, -0.35);
  group.add(seat);

  const engineMat = new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.4, metalness: 0.8 });
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), engineMat);
  engine.position.set(0, 0.45, 0.1);
  engine.castShadow = true;
  group.add(engine);
  const finGeo = new THREE.BoxGeometry(0.4, 0.04, 0.04);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(finGeo, engineMat);
    fin.position.set(0, 0.34 + i * 0.06, 0.1);
    group.add(fin);
  }

  const exhaustMat = new THREE.MeshStandardMaterial({ color: '#c9c9c9', roughness: 0.25, metalness: 0.9 });
  const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8);
  exhaustGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust.position.set(side * 0.16, 0.3, -0.7);
    exhaust.castShadow = true;
    group.add(exhaust);
  }

  const barMat = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5, metalness: 0.6 });
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 6), barMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 1.05, 0.85);
  group.add(handlebar);
  const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 6);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(gripGeo, barMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(side * 0.31, 1.05, 0.85);
    group.add(grip);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#111' });
  const front = new THREE.Mesh(wheelGeo, wheelMat);
  front.position.set(0, 0.34, 1.0);
  front.castShadow = true;
  const rear = new THREE.Mesh(wheelGeo, wheelMat);
  rear.position.set(0, 0.34, -1.0);
  rear.castShadow = true;
  group.add(front, rear);
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff8e0', emissive: '#fff8e0', emissiveIntensity: 1.4 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), headMat);
  head.position.set(0, 0.85, 1.05);
  group.add(head);
  const roll = new THREE.Group();
  roll.add(group);
  scene.add(roll);
  return { group: roll, wheels: [front, rear] };
}

// ctx: { keys, resolveCircleVsBuildings, hitLampPoles, gravity }
// returns { launchedRamp } so the caller (game.js) can trigger its own
// slow-motion timer without this module reaching back into the render loop
export function updateVehicle(state, dt, params, ctx) {
  const { keys, steerThrottle, resolveCircleVsBuildings, hitLampPoles, gravity } = ctx;
  const yawBefore = state.yaw;
  // analog steer/throttle straight from the joystick (falls back to digital
  // -1/0/1 from the keyboard) -- previously this read keys.left/right/up/down
  // directly, so a joystick nudged only slightly still produced full-deflection
  // steering/throttle with nothing in between, which read as jerky on mobile
  const { steer, throttle } = steerThrottle();
  const nitro = keys.shift && throttle > 0;
  state.boosting = nitro;
  const boostMul = nitro ? 1.55 : 1;
  const maxV = params.maxV * (nitro ? 1.25 : 1);

  if (keys.space && throttle > 0 && Math.abs(state.speed) < 3) {
    const rx = state.x - Math.sin(state.yaw) * 1.4, rz = state.z - Math.cos(state.yaw) * 1.4;
    spawnSmoke(rx, 0.15, rz, 1);
  }

  let accel = 0;
  if (throttle > 0) accel = params.accel * boostMul * (1 - Math.max(state.speed, 0) / maxV) * throttle;
  else if (throttle < 0) accel = (state.speed > 1 ? params.brake : -10 * (1 + state.speed / 14)) * -throttle;
  state.speed += accel * dt;
  state.speed -= params.drag * state.speed * dt;
  if (throttle === 0) state.speed *= (1 - 0.18 * dt);
  state.speed = clamp(state.speed, -params.maxV * 0.4, maxV);

  const speedFrac = Math.min(Math.abs(state.speed) / params.turnDenom, 1);
  state.yaw += steer * (params.steerBase + Math.min(Math.abs(state.speed) / 30, 1) * params.steerSpeed) * speedFrac * Math.sign(state.speed || 1) * dt;
  state.x += Math.sin(state.yaw) * state.speed * dt;
  state.z += Math.cos(state.yaw) * state.speed * dt;
  state.steer = steer;

  if (vehicleHitPedestrians(state.x, state.z, state.speed)) {
    state.speed *= 0.92;
    increaseWanted(state.x, state.z, 1);
    playImpact(0.8);
  }

  const propHit = vehicleHitProps(state.x, state.z, state.speed);
  if (propHit.hydrantHit) playImpact(0.5);
  if (hitLampPoles(state.x, state.z, state.speed)) { state.speed *= 0.8; playImpact(0.6); }

  const speedBefore = state.speed;
  resolveCircleVsBuildings(state, params.radius);
  state.wallCooldown = (state.wallCooldown || 0) - dt;
  if (Math.abs(speedBefore) > 8 && state.speed < speedBefore * 0.9 && state.wallCooldown <= 0) {
    state.wallCooldown = 0.4;
    scrapeSparks(state.x, 0.5, state.z, Math.sin(state.yaw), Math.cos(state.yaw));
    playImpact(0.35);
  }

  // stunt ramps: launch into the air, integrate a simple gravity arc, score on landing
  let launchedRamp = false;
  if (state.y <= 0 && state.vy === 0) {
    const launch = checkRampLaunch(state);
    if (launch) { state.vy = launch.vy; onAirborneStart(yawBefore, state.x, state.z); launchedRamp = true; }
  }
  if (state.y > 0 || state.vy !== 0) {
    state.vy -= gravity * dt;
    state.y += state.vy * dt;
    onAirborneFrame(yawBefore, state.yaw);
    if (state.y <= 0) { state.y = 0; state.vy = 0; onAirborneEnd(state.x, state.z); }
  }
  return { launchedRamp };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
