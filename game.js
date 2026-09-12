import * as THREE from 'three';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';
import { spawnPedestrians, updatePedestrians, punchNear, getPedestrians } from './pedestrians.js';
import { initAudio, playPunch } from './audio.js';
import { initPolice, increaseWanted, updatePolice, getWantedLevel, isFlashing, getPoliceUnits, __testSetWanted } from './police.js';
import { initProps, updateProps, getProps } from './props.js';
import { initMissions, updateMissions, getMarkers, getRamps } from './missions.js';
import { initCityArchitecture } from './cityArchitecture.js';
import { initNature } from './natureEngine.js';
import { buildCar, buildMoto, updateVehicle, CAR_PARAMS, MOTO_PARAMS } from './vehicleController.js';
import { buildCharacter, applyLocomotionSwing, seatOnMoto, unseatFromMoto } from './characterRig.js';
import { initCameraRig, updateCameraRig, getCameraZoomDebug, __testSetZoom } from './cameraRig.js';

// ============================================================
// Constants
// ============================================================
const GRID = 12;                 // city blocks per side
const BLOCK = 40;                // meters, block pitch
const STREET_W = 10;              // meters, street width
const LOT = BLOCK - STREET_W;     // building footprint size
const CITY_SIZE = GRID * BLOCK;   // meters, full city span
const CITY_HALF = CITY_SIZE / 2;
const CITY_SEED = 88213;

const DAY_CYCLE_SECONDS = 180;

const FOOT_WALK = 1.4, FOOT_RUN = 3.6, FOOT_SPRINT = 5.5, FOOT_TURN_RATE = 2.6;
const JUMP_V = 5.3, GRAVITY = 15.5;
const ENTER_RANGE = 3.6, MAX_EXIT_SPEED = 4.2;

// ============================================================
// Utility
// ============================================================
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }
function dampAngle(a, b, lambda, dt) {
  let diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * (1 - Math.exp(-lambda * dt));
}
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ============================================================
// DOM references
// ============================================================
const wrap = document.getElementById('game-wrap');
const canvas = document.getElementById('game');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

const hudSpeed = document.getElementById('hud-speed');
const hudMode = document.getElementById('hud-mode');
const hudClock = document.getElementById('hud-clock');
const hudMsg = document.getElementById('hud-msg');
const hudCash = document.getElementById('hud-cash');
const hudWanted = document.getElementById('hud-wanted');
const wantedStars = Array.from(hudWanted.querySelectorAll('.star'));
const missionHud = document.getElementById('mission-hud');
const missionArrow = document.getElementById('mission-arrow');
const missionDist = document.getElementById('mission-dist');
const missionTimer = document.getElementById('mission-timer');

const screenStart = document.getElementById('screen-start');
const screenPause = document.getElementById('screen-pause');
const btnStart = document.getElementById('btn-start');
const btnResume = document.getElementById('btn-resume');
const btnRestartPause = document.getElementById('btn-restart-pause');
const btnPause = document.getElementById('btn-pause');
const touchControls = document.getElementById('touch-controls');
const joystickEl = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystick-knob');

// ============================================================
// Renderer / scene / camera
// ============================================================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color('#5ec8f5');
const NIGHT_SKY = new THREE.Color('#0b1526');
scene.background = DAY_SKY.clone();
scene.fog = new THREE.FogExp2(DAY_SKY.getHex(), 0.0016);

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900);
camera.position.set(0, 8, -14);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.4, 0.86);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

initCameraRig(camera, canvas);

const hemiLight = new THREE.HemisphereLight('#c8dcf0', '#2c2f36', 0.9);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight('#fff3d6', 1.6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 260;
dirLight.shadow.camera.left = -70;
dirLight.shadow.camera.right = 70;
dirLight.shadow.camera.top = 70;
dirLight.shadow.camera.bottom = -70;
dirLight.shadow.bias = -0.0003;
scene.add(dirLight);
scene.add(dirLight.target);

// ============================================================
// City, nature, vehicles, character
// ============================================================
const cityOpts = { grid: GRID, block: BLOCK, streetW: STREET_W, lot: LOT, cityHalf: CITY_HALF, citySeed: CITY_SEED, skipBlocks: [{ bx: 4, bz: 4 }] };
const cityArch = initCityArchitecture(scene, THREE, cityOpts);
const { buildingAABBs, nightLights, shopSigns, buildingMaterials, hitLampPoles, updateLampPoles, lampPoles } = cityArch;
initNature(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, citySeed: CITY_SEED });

