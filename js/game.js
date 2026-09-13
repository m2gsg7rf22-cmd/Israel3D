import * as THREE from 'three';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { spawnPedestrians, updatePedestrians, punchNear, getPedestrians } from './pedestrians.js';
import { initAudio, playPunch, setMuted } from './audio.js';
import { initPolice, increaseWanted, updatePolice, getWantedLevel, isFlashing, getPoliceUnits, __testSetWanted, setPoliceDifficulty, getPoliceDifficulty } from './police.js';
import { initProps, updateProps, getProps } from './props.js';
import { initMissions, updateMissions, getMarkers, getRamps, getScore, spendCash, addCash, acceptPendingMission, consumeLevelUp } from './missions.js';
import { getLevel, getXP, xpIntoLevel, xpPerLevel } from './xpSystem.js';
import { initCityArchitecture } from './cityArchitecture.js';
import { initNature } from './natureEngine.js';
import { buildCar, buildMoto, updateVehicle, CAR_PARAMS, MOTO_PARAMS } from './vehicleController.js';
import { buildCharacter, applyLocomotionSwing, seatOnMoto, unseatFromMoto } from './characterRig.js';
import { initCameraRig, updateCameraRig, getCameraZoomDebug, __testSetZoom } from './cameraRig.js';
import { initGarage } from './garage.js';
import { initMapGPS, renderMapGPS, computeRoute } from './mapGPS.js';
import { initModShop, refreshShopBadge, refreshShopPanel } from './modShop.js';
import { initDealership, renderDealership, getActiveTierCostMultiplier, setCarColor } from './dealership.js';
import { initCharacterCustomizer } from './characterCustomizer.js';
import { initSafehouse, updateSafehouse, trySafehousePurchase, setActiveVehicle, getHomeLocation, getHouseAABBs } from './safehouse.js';
import { initLandmark, updateLandmark, getLandmarkAABB, LANDMARK_X, LANDMARK_Z } from './landmarks.js';
import { initPrison, updatePrison, isSeenByGuard, pickRandomMission, getMissionById, getMissionTargetWorld, distanceToMissionTarget, TARGET_REACH_RADIUS, getPrisonEntryPoint, getPrisonWallAABBs, PRISON_X, PRISON_Z, isOutsideCompound } from './prison.js';
import { initRacing, getRaceList, startRace, startCustomRace, exitRace, isRaceActive, updateRacing, DIFFICULTIES, LENGTHS, getMinimapRoute } from './racing.js';
import { initTraffic, spawnTraffic, updateTraffic } from './traffic.js';
import { getSave, saveState, listWorlds, createWorld, switchWorld, deleteWorld, getActiveWorldId } from './saveSystem.js';

// ============================================================
// Constants
// ============================================================
const GRID = 14;                 // city blocks per side
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
const hudLevel = document.getElementById('hud-level');
const hudWanted = document.getElementById('hud-wanted');
const wantedStars = Array.from(hudWanted.querySelectorAll('.star'));
const missionHud = document.getElementById('mission-hud');
const missionArrow = document.getElementById('mission-arrow');
const missionDist = document.getElementById('mission-dist');
const missionTimer = document.getElementById('mission-timer');

const gpsHud = document.getElementById('gps-hud');
const gpsArrow = document.getElementById('gps-arrow');
const gpsDist = document.getElementById('gps-dist');
const gpsCancel = document.getElementById('gps-cancel');

const prisonHud = document.getElementById('prison-hud');
const prisonText = document.getElementById('prison-text');
const prisonStatus = document.getElementById('prison-status');
const arrestWarning = document.getElementById('arrest-warning');

const sideMenu = document.getElementById('side-menu');
const panelGarage = document.getElementById('panel-garage');
const panelMap = document.getElementById('panel-map');
const panelShop = document.getElementById('panel-shop');
const panelCustomizer = document.getElementById('panel-customizer');
const panelSettings = document.getElementById('panel-settings');
const panelRace = document.getElementById('panel-race');
const allPanels = [panelGarage, panelMap, panelShop, panelCustomizer, panelSettings, panelRace];
const shopBadge = document.getElementById('shop-badge');

const boostHud = document.getElementById('boost-hud');
const boostFill = document.getElementById('boost-fill');
const missionPrompt = document.getElementById('mission-prompt');
const missionPromptText = document.getElementById('mission-prompt-text');
const raceHud = document.getElementById('race-hud');
const raceLapEl = document.getElementById('race-lap');
const raceProgressFill = document.getElementById('race-progress-fill');
const racePositionEl = document.getElementById('race-position');
const raceExitBtn = document.getElementById('race-exit');

const screenWorlds = document.getElementById('screen-worlds');
const worldListEl = document.getElementById('world-list');
const worldNewName = document.getElementById('world-new-name');
const worldNewBtn = document.getElementById('world-new-btn');
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
renderer.setPixelRatio(1);
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
dirLight.shadow.mapSize.set(512, 512);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 260;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
dirLight.shadow.bias = -0.0003;
scene.add(dirLight);
scene.add(dirLight.target);

