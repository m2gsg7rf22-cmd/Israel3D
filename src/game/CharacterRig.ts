import * as THREE from "three";
import type { CharacterAnimState } from "./types";

/**
 * Procedural human character rig: a kinematic "bone" hierarchy built from
 * pivots (Object3D) with primitive meshes attached, animated with a simple
 * sine-driven state machine instead of a baked skeletal animation clip.
 */
export class CharacterRig {
  root = new THREE.Group();
  hips = new THREE.Group();
  spine = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  foreArmL = new THREE.Group();
  foreArmR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  shinL = new THREE.Group();
  shinR = new THREE.Group();

  state: CharacterAnimState = "idle";
  private walkCycle = 0;
  private bodyMat: THREE.MeshStandardMaterial;

  constructor(color = 0x2255aa) {
    this.bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ad86, roughness: 0.7 });

    // Hips (root of the kinematic chain), height ~1.0m off ground.
    this.hips.position.y = 1.0;
    this.root.add(this.hips);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 4, 8), this.bodyMat);
    torso.position.y = 0.32;
    torso.castShadow = true;
    this.spine.add(torso);
    this.hips.add(this.spine);

    const hipsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.26), this.bodyMat);
    hipsMesh.castShadow = true;
    this.hips.add(hipsMesh);

    this.head.position.y = 0.66;
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), skinMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.spine.add(this.head);

    // Arms
    this.armL.position.set(0.28, 0.5, 0);
    this.armR.position.set(-0.28, 0.5, 0);
    const upperArmGeo = new THREE.CapsuleGeometry(0.075, 0.28, 4, 6);
    const upperArmL = new THREE.Mesh(upperArmGeo, this.bodyMat);
    upperArmL.position.y = -0.16;
    upperArmL.castShadow = true;
    this.armL.add(upperArmL);
    const upperArmR = new THREE.Mesh(upperArmGeo, this.bodyMat);
    upperArmR.position.y = -0.16;
    upperArmR.castShadow = true;
    this.armR.add(upperArmR);

    this.foreArmL.position.set(0, -0.3, 0);
    this.foreArmR.position.set(0, -0.3, 0);
    const foreArmGeo = new THREE.CapsuleGeometry(0.065, 0.26, 4, 6);
    const foreArmMeshL = new THREE.Mesh(foreArmGeo, skinMat);
    foreArmMeshL.position.y = -0.14;
    const foreArmMeshR = new THREE.Mesh(foreArmGeo, skinMat);
    foreArmMeshR.position.y = -0.14;
    this.foreArmL.add(foreArmMeshL);
    this.foreArmR.add(foreArmMeshR);
    this.armL.add(this.foreArmL);
    this.armR.add(this.foreArmR);
    this.spine.add(this.armL, this.armR);

    // Legs
    this.legL.position.set(0.11, -0.1, 0);
    this.legR.position.set(-0.11, -0.1, 0);
    const upperLegGeo = new THREE.CapsuleGeometry(0.09, 0.34, 4, 6);
    const upperLegL = new THREE.Mesh(upperLegGeo, this.bodyMat);
    upperLegL.position.y = -0.2;
    upperLegL.castShadow = true;
    this.legL.add(upperLegL);
    const upperLegR = new THREE.Mesh(upperLegGeo, this.bodyMat);
    upperLegR.position.y = -0.2;
    upperLegR.castShadow = true;
    this.legR.add(upperLegR);

    this.shinL.position.set(0, -0.36, 0);
    this.shinR.position.set(0, -0.36, 0);
    const shinGeo = new THREE.CapsuleGeometry(0.075, 0.32, 4, 6);
    const shinMeshL = new THREE.Mesh(shinGeo, skinMat);
    shinMeshL.position.y = -0.18;
    const shinMeshR = new THREE.Mesh(shinGeo, skinMat);
    shinMeshR.position.y = -0.18;
    this.shinL.add(shinMeshL);
    this.shinR.add(shinMeshR);
    this.legL.add(this.shinL);
    this.legR.add(this.shinR);
    this.hips.add(this.legL, this.legR);
  }

  setState(state: CharacterAnimState) {
    this.state = state;
  }

  /** Advance procedural animation. `speed01` roughly 0..1.6 scales stride rate. */
  update(dt: number, speed01: number) {
    const speedScale = { idle: 0, walk: 1, run: 1.6, sprint: 2.2, swing: 0, wallrun: 1.8, jump: 0, fall: 0 }[this.state];
    if (speedScale > 0) {
      this.walkCycle += dt * speedScale * 6;
    }
    const s = Math.sin(this.walkCycle);
    const c = Math.cos(this.walkCycle);

    switch (this.state) {
      case "idle": {
        const breathe = Math.sin(performance.now() * 0.002) * 0.02;
        this.spine.rotation.x = breathe;
        this.armL.rotation.x = 0.05;
        this.armR.rotation.x = -0.05;
        this.legL.rotation.x = 0;
        this.legR.rotation.x = 0;
        this.shinL.rotation.x = 0;
        this.shinR.rotation.x = 0;
        break;
      }
      case "walk":
      case "run":
      case "sprint":
      case "wallrun": {
        const amp = this.state === "sprint" ? 0.9 : this.state === "run" ? 0.7 : 0.45;
        this.legL.rotation.x = s * amp;
        this.legR.rotation.x = -s * amp;
        this.shinL.rotation.x = Math.max(0, -c * amp * 0.8);
        this.shinR.rotation.x = Math.max(0, c * amp * 0.8);
        this.armL.rotation.x = -s * amp * 0.8;
        this.armR.rotation.x = s * amp * 0.8;
        this.spine.rotation.x = this.state === "sprint" ? 0.22 : 0.08;
        this.hips.position.y = 1.0 + Math.abs(s) * 0.02;
        break;
      }
      case "swing": {
        this.armL.rotation.x = -1.9;
        this.armR.rotation.x = -1.9;
        this.legL.rotation.x = 0.5 + s * 0.15;
        this.legR.rotation.x = 0.3 - s * 0.15;
        this.spine.rotation.x = -0.2;
        break;
      }
      case "jump": {
        this.legL.rotation.x = -0.4;
        this.legR.rotation.x = 0.5;
        this.armL.rotation.x = -1.2;
        this.armR.rotation.x = -0.8;
        this.spine.rotation.x = -0.1;
        break;
      }
      case "fall": {
        this.legL.rotation.x = 0.2;
        this.legR.rotation.x = 0.2;
        this.armL.rotation.x = -0.6;
        this.armR.rotation.x = -0.6;
        this.spine.rotation.x = 0.1;
        break;
      }
    }
  }
}
