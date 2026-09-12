// Player character rig. Two layers:
//  1. A procedural low-poly rig (hip pivot + four limb pivots) -- this is the
//     default, always built immediately so the game never has a missing
//     player mesh, and it's what seatOnMoto/unseatFromMoto and the punch/
//     vehicle-enter logic elsewhere key off of.
//  2. An optional custom player model (glTF/.glb), loaded asynchronously from
//     PLAYER_MODEL_PATH below. If present, it replaces the procedural mesh
//     visually (the procedural meshes are hidden, not removed -- the pivot
//     groups stay so nothing else in the codebase has to know which mode is
//     active) and, if the file embeds Idle/Walk/Run animation clips, drives
//     them through a THREE.AnimationMixer keyed off the same speed the
//     procedural rig uses for its swing cycle.
//
// This loading path is used ONLY here, for the single player rig -- NPCs
// (pedestrians.js) and police (police.js) each build their own separate
// procedural meshes in their own files and never call into this module, so
// swapping the player's visual here cannot affect them.
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';

// Drop your exported model at this path (relative to index.html) to replace
// the procedural player mesh. A single self-contained .glb (glTF Binary) is
// strongly recommended -- it embeds meshes, materials, textures, and any
// animation clips in one file, so there's nothing else to place or link.
// If you only have an .fbx, re-export it as .glb from Blender or Mixamo
// first; the FBX loader was left out on purpose to keep this vendored
// dependency small (it otherwise drags in a compression lib and a spline
// module this project doesn't use anywhere else).
const PLAYER_MODEL_PATH = '../assets/models/player.glb';
const PLAYER_MODEL_SCALE = 1;   // tweak if your export isn't in meters
const PLAYER_MODEL_Y_OFFSET = 0; // tweak if the model's origin isn't at its feet

const ANIM_NAME_PATTERNS = {
  idle: ['idle', 'stand'],
  walk: ['walk'],
  run: ['run', 'sprint'],
};

// The player's default look is deliberately not drawn from pedestrians.js's
// palettes (SHIRT_COLORS/PANTS_COLORS there) -- a hero racing red + near-
// black plus a gold accent stripe (matching the game's own HUD gold) so the
// player never coincidentally matches a random NPC's outfit.
const HERO_SHIRT = '#d62828';
const HERO_PANTS = '#12161c';
const HERO_ACCENT = '#ffd23f';

export function buildCharacter(THREE, scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#e0b28e', roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: HERO_SHIRT, roughness: 0.75 });
  const pants = new THREE.MeshStandardMaterial({ color: HERO_PANTS, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: HERO_ACCENT, roughness: 0.5, emissive: HERO_ACCENT, emissiveIntensity: 0.15 });
  const hair = new THREE.MeshStandardMaterial({ color: '#241a12', roughness: 0.7 });

  const hips = new THREE.Group();
  hips.position.y = 0.88;
  group.add(hips);

  // torso built from a main box plus a slim center racing stripe -- more
  // silhouette detail than the pedestrian crowd's single flat-color box,
  // and the stripe alone makes the player readable at a glance in a crowd
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.25), shirt);
  torso.position.y = 0.35;
  torso.castShadow = true;
  hips.add(torso);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.56, 0.02), accent);
  stripe.position.set(0, 0.35, 0.135);
  hips.add(stripe);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skin);
  neck.position.y = 0.65;
  hips.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
  head.position.y = 0.75;
  head.castShadow = true;
  hips.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
  hairCap.position.y = 0.80;
  hips.add(hairCap);

  // two-segment limbs (upper + lower with an elbow/knee pivot) -- more
  // articulation than the crowd's single rigid box per limb, which both
  // reads as visually distinct and lets locomotion bend at the joint
  function makeSegmentedLimb(mat, upperLen, lowerLen, thickness, x, jointY, cuffAccent) {
    const pivot = new THREE.Group();
    pivot.position.set(x, jointY, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(thickness, upperLen, thickness), mat);
    upper.position.y = -upperLen / 2;
    upper.castShadow = true;
    pivot.add(upper);

    const joint = new THREE.Group();
    joint.position.y = -upperLen;
    pivot.add(joint);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(thickness * 0.92, lowerLen, thickness * 0.92), mat);
    lower.position.y = -lowerLen / 2;
    lower.castShadow = true;
    joint.add(lower);
    if (cuffAccent) {
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(thickness * 0.98, 0.04, thickness * 0.98), accent);
      cuff.position.y = -lowerLen + 0.02;
      joint.add(cuff);
    }
    return { pivot, joint, upper, lower };
  }

  const leg = { L: makeSegmentedLimb(pants, 0.42, 0.42, 0.15, -0.11, 0, true), R: makeSegmentedLimb(pants, 0.42, 0.42, 0.15, 0.11, 0, true) };
  const arm = { L: makeSegmentedLimb(shirt, 0.32, 0.3, 0.13, -0.29, 0.58, false), R: makeSegmentedLimb(shirt, 0.32, 0.3, 0.13, 0.29, 0.58, false) };
  hips.add(leg.L.pivot, leg.R.pivot, arm.L.pivot, arm.R.pivot);

  scene.add(group);
  const rig = {
    group, hips,
    legL: leg.L.pivot, legR: leg.R.pivot, armL: arm.L.pivot, armR: arm.R.pivot,
    kneeL: leg.L.joint, kneeR: leg.R.joint, elbowL: arm.L.joint, elbowR: arm.R.joint,
    torso, shirtMat: shirt, pantsMat: pants,
    proceduralMeshes: [torso, stripe, neck, head, hairCap, leg.L.upper, leg.L.lower, leg.R.upper, leg.R.lower, arm.L.upper, arm.L.lower, arm.R.upper, arm.R.lower],
    customModel: null, mixer: null, actions: {}, activeAction: null,
  };
  loadCustomPlayerModel(THREE, rig);
  return rig;
}

