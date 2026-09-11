import * as THREE from "three";
import type { InputState } from "./types";
import { SpatialGrid } from "./SpatialGrid";
import { SkidTrail, SmokeParticles } from "./VehicleEffects";
import { audioSynth } from "./AudioSynth";

export type VehicleKind = "car" | "bike";

export interface VehicleTelemetry {
  speedKmh: number;
  gear: number;
  nitro01: number;
  drifting: boolean;
  driftIntensity: number;
  driftScore: number;
}

const NITRO_MAX = 100;
const NITRO_DRAIN = 26; // units/sec
const NITRO_REGEN = 5; // units/sec, passive
const TOP_SPEED = 91; // m/s reference used by the nitro boost curve

export class VehicleController {
  kind: VehicleKind;
  group = new THREE.Group();
  private bodyGroup = new THREE.Group();
  private driverDoor = new THREE.Group();
  private frontFork = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private nitroFlames: THREE.Mesh[] = [];

  position = new THREE.Vector3();
  yaw = 0;
  velDir = new THREE.Vector3(0, 0, 1);
  speed = 0; // signed scalar, m/s
  rollAngle = 0;
  wheelieAngle = 0;

  occupied = false;
  doorAngle = 0;
  doorTarget = 0;
  nitroGauge = NITRO_MAX;
  driftScore = 0;

  private skid: SkidTrail;
  private smoke: SmokeParticles;
  private radius: number;
  private engineRunning = false;

  constructor(scene: THREE.Scene, kind: VehicleKind, spawn: THREE.Vector3) {
    this.kind = kind;
    this.position.copy(spawn);
    this.radius = kind === "car" ? 2.5 : 1.2;
    if (kind === "car") this.buildCar();
    else this.buildBike();
    this.group.add(this.bodyGroup);
    this.group.position.copy(this.position);
    scene.add(this.group);
    this.skid = new SkidTrail(scene);
    this.smoke = new SmokeParticles(scene, 220, kind === "car" ? 0xcfcfcf : 0xbfbfbf);
  }

