import * as THREE from 'three';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { spawnPedestrians, updatePedestrians, punchNear, getPedestrians } from './pedestrians.js';
import { initAudio, playPunch, setMuted, setRadioStation, getStationNames } from './audio.js';
import { initPolice, increaseWanted, updatePolice, getWantedLevel, isFlashing, getPoliceUnits, __testSetWanted, setPoliceDifficulty, getPoliceDifficulty, setPlayerInvisible } from './police.js';
import { initProps, updateProps, getProps } from './props.js';
import { initSkidMarks, updateSkidMarks } from './skidMarks.js';
import { initMissions, updateMissions, getMarkers, getRamps, getScore, spendCash, addCash, acceptPendingMission, consumeLevelUp } from './missions.js';
import { getLevel, getXP, xpIntoLevel, xpPerLevel } from './xpSystem.js';
import { initCityArchitecture } from './cityArchitecture.js';
import { initNature } from './natureEngine.js';
import { buildCar, buildMoto, updateVehicle, CAR_PARAMS, MOTO_PARAMS } from './vehicleController.js';
import { buildCharacter, applyLocomotionSwing, seatOnMoto, unseatFromMoto } from './characterRig.js';
import { initCameraRig, updateCameraRig, getCameraZoomDebug, getCameraYawOffset, nudgeCameraYawOffset, __testSetZoom, __testSetYawOffset } from './cameraRig.js';
import { initGarage } from './garage.js';
import { initMapGPS, renderMapGPS, computeRoute } from './mapGPS.js';
import { initModShop, refreshShopBadge, refreshShopPanel } from './modShop.js';
import { initDealership, renderDealership, getActiveTierCostMultiplier, setCarColor, setCarNeon, setCarRims, grantCarTier, renderAirDealership, grantAirTier } from './dealership.js';
import { initWeaponShop, renderWeaponShop, getActiveWeapon, WEAPONS } from './weaponShop.js';
import { buildAirplane, buildHelicopterVehicle, updateAircraft, AIRPLANE_PARAMS, HELICOPTER_PARAMS } from './aircraft.js';
import { applyCheatCode, isAdminUnlocked } from './cheatCodes.js';
import { initCharacterCustomizer } from './characterCustomizer.js';
import { initSafehouse, updateSafehouse, trySafehousePurchase, setActiveVehicle, getHomeLocation, getHouseAABBs } from './safehouse.js';
import { initLandmark, updateLandmark, getLandmarkAABB, LANDMARK_X, LANDMARK_Z } from './landmarks.js';
import { initPrison, updatePrison, isSeenByGuard, pickRandomMission, getMissionById, getMissionTargetWorld, distanceToMissionTarget, TARGET_REACH_RADIUS, getPrisonEntryPoint, getPrisonWallAABBs, PRISON_X, PRISON_Z, isOutsideCompound } from './prison.js';
import { initRacing, getRaceList, startRace, startCustomRace, exitRace, isRaceActive, updateRacing, DIFFICULTIES, LENGTHS, getMinimapRoute, getActiveRaceTheme, unstickPlayer } from './racing.js';
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

const FOOT_WALK = 1.4, FOOT_RUN = 3.6, FOOT_SPRINT = 5.5, FOOT_TURN_RATE = 11;
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
const panelWeapons = document.getElementById('panel-weapons');
const allPanels = [panelGarage, panelMap, panelShop, panelCustomizer, panelSettings, panelRace, panelWeapons];
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
const raceUnstickBtn = document.getElementById('race-unstick');

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

