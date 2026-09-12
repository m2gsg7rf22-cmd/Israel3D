// Player Safehouse & Real Estate: three ownable properties dropped at clear
// street intersections (same placement convention missions.js/props.js use --
// both coordinates a multiple of the 40m block pitch, which always lands on
// the ~10m clear intersection rather than inside a building lot). Tier 1 is
// owned from the start; tiers 2-3 show a red "for sale" beacon until bought
// (press F while on foot nearby, same contextual-interact key used to enter
// vehicles), at which point it flips to the owned-green beacon and gains its
// own wardrobe/save-point rings.
import { getSave, saveState } from './saveSystem.js';

const PROPERTIES = [
  { tier: 1, price: 0, label: 'הדירה בפאונדרי', x: 200, z: 200, yaw: Math.PI },
  { tier: 2, price: 150000, label: 'הפנטהאוז המפואר', x: -200, z: 160, yaw: 0 },
  { tier: 3, price: 500000, label: 'הווילה על החוף', x: 0, z: 200, yaw: Math.PI },
];
const INTERACT_RANGE = 4.5;
const RING_RADIUS = 2.2;
const OWNED_COLOR = '#3fae5c';
const SALE_COLOR = '#ff5f5f';

let THREE_;
const houses = [];
let getScore_, spendCash_, showMessage_, openWardrobe_, getPlayerState_;

function isOwned(tier) { return getSave().ownedTiers.includes(tier); }

function buildHouse(scene, THREE, def) {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  group.rotation.y = def.yaw;
  scene.add(group);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#7a6a58', roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), wallMat);
  body.position.y = 2;
  body.castShadow = true;
  group.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4), roofMat);
  roof.position.y = 5.1;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const beaconGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16);
  const beaconMat = new THREE.MeshStandardMaterial({ color: SALE_COLOR, emissive: SALE_COLOR, emissiveIntensity: 1.6, transparent: true, opacity: 0.8 });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0, 0.1, -5);
  group.add(beacon);
  const beam = new THREE.PointLight(SALE_COLOR, 2.2, 10);
  beam.position.set(0, 2, -5);
  group.add(beam);

  const ringGeo = new THREE.RingGeometry(RING_RADIUS - 0.25, RING_RADIUS, 24);
  const wardrobeRing = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: '#43c6ff', emissive: '#43c6ff', emissiveIntensity: 1.2, transparent: true, opacity: 0.7 }));
  wardrobeRing.rotation.x = -Math.PI / 2;
  wardrobeRing.position.set(-3.5, 0.05, 3.5);
  wardrobeRing.visible = false;
  group.add(wardrobeRing);
  const saveRing = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffd23f', emissiveIntensity: 1.2, transparent: true, opacity: 0.7 }));
  saveRing.rotation.x = -Math.PI / 2;
  saveRing.position.set(3.5, 0.05, 3.5);
  saveRing.visible = false;
  group.add(saveRing);

  return { def, group, beacon, beaconMat, beam, wardrobeRing, saveRing, insideWardrobe: false, insideSave: false };
}

function refreshVisual(h) {
  const owned = isOwned(h.def.tier);
  const color = owned ? OWNED_COLOR : SALE_COLOR;
  h.beaconMat.color.set(color);
  h.beaconMat.emissive.set(color);
  h.beam.color.set(color);
  h.wardrobeRing.visible = owned;
  h.saveRing.visible = owned;
}

export function initSafehouse(scene, THREE, callbacks) {
  THREE_ = THREE;
  getScore_ = callbacks.getScore;
  spendCash_ = callbacks.spendCash;
  showMessage_ = callbacks.showMessage;
  openWardrobe_ = callbacks.openWardrobe;
  getPlayerState_ = callbacks.getPlayerState;

  for (const def of PROPERTIES) {
    const h = buildHouse(scene, THREE, def);
    refreshVisual(h);
    houses.push(h);
  }
}

export function updateSafehouse(dt, footX, footZ, isFootMode) {
  const pulse = 0.6 + Math.sin(performance.now() * 0.004) * 0.4;
  for (const h of houses) h.beaconMat.emissiveIntensity = 1.2 + pulse;

  // ring world positions depend on house yaw; recomputed per-house each
  // frame -- cheap, there are only 3 houses
  for (const h of houses) {
    if (!isFootMode || !isOwned(h.def.tier)) continue;
    const cos = Math.cos(h.def.yaw), sin = Math.sin(h.def.yaw);
    const toWorld = (lx, lz) => ({ x: h.def.x + lx * cos + lz * sin, z: h.def.z - lx * sin + lz * cos });
    const wardrobeWorld = toWorld(h.wardrobeRing.position.x, h.wardrobeRing.position.z);
    const saveWorld = toWorld(h.saveRing.position.x, h.saveRing.position.z);

    const dW = Math.hypot(footX - wardrobeWorld.x, footZ - wardrobeWorld.z);
    const inW = dW < RING_RADIUS;
    if (inW && !h.insideWardrobe) openWardrobe_();
    h.insideWardrobe = inW;

    const dS = Math.hypot(footX - saveWorld.x, footZ - saveWorld.z);
    const inS = dS < RING_RADIUS;
    if (inS && !h.insideSave) hardSave(h);
    h.insideSave = inS;
  }
}

function hardSave(h) {
  const p = getPlayerState_();
  saveState({ cash: getScore_(), lastLocation: { mode: p.mode, x: p.x, z: p.z, yaw: p.yaw } });
  showMessage_(`💾 המשחק נשמר — ${h.def.label}`);
}

// called from game.js's F-press handler only when it wasn't consumed by
// entering/exiting a vehicle, so buying never fights with that binding
export function trySafehousePurchase(footX, footZ) {
  for (const h of houses) {
    if (isOwned(h.def.tier)) continue;
    const beaconWorld = { x: h.def.x + Math.sin(h.def.yaw) * -5, z: h.def.z + Math.cos(h.def.yaw) * -5 };
    const d = Math.hypot(footX - beaconWorld.x, footZ - beaconWorld.z);
    if (d > INTERACT_RANGE) continue;
    if (spendCash_(h.def.price)) {
      const save = getSave();
      saveState({ ownedTiers: [...save.ownedTiers, h.def.tier] });
      refreshVisual(h);
      showMessage_(`🏠 נרכש בהצלחה: ${h.def.label}!`);
    } else {
      showMessage_(`אין מספיק כסף — נדרש ₪${h.def.price}`);
    }
    return true;
  }
  return false;
}

export function setActiveVehicle(which) { saveState({ activeVehicle: which }); }

// highest-tier owned property: arrival spot for the player plus a separate
// driveway spot (a few meters to the side) where their other saved vehicle
// gets parked -- both offset from the house body so nobody spawns in a wall
export function getHomeLocation() {
  const owned = getSave().ownedTiers;
  const best = houses.reduce((a, b) => (owned.includes(b.def.tier) && b.def.tier > a.def.tier ? b : a), houses[0]);
  const cos = Math.cos(best.def.yaw), sin = Math.sin(best.def.yaw);
  const toWorld = (lx, lz) => ({ x: best.def.x + lx * cos + lz * sin, z: best.def.z - lx * sin + lz * cos });
  const arrival = toWorld(0, -7);
  const garage = toWorld(6, -6);
  return { x: arrival.x, z: arrival.z, yaw: best.def.yaw, gx: garage.x, gz: garage.z, label: best.def.label, tier: best.def.tier };
}
