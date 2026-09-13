import { vehicleHitPedestrians } from './pedestrians.js';
import { increaseWanted } from './police.js';
import { vehicleHitProps, scrapeSparks, spawnSmoke } from './props.js';
import { checkRampLaunch, onAirborneStart, onAirborneFrame, onAirborneEnd, addCash } from './missions.js';
import { playImpact } from './audio.js';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/loaders/DRACOLoader.js';

export const CAR_PARAMS = { accel: 20, maxV: 32, brake: -32, steerBase: 0.5, steerSpeed: 0.6, turnDenom: 7, drag: 0.11, radius: 2.3 };
export const MOTO_PARAMS = { accel: 26, maxV: 24, brake: -30, steerBase: 0.62, steerSpeed: 0.75, turnDenom: 5, drag: 0.14, radius: 1.1 };

// Real car models -- one per dealership tier, each a genuinely different
// 3D model (not the same mesh recolored) sourced from the Khronos glTF
// sample-asset library plus the Ferrari sample already in this project.
// Loaded exactly like characterRig.js loads the player model: the
// procedural car below still builds first and stays the fallback if a load
// fails, and only gets hidden (not removed) once a real model is in.
// Each model's own scale/rotation/ground-offset needs its own tuning since
// they come from unrelated sources with unrelated authored conventions.
// scale/yOffset are auto-computed per model (see loadCarModel) since these
// five come from unrelated sources at unrelated authored scales -- only
// yRotation (which way the model's front faces) can't be auto-detected.
// excludeMeshNames drops non-car scenery baked into a sample file (e.g. the
// ToyCar sample poses its car on a big cloth backdrop mesh named "Fabric" --
// found by dumping each glTF's own JSON mesh list, not a guess) so it
// doesn't get measured into the auto-scale or rendered on a moving car.
export const CAR_MODELS = [
  { tier: 1, path: '../assets/models/toycar.glb', yRotation: 0, excludeMeshNames: ['Fabric'] },
  { tier: 2, path: '../assets/models/cesiummilktruck.glb', yRotation: 0 },
  { tier: 3, path: '../assets/models/carconcept.glb', yRotation: Math.PI },
  { tier: 4, path: '../assets/models/buggy.glb', yRotation: Math.PI / 2 },
  { tier: 5, path: '../assets/models/ferrari.glb', yRotation: Math.PI },
];
const DEFAULT_CAR_MODEL = CAR_MODELS[0]; // tier 1 (starter) -- what a fresh save actually owns

// loadModel: false skips the real-glTF fetch/Draco-decode entirely and just
// keeps the procedural car -- used for AI race bots (7+ of them can spawn at
// once) so a race doesn't kick off a dozen simultaneous Draco decodes, which
// is exactly the kind of thing that tanks performance on a phone
export function buildCar(THREE, scene, { loadModel = true } = {}) {
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

  const rig = {
    group, wheels: [wheels[2], wheels[3]], steerWheels: [wheels[0], wheels[1]], tailMat,
    proceduralMeshes: [body, cabin, ...wheels, headL, headR, tailL, tailR],
    bodyMat, realModel: null, currentColor: null, loadGeneration: 0,
  };
  // applyColor is the single source of truth for "what color is this car" --
  // called right after building (procedural), again the instant a real
  // model finishes loading, and again whenever the dealership switches
  // tiers/colors, so the color reliably sticks regardless of which of those
  // happens last (the bug this replaced: a color set before the async glTF
  // finished loading was simply lost once the real model's own meshes
  // replaced the procedural ones, because nothing ever reapplied it)
  rig.applyColor = (color) => {
    rig.currentColor = color;
    bodyMat.color.set(color);
    if (rig.realModel) {
      rig.realModel.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && !/glass|window|tire|wheel|tyre/i.test(o.name)) {
          o.material.color.set(color);
        }
      });
    }
  };
  if (loadModel) loadCarModel(THREE, rig, DEFAULT_CAR_MODEL);
  return rig;
}