function loadCustomPlayerModel(THREE, rig) {
  const loader = new GLTFLoader();
  loader.load(
    PLAYER_MODEL_PATH,
    (gltf) => {
      for (const mesh of rig.proceduralMeshes) mesh.visible = false;

      const model = gltf.scene;
      model.scale.setScalar(PLAYER_MODEL_SCALE);
      model.position.y += PLAYER_MODEL_Y_OFFSET;
      // this rig (like most Mixamo-based exports, including three.js's own
      // Soldier.glb) treats -Z as its front, while every movement formula in
      // this game (foot.x += sin(yaw)*speed, foot.z += cos(yaw)*speed) treats
      // +Z as forward at yaw=0. Without this correction the model visibly
      // walks backwards -- moving toward +Z while its front faces -Z.
      model.rotation.y = Math.PI;
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      rig.group.add(model);
      rig.customModel = model;

      if (gltf.animations && gltf.animations.length) {
        rig.mixer = new THREE.AnimationMixer(model);
        for (const [key, patterns] of Object.entries(ANIM_NAME_PATTERNS)) {
          const clip = gltf.animations.find((c) => patterns.some((p) => c.name.toLowerCase().includes(p)));
          if (clip) {
            const action = rig.mixer.clipAction(clip);
            action.play();
            action.setEffectiveWeight(0);
            rig.actions[key] = action;
          }
        }
        const first = rig.actions.idle || Object.values(rig.actions)[0];
        if (first) { first.setEffectiveWeight(1); rig.activeAction = first; }
        console.info(`[characterRig] loaded ${PLAYER_MODEL_PATH} with animations: ${Object.keys(rig.actions).join(', ') || '(none matched idle/walk/run)'}`);
      } else {
        console.info(`[characterRig] loaded ${PLAYER_MODEL_PATH} (no embedded animations -- model will translate/rotate but won't animate limbs)`);
      }
    },
    undefined,
    () => {
      // expected default state: no file has been placed at PLAYER_MODEL_PATH
      // yet, so keep using the procedural rig -- this is not an error
    }
  );
}

const CROSSFADE_DURATION = 0.2;
function clampTimeScale(v) { return Math.max(0.5, Math.min(v, 1.8)); }