// ============================================================
// City, nature, vehicles, character
// ============================================================
// skip-block reservations are computed from fixed WORLD coordinates rather
// than hardcoded block indices, so a park/landmark/compound stays aligned
// with the procedural city grid no matter what GRID is set to
function blockIndexOf(worldX) { return Math.round((worldX + CITY_HALF) / BLOCK - 0.5); }
const PRISON_SKIP_BLOCKS = [];
{
  const pbx = blockIndexOf(PRISON_X), pbz = blockIndexOf(PRISON_Z);
  for (let bx = pbx - 1; bx <= pbx + 1; bx++) for (let bz = pbz - 1; bz <= pbz + 1; bz++) PRISON_SKIP_BLOCKS.push({ bx, bz });
}
const cityOpts = {
  grid: GRID, block: BLOCK, streetW: STREET_W, lot: LOT, cityHalf: CITY_HALF, citySeed: CITY_SEED,
  skipBlocks: [
    { bx: 4, bz: 4 }, // central park -- natureEngine.buildCentralPark uses this same fixed block index
    { bx: blockIndexOf(LANDMARK_X), bz: blockIndexOf(LANDMARK_Z) },
    ...PRISON_SKIP_BLOCKS,
  ],
};
const cityArch = initCityArchitecture(scene, THREE, cityOpts);
const { buildingAABBs, nightLights, shopSigns, buildingMaterials, hitLampPoles, updateLampPoles, lampPoles, pois, updateLightCulling } = cityArch;
// the safehouse structures aren't part of cityArchitecture's own generation,
// so they were never in this list -- without this, vehicles and the player
// on foot could walk/drive straight through the safehouse buildings
buildingAABBs.push(...getHouseAABBs(BLOCK, CITY_HALF));
buildingAABBs.push(getLandmarkAABB(BLOCK, CITY_HALF));
initLandmark(scene, THREE);
buildingAABBs.push(...getPrisonWallAABBs(BLOCK, CITY_HALF));
initPrison(scene, THREE);

// 5m arrest-range ring, drawn flat on the ground around the player and only
// shown while a police car is within it (see stepSim's policeInfo handling)
// arrest ring: a dim static boundary ring at the fixed 5m radius, plus a
// bright radial "fill" arc drawn over it that sweeps a full circle across
// exactly ARREST_SECONDS (4s) -- one geometry rebuild per frame while
// visible, which is trivial for a ~48-segment ring
const ARREST_RING_INNER = 4.85, ARREST_RING_OUTER = 5;
const arrestRingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, side: THREE.DoubleSide });
const arrestRing = new THREE.Mesh(new THREE.RingGeometry(ARREST_RING_INNER, ARREST_RING_OUTER, 48), arrestRingMat);
arrestRing.rotation.x = -Math.PI / 2;
arrestRing.position.y = 0.05;
arrestRing.visible = false;
scene.add(arrestRing);
const arrestFillMat = new THREE.MeshBasicMaterial({ color: '#ff3030', transparent: true, opacity: 0.95, side: THREE.DoubleSide });
const arrestFillRing = new THREE.Mesh(new THREE.RingGeometry(ARREST_RING_INNER, ARREST_RING_OUTER, 48, 1, -Math.PI / 2, 0.0001), arrestFillMat);
arrestFillRing.rotation.x = -Math.PI / 2;
arrestFillRing.position.y = 0.06;
arrestFillRing.visible = false;
scene.add(arrestFillRing);

let inPrison = false;
let lastArrestProgress = 0;
let activeMission = null;
let missionTargetMesh = null;

function showMissionTargetBeacon(x, z) {
  if (missionTargetMesh) scene.remove(missionTargetMesh);
  const geo = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 16);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffd23f', emissiveIntensity: 1.6, transparent: true, opacity: 0.8 });
  missionTargetMesh = new THREE.Mesh(geo, mat);
  missionTargetMesh.position.set(x, 0.1, z);
  scene.add(missionTargetMesh);
}
function hideMissionTargetBeacon() {
  if (missionTargetMesh) { scene.remove(missionTargetMesh); missionTargetMesh = null; }
}

// called when police.js reports an arrest (5m ring held for 4s straight)
const JAIL_RELEASE_SECONDS = 7 * 60;
let jailTimer = 0;

function startPrisonMission() {
  inPrison = true;
  activeMission = pickRandomMission();
  jailTimer = JAIL_RELEASE_SECONDS;
  const entry = getPrisonEntryPoint();
  mode = 'foot';
  character.group.visible = true;
  foot.x = entry.x; foot.z = entry.z; foot.yaw = entry.yaw; foot.y = 0; foot.vy = 0; foot.speed = 0;
  const target = getMissionTargetWorld(activeMission);
  showMissionTargetBeacon(target.x, target.z);
  prisonHud.classList.remove('hidden');
  prisonText.textContent = activeMission.title + ' — ' + activeMission.text;
  prisonStatus.textContent = '';
  showMessage('🚔 נעצרת ונכלאת!');
}

function caughtByGuard() {
  const entry = getPrisonEntryPoint();
  foot.x = entry.x; foot.z = entry.z; foot.yaw = entry.yaw; foot.speed = 0;
  showMessage('השומר תפס אותך! חזרת לנקודת ההתחלה.');
}

function escapePrison() {
  inPrison = false;
  hideMissionTargetBeacon();
  prisonHud.classList.add('hidden');
  activeMission = null;
  const entry = getPrisonEntryPoint();
  foot.x = entry.x + 14; foot.z = entry.z; foot.yaw = Math.PI / 2; foot.y = 0; foot.vy = 0; foot.speed = 0;
  addCash(1000);
  showMessage('🎉 ברחת מהכלא בהצלחה! +₪1000');
}

// no escape mission attempted in time: the player just gets let out with no
// reward, per the fixed 7-minute release timer
function releaseFromJail() {
  inPrison = false;
  hideMissionTargetBeacon();
  prisonHud.classList.add('hidden');
  activeMission = null;
  const entry = getPrisonEntryPoint();
  foot.x = entry.x + 14; foot.z = entry.z; foot.yaw = Math.PI / 2; foot.y = 0; foot.vy = 0; foot.speed = 0;
  showMessage('🔓 שוחררת מהכלא לאחר ריצוי הזמן');
}

// restores a jail-in-progress state exactly (mission + remaining timer)
// instead of picking a fresh random mission, so reloading mid-sentence
// doesn't hand the player a free do-over
function restorePrisonMission(missionId, jailRemaining) {
  const mission = getMissionById(missionId);
  if (!mission) return false;
  inPrison = true;
  activeMission = mission;
  jailTimer = jailRemaining > 0 ? jailRemaining : JAIL_RELEASE_SECONDS;
  const entry = getPrisonEntryPoint();
  mode = 'foot';
  character.group.visible = true;
  foot.x = entry.x; foot.z = entry.z; foot.yaw = entry.yaw; foot.y = 0; foot.vy = 0; foot.speed = 0;
  const target = getMissionTargetWorld(activeMission);
  showMissionTargetBeacon(target.x, target.z);
  prisonHud.classList.remove('hidden');
  prisonText.textContent = activeMission.title + ' — ' + activeMission.text;
  prisonStatus.textContent = '';
  return true;
}