const car = buildCar(THREE, scene);
const moto = buildMoto(THREE, scene);
const character = buildCharacter(THREE, scene);

// ============================================================
// Pedestrians
// ============================================================
spawnPedestrians(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, seed: CITY_SEED, count: 32 });
initPolice(scene, THREE);
initProps(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, seed: CITY_SEED });
initMissions(scene, THREE);

// ============================================================
// Simulation state
// ============================================================
const carState = { x: 6, z: 14, yaw: Math.PI, speed: 0, y: 0, vy: 0, boosting: false };
const motoState = { x: -6, z: 14, yaw: Math.PI, speed: 0, y: 0, vy: 0, boosting: false };
const foot = { x: 0, z: 20, yaw: Math.PI, y: 0, vy: 0, speed: 0, grounded: true, phase: 0 };

let mode = 'foot';
let dayTime = 0.4;
let nightFactor = 0;
let running = false;
let paused = false;
let msgTimer = 0;
let lastTime = null;
let lastSplash = null;
let slowMoTimer = 0;
let lastMissionInfo = { score: 0, waypoint: null, splash: null };

const keys = { left: false, right: false, up: false, down: false, shift: false, space: false, f: false, punch: false };
let fEdge = false, spaceEdge = false, punchEdge = false;
const joy = { x: 0, y: 0, active: false, pointerId: null };

function steerThrottle() {
  if (joy.active) return { steer: clamp(-joy.x, -1, 1), throttle: clamp(-joy.y, -1, 1) };
  return { steer: (keys.left ? 1 : 0) - (keys.right ? 1 : 0), throttle: keys.up ? 1 : keys.down ? -1 : 0 };
}

// ============================================================
// Collision
// ============================================================
function nearbyBuildings(x, z) {
  const bx = Math.round((x + CITY_HALF) / BLOCK - 0.5);
  const bz = Math.round((z + CITY_HALF) / BLOCK - 0.5);
  return buildingAABBs.filter(b => Math.abs(b.bx - bx) <= 1 && Math.abs(b.bz - bz) <= 1);
}
function resolveCircleVsBuildings(state, radius) {
  for (const b of nearbyBuildings(state.x, state.z)) {
    const cx = clamp(state.x, b.minX, b.maxX);
    const cz = clamp(state.z, b.minZ, b.maxZ);
    const dx = state.x - cx, dz = state.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 0.001;
      const push = (radius - dist);
      state.x += (dx / dist) * push;
      state.z += (dz / dist) * push;
      if (state.speed !== undefined) state.speed *= 0.5;
    }
  }
  const half = CITY_HALF - 4;
  state.x = clamp(state.x, -half, half);
  state.z = clamp(state.z, -half, half);
}

// context passed into the extracted vehicleController.updateVehicle() so it
// can reach world collision/lamp logic that still lives in this module
const vehicleCtx = { keys, resolveCircleVsBuildings, hitLampPoles, gravity: GRAVITY };

function updateFoot(dt) {
  const { steer, throttle } = steerThrottle();
  foot.yaw += steer * FOOT_TURN_RATE * dt;
  const targetSpeed = (keys.shift ? FOOT_SPRINT : FOOT_RUN) * throttle;
  foot.speed = damp(foot.speed, targetSpeed, 13, dt);
  foot.x += Math.sin(foot.yaw) * foot.speed * dt;
  foot.z += Math.cos(foot.yaw) * foot.speed * dt;
  resolveCircleVsBuildings(foot, 0.32);

  if (spaceEdge && foot.grounded) {
    foot.vy = JUMP_V;
    foot.grounded = false;
  }
  foot.vy -= GRAVITY * dt;
  foot.y += foot.vy * dt;
  if (foot.y <= 0) { foot.y = 0; foot.vy = 0; foot.grounded = true; }

  foot.phase += dt * (2.2 + Math.abs(foot.speed) * 1.15);
  applyLocomotionSwing(character, foot.phase, foot.speed, FOOT_RUN);
}

