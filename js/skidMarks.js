// Tire skid marks: a fixed-size pool of flat ground quads (object pooling --
// nothing is ever created/destroyed after init, just recycled) laid down
// behind a drifting or hard-braking vehicle's rear wheels and faded out
// over a few seconds. All marks share one geometry; only the material
// (for independent per-mark fade) is per-instance.
const MAX_MARKS = 140;
const FADE_TIME = 4.5;

let marks = [];
let poolIdx = 0;

export function initSkidMarks(THREE, scene) {
  const geo = new THREE.PlaneGeometry(0.22, 0.55);
  geo.rotateX(-Math.PI / 2);
  marks = [];
  for (let i = 0; i < MAX_MARKS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: '#151515', transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    marks.push({ mesh, mat, life: 0 });
  }
}

export function spawnSkidMark(x, z, yaw, strength = 1) {
  if (!marks.length) return;
  const m = marks[poolIdx];
  poolIdx = (poolIdx + 1) % MAX_MARKS;
  m.mesh.position.set(x, 0.02, z);
  m.mesh.rotation.y = yaw;
  m.mesh.visible = true;
  m.life = FADE_TIME;
  m.mat.opacity = Math.min(0.55, 0.3 + strength * 0.25);
}

export function updateSkidMarks(dt) {
  for (const m of marks) {
    if (m.life <= 0) continue;
    m.life -= dt;
    if (m.life <= 0) { m.mesh.visible = false; continue; }
    m.mat.opacity = Math.min(m.mat.opacity, (m.life / FADE_TIME) * 0.55);
  }
}
