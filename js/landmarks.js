// A single real-world showcase model dropped into the city as a landmark --
// not a replacement for the procedural buildings (this diorama is one fixed
// scene, not a modular building kit), but real downloaded 3D content beyond
// the player/car models. Uses the same load-with-fallback shape as those:
// if the file is ever missing, initLandmark just quietly does nothing rather
// than leaving a broken block (game.js reserves this block via skipBlocks
// regardless, so a missing landmark means an empty lot, not a hole in the
// street grid).
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/loaders/DRACOLoader.js';

const LANDMARK_PATH = '../assets/models/littlest-tokyo.glb';
const LANDMARK_SCALE = 0.055;
export const LANDMARK_X = 100;
export const LANDMARK_Z = 100;
const LANDMARK_HALF = 16; // coarse collision footprint after scaling (~30x30 source size)

let mixer = null;

export function initLandmark(scene, THREE) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('../vendor/libs/draco/gltf/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load(
    LANDMARK_PATH,
    (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(LANDMARK_SCALE);
      // the source diorama isn't centered on its own origin or sitting on
      // y=0, so measure its actual box post-scale and offset to fix both
      const box = new THREE.Box3().setFromObject(model);
      const centerX = (box.min.x + box.max.x) / 2;
      const centerZ = (box.min.z + box.max.z) / 2;
      model.position.set(LANDMARK_X - centerX, -box.min.y, LANDMARK_Z - centerZ);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(model);

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(gltf.animations[0]).play();
      }
      console.info('[landmarks] loaded', LANDMARK_PATH);
    },
    undefined,
    () => { /* optional decorative landmark -- the reserved block is just empty without it */ }
  );
}

export function updateLandmark(dt) {
  if (mixer) mixer.update(dt);
}

export function getLandmarkAABB(block, cityHalf) {
  const bx = Math.round((LANDMARK_X + cityHalf) / block - 0.5);
  const bz = Math.round((LANDMARK_Z + cityHalf) / block - 0.5);
  return { minX: LANDMARK_X - LANDMARK_HALF, maxX: LANDMARK_X + LANDMARK_HALF, minZ: LANDMARK_Z - LANDMARK_HALF, maxZ: LANDMARK_Z + LANDMARK_HALF, bx, bz };
}
