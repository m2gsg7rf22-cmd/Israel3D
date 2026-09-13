import * as THREE from "three";
import type { InputState, CharacterAnimState } from "./types";
import { SpatialGrid } from "./SpatialGrid";
import { CharacterRig } from "./CharacterRig";
import { audioSynth } from "./AudioSynth";

export const WALK_SPEED = 1.45;
export const RUN_SPEED = 3.7;
export const SPRINT_SPEED = 5.6;
const GRAVITY = -18;
const CHAR_RADIUS = 0.35;
const CHAR_HEIGHT = 1.82;
const GRAPPLE_RANGE = 60;
const WALLRUN_MIN_SPEED = 3.0;

export type LocoMode = "ground" | "air" | "swing" | "wallrun";

export interface SwingLine {
  anchor: THREE.Vector3;
  active: boolean;
}

export class Locomotion {
  rig = new CharacterRig(0x1e63c9);
  position = new THREE.Vector3(0, 0, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  mode: LocoMode = "ground";
  grounded = true;
  swingAnchor: THREE.Vector3 | null = null;
  swingLength = 0;
  wallNormal: THREE.Vector3 | null = null;
  wallRunTime = 0;
  vaultProgress = -1;
  vaultStartY = 0;
  vaultTargetHeight = 0;

  speed01 = 0; // for camera / FOV widening
  fovBoost = 0; // 0..1, camera rig reads this
  lastAnimState: CharacterAnimState = "idle";
  footstepTimer = 0;

  private prevPositionForConstraint = new THREE.Vector3();
  private grappleCooldown = 0;
  private jumpEdgeConsumed = false;

  reset(spawn: THREE.Vector3) {
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.mode = "ground";
    this.grounded = true;
    this.swingAnchor = null;
    this.rig.root.position.copy(this.position);
  }

  private findGrappleTarget(grid: SpatialGrid, forward: THREE.Vector3): { point: THREE.Vector3; buildingTop: number } | null {
    const candidates = grid.queryRadius(this.position.x, this.position.z, GRAPPLE_RANGE);
    let best: { dist: number; point: THREE.Vector3; buildingTop: number } | null = null;
    for (const c of candidates) {
      if (!c.isWall) continue;
      if (c.maxY < 6) continue;
      const dist = SpatialGrid.rayAABB2D(this.position.x, this.position.z, forward.x, forward.z, c);
      if (dist === null || dist < 3 || dist > GRAPPLE_RANGE) continue;
      if (!best || dist < best.dist) {
        const hx = this.position.x + forward.x * dist;
        const hz = this.position.z + forward.z * dist;
        best = { dist, point: new THREE.Vector3(hx, 0, hz), buildingTop: c.maxY };
      }
    }
    if (!best) return null;
    return { point: best.point, buildingTop: best.buildingTop };
  }

  private tryStartSwing(grid: SpatialGrid, cameraYaw: number) {
    const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const target = this.findGrappleTarget(grid, forward);
    if (!target) return false;
    const anchorY = THREE.MathUtils.clamp(target.buildingTop * 0.7, this.position.y + 8, this.position.y + 45);
    this.swingAnchor = new THREE.Vector3(target.point.x, anchorY, target.point.z);
    this.swingLength = this.position.distanceTo(this.swingAnchor);
    this.mode = "swing";
    this.fovBoost = 0.2;
    audioSynth.playSwingWhoosh(false);
    return true;
  }

  private releaseSwing() {
    if (this.mode !== "swing") return;
    this.velocity.y += 4.5;
    this.velocity.multiplyScalar(1.15);
    this.mode = "air";
    this.swingAnchor = null;
    this.fovBoost = 0.35;
    audioSynth.playSwingWhoosh(true);
  }

  private updateSwing(dt: number, inputX: number, inputY: number) {
    if (!this.swingAnchor) return;
    this.prevPositionForConstraint.copy(this.position);
    this.velocity.y += GRAVITY * 0.55 * dt;

    // Tangential input control: A/D swing side-to-side, W/S accelerate or
    // decelerate momentum along the arc.
    const toAnchor = new THREE.Vector3().subVectors(this.swingAnchor, this.position).normalize();
    const tangent = new THREE.Vector3(-toAnchor.z, 0, toAnchor.x);
    this.velocity.addScaledVector(tangent, inputX * 16 * dt);
    const horizVel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const forwardDir = horizVel.lengthSq() > 0.05 ? horizVel.normalize() : tangent;
    this.velocity.addScaledVector(forwardDir, inputY * 12 * dt);

    this.position.addScaledVector(this.velocity, dt);

    const dir = new THREE.Vector3().subVectors(this.position, this.swingAnchor);
    const dist = dir.length();
    if (dist > 0.0001) {
      dir.multiplyScalar(this.swingLength / dist);
      this.position.copy(this.swingAnchor).add(dir);
    }
    this.velocity.copy(this.position).sub(this.prevPositionForConstraint).divideScalar(Math.max(dt, 1e-4));

    if (this.position.y < 0.9) {
      this.position.y = 0.9;
      this.mode = "ground";
      this.swingAnchor = null;
      this.velocity.y = 0;
    }
  }
  private tryVault(grid: SpatialGrid, forward: THREE.Vector3): boolean {
    const candidates = grid.queryRadius(this.position.x, this.position.z, 1.6);
    for (const c of candidates) {
      if (c.isWall || c.maxY > 1.35 || c.maxY < 0.25) continue;
      const dist = SpatialGrid.rayAABB2D(this.position.x, this.position.z, forward.x, forward.z, c);
      if (dist !== null && dist < 1.3) {
        this.vaultProgress = 0;
        this.vaultStartY = this.position.y;
        this.vaultTargetHeight = c.maxY + 0.3;
        return true;
      }
    }
    return false;
  }

  private resolveBuildingCollisions(grid: SpatialGrid) {
    const candidates = grid.queryRadius(this.position.x, this.position.z, 3);
    for (const c of candidates) {
      if (!c.isWall) continue;
      if (this.position.y > c.maxY + 0.1) continue;
      const closestX = THREE.MathUtils.clamp(this.position.x, c.minX, c.maxX);
      const closestZ = THREE.MathUtils.clamp(this.position.z, c.minZ, c.maxZ);
      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < CHAR_RADIUS * CHAR_RADIUS && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = (CHAR_RADIUS - dist) / dist;
        this.position.x += dx * push;
        this.position.z += dz * push;
      } else if (distSq <= 1e-6) {
        // Center inside the box (shouldn't normally happen) — push out along shortest axis.
        this.position.x += CHAR_RADIUS;
      }
    }
  }