// auto-save: exact coordinates, mode, wanted level, and (if applicable) the
// in-progress jail sentence + escape mission -- called on exit to the world
// selector, on tab close, and periodically during play
function saveGameState() {
  saveState({
    cash: getScore(),
    lastLocation: { mode, x: playerXForSave(), z: playerZForSave(), yaw: playerYawForSave() },
    inPrison,
    activeMissionId: activeMission ? activeMission.id : null,
    jailTimerRemaining: inPrison ? jailTimer : 0,
    wantedLevel: getWantedLevel(),
  });
}
function playerXForSave() { return mode === 'car' ? carState.x : mode === 'moto' ? motoState.x : foot.x; }
function playerZForSave() { return mode === 'car' ? carState.z : mode === 'moto' ? motoState.z : foot.z; }
function playerYawForSave() { return mode === 'car' ? carState.yaw : mode === 'moto' ? motoState.yaw : foot.yaw; }

// applied once, right when the game actually starts (see startGame()) --
// everything it needs (character, carState, ...) is already built by then
// even though this function is declared up here, since it only ever runs
// later in response to a user action
function restoreSavedState() {
  const save = getSave();
  if (save.inPrison && save.activeMissionId) {
    if (restorePrisonMission(save.activeMissionId, save.jailTimerRemaining)) return;
  }
  if (save.lastLocation) {
    const loc = save.lastLocation;
    if (loc.mode === 'car') { carState.x = loc.x; carState.z = loc.z; carState.yaw = loc.yaw; mode = 'car'; character.group.visible = false; }
    else if (loc.mode === 'moto') { motoState.x = loc.x; motoState.z = loc.z; motoState.yaw = loc.yaw; mode = 'moto'; seatOnMoto(scene, character, moto.group); }
    else { foot.x = loc.x; foot.z = loc.z; foot.yaw = loc.yaw; mode = 'foot'; character.group.visible = true; }
  }
  if (save.wantedLevel > 0) __testSetWanted(save.wantedLevel, playerXForSave(), playerZForSave());
}
initNature(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, citySeed: CITY_SEED });

const car = buildCar(THREE, scene);
const moto = buildMoto(THREE, scene);
const character = buildCharacter(THREE, scene);

// ============================================================
// Pedestrians
// ============================================================
spawnPedestrians(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, seed: CITY_SEED, count: 48 });
initPolice(scene, THREE, resolveCircleVsBuildings);
initProps(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, seed: CITY_SEED });
initMissions(scene, THREE);

// ============================================================
// Simulation state
// ============================================================
const carState = { x: 6, z: 14, yaw: Math.PI, speed: 0, y: 0, vy: 0, boosting: false };
const motoState = { x: -6, z: 14, yaw: Math.PI, speed: 0, y: 0, vy: 0, boosting: false };
const foot = { x: 0, z: 20, yaw: Math.PI, y: 0, vy: 0, speed: 0, grounded: true, phase: 0 };
let gpsPath = null; // ordered list of {x,z} road-graph hops to the tapped destination

let mode = 'foot';
let dayTime = 0.4;
let nightFactor = 0;
let running = false;
let paused = false;
let msgTimer = 0;
let lastTime = null;
let lastSplash = null;
let slowMoTimer = 0;
let lightCullTimer = 0;
let autosaveTimer = 0;
let lastMissionInfo = { score: 0, waypoint: null, splash: null };

const keys = { left: false, right: false, up: false, down: false, shift: false, space: false, f: false, punch: false };
let fEdge = false, spaceEdge = false, punchEdge = false, pendingWeapon = null;
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
  // soft edge: push back in and kill the outward velocity component so
  // reaching the map edge feels like slowing at a wall, never a snap/jump
  const half = CITY_HALF - 4;
  if (state.x > half) { state.x = half; if (state.speed !== undefined && Math.sin(state.yaw ?? 0) > 0) state.speed *= 0.3; }
  else if (state.x < -half) { state.x = -half; if (state.speed !== undefined && Math.sin(state.yaw ?? 0) < 0) state.speed *= 0.3; }
  if (state.z > half) { state.z = half; if (state.speed !== undefined && Math.cos(state.yaw ?? 0) > 0) state.speed *= 0.3; }
  else if (state.z < -half) { state.z = -half; if (state.speed !== undefined && Math.cos(state.yaw ?? 0) < 0) state.speed *= 0.3; }
}

// context passed into the extracted vehicleController.updateVehicle() so it
// can reach world collision/lamp logic that still lives in this module
const vehicleCtx = { keys, steerThrottle, resolveCircleVsBuildings, hitLampPoles, gravity: GRAVITY };

initRacing(scene, THREE, {
  BLOCK, CITY_HALF, buildCar, updateVehicle, CAR_PARAMS,
  resolveCircleVsBuildings, hitLampPoles, gravity: GRAVITY, addCash,
  setDayTime: (t) => { dayTime = t; }, getDayTime: () => dayTime,
});

initTraffic(scene, THREE, { BLOCK, CITY_HALF, buildCar, updateVehicle, resolveCircleVsBuildings, hitLampPoles, gravity: GRAVITY });
spawnTraffic(26, 0, 0);

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
  applyLocomotionSwing(character, foot.phase, foot.speed, FOOT_WALK, FOOT_RUN, dt);
}

function showMessage(text) {
  hudMsg.textContent = text;
  hudMsg.classList.add('visible');
  msgTimer = 1.6;
}

