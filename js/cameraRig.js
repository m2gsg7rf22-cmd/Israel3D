import * as THREE from 'three';

const ZOOM_MIN = 1.8;
const ZOOM_MAX = 14.0;
const ZOOM_DEFAULT = 7.2;
const PITCH_MIN = 0.05;  // never lets the camera dip to/below eye-height, so it can't clip under the ground plane
const PITCH_MAX = 1.35;  // near-overhead, true-orbit-style freedom without reaching gimbal-lock at pi/2
const ORBIT_YAW_SENS = 0.0065;   // rad per pixel of single-finger drag
const ORBIT_PITCH_SENS = 0.0045;
const ZOOM_LERP_RATE = 6;        // per-second damp rate, smooths pinch jerk

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

let camera_;
const camPos = new THREE.Vector3(0, 8, -14);
const camTarget = new THREE.Vector3();
let camFov = 62;

let camZoom = ZOOM_DEFAULT;
let camZoomTarget = ZOOM_DEFAULT;
let camYawOffset = 0;
let camPitchOffset = 0.12;

// pointer-tracked gesture state: one finger orbits, two fingers pinch-zoom.
// Keyed by pointerId so a touch that started on the joystick or an action
// button (a different DOM element entirely) never reaches this handler --
// no extra bookkeeping needed to keep movement and camera input independent.
const activeTouches = new Map();
let dragLast = null;
let pinchStartDist = null;
let pinchStartZoom = null;

function pointsFrom(map) { return Array.from(map.values()); }

export function initCameraRig(camera, surfaceEl) {
  camera_ = camera;

  const onDown = (e) => {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 1) {
      dragLast = { x: e.clientX, y: e.clientY };
    } else if (activeTouches.size === 2) {
      dragLast = null;
      const [a, b] = pointsFrom(activeTouches);
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      pinchStartZoom = camZoomTarget;
    }
  };
  const onMove = (e) => {
    if (!activeTouches.has(e.pointerId)) return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 1 && dragLast) {
      const dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
      camYawOffset -= dx * ORBIT_YAW_SENS;
      camPitchOffset = clamp(camPitchOffset + dy * ORBIT_PITCH_SENS, PITCH_MIN, PITCH_MAX);
      dragLast = { x: e.clientX, y: e.clientY };
    } else if (activeTouches.size === 2 && pinchStartDist) {
      const [a, b] = pointsFrom(activeTouches);
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const spread = dist / pinchStartDist; // >1 = fingers moved apart
      camZoomTarget = clamp(pinchStartZoom / spread, ZOOM_MIN, ZOOM_MAX);
    }
  };
  const onUp = (e) => {
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) pinchStartDist = null;
    if (activeTouches.size === 1) {
      dragLast = { ...pointsFrom(activeTouches)[0] };
    } else if (activeTouches.size === 0) {
      dragLast = null;
    }
  };

  surfaceEl.addEventListener('pointerdown', onDown);
  surfaceEl.addEventListener('pointermove', onMove);
  surfaceEl.addEventListener('pointerup', onUp);
  surfaceEl.addEventListener('pointercancel', onUp);
  surfaceEl.style.touchAction = 'none';
}

// ctx: { mode, carState, motoState, foot, sprinting }
export function updateCameraRig(dt, ctx) {
  camZoom = damp(camZoom, camZoomTarget, ZOOM_LERP_RATE, dt);

  let targetX, targetZ, targetYaw, targetY, eyeHeight, lookAheadDist, speedKick, fov;
  if (ctx.mode === 'car' || ctx.mode === 'moto') {
    const state = ctx.mode === 'car' ? ctx.carState : ctx.motoState;
    targetX = state.x; targetZ = state.z; targetYaw = state.yaw; targetY = state.y || 0;
    eyeHeight = ctx.mode === 'car' ? 1.3 : 1.25;
    lookAheadDist = 6;
    speedKick = Math.abs(state.speed) * (ctx.mode === 'car' ? 0.03 : 0.035);
    fov = (ctx.mode === 'car' ? 60 : 64) + Math.abs(state.speed) * 0.25;
  } else {
    const foot = ctx.foot;
    targetX = foot.x; targetZ = foot.z; targetYaw = foot.yaw; targetY = foot.y || 0;
    eyeHeight = 1.45;
    lookAheadDist = 0;
    speedKick = ctx.sprinting ? 0.4 : 0;
    fov = ctx.sprinting ? 63 : 58;
  }

  const dist = clamp(camZoom + speedKick, ZOOM_MIN, ZOOM_MAX);
  const angle = targetYaw + camYawOffset;
  const horiz = dist * Math.cos(camPitchOffset);
  const vert = dist * Math.sin(camPitchOffset);

  const desiredPos = new THREE.Vector3(
    targetX - Math.sin(angle) * horiz,
    targetY + eyeHeight + vert,
    targetZ - Math.cos(angle) * horiz
  );
  const lookAt = new THREE.Vector3(
    targetX + Math.sin(targetYaw) * lookAheadDist,
    targetY + eyeHeight * 0.85,
    targetZ + Math.cos(targetYaw) * lookAheadDist
  );

  camPos.x = damp(camPos.x, desiredPos.x, 7, dt);
  camPos.y = damp(camPos.y, desiredPos.y, 7, dt);
  camPos.z = damp(camPos.z, desiredPos.z, 7, dt);
  camTarget.x = damp(camTarget.x, lookAt.x, 10, dt);
  camTarget.y = damp(camTarget.y, lookAt.y, 10, dt);
  camTarget.z = damp(camTarget.z, lookAt.z, 10, dt);
  camFov = damp(camFov, fov, 4, dt);

  camera_.position.copy(camPos);
  camera_.lookAt(camTarget);
  camera_.fov = camFov;
  camera_.updateProjectionMatrix();
}

export function __testSetZoom(z) {
  camZoomTarget = clamp(z, ZOOM_MIN, ZOOM_MAX);
  camZoom = camZoomTarget;
}

export function getCameraZoomDebug() {
  return { zoom: camZoom, zoomTarget: camZoomTarget, yawOffset: camYawOffset, pitchOffset: camPitchOffset, activeTouches: activeTouches.size };
}