function showMessage(text) {
  hudMsg.textContent = text;
  hudMsg.classList.add('visible');
  msgTimer = 1.6;
}

function tryPunch() {
  if (mode !== 'foot') return;
  const hit = punchNear(foot.x, foot.z, foot.yaw);
  if (hit) {
    playPunch();
    if (nightFactor < 0.5) increaseWanted(foot.x, foot.z, 1); // "in broad daylight" per spec
    showMessage('אגרוף!');
  }
}

function tryEnterExit() {
  if (mode === 'foot') {
    const dCar = Math.hypot(foot.x - carState.x, foot.z - carState.z);
    const dMoto = Math.hypot(foot.x - motoState.x, foot.z - motoState.z);
    if (dCar <= ENTER_RANGE && dCar <= dMoto) {
      mode = 'car';
      character.group.visible = false;
      showMessage('נכנסת למכונית — F ליציאה');
    } else if (dMoto <= ENTER_RANGE) {
      mode = 'moto';
      seatOnMoto(scene, character, moto.group);
      showMessage('עלית לאופנוע — F ליציאה');
    }
  } else {
    const state = mode === 'car' ? carState : motoState;
    if (Math.abs(state.speed) <= MAX_EXIT_SPEED) {
      foot.x = state.x - Math.sin(state.yaw) * 3;
      foot.z = state.z - Math.cos(state.yaw) * 3;
      foot.yaw = state.yaw;
      state.speed = 0;
      if (mode === 'moto') unseatFromMoto(scene, character, moto.group, foot.yaw);
      mode = 'foot';
      character.group.visible = true;
      showMessage('ירדת מהרכב');
    } else {
      showMessage('האט כדי לצאת');
    }
  }
}

// ============================================================
// Day / night
// ============================================================
function updateDayNight(dt) {
  dayTime = (dayTime + dt / DAY_CYCLE_SECONDS) % 1;
  // night curve: 0 during day, ramps to 1 at sunset, holds, ramps back down at dawn
  let n;
  if (dayTime < 0.46) n = 0;
  else if (dayTime < 0.56) n = smoothstep(0.46, 0.56, dayTime);
  else if (dayTime < 0.9) n = 1;
  else if (dayTime < 1.0) n = 1 - smoothstep(0.9, 1.0, dayTime);
  else n = 0;

  const sunAngle = dayTime * Math.PI * 2;
  dirLight.position.set(camera.position.x + Math.cos(sunAngle) * 60, Math.max(6, Math.sin(sunAngle) * 60 + 20), camera.position.z + 30);
  dirLight.target.position.set(camera.position.x, 0, camera.position.z);
  dirLight.intensity = damp(dirLight.intensity, 1.6 - n * 1.3, 3, dt);
  hemiLight.intensity = damp(hemiLight.intensity, 0.9 - n * 0.55, 3, dt);

  const skyColor = DAY_SKY.clone().lerp(NIGHT_SKY, n);
  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor);

  for (const mat of shopSigns) mat.emissiveIntensity = n;
  for (const light of nightLights) light.intensity = n * light.__base;
  for (const mat of buildingMaterials) mat.emissiveIntensity = n * 0.9;

  nightFactor = n;
  hudClock.textContent = n > 0.5 ? '🌙 לילה' : '☀️ יום';
}

// ============================================================
// Mesh sync
// ============================================================
function syncMeshes(dt) {
  car.group.position.set(carState.x, carState.y, carState.z);
  car.group.rotation.y = carState.yaw;
  const carSteerAngle = clamp((carState.steer || 0) * 0.32, -0.32, 0.32);
  for (const w of car.steerWheels) w.rotation.y = carSteerAngle;
  const wheelSpin = carState.speed * dt / 0.35;
  for (const w of [...car.wheels, ...car.steerWheels]) w.rotation.x += wheelSpin;
  car.tailMat.emissiveIntensity = keys.down ? 3 : 0.6;

  moto.group.position.set(motoState.x, motoState.y, motoState.z);
  moto.group.rotation.y = motoState.yaw;
  // lean angle = -steer * min(speed/25, 1) * 0.45 rad
  moto.group.rotation.z = damp(moto.group.rotation.z, -(motoState.steer || 0) * Math.min(Math.abs(motoState.speed) / 25, 1) * 0.45, 8, dt);
  moto.group.rotation.x = damp(moto.group.rotation.x, motoState.boosting ? -0.14 : 0, 6, dt);
  const motoSpin = motoState.speed * dt / 0.34;
  for (const w of moto.wheels) w.rotation.x += motoSpin;

  if (mode !== 'moto') {
    character.group.position.set(foot.x, foot.y, foot.z);
    character.group.rotation.y = foot.yaw;
  }
}