function tryPunch(forceWeapon) {
  if (mode !== 'foot') return;
  const isKnife = (forceWeapon || weapon) === 'knife';
  const hit = punchNear(foot.x, foot.z, foot.yaw, isKnife ? 2.1 : 1.5);
  if (hit) {
    playPunch();
    // a knife draws attention regardless of time of day, and escalates the
    // search level faster than a bare-handed shove
    if (isKnife) increaseWanted(foot.x, foot.z, 2);
    else if (nightFactor < 0.5) increaseWanted(foot.x, foot.z, 1); // "in broad daylight" per spec
    showMessage(isKnife ? 'דקירה!' : 'אגרוף!');
  }
}

// returns whether the F-press was consumed by entering/exiting a vehicle, so
// stepSim knows when to fall through to the safehouse "for sale" interaction
function tryEnterExit() {
  if (mode === 'foot') {
    const dCar = Math.hypot(foot.x - carState.x, foot.z - carState.z);
    const dMoto = Math.hypot(foot.x - motoState.x, foot.z - motoState.z);
    if (dCar <= ENTER_RANGE && dCar <= dMoto) {
      mode = 'car';
      character.group.visible = false;
      setActiveVehicle('car');
      showMessage('נכנסת למכונית — F ליציאה');
      return true;
    } else if (dMoto <= ENTER_RANGE) {
      mode = 'moto';
      seatOnMoto(scene, character, moto.group);
      setActiveVehicle('moto');
      showMessage('עלית לאופנוע — F ליציאה');
      return true;
    }
    return false;
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
    return true;
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
  const playerState = mode === 'foot' ? foot : (mode === 'car' ? carState : motoState);
  dirLight.position.set(playerState.x + Math.cos(sunAngle) * 60, Math.max(6, Math.sin(sunAngle) * 60 + 20), playerState.z + 30);
  dirLight.target.position.set(playerState.x, 0, playerState.z);
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

  const route = getMinimapRoute();
  if (route) {
    minimapCtx.strokeStyle = 'rgba(61, 220, 90, 0.8)';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    for (let i = 0; i < route.points.length; i++) {
      const p = route.points[i];
      const px = (p.x + CITY_HALF) * scale, pz = (p.z + CITY_HALF) * scale;
      if (i === 0) minimapCtx.moveTo(px, pz); else minimapCtx.lineTo(px, pz);
    }
    minimapCtx.closePath();
    minimapCtx.stroke();
    const cur = route.points[route.currentCp];
    if (cur) {
      minimapCtx.fillStyle = '#7dffa0';
      minimapCtx.beginPath();
      minimapCtx.arc((cur.x + CITY_HALF) * scale, (cur.z + CITY_HALF) * scale, 4, 0, Math.PI * 2);
      minimapCtx.fill();
    }
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

  boostHud.classList.toggle('hidden', !state);
  if (state) {
    const pct = Math.round(state.boostMeter ?? 100);
    boostFill.style.width = pct + '%';
    boostFill.classList.toggle('depleted', pct <= 0);
  }
}

function updateWantedHud() {
  const level = getWantedLevel();
  hudWanted.classList.toggle('flash', isFlashing());
  wantedStars.forEach((el, i) => el.classList.toggle('active', i < level));
}

function updateMissionHud(missionInfo, playerState) {
  hudCash.textContent = '₪' + missionInfo.score;
  hudLevel.textContent = 'Lv ' + getLevel();
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
// GPS waypoint HUD (route computed by mapGPS.js's A* over the street grid,
// tracked one hop at a time every frame)
// ============================================================
function updateGpsHud(playerState) {
  if (!gpsPath || gpsPath.length === 0) { gpsHud.classList.add('hidden'); return; }
  let hop = gpsPath[0];
  let dist = Math.hypot(hop.x - playerState.x, hop.z - playerState.z);
  if (dist < 8) {
    gpsPath.shift();
    if (gpsPath.length === 0) {
      gpsPath = null;
      gpsHud.classList.add('hidden');
      showMessage('הגעת ליעד הניווט!');
      return;
    }
    hop = gpsPath[0];
    dist = Math.hypot(hop.x - playerState.x, hop.z - playerState.z);
  }
  gpsHud.classList.remove('hidden');
  const bearing = Math.atan2(hop.x - playerState.x, hop.z - playerState.z);
  const rel = bearing - (playerState.yaw || 0) - Math.PI / 2;
  gpsArrow.style.transform = `rotate(${rel}rad)`;
  const remaining = gpsPath.length - 1;
  gpsDist.textContent = Math.round(dist) + 'm' + (remaining > 0 ? ` (+${remaining})` : '');
}
gpsCancel.addEventListener('click', () => { gpsPath = null; gpsHud.classList.add('hidden'); });

// ============================================================
// Left-side menu: garage / map / mod shop / home / settings / wardrobe
// ============================================================
function closeAllPanels() { for (const p of allPanels) p.classList.add('hidden'); }
document.querySelectorAll('.panel-close').forEach((b) => b.addEventListener('click', closeAllPanels));
for (const p of allPanels) {
  p.addEventListener('pointerdown', (e) => { if (e.target === p) closeAllPanels(); });
}

function teleportToVehicle(which) {
  const state = which === 'car' ? carState : motoState;
  const ref = mode === 'foot' ? foot : (mode === 'car' ? carState : motoState);
  state.x = ref.x + Math.sin(ref.yaw) * 4;
  state.z = ref.z + Math.cos(ref.yaw) * 4;
  state.yaw = ref.yaw; state.y = 0; state.vy = 0; state.speed = 0;
  if (mode === 'foot') {
    if (which === 'moto') { mode = 'moto'; seatOnMoto(scene, character, moto.group); }
    else { mode = 'car'; character.group.visible = false; }
  }
  setActiveVehicle(which);
  closeAllPanels();
  showMessage(which === 'car' ? 'המכונית הוזמנה' : 'האופנוע הוזמן');
}
function repairVehicle(which) {
  const state = which === 'car' ? carState : motoState;
  state.y = 0; state.vy = 0; state.speed = 0;
  closeAllPanels();
  showMessage('תוקן!');
}
initGarage(panelGarage, { teleportToVehicle, repairVehicle });

initMapGPS(panelMap, { citySize: CITY_SIZE, cityHalf: CITY_HALF, block: BLOCK, buildingAABBs, pois }, {
  getMarkers,
  getPath: () => gpsPath,
  getPlayer: () => (mode === 'foot' ? foot : (mode === 'car' ? carState : motoState)),
}, (path, dest) => {
  if (!path) { showMessage('לא נמצא מסלול ליעד'); return; }
  gpsPath = path;
  closeAllPanels();
  showMessage(gpsPath.length > 1 ? `מסלול חושב — ${gpsPath.length - 1} צמתים בדרך` : 'יעד ניווט הוגדר');
});
window.__testSetGpsRoute = (destX, destZ) => {
  const player = mode === 'foot' ? foot : (mode === 'car' ? carState : motoState);
  gpsPath = computeRoute(player.x, player.z, destX, destZ);
  return window.__debug();
};

initModShop(panelShop, { carParams: CAR_PARAMS, motoParams: MOTO_PARAMS, getScore, spendCash, badgeEl: shopBadge, getCarTierMultiplier: getActiveTierCostMultiplier });
initDealership(panelGarage, { THREE, carRig: car, carParams: CAR_PARAMS, spendCash });
document.querySelectorAll('#car-color-row .swatch').forEach((btn) => {
  btn.addEventListener('click', () => setCarColor(btn.dataset.color));
});

initCharacterCustomizer(panelCustomizer, { shirtMat: character.shirtMat, pantsMat: character.pantsMat });

initSafehouse(scene, THREE, {
  getScore,
  spendCash,
  showMessage,
  openWardrobe: () => { closeAllPanels(); panelCustomizer.classList.remove('hidden'); },
  getPlayerState: () => {
    const state = mode === 'foot' ? foot : (mode === 'car' ? carState : motoState);
    return { mode, x: state.x, z: state.z, yaw: state.yaw };
  },
});

// teleports the player to their highest-tier owned property and parks their
// active saved vehicle in its driveway (unless they're already riding it in,
// in which case it's already parked at the arrival spot itself)
function goHome() {
  const home = getHomeLocation();
  if (mode === 'foot') { foot.x = home.x; foot.z = home.z; foot.yaw = home.yaw; foot.y = 0; foot.vy = 0; foot.speed = 0; }
  else {
    const state = mode === 'car' ? carState : motoState;
    state.x = home.x; state.z = home.z; state.yaw = home.yaw; state.y = 0; state.vy = 0; state.speed = 0;
  }
  const active = getSave().activeVehicle || 'car';
  if (!(mode !== 'foot' && mode === active)) {
    const vState = active === 'car' ? carState : motoState;
    vState.x = home.gx; vState.z = home.gz; vState.yaw = home.yaw; vState.y = 0; vState.vy = 0; vState.speed = 0;
  }
  showMessage(`חזרת ל${home.label}`);
}

let muted = false;
document.getElementById('settings-mute').addEventListener('click', (e) => {
  muted = !muted;
  setMuted(muted);
  e.target.textContent = muted ? '🔇 בטל השתקה' : '🔈 השתק צלילים';
});
document.getElementById('settings-skip-time').addEventListener('click', () => { dayTime = (dayTime + 0.25) % 1; });
// the wardrobe/customizer button used to live in the main side-menu, but on
// a real landscape phone screen it overlapped the joystick (confirmed: both
// boxes fully coincided at 844x390) -- moved into the settings panel instead
document.getElementById('settings-wardrobe').addEventListener('click', () => { closeAllPanels(); panelCustomizer.classList.remove('hidden'); });

let weapon = 'fist'; // 'fist' | 'knife' -- toggled from settings, read by tryPunch()
document.getElementById('settings-knife').addEventListener('click', (e) => {
  weapon = weapon === 'fist' ? 'knife' : 'fist';
  e.target.textContent = weapon === 'knife' ? '👊 החלף לאגרוף' : '🔪 החלף לסכין';
});

const TOUCH_SIZE_KEY = 'openCity.touchScale';
function applyTouchScale(scale) {
  document.documentElement.style.setProperty('--touch-scale', scale);
  document.querySelectorAll('.size-btn').forEach((b) => b.classList.toggle('active', b.dataset.size === String(scale)));
  try { localStorage.setItem(TOUCH_SIZE_KEY, scale); } catch (e) { /* private mode -- just won't persist */ }
}
document.querySelectorAll('.size-btn').forEach((b) => {
  b.addEventListener('click', () => applyTouchScale(b.dataset.size));
});
try {
  const savedScale = localStorage.getItem(TOUCH_SIZE_KEY);
  if (savedScale) applyTouchScale(savedScale);
} catch (e) { /* private mode -- default scale stays 1 */ }

const POLICE_DIFF_KEY = 'openCity.policeDifficulty';
function applyPoliceDifficulty(level) {
  setPoliceDifficulty(level);
  document.querySelectorAll('.diff-btn').forEach((b) => b.classList.toggle('active', b.dataset.diff === level));
  try { localStorage.setItem(POLICE_DIFF_KEY, level); } catch (e) { /* private mode -- just won't persist */ }
}
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => applyPoliceDifficulty(b.dataset.diff));
});
try {
  const savedDiff = localStorage.getItem(POLICE_DIFF_KEY);
  applyPoliceDifficulty(savedDiff || getPoliceDifficulty());
} catch (e) { /* private mode -- default difficulty stays normal */ }