// plain sRGB-integer channel lerp between two '#rrggbb' strings -- deliberately
// NOT done via THREE.Color.lerp(), which mixes in linear color space and keeps
// a saturated sky blue visually dominant over a muted tint until the blend
// factor is almost 1; this keeps per-race sky tinting intuitive and readable
// at a moderate, honest blend factor
function lerpSRGBHex(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

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
let missionTargetLight = null;

function showMissionTargetBeacon(x, z) {
  if (missionTargetMesh) scene.remove(missionTargetMesh);
  const geo = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 16);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffd23f', emissiveIntensity: 1.6, transparent: true, opacity: 0.8 });
  missionTargetMesh = new THREE.Mesh(geo, mat);
  missionTargetMesh.position.set(x, 0.1, z);
  scene.add(missionTargetMesh);
  // a real light (not just an emissive material) so the target is spottable
  // from a distance in the dark cell block/yard at night, not just up close
  if (missionTargetLight) scene.remove(missionTargetLight);
  missionTargetLight = new THREE.PointLight('#ffd23f', 2.2, 14);
  missionTargetLight.position.set(x, 2, z);
  scene.add(missionTargetLight);
}
function hideMissionTargetBeacon() {
  if (missionTargetMesh) { scene.remove(missionTargetMesh); missionTargetMesh = null; }
  if (missionTargetLight) { scene.remove(missionTargetLight); missionTargetLight = null; }
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
function playerXForSave() { return mode === 'car' ? carState.x : mode === 'moto' ? motoState.x : mode === 'plane' ? planeState.x : mode === 'heli' ? heliState.x : foot.x; }
function playerZForSave() { return mode === 'car' ? carState.z : mode === 'moto' ? motoState.z : mode === 'plane' ? planeState.z : mode === 'heli' ? heliState.z : foot.z; }
function playerYawForSave() { return mode === 'car' ? carState.yaw : mode === 'moto' ? motoState.yaw : mode === 'plane' ? planeState.yaw : mode === 'heli' ? heliState.yaw : foot.yaw; }

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
    else if (loc.mode === 'plane') { planeState.x = loc.x; planeState.z = loc.z; planeState.yaw = loc.yaw; mode = 'plane'; character.group.visible = false; }
    else if (loc.mode === 'heli') { heliState.x = loc.x; heliState.z = loc.z; heliState.yaw = loc.yaw; mode = 'heli'; character.group.visible = false; }
    else { foot.x = loc.x; foot.z = loc.z; foot.yaw = loc.yaw; mode = 'foot'; character.group.visible = true; }
  }
  if (save.wantedLevel > 0) __testSetWanted(save.wantedLevel, playerXForSave(), playerZForSave());
}
initNature(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, citySeed: CITY_SEED });

const car = buildCar(THREE, scene);
const moto = buildMoto(THREE, scene);
const character = buildCharacter(THREE, scene);
// no in-world airport exists, so the two air vehicles just live parked at a
// fixed open patch near a map corner (clear of buildings) -- walk up and
// press F to fly, same as any car/moto, once bought at the dealership
const AIRFIELD_X = CITY_HALF - 30, AIRFIELD_Z = -CITY_HALF + 30;
const plane = buildAirplane(THREE, scene);
const heli = buildHelicopterVehicle(THREE, scene);

// ============================================================
// Pedestrians
// ============================================================
spawnPedestrians(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, seed: CITY_SEED, count: 48 });
initPolice(scene, THREE, resolveCircleVsBuildings);
initProps(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, seed: CITY_SEED });
initSkidMarks(THREE, scene);
initMissions(scene, THREE);

// ============================================================
// Simulation state
// ============================================================
const carState = { x: 6, z: 14, yaw: Math.PI, speed: 0, y: 0, vy: 0, boosting: false };
const motoState = { x: -6, z: 14, yaw: Math.PI, speed: 0, y: 0, vy: 0, boosting: false };
const foot = { x: 0, z: 20, yaw: Math.PI, y: 0, vy: 0, speed: 0, grounded: true, phase: 0 };
const planeState = { x: AIRFIELD_X, z: AIRFIELD_Z, yaw: 0, speed: 0, y: 0, vy: 0, steer: 0 };
const heliState = { x: AIRFIELD_X - 12, z: AIRFIELD_Z, yaw: 0, speed: 0, y: 0, vy: 0, steer: 0 };
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
const aircraftCtx = { keys, steerThrottle };

// the single source of truth for "wherever the player currently is",
// whichever of the five state objects that means -- used everywhere
// something (camera, AI, traffic, HUD, sun) needs to follow the player
function currentPlayerState() {
  return mode === 'car' ? carState : mode === 'moto' ? motoState : mode === 'plane' ? planeState : mode === 'heli' ? heliState : foot;
}

initRacing(scene, THREE, {
  BLOCK, CITY_HALF, buildCar, updateVehicle, CAR_PARAMS,
  resolveCircleVsBuildings, hitLampPoles, gravity: GRAVITY, addCash,
  setDayTime: (t) => { dayTime = t; }, getDayTime: () => dayTime,
});

