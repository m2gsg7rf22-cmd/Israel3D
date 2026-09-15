// Ambient traffic: procedural cars in varied colors wandering the road
// grid between random intersections, using the same "steer toward the next
// waypoint" pattern as the race AI bots and the exact same
// buildCar()/updateVehicle() physics the player's own car uses. Reuses
// mapGPS.js's road graph instead of rebuilding one.
//
// Scoped honestly: traffic cars push apart from the player's vehicle and
// each other (a soft radius nudge, same idea as pedestrian separation) so
// they don't visually drive straight through anything, but this is not the
// same building-scale collision resolution the player's own car gets --
// keeping many ambient cars fast matters more here than precise physics.
import { buildRoadGraph } from './mapGPS.js';

const COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#27ae60', '#8e44ad', '#ecf0f1', '#e67e22', '#34495e', '#bdc3c7', '#16a085'];

let THREE_, scene_, opts_, graph_;
const cars = [];

function pickNeighbor(graph, fromId, avoidId) {
  const neighbors = graph.nodes[fromId].neighbors;
  if (!neighbors.length) return fromId;
  const options = neighbors.length > 1 ? neighbors.filter((n) => n !== avoidId) : neighbors;
  return options[Math.floor(Math.random() * options.length)];
}

function spawnCar(nearX, nearZ) {
  const { buildCar } = opts_;
  const startId = Math.floor(Math.random() * graph_.nodes.length);
  const node = graph_.nodes[startId];
  const nextId = pickNeighbor(graph_, startId, -1);
  const next = graph_.nodes[nextId];
  const rig = buildCar(THREE_, scene_, { loadModel: false });
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  rig.group.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.set(color); });
  const yaw = Math.atan2(next.x - node.x, next.z - node.z);
  return {
    rig,
    state: { x: node.x, z: node.z, y: 0, vy: 0, yaw, speed: 6, steer: 0, boosting: false, wallCooldown: 0 },
    curId: startId, nextId, prevId: -1,
    speedMul: 0.55 + Math.random() * 0.25,
  };
}

export function initTraffic(scene, THREE, opts) {
  THREE_ = THREE; scene_ = scene; opts_ = opts;
  graph_ = buildRoadGraph(opts.CITY_HALF, opts.BLOCK);
}

export function spawnTraffic(count, playerX, playerZ) {
  for (let i = 0; i < count; i++) cars.push(spawnCar(playerX, playerZ));
}

function botCtx(car, brakeFactor) {
  return {
    keys: { shift: false, space: false },
    steerThrottle: () => {
      const target = graph_.nodes[car.nextId];
      const dx = target.x - car.state.x, dz = target.z - car.state.z;
      const desiredYaw = Math.atan2(dx, dz);
      let diff = ((desiredYaw - car.state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const steer = Math.max(-1, Math.min(1, diff * 2));
      let throttle = Math.abs(diff) > 1.1 ? 0.3 : 0.75;
      throttle *= brakeFactor; // slow/stop for a car or the player ahead instead of just shoving through them
      return { steer, throttle };
    },
    resolveCircleVsBuildings: opts_.resolveCircleVsBuildings,
    hitLampPoles: opts_.hitLampPoles,
    gravity: opts_.gravity,
  };
}

const TRAFFIC_PARAMS = { accel: 10, maxV: 14, brake: -20, steerBase: 0.55, steerSpeed: 0.6, turnDenom: 6, drag: 0.12, radius: 2.2 };

// looks ahead along the car's own heading for the nearest other traffic
// car or the player's vehicle, and returns a 0-1 throttle scale: full
// speed when clear, braking to a stop as it closes in -- real forward
// collision avoidance instead of only separating cars after they've
// already driven into each other
const LOOKAHEAD = 8, LOOKAHEAD_HALF_ANGLE = 0.5;
function brakeFactorFor(car, playerState) {
  let nearest = Infinity;
  const check = (ox, oz) => {
    const dx = ox - car.state.x, dz = oz - car.state.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01 || dist > LOOKAHEAD) return;
    const bearing = Math.atan2(dx, dz);
    const diff = Math.abs(((bearing - car.state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (diff < LOOKAHEAD_HALF_ANGLE) nearest = Math.min(nearest, dist);
  };
  if (playerState) check(playerState.x, playerState.z);
  for (const other of cars) { if (other !== car) check(other.state.x, other.state.z); }
  if (nearest > LOOKAHEAD) return 1;
  return Math.max(0, (nearest - 2.5) / (LOOKAHEAD - 2.5));
}

export function updateTraffic(dt, playerState) {
  for (const car of cars) {
    const scaledParams = { ...TRAFFIC_PARAMS, maxV: TRAFFIC_PARAMS.maxV * car.speedMul };
    opts_.updateVehicle(car.state, dt, scaledParams, botCtx(car, brakeFactorFor(car, playerState)));

    const target = graph_.nodes[car.nextId];
    const dist = Math.hypot(target.x - car.state.x, target.z - car.state.z);
    if (dist < 3) {
      car.prevId = car.curId;
      car.curId = car.nextId;
      car.nextId = pickNeighbor(graph_, car.curId, car.prevId);
    }

    // soft push-apart from the player's car/moto and other traffic, so cars
    // don't visibly overlap -- not real collision physics, just separation
    if (playerState) {
      const dx = car.state.x - playerState.x, dz = car.state.z - playerState.z;
      const d = Math.hypot(dx, dz);
      if (d < 3 && d > 0.01) { car.state.x += (dx / d) * (3 - d) * 0.5; car.state.z += (dz / d) * (3 - d) * 0.5; }
    }

    car.rig.group.position.set(car.state.x, car.state.y, car.state.z);
    car.rig.group.rotation.y = car.state.yaw;
    const spin = car.state.speed * dt / 0.35;
    for (const w of [...car.rig.wheels, ...car.rig.steerWheels]) w.rotation.x += spin;
  }
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i].state, b = cars[j].state;
      const dx = a.x - b.x, dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 3 && d > 0.01) {
        const push = (3 - d) * 0.5;
        a.x += (dx / d) * push; a.z += (dz / d) * push;
        b.x -= (dx / d) * push; b.z -= (dz / d) * push;
      }
    }
  }
}

export function getTrafficCount() { return cars.length; }