  private findWallAhead(grid: SpatialGrid, forward: THREE.Vector3): { normal: THREE.Vector3 } | null {
    const candidates = grid.queryRadius(this.position.x, this.position.z, 2.5);
    for (const c of candidates) {
      if (!c.isWall || c.maxY < 3) continue;
      const dist = SpatialGrid.rayAABB2D(this.position.x, this.position.z, forward.x, forward.z, c);
      if (dist !== null && dist < 0.9) {
        const closestX = THREE.MathUtils.clamp(this.position.x, c.minX, c.maxX);
        const closestZ = THREE.MathUtils.clamp(this.position.z, c.minZ, c.maxZ);
        const normal = new THREE.Vector3(this.position.x - closestX, 0, this.position.z - closestZ);
        if (normal.lengthSq() < 1e-6) normal.set(-forward.x, 0, -forward.z);
        normal.normalize();
        return { normal };
      }
    }
    return null;
  }

  update(dt: number, input: InputState, grid: SpatialGrid, cameraYaw: number, vehicleNearby: boolean) {
    this.grappleCooldown = Math.max(0, this.grappleCooldown - dt);

    const moveMag = Math.min(1, Math.hypot(input.moveX, input.moveY));
    const inputForward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const inputRight = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    const moveDir = new THREE.Vector3()
      .addScaledVector(inputForward, input.moveY)
      .addScaledVector(inputRight, input.moveX);
    if (moveDir.lengthSq() > 1) moveDir.normalize();

    if (moveDir.lengthSq() > 0.0001) {
      this.yaw = Math.atan2(moveDir.x, moveDir.z);
    }

    // --- Web swing input ---
    if (input.webSwing && this.grappleCooldown === 0) {
      this.grappleCooldown = 0.35;
      if (this.mode === "swing") {
        this.releaseSwing();
      } else if (this.mode === "air" || this.mode === "ground") {
        this.tryStartSwing(grid, cameraYaw);
      }
    }
    if (this.mode === "swing" && input.jumpVault && !this.jumpEdgeConsumed) {
      this.jumpEdgeConsumed = true;
      this.releaseSwing();
    }
    if (!input.jumpVault) this.jumpEdgeConsumed = false;

    if (this.mode === "swing") {
      this.updateSwing(dt, input.moveX, input.moveY);
      this.fovBoost = THREE.MathUtils.lerp(this.fovBoost, 0.5 * Math.min(1, this.velocity.length() / 20), 0.05);
      this.speed01 = Math.min(1, this.velocity.length() / 22);
      this.rig.root.position.copy(this.position);
      this.rig.root.rotation.y = this.yaw;
      this.rig.setState("swing");
      this.rig.update(dt, 1);
      return;
    }

    this.fovBoost = THREE.MathUtils.lerp(this.fovBoost, 0, 0.08);

    // --- Vault in progress ---
    if (this.vaultProgress >= 0) {
      this.vaultProgress += dt / 0.45;
      const t = Math.min(1, this.vaultProgress);
      const arc = Math.sin(t * Math.PI) * 0.5;
      this.position.y = THREE.MathUtils.lerp(this.vaultStartY, this.vaultTargetHeight, t) + arc;
      this.position.addScaledVector(inputForward, dt * RUN_SPEED);
      if (t >= 1) {
        this.vaultProgress = -1;
        this.mode = "ground";
      }
      this.rig.root.position.copy(this.position);
      this.rig.root.rotation.y = this.yaw;
      this.rig.setState("jump");
      this.rig.update(dt, 1);
      return;
    }

    // --- Wall running ---
    if (this.mode === "wallrun" && this.wallNormal) {
      this.wallRunTime += dt;
      const tangent = new THREE.Vector3(-this.wallNormal.z, 0, this.wallNormal.x);
      if (tangent.dot(moveDir) < 0) tangent.negate();
      this.velocity.x = tangent.x * RUN_SPEED * 1.15;
      this.velocity.z = tangent.z * RUN_SPEED * 1.15;
      this.velocity.y = Math.max(this.velocity.y - GRAVITY * -0.15 * dt, -2.5);
      this.position.addScaledVector(this.velocity, dt);
      // Keep glued to wall plane.
      this.position.addScaledVector(this.wallNormal, -0.05);
      if (this.wallRunTime > 1.3 || this.velocity.length() < WALLRUN_MIN_SPEED || input.jumpVault) {
        this.mode = "air";
        this.velocity.addScaledVector(this.wallNormal, 2.5);
        this.velocity.y = 5;
      }
      if (this.position.y <= 0.9) {
        this.position.y = 0.9;
        this.mode = "ground";
        this.velocity.y = 0;
      }
      this.rig.root.position.copy(this.position);
      this.rig.root.rotation.y = Math.atan2(tangent.x, tangent.z);
      this.rig.setState("wallrun");
      this.rig.update(dt, 1.5);
      return;
    }

    // --- Ground / air movement ---
    const sprinting = input.sprint && moveMag > 0.1;
    const targetSpeed = moveMag < 0.05 ? 0 : sprinting ? SPRINT_SPEED : moveMag > 0.55 ? RUN_SPEED : WALK_SPEED;
    const desiredVel = moveDir.clone().multiplyScalar(targetSpeed);

    const accel = this.grounded ? 10 : 3;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desiredVel.x, accel, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desiredVel.z, accel, dt);

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed01 = Math.min(1, horizSpeed / SPRINT_SPEED);