initTraffic(scene, THREE, { BLOCK, CITY_HALF, buildCar, updateVehicle, resolveCircleVsBuildings, hitLampPoles, gravity: GRAVITY });
spawnTraffic(26, 0, 0);

// raw local (right, forward) input for on-foot movement, independent of the
// vehicle-style steerThrottle() (which is a turn-rate + throttle pair, the
// right scheme for driving but not for walking) -- straight from the
// joystick or WASD, with no camera knowledge yet
function footMoveVector() {
  if (joy.active) return { right: clamp(joy.x, -1, 1), forward: clamp(-joy.y, -1, 1) };
  return { right: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), forward: (keys.up ? 1 : 0) - (keys.down ? 1 : 0) };
}

function updateFoot(dt) {
  const { right, forward } = footMoveVector();
  const mag = Math.min(1, Math.hypot(right, forward));
  if (mag > 0.04) {
    // rotate the local input into world space using the camera's current
    // yaw (character yaw + orbit offset), so "push forward" always means
    // "walk toward where the camera is looking" -- not "keep walking the
    // way I already happen to be facing", which is what the old tank-style
    // steer+throttle scheme (still used for vehicles, where it's correct)
    // gave on foot
    const camYaw = foot.yaw + getCameraYawOffset();
    // the camera's actual screen-right direction at yaw camYaw is
    // (-cos(camYaw), sin(camYaw)) in (x, z) -- NOT (cos, -sin), because
    // Three.js's lookAt derives the camera's local axes from (eye - target),
    // the reverse of the "forward" direction, which flips the cross product
    // that gives the right vector. Using the naive (cos, -sin) pairing (an
    // earlier version of this code did) made every left/right input move
    // the character in the mirror-opposite screen direction.
    const worldX = -Math.cos(camYaw) * right + Math.sin(camYaw) * forward;
    const worldZ = Math.sin(camYaw) * right + Math.cos(camYaw) * forward;
    const desiredYaw = Math.atan2(worldX, worldZ);
    const diff = ((desiredYaw - foot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const maxStep = FOOT_TURN_RATE * dt;
    const step = clamp(diff, -maxStep, maxStep);
    foot.yaw += step;
    // conserve (foot.yaw + cameraYawOffset) -- see nudgeCameraYawOffset's
    // own comment for why, without this, the target the character is
    // turning toward would slide away from it forever
    nudgeCameraYawOffset(-step);
  }
  const targetSpeed = (keys.shift ? FOOT_SPRINT : FOOT_RUN) * mag;
  foot.speed = damp(foot.speed, targetSpeed, 13, dt);
  foot.x += Math.sin(foot.yaw) * foot.speed * dt;
  foot.z += Math.cos(foot.yaw) * foot.speed * dt;
  resolveCircleVsBuildings(foot, 0.32);

  spaceSinceLastTap += dt;
  if (isFlying) {
    // cheat-code fly mode: no gravity, hold Space to climb / F to descend,
    // hover in place otherwise -- WASD/joystick still moves horizontally
    // exactly as on the ground, just airborne. Landing ends the flight.
    foot.vy = keys.space ? 6 : keys.f ? -6 : 0;
    foot.y += foot.vy * dt;
    if (foot.y <= 0) { foot.y = 0; foot.vy = 0; foot.grounded = true; isFlying = false; }
  } else {
    if (spaceEdge) {
      if (foot.grounded) {
        foot.vy = JUMP_V;
        foot.grounded = false;
        spaceSinceLastTap = 0;
      } else if (spaceSinceLastTap < 0.65 && isAdminUnlocked()) {
        // a second Space press while still airborne from the jump above
        // (not a second press while standing still) lifts into fly mode
        // instead of a second jump -- the classic "double-jump into
        // flight" cheat, gated to worlds with the fly ability unlocked
        isFlying = true;
        foot.vy = 4;
      }
    }
    foot.vy -= GRAVITY * dt;
    foot.y += foot.vy * dt;
    if (foot.y <= 0) { foot.y = 0; foot.vy = 0; foot.grounded = true; }
  }

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
  // forceWeapon 'fist' (the dedicated mobile punch button) always means
  // free bare hands; anything else (keyboard E, or the mobile weapon
  // button) attacks with whatever's equipped from the weapon shop
  const w = forceWeapon === 'fist' ? WEAPONS[0] : getActiveWeapon();
  const hit = punchNear(foot.x, foot.z, foot.yaw, w.range);
  if (hit) {
    playPunch();
    // an equipped weapon draws attention regardless of time of day and
    // escalates the search level faster than a bare-handed shove
    if (w.key !== 'fist') increaseWanted(foot.x, foot.z, w.wantedBonus);
    else if (nightFactor < 0.5) increaseWanted(foot.x, foot.z, w.wantedBonus); // "in broad daylight" per spec
    showMessage(w.key === 'fist' ? 'אגרוף!' : `${w.label}!`);
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
    const save = getSave();
    if (save.ownedAirTiers.includes('plane') && Math.hypot(foot.x - planeState.x, foot.z - planeState.z) <= ENTER_RANGE) {
      mode = 'plane';
      character.group.visible = false;
      showMessage('נכנסת למטוס — F ליציאה');
      return true;
    }
    if (save.ownedAirTiers.includes('heli') && Math.hypot(foot.x - heliState.x, foot.z - heliState.z) <= ENTER_RANGE) {
      mode = 'heli';
      character.group.visible = false;
      showMessage('נכנסת למסוק — F ליציאה');
      return true;
    }
    return false;
  } else if (mode === 'plane' || mode === 'heli') {
    const state = mode === 'plane' ? planeState : heliState;
    if (state.y > 0.6 || Math.abs(state.speed) > MAX_EXIT_SPEED) {
      showMessage('נחת והאט כדי לצאת מכלי הטיס');
      return true;
    }
    foot.x = state.x - Math.sin(state.yaw) * 3;
    foot.z = state.z - Math.cos(state.yaw) * 3;
    foot.yaw = state.yaw;
    state.speed = 0;
    state.vy = 0;
    mode = 'foot';
    character.group.visible = true;
    showMessage('ירדת מכלי הטיס');
    return true;
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
  const playerState = currentPlayerState();
  dirLight.position.set(playerState.x + Math.cos(sunAngle) * 60, Math.max(6, Math.sin(sunAngle) * 60 + 20), playerState.z + 30);
  dirLight.target.position.set(playerState.x, 0, playerState.z);
  dirLight.intensity = damp(dirLight.intensity, 1.6 - n * 1.3, 3, dt);
  hemiLight.intensity = damp(hemiLight.intensity, 0.9 - n * 0.55, 3, dt);

  const skyColor = DAY_SKY.clone().lerp(NIGHT_SKY, n);
  // per-race sky/fog theming (see racing.js's getActiveRaceTheme): blended
  // on top of the normal day/night color rather than replacing it, so a
  // themed race at night still looks like night, just tinted (see
  // lerpSRGBHex() above for why this isn't a plain THREE.Color.lerp()).
  const raceTheme = getActiveRaceTheme();
  if (raceTheme?.fogTint) {
    skyColor.set(lerpSRGBHex('#' + skyColor.getHexString(), raceTheme.fogTint, 0.72));
  }
  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor);
  scene.fog.density = 0.0016 * (raceTheme?.fogDensityMul ?? 1);

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
  // subtle body lean -- same validated sign convention as the motorcycle's
  // own lean just below (steer>0 -> rotation.z<0), scaled down for a
  // 4-wheeled body and amplified while drifting (handbrake held)
  const carLeanMax = carState.drifting ? 0.16 : 0.045;
  car.group.rotation.z = damp(car.group.rotation.z, -(carState.steer || 0) * Math.min(Math.abs(carState.speed) / 25, 1) * carLeanMax, 8, dt);
  const carSteerAngle = clamp((carState.steer || 0) * 0.32, -0.32, 0.32);
  for (const w of car.steerWheels) w.rotation.y = carSteerAngle;
  const wheelSpin = carState.speed * dt / 0.35;
  for (const w of [...car.wheels, ...car.steerWheels]) w.rotation.x += wheelSpin;
  car.tailMat.emissiveIntensity = (keys.down || carState.drifting) ? 3 : 0.6;

  moto.group.position.set(motoState.x, motoState.y, motoState.z);
  moto.group.rotation.y = motoState.yaw;
  // lean angle = -steer * min(speed/25, 1) * 0.45 rad
  moto.group.rotation.z = damp(moto.group.rotation.z, -(motoState.steer || 0) * Math.min(Math.abs(motoState.speed) / 25, 1) * 0.45, 8, dt);
  moto.group.rotation.x = damp(moto.group.rotation.x, motoState.boosting ? -0.14 : 0, 6, dt);
  const motoSpin = motoState.speed * dt / 0.34;
  for (const w of moto.wheels) w.rotation.x += motoSpin;

  plane.group.position.set(planeState.x, planeState.y, planeState.z);
  plane.group.rotation.y = planeState.yaw;
  plane.group.rotation.z = damp(plane.group.rotation.z, -(planeState.steer || 0) * 0.4, 6, dt);
  plane.group.rotation.x = damp(plane.group.rotation.x, clamp((planeState.vy || 0) / 25, -0.25, 0.25), 6, dt);
  const planeSpin = (mode === 'plane' ? 25 : 3) + Math.abs(planeState.speed);
  plane.prop.rotation.z += planeSpin * dt;
  for (const w of plane.wheels) w.rotation.x += planeState.speed * dt / 0.22;

  heli.group.position.set(heliState.x, heliState.y, heliState.z);
  heli.group.rotation.y = heliState.yaw;
  heli.group.rotation.x = damp(heli.group.rotation.x, clamp((heliState.speed || 0) / 40, -0.15, 0.15), 6, dt);
  const heliSpin = mode === 'heli' ? 32 : 4;
  heli.rotor.rotation.y += heliSpin * dt;
  heli.tailRotor.rotation.x += heliSpin * 1.2 * dt;

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
const MODE_LABEL = { car: 'רכב', moto: 'אופנוע', foot: 'הליכה', plane: 'מטוס', heli: 'מסוק' };
function updateHud(dt) {
  const state = mode === 'car' ? carState : mode === 'moto' ? motoState : null;
  hudSpeed.textContent = state ? Math.round(Math.abs(state.speed) * 3.6) : Math.round(Math.abs(foot.speed) * 3.6);
  hudMode.textContent = MODE_LABEL[mode];
  syncWeaponButtonIcon();
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
  hudCash.textContent = isAdminUnlocked() ? '₪∞' : '₪' + missionInfo.score;
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
  const ref = currentPlayerState();
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
  getPlayer: () => currentPlayerState(),
}, (path, dest) => {
  if (!path) { showMessage('לא נמצא מסלול ליעד'); return; }
  gpsPath = path;
  closeAllPanels();
  showMessage(gpsPath.length > 1 ? `מסלול חושב — ${gpsPath.length - 1} צמתים בדרך` : 'יעד ניווט הוגדר');
});
window.__testSetGpsRoute = (destX, destZ) => {
  const player = currentPlayerState();
  gpsPath = computeRoute(player.x, player.z, destX, destZ);
  return window.__debug();
};

initModShop(panelShop, { carParams: CAR_PARAMS, motoParams: MOTO_PARAMS, getScore, spendCash, badgeEl: shopBadge, getCarTierMultiplier: getActiveTierCostMultiplier });
initDealership(panelGarage, { THREE, carRig: car, carParams: CAR_PARAMS, spendCash });
document.querySelectorAll('#car-color-row .swatch').forEach((btn) => {
  btn.addEventListener('click', () => setCarColor(btn.dataset.color));
});
document.querySelectorAll('#car-neon-row .swatch').forEach((btn) => {
  btn.addEventListener('click', () => setCarNeon(btn.dataset.color));
});
document.querySelectorAll('#car-rims-row .swatch').forEach((btn) => {
  btn.addEventListener('click', () => setCarRims(btn.dataset.color));
});

initWeaponShop(panelWeapons, { spendCash });
document.getElementById('settings-weapons').addEventListener('click', () => { closeAllPanels(); renderWeaponShop(); panelWeapons.classList.remove('hidden'); });

// radio: cycles off -> station 1 -> station 2 -> station 3 -> off. Synth
// loops, not real music -- see audio.js's own comment on why.
const radioBtn = document.getElementById('settings-radio');
const stationNames = getStationNames();
let radioStationIdx = null; // null = off
function applyRadio(idx) {
  radioStationIdx = idx;
  setRadioStation(idx);
  radioBtn.textContent = idx === null ? '📻 רדיו: כבוי' : `📻 ${stationNames[idx]}`;
}
radioBtn.addEventListener('click', () => {
  const next = radioStationIdx === null ? 0 : (radioStationIdx + 1 < stationNames.length ? radioStationIdx + 1 : null);
  applyRadio(next);
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

document.getElementById('menu-garage').addEventListener('click', () => { closeAllPanels(); renderDealership(); renderAirDealership(); panelGarage.classList.remove('hidden'); });
document.getElementById('menu-map').addEventListener('click', () => { closeAllPanels(); renderMapGPS(); panelMap.classList.remove('hidden'); });
document.getElementById('menu-shop').addEventListener('click', () => { closeAllPanels(); refreshShopPanel(); panelShop.classList.remove('hidden'); });
document.getElementById('menu-race').addEventListener('click', () => { closeAllPanels(); renderRacePanel(); panelRace.classList.remove('hidden'); });
document.getElementById('menu-home').addEventListener('click', goHome);
document.getElementById('menu-settings').addEventListener('click', () => { closeAllPanels(); refreshAdminControls(); panelSettings.classList.remove('hidden'); });

// ============================================================
// Cheat codes / admin abilities
// ============================================================
const cheatInput = document.getElementById('cheat-input');
const cheatMsg = document.getElementById('cheat-msg');
const adminControls = document.getElementById('admin-controls');
const adminInvisibleBtn = document.getElementById('admin-invisible-toggle');

let invisibleEnabled = false;
// fly mode (admin-unlocked worlds only) isn't a settings toggle -- it's
// triggered by double-tapping Space on the ground (see updateFoot()),
// same as a classic "double-jump into flight" cheat
let isFlying = false;
let spaceSinceLastTap = 999; // seconds since the last Space press; big = "no recent press"

function refreshAdminControls() {
  adminControls.classList.toggle('hidden', !isAdminUnlocked());
}

// toggling material opacity directly on the character's own meshes -- a
// cosmetic effect layered on top of setPlayerInvisible()'s gameplay effect
// (police.js) rather than a substitute for it
function setCharacterInvisible(v) {
  character.group.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (m) { m.transparent = true; m.opacity = v ? 0.12 : 1; } }
  });
}

function submitCheatCode() {
  const result = applyCheatCode(cheatInput.value, { addCash, ownCarTier: grantCarTier });
  cheatMsg.textContent = result.message;
  cheatMsg.classList.toggle('error', !result.ok);
  if (result.ok) { cheatInput.value = ''; refreshAdminControls(); }
}
document.getElementById('cheat-submit').addEventListener('click', submitCheatCode);
cheatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCheatCode(); });