function loadCarModel(THREE, rig, modelConfig) {
  // a load started by an earlier call (e.g. the default tier-1 model, still
  // in flight on a slow connection) must not be allowed to clobber a tier
  // switch that happened before it finished -- each call gets its own
  // generation number, and a callback whose generation is no longer current
  // by the time it fires (a newer load having since been kicked off) bails
  // out instead of attaching its (now stale) result
  const myGeneration = ++rig.loadGeneration;
  const draco = new DRACOLoader();
  draco.setDecoderPath('../vendor/libs/draco/gltf/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load(
    modelConfig.path,
    (gltf) => {
      if (myGeneration !== rig.loadGeneration) return; // superseded by a later load
      for (const mesh of rig.proceduralMeshes) mesh.visible = false;
      const model = gltf.scene;
      // this glTF's authored front faces -Z, but the game's own forward
      // convention is +Z at yaw=0 (same mismatch fixed for the player model
      // in characterRig.js) -- without this, pressing forward visually
      // drives the car backward, nose-first away from the direction of travel
      model.rotation.y = modelConfig.yRotation;
      // drop any non-car scenery mesh named in this model's own config
      // (see CAR_MODELS above) before measuring, so it doesn't throw off
      // auto-scaling or render attached to a moving car
      if (modelConfig.excludeMeshNames?.length) {
        const toRemove = [];
        model.traverse((o) => { if (o.isMesh && modelConfig.excludeMeshNames.includes(o.name)) toRemove.push(o); });
        for (const m of toRemove) m.parent.remove(m);
      }
      // auto-fit instead of a hand-guessed scale per model: these 5 models
      // come from unrelated sources authored at wildly different scales (a
      // "toy" sample vs. a milk truck vs. a hypercar), so measure each
      // one's own bounding box and scale it to the same ~4.3m car length
      // every time, then ground it (lowest point at y=0) and center it --
      // the same technique landmarks.js uses to place its own glTF model
      model.updateMatrixWorld(true);
      const rawSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      const longestHorizontal = Math.max(rawSize.x, rawSize.z) || 1;
      model.scale.setScalar((4.3 / longestHorizontal) * (modelConfig.scale || 1));
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y + (modelConfig.yOffset || 0), -center.z);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      rig.group.add(model);
      rig.realModel = model;

      const fl = model.getObjectByName('wheel_fl');
      const fr = model.getObjectByName('wheel_fr');
      const rl = model.getObjectByName('wheel_rl');
      const rr = model.getObjectByName('wheel_rr');
      if (fl && fr && rl && rr) {
        rig.steerWheels = [fl, fr];
        rig.wheels = [rl, rr];
      } else {
        // this model doesn't share the Ferrari's wheel-node naming, so
        // there's nothing to steer/spin -- keep pointing at the (now
        // hidden) procedural wheels rather than crashing on missing refs
        rig.steerWheels = [rig.proceduralMeshes[2], rig.proceduralMeshes[3]];
        rig.wheels = [rig.proceduralMeshes[2], rig.proceduralMeshes[3]];
      }
      const tailMesh = model.getObjectByName('lights_red');
      if (tailMesh) {
        tailMesh.material = tailMesh.material.clone(); // don't share a material two vehicles could tint independently
        rig.tailMat = tailMesh.material;
      }
      if (rig.currentColor) rig.applyColor(rig.currentColor);
      console.info('[vehicleController] loaded real car model:', modelConfig.path);
    },
    undefined,
    (err) => {
      // the procedural car (already visible) just stays as-is, but log it --
      // a silently-swallowed load error here previously made it look like a
      // hang with no way to tell "still loading" from "never going to load"
      console.warn('[vehicleController] failed to load car model', modelConfig.path, err);
    }
  );
}

// swaps the real model for a different dealership tier's -- removes
// whatever real model is currently attached (if any), re-shows the
// procedural fallback as an immediate placeholder, and loads the new one
export function swapCarModel(THREE, rig, modelConfig) {
  if (rig.realModel) {
    rig.group.remove(rig.realModel);
    rig.realModel.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose(); } });
    rig.realModel = null;
  }
  for (const mesh of rig.proceduralMeshes) mesh.visible = true;
  rig.wheels = [rig.proceduralMeshes[2], rig.proceduralMeshes[3]];
  rig.steerWheels = [rig.proceduralMeshes[0], rig.proceduralMeshes[1]];
  loadCarModel(THREE, rig, modelConfig);
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
  // boost meter: 0-100, drains while boosting and regenerates otherwise --
  // the boost upgrade level (0-6, from the mod shop) slows the drain and
  // speeds up the regen rather than changing the multiplier itself, so a
  // maxed-out boost category means "boost almost all the time" rather than
  // a bigger one-off speed spike
  if (state.boostMeter === undefined) state.boostMeter = 100;
  const boostLevel = params.boostLevel || 0;
  const wantBoost = keys.shift && throttle > 0;
  const canBoost = wantBoost && state.boostMeter > 0;
  state.boosting = canBoost;
  const boostMul = canBoost ? 1.55 : 1;
  const maxV = params.maxV * (canBoost ? 1.25 : 1);
  const boostDrainRate = 26 - boostLevel * 2.5;
  const boostRegenRate = 10 + boostLevel * 4;
  state.boostMeter = clamp(state.boostMeter + (canBoost ? -boostDrainRate : boostRegenRate) * dt, 0, 100);

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

  const pedsHit = vehicleHitPedestrians(state.x, state.z, state.speed);
  if (pedsHit) {
    state.speed *= 0.92;
    increaseWanted(state.x, state.z, 1);
    playImpact(0.8);
    addCash(300 * pedsHit); // per spec: a cash payout for every pedestrian run over
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