document.getElementById('menu-garage').addEventListener('click', () => { closeAllPanels(); renderDealership(); panelGarage.classList.remove('hidden'); });
document.getElementById('menu-map').addEventListener('click', () => { closeAllPanels(); renderMapGPS(); panelMap.classList.remove('hidden'); });
document.getElementById('menu-shop').addEventListener('click', () => { closeAllPanels(); refreshShopPanel(); panelShop.classList.remove('hidden'); });
document.getElementById('menu-race').addEventListener('click', () => { closeAllPanels(); renderRacePanel(); panelRace.classList.remove('hidden'); });
document.getElementById('menu-home').addEventListener('click', goHome);
document.getElementById('menu-settings').addEventListener('click', () => { closeAllPanels(); panelSettings.classList.remove('hidden'); });

// ============================================================
// Racing
// ============================================================
let selectedLength = LENGTHS[1].id;
let selectedDifficulty = DIFFICULTIES[1].id;

function renderRacePanel() {
  const listEl = document.getElementById('race-list');
  listEl.innerHTML = '';
  for (const r of getRaceList()) {
    const item = document.createElement('div');
    item.className = 'race-item';
    item.innerHTML = `
      <h4><span>${r.name}</span><span class="race-meta">${r.difficulty}</span></h4>
      <p>${r.description}</p>
      <div class="race-meta">${r.laps} סבבים • 7 יריבים${r.night ? ' • לילה' : ''}</div>
      <button class="btn-small race-start-btn" type="button">🏁 התחל מרוץ</button>
    `;
    item.querySelector('.race-start-btn').addEventListener('click', () => beginSelectedRace(r.id));
    listEl.appendChild(item);
  }

  const lengthOpts = document.getElementById('race-length-opts');
  lengthOpts.innerHTML = '';
  for (const l of LENGTHS) {
    const b = document.createElement('button');
    b.className = 'race-opt-btn' + (l.id === selectedLength ? ' active' : '');
    b.textContent = l.label;
    b.type = 'button';
    b.addEventListener('click', () => { selectedLength = l.id; renderRacePanel(); });
    lengthOpts.appendChild(b);
  }
  const diffOpts = document.getElementById('race-diff-opts');
  diffOpts.innerHTML = '';
  for (const d of DIFFICULTIES) {
    const b = document.createElement('button');
    b.className = 'race-opt-btn' + (d.id === selectedDifficulty ? ' active' : '');
    b.textContent = d.label;
    b.type = 'button';
    b.addEventListener('click', () => { selectedDifficulty = d.id; renderRacePanel(); });
    diffOpts.appendChild(b);
  }
}