  private buildCar() {
    const paint = new THREE.MeshPhysicalMaterial({ color: 0x1fb8b0, metalness: 0.85, roughness: 0.25, clearcoat: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1a22, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 4.6), paint);
    chassis.position.y = 0.5;
    chassis.castShadow = true;
    this.bodyGroup.add(chassis);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 2.2), glass);
    cabin.position.set(0, 0.95, -0.2);
    this.bodyGroup.add(cabin);

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.35, 0.4), dark);
    bumperF.position.set(0, 0.35, 2.3);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.35, 0.4), dark);
    bumperR.position.set(0, 0.35, -2.3);
    this.bodyGroup.add(bumperF, bumperR);

    // Driver door (hinged, left side).
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 1.9), paint);
    doorMesh.position.set(0.45, 0, 0);
    this.driverDoor.position.set(1.1, 0.55, 0.1);
    this.driverDoor.add(doorMesh);
    this.bodyGroup.add(this.driverDoor);

    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 14);
    const wheelPositions: [number, number, number][] = [
      [0.95, 0.34, 1.55],
      [-0.95, 0.34, 1.55],
      [0.95, 0.34, -1.55],
      [-0.95, 0.34, -1.55],
    ];
    for (const [x, y, z] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      wheel.castShadow = true;
      this.bodyGroup.add(wheel);
      this.wheels.push(wheel);
    }

    this.buildNitroFlames(0.5, [-0.55, -0.55]);
    this.buildHeadlights(2.28, [0.75, -0.75]);
  }

  private buildBike() {
    const paint = new THREE.MeshPhysicalMaterial({ color: 0xdd2233, metalness: 0.7, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6, metalness: 0.4 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 1.6), paint);
    frame.position.y = 0.62;
    frame.castShadow = true;
    this.bodyGroup.add(frame);

    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.5), dark);
    engine.position.set(0, 0.42, 0);
    this.bodyGroup.add(engine);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    seat.position.set(0, 0.82, -0.3);
    this.bodyGroup.add(seat);

    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), dark);
    handlebar.position.set(0, 0.95, 0.75);
    this.bodyGroup.add(handlebar);

    // Front fork pivot (wheelie pitch).
    this.frontFork.position.set(0, 0.34, 0.75);
    const frontWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.16, 16), dark);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.castShadow = true;
    this.frontFork.add(frontWheel);
    this.wheels.push(frontWheel);
    this.bodyGroup.add(this.frontFork);

    const rearWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 16), dark);
    rearWheel.rotation.z = Math.PI / 2;
    rearWheel.position.set(0, 0.34, -0.75);
    rearWheel.castShadow = true;
    this.bodyGroup.add(rearWheel);
    this.wheels.push(rearWheel);

    for (const side of [-1, 1]) {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 8), dark);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(side * 0.18, 0.32, -0.9);
      this.bodyGroup.add(exhaust);
    }

    this.buildNitroFlames(0.32, [0]);
    this.buildHeadlights(0.85, [0]);
  }

  private buildNitroFlames(y: number, xs: number[]) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const zBack = this.kind === "car" ? -2.4 : -1.05;
    for (const x of xs) {
      const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.9), mat.clone());
      flame.position.set(x, y, zBack);
      flame.rotation.x = Math.PI / 2;
      this.bodyGroup.add(flame);
      this.nitroFlames.push(flame);
    }
  }

  private buildHeadlights(z: number, xs: number[]) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 1.5 });
    for (const x of xs) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat);
      light.position.set(x, this.kind === "car" ? 0.45 : 0.55, z);
      this.bodyGroup.add(light);
    }
  }

  enter() {
    this.occupied = true;
    this.doorTarget = this.kind === "car" ? 1.12 : 0;
    audioSynth.startEngine();
    audioSynth.playIgnition();
    this.engineRunning = true;
  }

  exit() {
    this.occupied = false;
    this.doorTarget = this.kind === "car" ? 1.12 : 0;
    audioSynth.stopEngine();
    this.engineRunning = false;
  }

  private wheelSpinAccum = 0;

  update(dt: number, input: InputState, grid: SpatialGrid): VehicleTelemetry {
    // Door animation always runs (open on enter/exit, then settle closed).
    if (this.occupied || this.doorTarget > 0) {
      this.doorAngle = THREE.MathUtils.damp(this.doorAngle, this.doorTarget, 6, dt);
    }
    this.driverDoor.rotation.y = -this.doorAngle;

    if (!this.occupied) {
      this.nitroGauge = Math.min(NITRO_MAX, this.nitroGauge + NITRO_REGEN * dt * 2);
      return this.telemetry(false, 0);
    }

    const throttle = input.moveY;
    const steerInput = input.moveX;
    const nitroHeld = input.nitro && this.nitroGauge > 0;
    const handbrake = input.handbrake || input.drift;

    const maxAccel = this.kind === "car" ? 13 : 19;
    const brakeDecel = this.kind === "car" ? 22 : 26;
    const reverseAccel = this.kind === "car" ? 6 : 9;

    let accel = 0;
    if (throttle > 0.02) {
      accel = maxAccel * throttle;
    } else if (throttle < -0.02) {
      accel = this.speed > 0.3 ? brakeDecel * throttle : reverseAccel * throttle;
    }
    this.speed += accel * dt;
    this.speed += -0.11 * this.speed * dt;

    if (nitroHeld) {
      const boost = 32 * Math.max(0, 1 - Math.abs(this.speed) / TOP_SPEED);
      this.speed += boost * dt;
      this.nitroGauge = Math.max(0, this.nitroGauge - NITRO_DRAIN * dt);
    } else {
      this.nitroGauge = Math.min(NITRO_MAX, this.nitroGauge + NITRO_REGEN * dt);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, this.kind === "car" ? -14 : -10, 95);

    // Steering: velocity-scaled lag.
    const steerAngle = steerInput * (0.52 + Math.min(Math.abs(this.speed) / 32, 1) * 0.58) * dt * (this.speed >= 0 ? 1 : -1);
    this.yaw += steerAngle * (this.kind === "car" ? 1.4 : 1.9);

    // Grip / drift model: velocity direction lags heading based on rear grip.
    const grip = handbrake ? 1.6 : 7.0;
    const headingDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const blend = Math.min(1, grip * dt);
    if (this.velDir.lengthSq() < 1e-6) this.velDir.copy(headingDir);
    this.velDir.lerp(headingDir, blend).normalize();

    const slipDot = THREE.MathUtils.clamp(this.velDir.dot(headingDir), -1, 1);
    const driftIntensity = THREE.MathUtils.clamp(1 - slipDot, 0, 1) * 3;
    const drifting = handbrake && Math.abs(this.speed) > 3 && driftIntensity > 0.04;
    if (drifting) {
      this.driftScore += dt * Math.abs(this.speed) * 12;
      this.emitDriftEffects();
    }

    this.position.addScaledVector(this.velDir, this.speed * dt);
    this.resolveCollisions(grid);

    // Roll (bike lean) / wheelie.
    if (this.kind === "bike") {
      this.rollAngle = THREE.MathUtils.damp(this.rollAngle, -steerInput * Math.min(Math.abs(this.speed) / 25, 1) * 0.45, 8, dt);
      const wheelieTarget = throttle > 0.85 && this.speed > 8 ? 0.25 : 0;
      this.wheelieAngle = THREE.MathUtils.damp(this.wheelieAngle, wheelieTarget, 4, dt);
      this.frontFork.rotation.x = -this.wheelieAngle;
      this.bodyGroup.rotation.z = this.rollAngle;
      this.bodyGroup.rotation.x = -this.wheelieAngle * 0.6;
    }

    // Nitro flame visuals.
    for (const flame of this.nitroFlames) {
      const mat = flame.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.damp(mat.opacity, nitroHeld ? 0.75 + Math.random() * 0.2 : 0, 10, dt);
      flame.scale.y = 1 + (nitroHeld ? Math.random() * 0.4 : 0);
    }

    // Wheel spin visuals.
    this.wheelSpinAccum += this.speed * dt * 3.2;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpinAccum;

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.smoke.update(dt);

    return this.telemetry(drifting, driftIntensity);
  }

  private emitDriftEffects() {
    const rearOffset = this.kind === "car" ? -1.55 : -0.75;
    const left = new THREE.Vector3(-0.9, 0, rearOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.position);
    const right = new THREE.Vector3(0.9, 0, rearOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.position);
    this.skid.addMark(left, right, this._prevLeft ?? left, this._prevRight ?? right);
    this._prevLeft = left.clone();
    this._prevRight = right.clone();
    this.smoke.emit(left, this.velDir.clone().negate(), 2);
    this.smoke.emit(right, this.velDir.clone().negate(), 2);
  }
  private _prevLeft: THREE.Vector3 | null = null;
  private _prevRight: THREE.Vector3 | null = null;

  private resolveCollisions(grid: SpatialGrid) {
    const candidates = grid.queryRadius(this.position.x, this.position.z, this.radius + 2);
    for (const c of candidates) {
      if (!c.isWall) continue;
      const closestX = THREE.MathUtils.clamp(this.position.x, c.minX, c.maxX);
      const closestZ = THREE.MathUtils.clamp(this.position.z, c.minZ, c.maxZ);
      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < this.radius * this.radius) {
        const dist = Math.sqrt(distSq) || 0.001;
        const push = (this.radius - dist) / dist;
        this.position.x += dx * push;
        this.position.z += dz * push;
        this.speed *= 0.35;
      }
    }
  }

  /** Coast to a stop under friction after the driver exits at speed. */
  applyExitFriction(dt: number) {
    this.speed = THREE.MathUtils.damp(this.speed, 0, 3, dt);
    this.position.addScaledVector(this.velDir, this.speed * dt);
    this.group.position.copy(this.position);
  }

  distanceTo(p: THREE.Vector3) {
    return this.position.distanceTo(p);
  }

  getSeatWorldPosition(target: THREE.Vector3) {
    target.copy(this.position);
    target.y += this.kind === "car" ? 0.55 : 0.75;
  }

  private telemetry(drifting: boolean, driftIntensity: number): VehicleTelemetry {
    const speedKmh = Math.abs(this.speed) * 3.6;
    const gear = Math.max(1, Math.min(6, Math.floor((Math.abs(this.speed) / 95) * 6) + 1));
    return {
      speedKmh,
      gear,
      nitro01: this.nitroGauge / NITRO_MAX,
      drifting,
      driftIntensity: Math.min(1, driftIntensity),
      driftScore: this.driftScore,
    };
  }
}
