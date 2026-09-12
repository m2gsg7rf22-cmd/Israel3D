import * as THREE from 'three';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';
import { spawnPedestrians, updatePedestrians, punchNear, vehicleHitPedestrians, getPedestrians } from './pedestrians.js';

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

const CAR_PARAMS = { accel: 20, maxV: 32, brake: -32, steerBase: 0.5, steerSpeed: 0.6, turnDenom: 7, drag: 0.11, radius: 2.3 };
const MOTO_PARAMS = { accel: 26, maxV: 24, brake: -30, steerBase: 0.62, steerSpeed: 0.75, turnDenom: 5, drag: 0.14, radius: 1.1 };
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
// Ground / street texture
// ============================================================
function buildCityTexture() {
  const px = 2048;
  const scale = px / CITY_SIZE;
  const cnv = document.createElement('canvas');
  cnv.width = px; cnv.height = px;
  const g = cnv.getContext('2d');
  g.fillStyle = '#3a3d42';
  g.fillRect(0, 0, px, px);

  // asphalt grain
  const grainRng = mulberry32(CITY_SEED + 42);
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 6000; i++) {
    const gx = grainRng() * px, gz = grainRng() * px, gs = 1 + grainRng() * 2;
    g.fillRect(gx, gz, gs, gs);
  }

  const rng = mulberry32(CITY_SEED + 999);
  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const cx = (bx - GRID / 2 + 0.5) * BLOCK;
      const cz = (bz - GRID / 2 + 0.5) * BLOCK;
      const district = districtOf(bx, bz);
      const sx = (cx + CITY_HALF - LOT / 2) * scale;
      const sz = (cz + CITY_HALF - LOT / 2) * scale;
      const sw = LOT * scale;
      // curb: a thin concrete-grey border just outside the lot, under the building line
      g.fillStyle = '#9a9a92';
      g.fillRect(sx - 2, sz - 2, sw + 4, sw + 4);
      g.fillStyle = district.lotColor;
      g.fillRect(sx, sz, sw, sw);
    }
  }

  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = Math.max(2, 0.14 * scale);
  g.setLineDash([1.8 * scale, 1.8 * scale]);
  for (let bx = 0; bx <= GRID; bx++) {
    const x = (bx * BLOCK) * scale;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, px); g.stroke();
  }
  for (let bz = 0; bz <= GRID; bz++) {
    const z = (bz * BLOCK) * scale;
    g.beginPath(); g.moveTo(0, z); g.lineTo(px, z); g.stroke();
  }
  g.setLineDash([]);

  // crosswalks: zebra stripes on the four approaches to a subset of intersections
  g.fillStyle = 'rgba(255,255,255,0.55)';
  const crossW = (STREET_W - 2) * scale;
  const stripeLen = 0.6 * scale, stripeGap = 0.5 * scale, stripeThick = 0.35 * scale;
  const setback = STREET_W / 2 * scale + 1 * scale;
  for (let bx = 1; bx < GRID; bx += 2) {
    for (let bz = 1; bz < GRID; bz += 2) {
      const ix = bx * BLOCK * scale, iz = bz * BLOCK * scale;
      // vertical-street approaches (crossing drawn horizontally) at north/south of intersection
      for (const dz of [-setback, setback]) {
        for (let s = -crossW / 2; s < crossW / 2; s += stripeLen + stripeGap) {
          g.fillRect(ix + s, iz + dz - stripeThick / 2, stripeLen, stripeThick);
        }
      }
      // horizontal-street approaches (crossing drawn vertically) at east/west of intersection
      for (const dx of [-setback, setback]) {
        for (let s = -crossW / 2; s < crossW / 2; s += stripeLen + stripeGap) {
          g.fillRect(ix + dx - stripeThick / 2, iz + s, stripeThick, stripeLen);
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const DISTRICTS = {
  downtown: { name: 'Downtown Core', lotColor: '#8a8f96', bodyColor: '#4b6785', shop: 0.25, floors: [8, 18], hillside: false },
  harbor: { name: 'Harbor Row', lotColor: '#7d9098', bodyColor: '#3f7d82', shop: 0.55, floors: [2, 5], hillside: false },
  oldquarter: { name: 'Old Quarter', lotColor: '#9c8a72', bodyColor: '#8a5a44', shop: 0.6, floors: [3, 6], hillside: false },
  hillside: { name: 'Hillside Heights', lotColor: '#4f8f52', bodyColor: '#c9b896', shop: 0.05, floors: [1, 2], hillside: true },
};
function districtOf(bx, bz) {
  const half = GRID / 2;
  if (bx < half && bz < half) return DISTRICTS.downtown;
  if (bx >= half && bz < half) return DISTRICTS.harbor;
  if (bx < half && bz >= half) return DISTRICTS.oldquarter;
  return DISTRICTS.hillside;
}

const groundGeo = new THREE.PlaneGeometry(CITY_SIZE, CITY_SIZE);
groundGeo.rotateX(-Math.PI / 2);
const groundMat = new THREE.MeshStandardMaterial({ map: buildCityTexture(), roughness: 0.95, metalness: 0.02 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

// ============================================================
// Buildings
// ============================================================
function buildWindowTexture(color, night) {
  const cnv = document.createElement('canvas');
  cnv.width = 64; cnv.height = 96;
  const g = cnv.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 96);
  g.fillStyle = night;
  for (let y = 6; y < 96; y += 14) {
    for (let x = 4; x < 64; x += 12) {
      g.fillRect(x, y, 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const buildingMaterials = {};
function materialFor(district, floors) {
  const key = district.name;
  if (!buildingMaterials[key]) {
    const tex = buildWindowTexture(district.bodyColor, '#ffdb8a');
    tex.repeat.set(2, Math.max(1, floors));
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1, emissive: '#ffb35c', emissiveMap: tex, emissiveIntensity: 0 });
    buildingMaterials[key] = mat;
  }
  return buildingMaterials[key];
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const buildingAABBs = []; // { minX, maxX, minZ, maxZ }
const shopSigns = [];
const landmarks = [];
const SHOP_NAMES = ['Blue Fig Cafe', 'Meridian Books', 'Harbor Market', 'The Rivet', 'Old Quarter Deli', 'Salt & Pine', 'Quay Flowers', 'Northline Music', "Cassie's Diner", 'Bay Cycles'];

function addBuilding(bx, bz, overrides) {
  const district = districtOf(bx, bz);
  const cx = (bx - GRID / 2 + 0.5) * BLOCK;
  const cz = (bz - GRID / 2 + 0.5) * BLOCK;
  const rng = mulberry32(CITY_SEED + bx * 1000 + bz * 7 + 3);

  if (!overrides && rng() < 0.08) return; // open plaza / park

  const floors = overrides?.floors ?? Math.round(district.floors[0] + rng() * (district.floors[1] - district.floors[0]));
  const floorH = district.hillside ? 2.9 : 3.25;
  const height = floors * floorH;
  const w = LOT * (0.6 + rng() * 0.32);
  const d = LOT * (0.6 + rng() * 0.32);

  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const body = new THREE.Mesh(unitBox, materialFor(district, floors));
  body.scale.set(w, height, d);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (district.hillside) {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, floorH * 1.1, 4), new THREE.MeshStandardMaterial({ color: '#7a4a3a', roughness: 0.9 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = height + floorH * 0.45;
    roof.castShadow = true;
    group.add(roof);
  }

  const isShop = overrides?.shop ?? (rng() < district.shop);
  if (isShop) {
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.35, 1.4), new THREE.MeshStandardMaterial({ color: '#c94f4f', roughness: 0.7 }));
    awning.position.set(0, floorH * 0.78, d / 2 + 0.6);
    awning.castShadow = true;
    group.add(awning);

    const name = SHOP_NAMES[Math.floor(rng() * SHOP_NAMES.length)];
    const signCnv = document.createElement('canvas');
    signCnv.width = 256; signCnv.height = 64;
    const sg = signCnv.getContext('2d');
    sg.fillStyle = '#12141a'; sg.fillRect(0, 0, 256, 64);
    sg.fillStyle = '#ffce94'; sg.font = 'bold 28px Arial'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.fillText(name, 128, 34);
    const signTex = new THREE.CanvasTexture(signCnv);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffce94', emissiveMap: signTex, emissiveIntensity: 0 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, 0.9), signMat);
    sign.position.set(0, floorH * 0.55, d / 2 + 0.05);
    group.add(sign);
    shopSigns.push(signMat);

    const lamp = new THREE.PointLight('#ffce94', 0, 8);
    lamp.position.set(0, 2.2, d / 2 + 1.2);
    group.add(lamp);
    nightLights.push(lamp);
  }

  scene.add(group);
  buildingAABBs.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, bx, bz });
}

const nightLights = [];

for (let bx = 0; bx < GRID; bx++) {
  for (let bz = 0; bz < GRID; bz++) {
    addBuilding(bx, bz);
  }
}

// two landmarks so navigation has recognizable anchors
addBuilding(2, 2, { floors: 26, shop: false });
{
  const tower = buildingAABBs[buildingAABBs.length - 1];
  const beacon = new THREE.PointLight('#ff5050', 0, 20);
  beacon.position.set((tower.minX + tower.maxX) / 2, 26 * 3.25 + 1.5, (tower.minZ + tower.maxZ) / 2);
  scene.add(beacon);
  nightLights.push(beacon);
}
addBuilding(9, 2, { floors: 4, shop: true });

// street lamps at a subset of intersections
const lampGeo = new THREE.CylinderGeometry(0.08, 0.08, 8, 6);
const lampMat = new THREE.MeshStandardMaterial({ color: '#333' });
const bulbGeo = new THREE.SphereGeometry(0.18, 8, 8);
for (let bx = 1; bx < GRID; bx += 2) {
  for (let bz = 1; bz < GRID; bz += 2) {
    const x = bx * BLOCK - CITY_HALF;
    const z = bz * BLOCK - CITY_HALF;
    const pole = new THREE.Mesh(lampGeo, lampMat);
    pole.position.set(x, 4, z);
    pole.castShadow = true;
    scene.add(pole);
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff0d6', emissive: '#fff0d6', emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 8, z);
    scene.add(bulb);
    const light = new THREE.PointLight('#fff0d6', 0, 22, 2);
    light.position.set(x, 7.6, z);
    scene.add(light);
    nightLights.push(light);
    shopSigns.push(bulbMat);
  }
}

// ============================================================
// Procedural street trees
// ============================================================
{
  const treeRng = mulberry32(CITY_SEED + 7777);
  const candidates = [];
  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      if (treeRng() < 0.55) candidates.push({ bx, bz });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.18, 2.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4130', roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, candidates.length);
  trunks.castShadow = true;
  scene.add(trunks);

  const foliageGeo = new THREE.SphereGeometry(1, 7, 6);
  const foliageMat = new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.9 });
  const foliageLayers = 3;
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, candidates.length * foliageLayers);
  foliage.castShadow = true;
  scene.add(foliage);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const posV = new THREE.Vector3();
  const scaleV = new THREE.Vector3();
  const r = LOT / 2 + 3.0;
  let foliageIdx = 0;
  candidates.forEach((b, i) => {
    const c = { x: (b.bx - GRID / 2 + 0.5) * BLOCK, z: (b.bz - GRID / 2 + 0.5) * BLOCK };
    const corner = Math.floor(treeRng() * 4);
    const cx = c.x + (corner % 2 === 0 ? -r : r);
    const cz = c.z + (corner < 2 ? -r : r);
    const treeH = 3.6 + treeRng() * 1.8;
    const trunkScale = treeH / 2.2;

    posV.set(cx, treeH * 0.24, cz);
    scaleV.set(1, trunkScale, 1);
    m.compose(posV, q, scaleV);
    trunks.setMatrixAt(i, m);

    for (let l = 0; l < foliageLayers; l++) {
      const fy = treeH * 0.5 + l * (treeH * 0.22);
      const fr = (1.1 - l * 0.18) * (0.85 + treeRng() * 0.3);
      posV.set(cx + (treeRng() - 0.5) * 0.3, fy, cz + (treeRng() - 0.5) * 0.3);
      scaleV.set(fr, fr * 0.85, fr);
      m.compose(posV, q, scaleV);
      foliage.setMatrixAt(foliageIdx++, m);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
}

// ============================================================
// Vehicles
// ============================================================
function buildCar() {
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

function buildMoto() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#b6404a', roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 2.0), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.8), new THREE.MeshStandardMaterial({ color: '#181818' }));
  seat.position.set(0, 1.02, -0.35);
  group.add(seat);
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

const car = buildCar();
const moto = buildMoto();

// ============================================================
// Character
// ============================================================
function buildCharacter() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#e0b28e', roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: '#2f5fa8', roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: '#33384a', roughness: 0.85 });

  const hips = new THREE.Group();
  hips.position.y = 0.9;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), shirt);
  torso.position.y = 0.34;
  torso.castShadow = true;
  hips.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skin);
  head.position.y = 0.72;
  head.castShadow = true;
  hips.add(head);

  function makeLimb(mat, len, x, side) {
    const pivot = new THREE.Group();
    pivot.position.set(x, side === 'leg' ? 0 : 0.58, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, len, 0.14), mat);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    hips.add(pivot);
    return pivot;
  }
  const legL = makeLimb(pants, 0.85, -0.11, 'leg');
  const legR = makeLimb(pants, 0.85, 0.11, 'leg');
  const armL = makeLimb(shirt, 0.6, -0.28, 'arm');
  const armR = makeLimb(shirt, 0.6, 0.28, 'arm');

  scene.add(group);
  return { group, legL, legR, armL, armR };
}
const character = buildCharacter();

// ============================================================
// Pedestrians
// ============================================================
spawnPedestrians(scene, THREE, { grid: GRID, block: BLOCK, lot: LOT, cityHalf: CITY_HALF, seed: CITY_SEED, count: 32 });

// ============================================================
// Simulation state
// ============================================================
const carState = { x: 6, z: 14, yaw: Math.PI, speed: 0 };
const motoState = { x: -6, z: 14, yaw: Math.PI, speed: 0 };
const foot = { x: 0, z: 20, yaw: Math.PI, y: 0, vy: 0, speed: 0, grounded: true, phase: 0 };

let mode = 'foot';
let dayTime = 0.4;
let running = false;
let paused = false;
let msgTimer = 0;
let lastTime = null;

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

// ============================================================
// Vehicle physics
// ============================================================
function updateVehicle(state, dt, params) {
  const { steer, throttle } = steerThrottle();
  let accel = 0;
  if (throttle > 0) accel = params.accel * (1 - Math.max(state.speed, 0) / params.maxV) * throttle;
  else if (throttle < 0) accel = (state.speed > 1 ? params.brake : -10 * (1 + state.speed / 14)) * -throttle;
  state.speed += accel * dt;
  state.speed -= params.drag * state.speed * dt;
  if (throttle === 0) state.speed *= (1 - 0.18 * dt);
  state.speed = clamp(state.speed, -params.maxV * 0.4, params.maxV);

  const speedFrac = Math.min(Math.abs(state.speed) / params.turnDenom, 1);
  state.yaw += steer * (params.steerBase + Math.min(Math.abs(state.speed) / 30, 1) * params.steerSpeed) * speedFrac * Math.sign(state.speed || 1) * dt;
  state.x += Math.sin(state.yaw) * state.speed * dt;
  state.z += Math.cos(state.yaw) * state.speed * dt;
  state.steer = steer;

  if (vehicleHitPedestrians(state.x, state.z, state.speed)) state.speed *= 0.92;
  resolveCircleVsBuildings(state, params.radius);
}

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

  const speedFactor = clamp(Math.abs(foot.speed) / FOOT_RUN, 0, 1.35);
  foot.phase += dt * (2.2 + Math.abs(foot.speed) * 1.15);
  const swing = Math.sin(foot.phase) * 0.55 * speedFactor;
  character.legL.rotation.x = swing;
  character.legR.rotation.x = -swing;
  character.armL.rotation.x = -swing * 0.8;
  character.armR.rotation.x = swing * 0.8;
}