function beginSelectedRace(raceId) {
  if (inPrison) { showMessage('אי אפשר להתחיל מרוץ בזמן שאתה בכלא!'); return; }
  closeAllPanels();
  mode = 'car';
  character.group.visible = false;
  startRace(raceId, carState);
}

document.getElementById('race-custom-start').addEventListener('click', () => {
  if (inPrison) { showMessage('אי אפשר להתחיל מרוץ בזמן שאתה בכלא!'); return; }
  closeAllPanels();
  mode = 'car';
  character.group.visible = false;
  startCustomRace(selectedLength, selectedDifficulty, carState);
});

raceExitBtn.addEventListener('click', () => {
  exitRace();
  raceHud.classList.add('hidden');
});

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
  if (fEdge) {
    // F is already "enter/exit vehicle" -- a pending mission prompt takes
    // priority over that so accepting a job doesn't accidentally hop out
    const tookMission = mode !== 'foot' && lastMissionInfo.prompt && acceptPendingMission();
    if (!tookMission) {
      const handled = tryEnterExit();
      if (!handled) trySafehousePurchase(foot.x, foot.z);
    }
    fEdge = false;
  }
  if (punchEdge) { tryPunch(pendingWeapon); punchEdge = false; pendingWeapon = null; }

  if (!paused) {
    if (mode === 'car') { if (updateVehicle(carState, dt, CAR_PARAMS, vehicleCtx).launchedRamp) slowMoTimer = 1.1; }
    else if (mode === 'moto') { if (updateVehicle(motoState, dt, MOTO_PARAMS, vehicleCtx).launchedRamp) slowMoTimer = 1.1; }
    else updateFoot(dt);
    const pedInfo = updatePedestrians(dt, foot.x, foot.z);
    if (pedInfo.playerAttacked && mode === 'foot') {
      foot.x += pedInfo.attackX * 0.5;
      foot.z += pedInfo.attackZ * 0.5;
      foot.speed *= 0.4;
      showMessage('אזרח תוקף אותך בחזרה!');
    }
    updateProps(dt);
    updateLampPoles(dt);
    updateSafehouse(dt, foot.x, foot.z, mode === 'foot');
    updateLandmark(dt);
    updatePrison(dt);

    const playerState = mode === 'car' ? carState : mode === 'moto' ? motoState : foot;
    updateTraffic(dt, mode === 'foot' ? null : playerState);

    lightCullTimer -= dt;
    if (lightCullTimer <= 0) {
      lightCullTimer = 0.4;
      updateLightCulling(playerState.x, playerState.z);
    }

    autosaveTimer -= dt;
    if (autosaveTimer <= 0) { autosaveTimer = 20; saveGameState(); }

    const leveledUpTo = consumeLevelUp();
    if (leveledUpTo) showMessage(`🆙 עלית לרמה ${leveledUpTo}!`);

    const policeInfo = updatePolice(dt, playerState, mode !== 'foot');
    if (policeInfo.rammed) {
      const activeState = mode === 'car' ? carState : motoState;
      activeState.speed *= 0.85;
      activeState.x += policeInfo.pushX * 0.3;
      activeState.z += policeInfo.pushZ * 0.3;
    }
    if (policeInfo.runOverFoot) {
      // non-lethal: the cruiser blocks/bumps the player aside instead of
      // running them down -- police box the player in toward an arrest
      foot.x += policeInfo.footPushX * 0.6;
      foot.z += policeInfo.footPushZ * 0.6;
      foot.speed *= 0.3;
      showMessage('ניידת משטרה חוסמת אותך!');
    }
    const arrestVisible = policeInfo.inArrestRange && !inPrison;
    lastArrestProgress = policeInfo.arrestProgress;
    arrestRing.visible = arrestVisible;
    arrestFillRing.visible = arrestVisible;
    if (arrestVisible) {
      arrestRing.position.x = playerState.x;
      arrestRing.position.z = playerState.z;
      arrestFillRing.position.x = playerState.x;
      arrestFillRing.position.z = playerState.z;
      // radial fill: one full sweep across the whole ring exactly as the
      // 4-second arrest timer completes, "filling in" clockwise from the top
      const thetaLength = Math.max(0.0001, policeInfo.arrestProgress * Math.PI * 2);
      arrestFillRing.geometry.dispose();
      arrestFillRing.geometry = new THREE.RingGeometry(ARREST_RING_INNER, ARREST_RING_OUTER, 48, 1, -Math.PI / 2, thetaLength);
    }
    arrestWarning.classList.toggle('hidden', !arrestVisible);
    if (policeInfo.arrested) startPrisonMission();

    if (inPrison && activeMission) {
      if (isSeenByGuard(foot.x, foot.z)) caughtByGuard();
      else if (isOutsideCompound(foot.x)) {
        // no walking straight out the gate for free -- back inside
        const entry = getPrisonEntryPoint();
        foot.x = entry.x; foot.z = entry.z; foot.yaw = entry.yaw; foot.speed = 0;
        showMessage('אין דרך החוצה בלי להשלים את משימת הבריחה!');
      }
      const distToTarget = distanceToMissionTarget(activeMission, foot.x, foot.z);
      jailTimer -= dt;
      if (distToTarget < TARGET_REACH_RADIUS) escapePrison();
      else if (jailTimer <= 0) releaseFromJail();
      else {
        const mm = Math.floor(jailTimer / 60), ss = Math.floor(jailTimer % 60);
        prisonStatus.textContent = `מרחק ליעד: ${Math.round(distToTarget)}מ' • שחרור אוטומטי בעוד ${mm}:${String(ss).padStart(2, '0')}`;
      }
    }

    const missionInfo = updateMissions(dt, playerState.x, playerState.z, mode !== 'foot');
    lastMissionInfo = missionInfo;
    if (missionInfo.splash && missionInfo.splash !== lastSplash) {
      showMessage(missionInfo.splash);
      lastSplash = missionInfo.splash;
    } else if (!missionInfo.splash) {
      lastSplash = null;
    }

    missionPrompt.classList.toggle('hidden', !missionInfo.prompt);
    if (missionInfo.prompt) missionPromptText.textContent = missionInfo.prompt.text;

    if (isRaceActive()) {
      const raceInfo = updateRacing(dt, carState);
      raceHud.classList.remove('hidden');
      raceLapEl.textContent = `סבב ${raceInfo.lap}/${raceInfo.totalLaps}`;
      raceProgressFill.style.width = raceInfo.progressPct + '%';
      racePositionEl.textContent = `מקום ${raceInfo.position}/${raceInfo.totalRacers}`;
      if (raceInfo.justFinished) {
        showMessage(raceInfo.position === 1 ? '🏆 ניצחת במרוץ!' : `סיימת במקום ${raceInfo.position}!`);
      }
    } else {
      raceHud.classList.add('hidden');
    }

    updateCameraRig(dt, { mode, carState, motoState, foot, sprinting: keys.shift });
    updateDayNight(dt);
    syncMeshes(dt);
    updateHud(dt);
    updateWantedHud();
    updateMissionHud(missionInfo, playerState);
    updateGpsHud(playerState);
    refreshShopBadge();
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
  restoreSavedState();
  running = true;
  paused = false;
  lastTime = null;
  screenStart.classList.add('hidden');
  screenPause.classList.add('hidden');
  btnPause.classList.remove('hidden');
  sideMenu.classList.remove('hidden');
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
// Uses e.code (physical key position) rather than e.key for the WASD block:
// e.key reflects the active OS keyboard layout, so on a Hebrew layout the
// physical W/A/S/D keys report Hebrew letters and silently stop working --
// e.code ("KeyW" etc.) always names the physical key regardless of layout.
function setKey(code, key, val) {
  switch (code) {
    case 'ArrowLeft': case 'KeyA': keys.left = val; return;
    case 'ArrowRight': case 'KeyD': keys.right = val; return;
    case 'ArrowUp': case 'KeyW': keys.up = val; return;
    case 'ArrowDown': case 'KeyS': keys.down = val; return;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = val; return;
    case 'Space': if (val && !keys.space) spaceEdge = true; keys.space = val; return;
    case 'KeyF': if (val && !keys.f) fEdge = true; keys.f = val; return;
    case 'KeyE': if (val && !keys.punch) punchEdge = true; keys.punch = val; return;
  }
  // fallback for the rare case a browser/device doesn't populate e.code
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
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Space'].includes(e.key) || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.key === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  setKey(e.code, e.key, true);
});
window.addEventListener('keyup', (e) => setKey(e.code, e.key, false));
// right-click punches on desktop, per spec -- also block the browser's own
// context menu on the canvas so a right-click doesn't pop that up instead
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => { if (e.button === 2) punchEdge = true; });
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
// stopPropagation here is redundant with setPointerCapture below (capture
// already redirects every subsequent event for this pointerId straight to
// joystickEl, so the canvas's own camera-orbit listener never sees it even
// without this) -- kept anyway as an explicit, defense-in-depth guarantee
// that joystick input can never bleed into camera orbit or the side menu.
joystickEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  joystickEl.setPointerCapture(e.pointerId);
  joy.pointerId = e.pointerId;
  joy.active = true;
  joystickEl.classList.add('active');
  updateJoyFromEvent(e);
});
joystickEl.addEventListener('pointermove', (e) => {
  if (joy.pointerId !== e.pointerId) return;
  e.stopPropagation();
  updateJoyFromEvent(e);
});
joystickEl.addEventListener('pointerup', (e) => { if (joy.pointerId === e.pointerId) { e.stopPropagation(); resetJoy(); } });
joystickEl.addEventListener('pointercancel', (e) => { if (joy.pointerId === e.pointerId) { e.stopPropagation(); resetJoy(); } });
document.getElementById('t-action').addEventListener('touchstart', (e) => { e.preventDefault(); fEdge = true; }, { passive: false });
document.getElementById('t-action').addEventListener('click', () => { fEdge = true; });
document.getElementById('t-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if (!keys.space) spaceEdge = true; }, { passive: false });
document.getElementById('t-jump').addEventListener('click', () => { spaceEdge = true; });
// these two are always fist/knife respectively regardless of the settings
// toggle, per spec ("two fixed buttons -- a punch button and a knife button")
document.getElementById('t-punch').addEventListener('touchstart', (e) => { e.preventDefault(); punchEdge = true; pendingWeapon = 'fist'; }, { passive: false });
document.getElementById('t-punch').addEventListener('click', () => { punchEdge = true; pendingWeapon = 'fist'; });
document.getElementById('t-knife').addEventListener('touchstart', (e) => { e.preventDefault(); punchEdge = true; pendingWeapon = 'knife'; }, { passive: false });
document.getElementById('t-knife').addEventListener('click', () => { punchEdge = true; pendingWeapon = 'knife'; });

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  touchControls.classList.remove('hidden');
}