// ============================================================
// Minimap
// ============================================================
function drawMinimap() {
  const w = minimapCanvas.width, h = minimapCanvas.height;
  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = 'rgba(10,14,23,0.55)';
  minimapCtx.fillRect(0, 0, w, h);
  const scale = w / CITY_SIZE;
  minimapCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  minimapCtx.strokeRect(1, 1, w - 2, h - 2);
  minimapCtx.fillStyle = '#66bce5';
  minimapCtx.beginPath();
  minimapCtx.arc((foot.x + CITY_HALF) * scale, (foot.z + CITY_HALF) * scale, 3, 0, Math.PI * 2);
  minimapCtx.fill();
  if (mode !== 'car') {
    minimapCtx.fillStyle = '#ffd23f';
    minimapCtx.fillRect((carState.x + CITY_HALF) * scale - 2, (carState.z + CITY_HALF) * scale - 2, 4, 4);
  }
  if (mode !== 'moto') {
    minimapCtx.fillStyle = '#ff5f5f';
    minimapCtx.fillRect((motoState.x + CITY_HALF) * scale - 2, (motoState.z + CITY_HALF) * scale - 2, 4, 4);
  }
}

// ============================================================
// HUD
// ============================================================
const MODE_LABEL = { car: 'רכב', moto: 'אופנוע', foot: 'הליכה' };
function updateHud(dt) {
  const state = mode === 'car' ? carState : mode === 'moto' ? motoState : null;
  hudSpeed.textContent = state ? Math.round(Math.abs(state.speed) * 3.6) : Math.round(Math.abs(foot.speed) * 3.6);
  hudMode.textContent = MODE_LABEL[mode];
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) hudMsg.classList.remove('visible'); }
}

function updateWantedHud() {
  const level = getWantedLevel();
  hudWanted.classList.toggle('flash', isFlashing());
  wantedStars.forEach((el, i) => el.classList.toggle('active', i < level));
}

function updateMissionHud(missionInfo, playerState) {
  hudCash.textContent = '₪' + missionInfo.score;
  if (!missionInfo.waypoint) {
    missionHud.classList.add('hidden');
    return;
  }
  missionHud.classList.remove('hidden');
  const dx = missionInfo.waypoint.x - playerState.x;
  const dz = missionInfo.waypoint.z - playerState.z;
  const bearing = Math.atan2(dx, dz);
  const rel = bearing - (playerState.yaw || 0) - Math.PI / 2;
  missionArrow.style.transform = `rotate(${rel}rad)`;
  missionDist.textContent = Math.round(missionInfo.waypoint.dist) + 'm';
  missionTimer.textContent = Math.ceil(missionInfo.waypoint.timeLeft) + 's';
}

// ============================================================
// Resize
// ============================================================
function resize() {
  const rect = wrap.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, true);
  composer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ============================================================