adminInvisibleBtn.addEventListener('click', () => {
  invisibleEnabled = !invisibleEnabled;
  adminInvisibleBtn.textContent = invisibleEnabled ? '👻 היעלמות: דלוקה' : '👻 היעלמות: כבויה';
  setPlayerInvisible(invisibleEnabled);
  setCharacterInvisible(invisibleEnabled);
});
refreshAdminControls();

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

raceUnstickBtn.addEventListener('click', () => { unstickPlayer(carState); });

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
    else if (mode === 'plane') updateAircraft(planeState, dt, AIRPLANE_PARAMS, aircraftCtx, true);
    else if (mode === 'heli') updateAircraft(heliState, dt, HELICOPTER_PARAMS, aircraftCtx, false);
    else updateFoot(dt);
    const pedInfo = updatePedestrians(dt, foot.x, foot.z);
    if (pedInfo.playerAttacked && mode === 'foot') {
      foot.x += pedInfo.attackX * 0.5;
      foot.z += pedInfo.attackZ * 0.5;
      foot.speed *= 0.4;
      showMessage('אזרח תוקף אותך בחזרה!');
    }
    updateProps(dt);
    updateSkidMarks(dt);
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

    updateCameraRig(dt, { mode, carState, motoState, planeState, heliState, foot, sprinting: keys.shift });
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
// same physical button doubles as the vehicle handbrake -- on foot it's a
// single tap (spaceEdge, above); in a car/moto, updateVehicle reads
// keys.space continuously as "handbrake held", so it also needs the
// press-and-hold tracking bindHold gives t-run for sprint/boost
bindHold(document.getElementById('t-jump'), (v) => keys.space = v);
// t-punch is always bare-handed (free, no wanted-level bump in daylight).
// t-weapon attacks with whatever's currently equipped from the weapon shop
// -- its icon/label is kept in sync with the active weapon in updateHud()
// below, instead of being hard-coded to a knife regardless of what's owned.
document.getElementById('t-punch').addEventListener('touchstart', (e) => { e.preventDefault(); punchEdge = true; pendingWeapon = 'fist'; }, { passive: false });
document.getElementById('t-punch').addEventListener('click', () => { punchEdge = true; pendingWeapon = 'fist'; });
const tWeaponBtn = document.getElementById('t-knife');
tWeaponBtn.addEventListener('touchstart', (e) => { e.preventDefault(); punchEdge = true; pendingWeapon = 'equipped'; }, { passive: false });
tWeaponBtn.addEventListener('click', () => { punchEdge = true; pendingWeapon = 'equipped'; });
let lastWeaponIconKey = null;
function syncWeaponButtonIcon() {
  const w = getActiveWeapon();
  if (w.key === lastWeaponIconKey) return;
  lastWeaponIconKey = w.key;
  tWeaponBtn.textContent = w.icon;
  tWeaponBtn.title = w.label;
}

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
  mode, foot: { x: foot.x, z: foot.z, y: foot.y, yaw: foot.yaw, speed: foot.speed },
  car: { x: carState.x, z: carState.z, yaw: carState.yaw, speed: carState.speed, y: carState.y, boosting: carState.boosting, drifting: carState.drifting, slipAngle: carState.slipAngle },
  moto: { x: motoState.x, z: motoState.z, yaw: motoState.yaw, speed: motoState.speed, y: motoState.y, boosting: motoState.boosting, drifting: motoState.drifting, slipAngle: motoState.slipAngle },
  plane: { x: planeState.x, z: planeState.z, yaw: planeState.yaw, speed: planeState.speed, y: planeState.y, vy: planeState.vy },
  heli: { x: heliState.x, z: heliState.z, yaw: heliState.yaw, speed: heliState.speed, y: heliState.y, vy: heliState.vy },
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
  // drives the joystick's (x, y) directly rather than keys.left/right --
  // since updateFoot() now walks camera-relative (see its own comment),
  // "steer left/right to face the target" no longer means what it used to;
  // the joystick path lets this compute the exact local input needed to
  // produce the target world angle for whatever the camera offset
  // currently is, rather than assuming any particular offset
  for (let i = 0; i < maxIters; i++) {
    const dx = targetX - foot.x, dz = targetZ - foot.z;
    if (Math.hypot(dx, dz) <= within) break;
    const desiredYaw = Math.atan2(dx, dz);
    const localAngle = desiredYaw - foot.yaw - getCameraYawOffset();
    joy.active = true; joy.x = Math.sin(localAngle); joy.y = -Math.cos(localAngle);
    for (let f = 0; f < 6; f++) stepSim(1 / 60);
  }
  joy.active = false; joy.x = 0; joy.y = 0;
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
window.__setCameraYawOffset = (yaw) => { __testSetYawOffset(yaw); return window.__debug(); };
window.__testRaceTheme = () => ({
  theme: getActiveRaceTheme(),
  bgHex: '#' + scene.background.getHexString(),
  fogHex: '#' + scene.fog.color.getHexString(),
  fogDensity: scene.fog.density,
  isRaceActive: isRaceActive(),
});
window.__testRaceTrack = () => {
  const route = getMinimapRoute();
  return { checkpointCount: route ? route.points.length : 0, currentCp: route ? route.currentCp : -1, car: { x: carState.x, z: carState.z } };
};
window.__testUnstick = () => { unstickPlayer(carState); return { x: carState.x, z: carState.z, speed: carState.speed }; };
window.__testSpendCash = (amount) => ({ ok: spendCash(amount), scoreAfter: getScore() });
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