btnStart.addEventListener('click', startGame);

// ============================================================
// World select (shown before the start screen, every time the game opens)
// ============================================================
function renderWorldSelect() {
  worldListEl.innerHTML = '';
  const worlds = listWorlds();
  const activeId = getActiveWorldId();
  if (!worlds.length) {
    const hint = document.createElement('p');
    hint.className = 'world-empty-hint';
    hint.textContent = 'אין עדיין עולמות שמורים — צרו עולם חדש כדי להתחיל.';
    worldListEl.appendChild(hint);
  }
  for (const w of worlds) {
    const item = document.createElement('div');
    item.className = 'world-item';
    const dateStr = new Date(w.lastPlayedAt).toLocaleDateString('he-IL');
    item.innerHTML = `
      <div class="world-info">
        <div class="world-name"></div>
        <div class="world-meta">שוחק לאחרונה: ${dateStr}</div>
      </div>
      ${w.id === activeId ? '<span class="world-active-badge">פעיל</span>' : ''}
      <button class="world-delete" type="button" title="מחק עולם">🗑</button>
    `;
    item.querySelector('.world-name').textContent = w.name; // via textContent, not template interpolation -- world names are user-typed text
    item.querySelector('.world-info').addEventListener('click', () => enterWorld(w.id));
    item.querySelector('.world-active-badge')?.addEventListener('click', () => enterWorld(w.id));
    item.querySelector('.world-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`למחוק את "${w.name}"? הפעולה בלתי הפיכה.`)) {
        deleteWorld(w.id);
        renderWorldSelect();
      }
    });
    worldListEl.appendChild(item);
  }
}