// Main loop
// ============================================================
function stepSim(dt) {
  if (fEdge) { tryEnterExit(); fEdge = false; }
  if (punchEdge) { tryPunch(); punchEdge = false; }

  if (!paused) {
    if (mode === 'car') { if (updateVehicle(carState, dt, CAR_PARAMS, vehicleCtx).launchedRamp) slowMoTimer = 1.1; }
    else if (mode === 'moto') { if (updateVehicle(motoState, dt, MOTO_PARAMS, vehicleCtx).launchedRamp) slowMoTimer = 1.1; }
    else updateFoot(dt);
    updatePedestrians(dt);
    updateProps(dt);
    updateLampPoles(dt);

    const playerState = mode === 'car' ? carState : mode === 'moto' ? motoState : foot;
    const policeInfo = updatePolice(dt, playerState, mode !== 'foot');
    if (policeInfo.rammed) {
      const activeState = mode === 'car' ? carState : motoState;
      activeState.speed *= 0.85;
      activeState.x += policeInfo.pushX * 0.3;
      activeState.z += policeInfo.pushZ * 0.3;
    }

    const missionInfo = updateMissions(dt, playerState.x, playerState.z, mode !== 'foot');
    lastMissionInfo = missionInfo;
    if (missionInfo.splash && missionInfo.splash !== lastSplash) {
      showMessage(missionInfo.splash);
      lastSplash = missionInfo.splash;
    } else if (!missionInfo.splash) {
      lastSplash = null;
    }

    updateCameraRig(dt, { mode, carState, motoState, foot, sprinting: keys.shift });
    updateDayNight(dt);
    syncMeshes(dt);
    updateHud(dt);
    updateWantedHud();
    updateMissionHud(missionInfo, playerState);
    drawMinimap();
  }
  spaceEdge = false;
}

function loop(ts) {
  if (!running) return;
  if (lastTime === null) lastTime = ts;
  let dt = (ts - lastTime) / 1000;
  lastTime = ts;
  dt = Math.min(dt, 1 / 20);

  if (slowMoTimer > 0) {
    slowMoTimer -= dt;
    stepSim(dt * 0.35);
  } else {
    stepSim(dt);
  }

  composer.render();
  window.__frameCount = (window.__frameCount || 0) + 1;
  requestAnimationFrame(loop);
}

// ============================================================
// State transitions
// ============================================================
function startGame() {
  initAudio();
  running = true;
  paused = false;
  lastTime = null;
  screenStart.classList.add('hidden');
  screenPause.classList.add('hidden');
  btnPause.classList.remove('hidden');
  resize();
  requestAnimationFrame(loop);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  screenPause.classList.toggle('hidden', !paused);
}

// ============================================================
// Input
// ============================================================
function setKey(key, val) {
  switch (key) {
    case 'ArrowLeft': case 'a': case 'A': keys.left = val; break;
    case 'ArrowRight': case 'd': case 'D': keys.right = val; break;
    case 'ArrowUp': case 'w': case 'W': keys.up = val; break;
    case 'ArrowDown': case 's': case 'S': keys.down = val; break;
    case 'Shift': keys.shift = val; break;
    case ' ': if (val && !keys.space) spaceEdge = true; keys.space = val; break;
    case 'f': case 'F': if (val && !keys.f) fEdge = true; keys.f = val; break;
    case 'e': case 'E': if (val && !keys.punch) punchEdge = true; keys.punch = val; break;
  }
}
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { togglePause(); return; }
  setKey(e.key, true);
});
window.addEventListener('keyup', (e) => setKey(e.key, false));
window.addEventListener('blur', () => {
  keys.left = keys.right = keys.up = keys.down = keys.shift = keys.space = keys.f = keys.punch = false;
  resetJoy();
});

function bindHold(el, fn) {
  const on = (e) => { e.preventDefault(); fn(true); };
  const off = (e) => { e.preventDefault(); fn(false); };
  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('touchcancel', off, { passive: false });
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}
bindHold(document.getElementById('t-run'), (v) => keys.shift = v);

const JOY_RADIUS = 18;
function updateJoyFromEvent(e) {
  const rect = joystickEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > JOY_RADIUS) { dx = (dx / dist) * JOY_RADIUS; dy = (dy / dist) * JOY_RADIUS; }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / JOY_RADIUS;
  joy.y = dy / JOY_RADIUS;
}
function resetJoy() {
  joy.x = 0; joy.y = 0; joy.active = false; joy.pointerId = null;
  joystickKnob.style.transform = 'translate(0px, 0px)';
  joystickEl.classList.remove('active');
}
joystickEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  joystickEl.setPointerCapture(e.pointerId);
  joy.pointerId = e.pointerId;
  joy.active = true;
  joystickEl.classList.add('active');
  updateJoyFromEvent(e);
});
joystickEl.addEventListener('pointermove', (e) => {
  if (joy.pointerId !== e.pointerId) return;
  updateJoyFromEvent(e);
});
joystickEl.addEventListener('pointerup', (e) => { if (joy.pointerId === e.pointerId) resetJoy(); });
joystickEl.addEventListener('pointercancel', (e) => { if (joy.pointerId === e.pointerId) resetJoy(); });
document.getElementById('t-action').addEventListener('touchstart', (e) => { e.preventDefault(); fEdge = true; }, { passive: false });
document.getElementById('t-action').addEventListener('click', () => { fEdge = true; });
document.getElementById('t-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if (!keys.space) spaceEdge = true; }, { passive: false });
document.getElementById('t-jump').addEventListener('click', () => { spaceEdge = true; });
document.getElementById('t-punch').addEventListener('touchstart', (e) => { e.preventDefault(); punchEdge = true; }, { passive: false });
document.getElementById('t-punch').addEventListener('click', () => { punchEdge = true; });

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  touchControls.classList.remove('hidden');
}

