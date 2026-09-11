import * as THREE from "three";
import { SpatialGrid } from "./SpatialGrid";
import type { CameraMode } from "./types";

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  mode: CameraMode = "shoulder";
  private fov = 68;
  private targetFov = 68;
  shoulderSide = 1;
  chaseDistanceMul = 1;

  private smoothedYaw = 0;
  private smoothedPos = new THREE.Vector3();
  private shakeTime = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.fov, aspect, 0.1, 900);
  }

  get yaw(): number {
    return this.smoothedYaw;
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  cycle() {
    this.shoulderSide *= -1;
    this.chaseDistanceMul = this.chaseDistanceMul > 1 ? 0.7 : 1.3;
  }

  private applyFov(dt: number) {
    this.fov = THREE.MathUtils.damp(this.fov, this.targetFov, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private occlusionClamp(charPos: THREE.Vector3, desired: THREE.Vector3, grid: SpatialGrid): THREE.Vector3 {
    const dir = new THREE.Vector3().subVectors(desired, charPos);
    const dist = dir.length();
    if (dist < 0.01) return desired;
    const dirN = dir.clone().normalize();
    const candidates = grid.queryRadius(charPos.x, charPos.z, dist + 1);
    let minDist = dist;
    for (const c of candidates) {
      if (!c.isWall || c.maxY < 1.6) continue;
      const hit = SpatialGrid.rayAABB2D(charPos.x, charPos.z, dirN.x, dirN.z, c);
      if (hit !== null && hit < minDist) minDist = hit;
    }
    const safeDist = Math.max(0.6, minDist - 0.4);
    return charPos.clone().addScaledVector(dirN, safeDist).setY(desired.y);
  }

  updatePursuit(dt: number, vehiclePos: THREE.Vector3, vehicleYaw: number, speed: number, nitroActive: boolean, grid: SpatialGrid) {
    this.mode = "pursuit";
    const absSpeed = Math.abs(speed);
    const distance = (7.2 + absSpeed * 0.024) * this.chaseDistanceMul;
    const height = 2.8 + absSpeed * 0.006;

    this.smoothedYaw = THREE.MathUtils.damp(this.smoothedYaw, vehicleYaw, 4.5, dt);
    const back = new THREE.Vector3(Math.sin(this.smoothedYaw), 0, Math.cos(this.smoothedYaw));
    const desired = vehiclePos.clone().addScaledVector(back, -distance);
    desired.y = vehiclePos.y + height;

    if (nitroActive) {
      this.shakeTime += dt * 40;
      desired.x += Math.sin(this.shakeTime) * 0.06;
      desired.y += Math.cos(this.shakeTime * 1.3) * 0.04;
    }

    this.smoothedPos.lerp(desired, 1 - Math.pow(0.001, dt));
    this.camera.position.copy(this.smoothedPos);
    const lookAt = vehiclePos.clone().addScaledVector(back, 3);
    lookAt.y += 1.1;
    this.camera.lookAt(lookAt);

    this.targetFov = 68 + Math.min(14, absSpeed * 0.14) + (nitroActive ? 6 : 0);
    this.applyFov(dt);
  }

  updateShoulder(dt: number, charPos: THREE.Vector3, charYaw: number, fovBoost: number, grid: SpatialGrid) {
    this.mode = "shoulder";
    this.smoothedYaw = THREE.MathUtils.damp(this.smoothedYaw, charYaw, 8, dt);
    const back = new THREE.Vector3(Math.sin(this.smoothedYaw), 0, Math.cos(this.smoothedYaw));
    const right = new THREE.Vector3(back.z, 0, -back.x);
    const head = charPos.clone();
    head.y += 1.55;
    const desired = head
      .clone()
      .addScaledVector(back, -3.1)
      .addScaledVector(right, 0.55 * this.shoulderSide);
    desired.y += 0.35;

    const clamped = this.occlusionClamp(head, desired, grid);
    this.smoothedPos.lerp(clamped, 1 - Math.pow(0.0005, dt));
    this.camera.position.copy(this.smoothedPos);
    const lookAt = head.clone().addScaledVector(back, 4);
    this.camera.lookAt(lookAt);

    this.targetFov = 62 + fovBoost * 14;
    this.applyFov(dt);
  }

  updateSwing(dt: number, charPos: THREE.Vector3, velocity: THREE.Vector3, fovBoost: number) {
    this.mode = "swing";
    const speed = velocity.length();
    const dir = speed > 0.5 ? velocity.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const desired = charPos.clone().addScaledVector(dir, -5.5);
    desired.y += 1.2 - Math.max(0, dir.y) * 1.5;

    this.smoothedPos.lerp(desired, 1 - Math.pow(0.002, dt));
    this.camera.position.copy(this.smoothedPos);
    const lookAt = charPos.clone().addScaledVector(dir, 6);
    this.camera.lookAt(lookAt);

    this.targetFov = THREE.MathUtils.lerp(68, 85, Math.min(1, speed / 24 + fovBoost));
    this.applyFov(dt);
  }

  setPose(position: THREE.Vector3, lookAt: THREE.Vector3, fov: number) {
    this.mode = "cinematic";
    this.camera.position.copy(position);
    this.camera.lookAt(lookAt);
    this.fov = this.targetFov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  snapTo(position: THREE.Vector3) {
    this.smoothedPos.copy(position);
    this.camera.position.copy(position);
  }
}