    // Wall-run trigger: sprinting into a wall.
    if (this.grounded && horizSpeed > WALLRUN_MIN_SPEED && moveDir.lengthSq() > 0.3) {
      const wallHit = this.findWallAhead(grid, moveDir);
      if (wallHit) {
        // Try vault first if a low obstacle, otherwise wall-run.
        this.mode = "wallrun";
        this.wallNormal = wallHit.normal;
        this.wallRunTime = 0;
        this.velocity.y = 2;
        return;
      }
    }

    // Vault trigger (E or Space) over low obstacles.
    if ((input.jumpVault || input.drift) && this.grounded && moveDir.lengthSq() > 0.05) {
      if (this.tryVault(grid, moveDir)) {
        this.mode = "air";
        return;
      }
    }

    // Jump.
    if (input.jumpVault && this.grounded && !this.jumpEdgeConsumed) {
      this.jumpEdgeConsumed = true;
      this.velocity.y = 5.2;
      this.grounded = false;
    }
    if (!input.jumpVault) this.jumpEdgeConsumed = false;

    // Gravity.
    if (!this.grounded) {
      this.velocity.y += GRAVITY * dt;
    }

    this.position.addScaledVector(this.velocity, dt);
    this.resolveBuildingCollisions(grid);

    if (this.position.y <= 0.9) {
      this.position.y = 0.9;
      this.velocity.y = 0;
      this.grounded = true;
      this.mode = "ground";
    } else {
      this.grounded = false;
      this.mode = "air";
    }

    this.rig.root.position.copy(this.position);
    if (moveDir.lengthSq() > 0.0001) {
      this.rig.root.rotation.y = this.yaw;
    }

    let animState: CharacterAnimState;
    if (!this.grounded) animState = this.velocity.y > 0 ? "jump" : "fall";
    else if (horizSpeed < 0.15) animState = "idle";
    else if (sprinting) animState = "sprint";
    else if (moveMag > 0.55) animState = "run";
    else animState = "walk";
    this.rig.setState(animState);
    this.rig.update(dt, horizSpeed / SPRINT_SPEED);

    if (animState === "walk" || animState === "run" || animState === "sprint") {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        audioSynth.playFootstep(animState === "sprint" ? 1.3 : animState === "run" ? 1.0 : 0.6);
        this.footstepTimer = animState === "sprint" ? 0.22 : animState === "run" ? 0.32 : 0.48;
      }
    }
    void vehicleNearby;
  }
}
