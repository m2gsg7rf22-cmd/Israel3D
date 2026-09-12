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

export function buildCharacter(THREE, scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#e0b28e', roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: '#2f5fa8', roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: '#33384a', roughness: 0.85 });

  const hips = new THREE.Group();
  hips.position.y = 0.9;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), shirt);
  torso.position.y = 0.34;
  torso.castShadow = true;
  hips.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skin);
  head.position.y = 0.72;
  head.castShadow = true;
  hips.add(head);

  function makeLimb(mat, len, x, side) {
    const pivot = new THREE.Group();
    pivot.position.set(x, side === 'leg' ? 0 : 0.58, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, len, 0.14), mat);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    hips.add(pivot);
    return pivot;
  }
  const legL = makeLimb(pants, 0.85, -0.11, 'leg');
  const legR = makeLimb(pants, 0.85, 0.11, 'leg');
  const armL = makeLimb(shirt, 0.6, -0.28, 'arm');
  const armR = makeLimb(shirt, 0.6, 0.28, 'arm');

  scene.add(group);
  const rig = {
    group, hips, legL, legR, armL, armR, shirtMat: shirt, pantsMat: pants,
    proceduralMeshes: [torso, head, ...[legL, legR, armL, armR].map((p) => p.children[0])],
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
  const speedFactor = Math.max(0, Math.min(Math.abs(speed) / runSpeed, 1.35));
  const swing = Math.sin(phase) * 0.55 * speedFactor;
  character.legL.rotation.x = swing;
  character.legR.rotation.x = -swing;
  character.armL.rotation.x = -swing * 0.8;
  character.armR.rotation.x = swing * 0.8;
}

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
  character.legL.rotation.x = -1.35;
  character.legR.rotation.x = -1.35;
  character.armL.rotation.x = -0.35;
  character.armR.rotation.x = -0.35;
}

export function unseatFromMoto(scene, character, motoGroup, footYaw) {
  motoGroup.remove(character.group);
  scene.add(character.group);
  character.group.rotation.set(0, footYaw, 0);
  character.legL.rotation.x = 0;
  character.legR.rotation.x = 0;
  character.armL.rotation.x = 0;
  character.armR.rotation.x = 0;
}