function showMessage(text) {
  hudMsg.textContent = text;
  hudMsg.classList.add('visible');
  msgTimer = 1.6;
}

function tryPunch() {
  if (mode !== 'foot') return;
  const hit = punchNear(foot.x, foot.z, foot.yaw);
  if (hit) showMessage('אגרוף!');
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
      character.group.visible = false;
      showMessage('עלית לאופנוע — F ליציאה');
    }
  } else {
    const state = mode === 'car' ? carState : motoState;
    if (Math.abs(state.speed) <= MAX_EXIT_SPEED) {
      foot.x = state.x - Math.sin(state.yaw) * 3;
      foot.z = state.z - Math.cos(state.yaw) * 3;
      foot.yaw = state.yaw;
      state.speed = 0;
      mode = 'foot';
      character.group.visible = true;
      showMessage('ירדת מהרכב');
    } else {
      showMessage('האט כדי לצאת');
    }
  }
}

// ============================================================
// Camera
// ============================================================
const camPos = new THREE.Vector3(0, 8, -14);
const camTarget = new THREE.Vector3();
let camFov = 62;

function updateCamera(dt) {
  let desiredPos, lookAt, fov;
  if (mode === 'car' || mode === 'moto') {
    const state = mode === 'car' ? carState : motoState;
    const dist = mode === 'car' ? 7.2 + Math.abs(state.speed) * 0.05 : 6.4 + Math.abs(state.speed) * 0.06;
    const height = mode === 'car' ? 2.8 + Math.abs(state.speed) * 0.02 : 2.6 + Math.abs(state.speed) * 0.02;
    desiredPos = new THREE.Vector3(state.x - Math.sin(state.yaw) * dist, height, state.z - Math.cos(state.yaw) * dist);
    lookAt = new THREE.Vector3(state.x + Math.sin(state.yaw) * 6, 1.2, state.z + Math.cos(state.yaw) * 6);
    fov = (mode === 'car' ? 60 : 64) + Math.abs(state.speed) * 0.25;
  } else {
    const dist = keys.shift ? 4.8 : 4.4;
    desiredPos = new THREE.Vector3(foot.x - Math.sin(foot.yaw) * dist, 2.9 + foot.y, foot.z - Math.cos(foot.yaw) * dist);
    lookAt = new THREE.Vector3(foot.x, 1.3 + foot.y, foot.z);
    fov = keys.shift ? 63 : 58;
  }
  camPos.x = damp(camPos.x, desiredPos.x, 7, dt);
  camPos.y = damp(camPos.y, desiredPos.y, 7, dt);
  camPos.z = damp(camPos.z, desiredPos.z, 7, dt);
  camTarget.x = damp(camTarget.x, lookAt.x, 10, dt);
  camTarget.y = damp(camTarget.y, lookAt.y, 10, dt);
  camTarget.z = damp(camTarget.z, lookAt.z, 10, dt);
  camFov = damp(camFov, fov, 4, dt);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  camera.fov = camFov;
  camera.updateProjectionMatrix();
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
  for (const key in buildingMaterials) buildingMaterials[key].emissiveIntensity = n * 0.9;

  hudClock.textContent = n > 0.5 ? '🌙 לילה' : '☀️ יום';
}

