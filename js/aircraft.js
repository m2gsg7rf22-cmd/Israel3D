// Airplanes and helicopters: simplified arcade flight physics, not real
// aerodynamics -- reuses the same joystick/keyboard steer+throttle reader
// cars already use (steer = roll/yaw, throttle = engine power) so the
// controls feel familiar. Climb/descend is Space/Shift, NOT Space/F like
// the on-foot fly cheat: F is already the universal "exit vehicle" key,
// and holding it to descend while landing a plane would also fire that
// key's edge-triggered exit every time, ejecting the player mid-flight.
// Models are built from primitives (boxes/cylinders/cones), the same
// low-poly-procedural approach already used for police cars, pedestrians
// and traffic -- there's no glTF sample asset for a plane or helicopter
// the way there was for the 5 dealership cars.
export const AIRPLANE_PARAMS = {
  accel: 13, maxV: 46, brake: -16, drag: 0.045, turnDenom: 12,
  steerBase: 0.3, steerSpeed: 0.45,
  stallSpeed: 15, climbRate: 9, sinkRate: 12,
};
export const HELICOPTER_PARAMS = {
  accel: 9, maxV: 26, brake: -14, drag: 0.1, turnDenom: 6,
  steerBase: 0.85, steerSpeed: 0.35,
  climbRate: 7,
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

export function buildAirplane(THREE, scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#e8e8ec', roughness: 0.35, metalness: 0.4 });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 5.5, 10), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 10), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 3.25;
  group.add(nose);
  const wingMat = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.4 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.15, 1.4), wingMat);
  wing.position.set(0, -0.1, 0.2);
  group.add(wing);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.8), wingMat);
  tailWing.position.set(0, 0.1, -2.5);
  group.add(tailWing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1.0), wingMat);
  fin.position.set(0, 0.6, -2.5);
  group.add(fin);
  const propMat = new THREE.MeshStandardMaterial({ color: '#222' });
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 0.14), propMat);
  prop.position.z = 3.8;
  group.add(prop);
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#111' });
  const wheels = [[-1.1, -0.7, 0.2], [1.1, -0.7, 0.2], [0, -0.6, 2.6]].map(([x, y, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, y, z);
    group.add(w);
    return w;
  });
  scene.add(group);
  return { group, prop, wheels, kind: 'airplane' };
}

export function buildHelicopterVehicle(THREE, scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#2e6b8f', roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), bodyMat);
  body.scale.set(1, 0.85, 1.6);
  group.add(body);
  const tailBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 3.0, 8), bodyMat);
  tailBoom.rotation.x = Math.PI / 2;
  tailBoom.position.set(0, 0.1, -2.4);
  group.add(tailBoom);
  const rotorMat = new THREE.MeshStandardMaterial({ color: '#0a0a0a' });
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.06, 0.2), rotorMat);
  rotor.position.y = 1.15;
  group.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.12), rotorMat);
  tailRotor.position.set(0.15, 0.3, -3.8);
  group.add(tailRotor);
  const skidMat = new THREE.MeshStandardMaterial({ color: '#333' });
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.6), skidMat);
  skidL.position.set(-0.7, -0.95, 0);
  const skidR = skidL.clone(); skidR.position.x = 0.7;
  group.add(skidL, skidR);
  scene.add(group);
  return { group, rotor, tailRotor, kind: 'helicopter' };
}

// state: { x, y, z, yaw, speed, vy, steer }. ctx: { keys, steerThrottle }
// (the same shape vehicleController.updateVehicle takes, minus the
// ground-only bits like building collision -- aircraft fly over buildings)
export function updateAircraft(state, dt, params, ctx, isPlane) {
  const { keys, steerThrottle } = ctx;
  const { steer, throttle } = steerThrottle();
  state.steer = steer;

  let accel = 0;
  if (throttle > 0) accel = params.accel * (1 - Math.max(state.speed, 0) / params.maxV) * throttle;
  else if (throttle < 0) accel = (state.speed > 1 ? params.brake : -8) * -throttle;
  state.speed += accel * dt;
  state.speed -= params.drag * state.speed * dt;
  if (throttle === 0) state.speed *= (1 - 0.12 * dt);
  state.speed = clamp(state.speed, isPlane ? 4 : -params.maxV * 0.4, params.maxV);

  const speedFrac = Math.min(Math.abs(state.speed) / params.turnDenom, 1);
  state.yaw += steer * (params.steerBase + Math.min(Math.abs(state.speed) / 30, 1) * params.steerSpeed) * speedFrac * Math.sign(state.speed || 1) * dt;
  state.x += Math.sin(state.yaw) * state.speed * dt;
  state.z += Math.cos(state.yaw) * state.speed * dt;

  if (state.vy === undefined) state.vy = 0;
  let targetVy = 0;
  if (isPlane) {
    const flying = state.speed >= params.stallSpeed;
    if (flying && keys.space) targetVy = params.climbRate;
    else if (keys.shift) targetVy = -params.sinkRate;
    else if (!flying) targetVy = -params.sinkRate * 0.5; // below stall speed: no lift, gentle sink
    state.vy = damp(state.vy, targetVy, 3, dt);
  } else {
    if (keys.space) targetVy = params.climbRate;
    else if (keys.shift) targetVy = -params.climbRate;
    state.vy = damp(state.vy, targetVy, 6, dt);
  }
  state.y += state.vy * dt;
  if (state.y < 0) { state.y = 0; state.vy = 0; }
}