btnStart.addEventListener('click', startGame);
btnResume.addEventListener('click', togglePause);
btnRestartPause.addEventListener('click', () => { screenPause.classList.add('hidden'); togglePause(); });
btnPause.addEventListener('click', togglePause);

resize();
composer.render();

window.__frameCount = 0;
window.__debug = () => ({
  frames: window.__frameCount,
  mode, foot: { x: foot.x, z: foot.z, yaw: foot.yaw, speed: foot.speed },
  car: { x: carState.x, z: carState.z, yaw: carState.yaw, speed: carState.speed, y: carState.y, boosting: carState.boosting },
  moto: { x: motoState.x, z: motoState.z, yaw: motoState.yaw, speed: motoState.speed, y: motoState.y, boosting: motoState.boosting },
  distCar: Math.hypot(foot.x - carState.x, foot.z - carState.z),
  distMoto: Math.hypot(foot.x - motoState.x, foot.z - motoState.z),
  pedCount: getPedestrians().length,
  peds: getPedestrians().map(p => ({ x: p.x, z: p.z, state: p.state })),
  wanted: getWantedLevel(),
  policeCars: getPoliceUnits().cars.length,
  policeOfficers: getPoliceUnits().officers.length,
  props: (() => {
    const p = getProps();
    return {
      hydrantsBroken: p.hydrants.filter(h => h.broken).length,
      cansBroken: p.cans.filter(c => c.broken).length,
      conesBroken: p.cones.filter(c => c.broken).length,
      firstHydrant: p.hydrants[0] ? { x: p.hydrants[0].x, z: p.hydrants[0].z } : null,
      firstCan: p.cans[0] ? { x: p.cans[0].x, z: p.cans[0].z } : null,
      firstCone: p.cones[0] ? { x: p.cones[0].x, z: p.cones[0].z } : null,
    };
  })(),
  lampsBroken: lampPoles.filter(p => p.broken).length,
  firstLamp: lampPoles[0] ? { x: lampPoles[0].x, z: lampPoles[0].z } : null,
  flashing: isFlashing(),
  missionScore: lastMissionInfo.score,
  missionWaypoint: lastMissionInfo.waypoint,
  markers: getMarkers(),
  ramps: getRamps(),
  nightFactor,
  camera: getCameraZoomDebug(),
});
window.__setFootPos = (x, z, yaw = 0) => { foot.x = x; foot.z = z; foot.yaw = yaw; foot.speed = 0; return window.__debug(); };
// test-only hooks: deterministic stepping independent of real time / rAF throttling
window.__setKeys = (patch) => Object.assign(keys, patch);
window.__pressF = () => { fEdge = true; };
window.__pressSpace = () => { spaceEdge = true; };
window.__pressPunch = () => { punchEdge = true; };
window.__stepFrames = (n, dtMs = 16.6) => {
  for (let i = 0; i < n; i++) stepSim(dtMs / 1000);
  composer.render();
};
window.__setRunning = (v) => { running = v; };
window.__walkTo = (targetX, targetZ, within, maxIters = 400) => {
  for (let i = 0; i < maxIters; i++) {
    const dx = targetX - foot.x, dz = targetZ - foot.z;
    if (Math.hypot(dx, dz) <= within) break;
    const desiredYaw = Math.atan2(dx, dz);
    const diff = ((desiredYaw - foot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    keys.up = true; keys.down = false;
    keys.left = diff > 0.05; keys.right = diff < -0.05;
    for (let f = 0; f < 6; f++) stepSim(1 / 60);
  }
  keys.up = keys.left = keys.right = false;
  for (let f = 0; f < 10; f++) stepSim(1 / 60);
  composer.render();
  return window.__debug();
};
window.__forceMode = (m) => { mode = m; character.group.visible = m === 'foot'; return window.__debug(); };
window.__setVehiclePos = (which, x, z, yaw, speed = 0) => {
  const state = which === 'car' ? carState : motoState;
  state.x = x; state.z = z; state.yaw = yaw; state.speed = speed; state.y = 0; state.vy = 0;
  composer.render();
  return window.__debug();
};
window.__increaseWanted = (amount = 1) => {
  const p = mode === 'car' ? carState : mode === 'moto' ? motoState : foot;
  increaseWanted(p.x, p.z, amount);
  return window.__debug();
};
window.__testSetWanted = (level) => {
  const p = mode === 'car' ? carState : mode === 'moto' ? motoState : foot;
  __testSetWanted(level, p.x, p.z);
  return window.__debug();
};
window.__testStuntJump = (x, z, yaw, speed, frames = 240) => {
  mode = 'car';
  carState.x = x; carState.z = z; carState.yaw = yaw; carState.speed = speed; carState.y = 0; carState.vy = 0;
  keys.up = true;
  let maxY = 0;
  for (let i = 0; i < frames; i++) {
    stepSim(1 / 60);
    maxY = Math.max(maxY, carState.y);
  }
  keys.up = false;
  composer.render();
  return { maxY, debug: window.__debug(), hudMsgText: hudMsg.textContent, hudMsgVisible: hudMsg.classList.contains('visible') };
};
window.__driveHitNearestPed = (maxIters = 600) => {
  const state = mode === 'car' ? carState : mode === 'moto' ? motoState : null;
  if (!state) return window.__debug();
  for (let i = 0; i < maxIters; i++) {
    let best = null, bestD = Infinity;
    for (const p of getPedestrians()) {
      if (p.state === 'down' || p.state === 'gettingUp') continue;
      const dd = Math.hypot(p.x - state.x, p.z - state.z);
      if (dd < bestD) { bestD = dd; best = p; }
    }
    if (!best || bestD < 0.9) break;
    const desiredYaw = Math.atan2(best.x - state.x, best.z - state.z);
    const diff = ((desiredYaw - state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    keys.up = true; keys.down = false;
    keys.left = diff > 0.05; keys.right = diff < -0.05;
    for (let f = 0; f < 3; f++) stepSim(1 / 60);
  }
  keys.up = keys.left = keys.right = false;
  composer.render();
  return window.__debug();
};
window.__driveTo = (targetX, targetZ, within, maxIters = 400) => {
  const state = mode === 'car' ? carState : mode === 'moto' ? motoState : null;
  if (!state) return window.__debug();
  for (let i = 0; i < maxIters; i++) {
    const dx = targetX - state.x, dz = targetZ - state.z;
    if (Math.hypot(dx, dz) <= within) break;
    const desiredYaw = Math.atan2(dx, dz);
    const diff = ((desiredYaw - state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    keys.up = true; keys.down = false;
    keys.left = diff > 0.05; keys.right = diff < -0.05;
    for (let f = 0; f < 4; f++) stepSim(1 / 60);
  }
  keys.up = keys.left = keys.right = false;
  composer.render();
  return window.__debug();
};
window.__setDayTime = (t) => { dayTime = t; for (let f = 0; f < 3; f++) stepSim(1 / 60); composer.render(); return window.__debug(); };
window.__setCameraZoomTarget = (z) => { __testSetZoom(z); return window.__debug(); };
window.__brakeToStop = (which, maxIters = 200) => {
  const state = which === 'car' ? carState : motoState;
  mode = which; // ensure the vehicle is actually being simulated
  for (let i = 0; i < maxIters; i++) {
    if (Math.abs(state.speed) < 1.0) break;
    keys.up = state.speed < 0; keys.down = state.speed > 0;
    for (let f = 0; f < 4; f++) stepSim(1 / 60);
  }
  keys.up = keys.down = false;
  composer.render();
  return window.__debug();
};