for (const l of nightLights) l.__base = l.distance === 20 ? 2.2 : l.distance === 8 ? 10 : 1.4;

// ============================================================
// Mesh sync
// ============================================================
function syncMeshes(dt) {
  car.group.position.set(carState.x, 0, carState.z);
  car.group.rotation.y = carState.yaw;
  const carSteerAngle = clamp((carState.steer || 0) * 0.32, -0.32, 0.32);
  for (const w of car.steerWheels) w.rotation.y = carSteerAngle;
  const wheelSpin = carState.speed * dt / 0.35;
  for (const w of [...car.wheels, ...car.steerWheels]) w.rotation.x += wheelSpin;
  car.tailMat.emissiveIntensity = keys.down ? 3 : 0.6;

  moto.group.position.set(motoState.x, 0, motoState.z);
  moto.group.rotation.y = motoState.yaw;
  moto.group.rotation.z = damp(moto.group.rotation.z, -(motoState.steer || 0) * Math.min(Math.abs(motoState.speed) / 20, 1) * 0.45, 8, dt);
  const motoSpin = motoState.speed * dt / 0.34;
  for (const w of moto.wheels) w.rotation.x += motoSpin;

  character.group.position.set(foot.x, foot.y, foot.z);
  character.group.rotation.y = foot.yaw;
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
    if (mode === 'car') updateVehicle(carState, dt, CAR_PARAMS);
    else if (mode === 'moto') updateVehicle(motoState, dt, MOTO_PARAMS);
    else updateFoot(dt);
    updatePedestrians(dt);
    updateCamera(dt);
    updateDayNight(dt);
    syncMeshes(dt);
    updateHud(dt);
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

  stepSim(dt);

  composer.render();
  window.__frameCount = (window.__frameCount || 0) + 1;
  requestAnimationFrame(loop);
}

// ============================================================
// State transitions
// ============================================================
function startGame() {
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
  car: { x: carState.x, z: carState.z, yaw: carState.yaw, speed: carState.speed },
  moto: { x: motoState.x, z: motoState.z, yaw: motoState.yaw, speed: motoState.speed },
  distCar: Math.hypot(foot.x - carState.x, foot.z - carState.z),
  distMoto: Math.hypot(foot.x - motoState.x, foot.z - motoState.z),
  pedCount: getPedestrians().length,
  peds: getPedestrians().map(p => ({ x: p.x, z: p.z, state: p.state })),
});
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
  state.x = x; state.z = z; state.yaw = yaw; state.speed = speed;
  composer.render();
  return window.__debug();
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
  keys.left = keys.right = false;
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
  keys.left = keys.right = false;
  composer.render();
  return window.__debug();
};
window.__setDayTime = (t) => { dayTime = t; for (let f = 0; f < 3; f++) stepSim(1 / 60); composer.render(); return window.__debug(); };
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