// crossfades between matched animation clips on the loaded custom model
// (true crossFadeTo blending, not an instant weight swap), with playback
// rate synced to actual movement speed so a walk/run cycle authored at one
// reference pace doesn't visibly foot-slide when the character is moving
// faster or slower than that pace. Falls back to the original procedural
// limb-swing math when no custom model (or no matching clips) is loaded.
export function applyLocomotionSwing(character, phase, speed, walkSpeed, runSpeed, dt = 0) {
  if (character.mixer) {
    const absSpeed = Math.abs(speed);
    const key = absSpeed > runSpeed * 0.75 ? 'run' : absSpeed > 0.15 ? 'walk' : 'idle';
    const next = character.actions[key];
    if (next && character.activeAction !== next) {
      next.enabled = true;
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(1);
      next.time = 0;
      if (character.activeAction) character.activeAction.crossFadeTo(next, CROSSFADE_DURATION, true);
      else next.play();
      character.activeAction = next;
    }
    if (character.activeAction) {
      const refSpeed = key === 'run' ? runSpeed : key === 'walk' ? walkSpeed : 1;
      character.activeAction.setEffectiveTimeScale(key === 'idle' ? 1 : clampTimeScale(absSpeed / refSpeed));
    }
    character.mixer.update(dt);
    return;
  }
  // procedural fallback: phase already advances faster at higher speed (see
  // game.js's updateFoot), so a swing driven purely by phase keeps stride
  // cadence tied to pace -- this is the mechanism that keeps feet from
  // visibly sliding without needing full inverse-kinematics foot planting.
  const absSpeed = Math.abs(speed);
  const speedFactor = Math.max(0, Math.min(absSpeed / runSpeed, 1.35));
  const swing = Math.sin(phase) * 0.55 * speedFactor;
  character.legL.rotation.x = swing;
  character.legR.rotation.x = -swing;
  character.armL.rotation.x = -swing * 0.8;
  character.armR.rotation.x = swing * 0.8;
  // knees/elbows bend on the forward half of each stride, straighten on the
  // back half -- a flat sine would let the leg pass through the ground
  character.kneeL.rotation.x = Math.max(0, Math.sin(phase)) * 0.9 * speedFactor;
  character.kneeR.rotation.x = Math.max(0, -Math.sin(phase)) * 0.9 * speedFactor;
  character.elbowL.rotation.x = Math.max(0, Math.sin(phase + Math.PI)) * 0.5 * speedFactor;
  character.elbowR.rotation.x = Math.max(0, Math.sin(phase)) * 0.5 * speedFactor;

  // breathing: a slow, small chest rise even at a standstill, plus a
  // forward torso lean that grows with speed to sell momentum
  const breathe = Math.sin(phase * 0.18 + 1.7) * 0.012 * (1 - Math.min(speedFactor, 1));
  character.torso.scale.y = 1 + breathe;
  character.hips.rotation.x = damp(character.hips.rotation.x, speedFactor * 0.12, 6, dt);
  character.hips.position.y = 0.88 + Math.abs(Math.sin(phase)) * 0.015 * speedFactor;
}
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

// reparents the rig onto the motorcycle's seat socket with a seated pose.
// Note: the seated pose is procedural-rig-specific (it poses legL/legR/
// armL/armR directly) -- a loaded custom model will ride along positioned
// correctly but won't visually bend into a seated pose unless its own glTF
// animations include one matched by ANIM_NAME_PATTERNS.
export function seatOnMoto(scene, character, motoGroup) {
  scene.remove(character.group);
  motoGroup.add(character.group);
  character.group.position.set(0, 0.21, -0.35);
  character.group.rotation.set(0, 0, 0);
  character.legL.rotation.x = -0.9;
  character.legR.rotation.x = -0.9;
  character.kneeL.rotation.x = 1.4;
  character.kneeR.rotation.x = 1.4;
  character.armL.rotation.x = -0.35;
  character.armR.rotation.x = -0.35;
  character.elbowL.rotation.x = 0.5;
  character.elbowR.rotation.x = 0.5;
  character.hips.rotation.x = 0;
}

export function unseatFromMoto(scene, character, motoGroup, footYaw) {
  motoGroup.remove(character.group);
  scene.add(character.group);
  character.group.rotation.set(0, footYaw, 0);
  character.legL.rotation.x = 0;
  character.legR.rotation.x = 0;
  character.kneeL.rotation.x = 0;
  character.kneeR.rotation.x = 0;
  character.armL.rotation.x = 0;
  character.armR.rotation.x = 0;
  character.elbowL.rotation.x = 0;
  character.elbowR.rotation.x = 0;
}