function enterWorld(id) {
  if (id === getActiveWorldId()) {
    // this world's data is already what's loaded in memory -- no reload
    // needed, and per spec there's no separate "start roaming" step: picking
    // a world drops the player straight into the game
    screenWorlds.classList.add('hidden');
    startGame();
  } else {
    // every module reads its save data from saveSystem.js at import time, so
    // switching to a different world's data requires a fresh page load
    switchWorld(id);
    location.reload();
  }
}

worldNewBtn.addEventListener('click', () => {
  createWorld(worldNewName.value.trim());
  location.reload();
});

renderWorldSelect();
btnResume.addEventListener('click', togglePause);
// returns to the world-select screen -- simplest correct way given every
// module's save data is loaded once at import time (see saveSystem.js)
btnRestartPause.addEventListener('click', () => { saveGameState(); location.reload(); });
window.addEventListener('beforeunload', saveGameState);
btnPause.addEventListener('click', togglePause);

resize();
composer.render();
window.__gameBooted = true;
window.__renderer = renderer;
window.__testAddCash = (amount) => { addCash(amount); return getScore(); };
window.__testCarModelInfo = () => ({
  hasRealModel: !!car.realModel,
  groupChildCount: car.group.children.length,
  proceduralVisible: car.proceduralMeshes.map((m) => m.visible),
  realModelMeshNames: car.realModel ? (() => { const names = []; car.realModel.traverse((o) => { if (o.isMesh) names.push(o.name); }); return names; })() : null,
});
window.__lightCount = () => {
  let n = 0;
  scene.traverse((o) => { if (o.isLight) n++; });
  return n;
};

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
  policeCarPositions: getPoliceUnits().cars.map((c) => ({ x: c.x, z: c.z })),
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
  gpsPath: gpsPath ? gpsPath.map((p) => ({ x: p.x, z: p.z })) : null,
  markers: getMarkers(),
  ramps: getRamps(),
  nightFactor,
  camera: getCameraZoomDebug(),
  characterModel: {
    customModelLoaded: !!character.customModel,
    hasMixer: !!character.mixer,
    actionNames: Object.keys(character.actions),
    activeActionIsPlaying: character.activeAction ? character.activeAction.isRunning() : null,
  },
  cash: getScore(),
  prison: {
    inPrison, arrestRingVisible: arrestRing.visible, arrestProgress: lastArrestProgress,
    activeMission: activeMission ? { id: activeMission.id, title: activeMission.title } : null,
  },
});
window.__setFootPos = (x, z, yaw = 0) => { foot.x = x; foot.z = z; foot.yaw = yaw; foot.speed = 0; return window.__debug(); };
window.__testForceArrest = () => { startPrisonMission(); return window.__debug(); };
window.__testMissionTarget = () => {
  if (!activeMission) return null;
  const t = getMissionTargetWorld(activeMission);
  return { ...t, distToTarget: distanceToMissionTarget(activeMission, foot.x, foot.z) };
};
window.__isSeenByGuard = (x, z) => isSeenByGuard(x, z);
// test-only hooks: deterministic stepping independent of real time / rAF throttling
window.__setKeys = (patch) => Object.assign(keys, patch);
window.__setJoy = (x, y, active) => { joy.x = x; joy.y = y; joy.active = active; };
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
window.__testMovePoliceCarNear = (dist = 2) => {
  const p = mode === 'car' ? carState : mode === 'moto' ? motoState : foot;
  const c = getPoliceUnits().cars[0];
  if (!c) return null;
  c.x = p.x; c.z = p.z + dist; c.roadblock = true; // roadblock=true freezes its own movement AI so it stays put
  return { x: c.x, z: c.z };
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
