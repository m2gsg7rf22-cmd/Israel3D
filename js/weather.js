// Weather: cycles clear <-> rain on a randomized timer. Rain is a small
// pool of falling streak meshes recycled around the player (same "rain
// volume" trick most games use -- wrap particles back to the top of a box
// centered on the player instead of spawning/destroying them), plus a real
// (small, safe) grip reduction fed into vehicle physics via getGripMul(),
// and a fog/light darkening blended into game.js's own day/night pass.
const RAIN_COUNT = 220;
const VOLUME = 40; // half-extent of the rain box around the player, meters
const HEIGHT = 26;
const FALL_SPEED = 22;

let raining = false;
let timer = 8 + Math.random() * 10; // seconds until the next state flip
let streaks = null;
let mesh = null;
let THREE_ = null;

export function initWeather(THREE, scene) {
  THREE_ = THREE;
  const geo = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 3);
  const mat = new THREE.MeshBasicMaterial({ color: '#bcd6e8', transparent: true, opacity: 0.35 });
  mesh = new THREE.InstancedMesh(geo, mat, RAIN_COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  streaks = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < RAIN_COUNT; i++) {
    const p = { x: (Math.random() - 0.5) * VOLUME * 2, y: Math.random() * HEIGHT, z: (Math.random() - 0.5) * VOLUME * 2 };
    streaks.push(p);
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
  }
}

export function isRaining() { return raining; }
export function __testSetRaining(v) { raining = v; if (mesh) mesh.visible = v; }
export function getGripMul() { return raining ? 0.82 : 1; } // wet roads: real, modest grip reduction
export function getFogMul() { return raining ? 2.4 : 1; }
export function getLightMul() { return raining ? 0.72 : 1; }

export function updateWeather(dt, playerX, playerZ) {
  timer -= dt;
  if (timer <= 0) {
    raining = !raining;
    timer = raining ? 30 + Math.random() * 60 : 60 + Math.random() * 120;
    if (mesh) mesh.visible = raining;
  }
  if (!raining || !mesh) return;
  const m = new THREE_.Matrix4();
  for (let i = 0; i < streaks.length; i++) {
    const p = streaks[i];
    p.y -= FALL_SPEED * dt;
    if (p.y < 0) {
      p.y = HEIGHT;
      p.x = playerX + (Math.random() - 0.5) * VOLUME * 2;
      p.z = playerZ + (Math.random() - 0.5) * VOLUME * 2;
    }
    // keep the rain volume centered on the player horizontally without
    // resetting height, so it always falls nearby regardless of travel
    if (Math.abs(p.x - playerX) > VOLUME) p.x = playerX + (Math.random() - 0.5) * VOLUME * 2;
    if (Math.abs(p.z - playerZ) > VOLUME) p.z = playerZ + (Math.random() - 0.5) * VOLUME * 2;
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
