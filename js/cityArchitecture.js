import { spawnDebrisBurst } from './props.js';

export const DISTRICTS = {
  downtown: { name: 'Downtown Core', lotColor: '#8a8f96', bodyColor: '#4b6785', shop: 0.25, floors: [8, 18], hillside: false },
  harbor: { name: 'Harbor Row', lotColor: '#7d9098', bodyColor: '#3f7d82', shop: 0.55, floors: [2, 5], hillside: false },
  oldquarter: { name: 'Old Quarter', lotColor: '#9c8a72', bodyColor: '#8a5a44', shop: 0.6, floors: [3, 6], hillside: false },
  hillside: { name: 'Hillside Heights', lotColor: '#4f8f52', bodyColor: '#c9b896', shop: 0.05, floors: [1, 2], hillside: true },
};

// height-scale variety requested alongside floor-count variety, applied on
// top of it rather than instead of it, without changing ground footprints
const HEIGHT_MULTIPLIERS = [0.93, 1.04, 1.12];

// shared geometries for small rooftop/shop decorations: every building used
// to allocate its own copy of these (identical dimensions every time), which
// wasted memory and GPU buffer uploads at city scale -- one instance per
// shape, reused across every building via .clone()-free shared references
let sharedGeo = null;
function getSharedGeo(THREE) {
  if (sharedGeo) return sharedGeo;
  sharedGeo = {
    hvacSmall: new THREE.BoxGeometry(0.6, 0.4, 0.6),
    antenna: new THREE.CylinderGeometry(0.04, 0.06, 2.4, 6),
    towerLeg: new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6),
    tank: new THREE.CylinderGeometry(0.9, 0.9, 1.1, 10),
    tankCap: new THREE.ConeGeometry(1.0, 0.5, 10),
    hvacUnit: new THREE.BoxGeometry(0.8, 0.5, 0.8),
    escLanding: new THREE.BoxGeometry(0.9, 0.06, 0.5),
    awning: new THREE.BoxGeometry(1, 0.35, 1.4),
  };
  return sharedGeo;
}

const SHOP_NAMES = ['Blue Fig Cafe', 'Meridian Books', 'Harbor Market', 'The Rivet', 'Old Quarter Deli', 'Salt & Pine', 'Quay Flowers', 'Northline Music', "Cassie's Diner", 'Bay Cycles'];

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function districtOf(bx, bz, grid) {
  const half = grid / 2;
  if (bx < half && bz < half) return DISTRICTS.downtown;
  if (bx >= half && bz < half) return DISTRICTS.harbor;
  if (bx < half && bz >= half) return DISTRICTS.oldquarter;
  return DISTRICTS.hillside;
}

function buildCityTexture(THREE, opts) {
  const { grid, block, streetW, lot, cityHalf, citySeed, citySize } = opts;
  const px = 2048;
  const scale = px / citySize;
  const cnv = document.createElement('canvas');
  cnv.width = px; cnv.height = px;
  const g = cnv.getContext('2d');
  g.fillStyle = '#3a3d42';
  g.fillRect(0, 0, px, px);

  const grainRng = mulberry32(citySeed + 42);
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 6000; i++) {
    const gx = grainRng() * px, gz = grainRng() * px, gs = 1 + grainRng() * 2;
    g.fillRect(gx, gz, gs, gs);
  }

  for (let bx = 0; bx < grid; bx++) {
    for (let bz = 0; bz < grid; bz++) {
      const cx = (bx - grid / 2 + 0.5) * block;
      const cz = (bz - grid / 2 + 0.5) * block;
      const district = districtOf(bx, bz, grid);
      const sx = (cx + cityHalf - lot / 2) * scale;
      const sz = (cz + cityHalf - lot / 2) * scale;
      const sw = lot * scale;
      g.fillStyle = '#9a9a92';
      g.fillRect(sx - 2, sz - 2, sw + 4, sw + 4);
      g.fillStyle = district.lotColor;
      g.fillRect(sx, sz, sw, sw);
    }
  }

  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = Math.max(2, 0.14 * scale);
  g.setLineDash([1.8 * scale, 1.8 * scale]);
  for (let bx = 0; bx <= grid; bx++) {
    const x = (bx * block) * scale;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, px); g.stroke();
  }
  for (let bz = 0; bz <= grid; bz++) {
    const z = (bz * block) * scale;
    g.beginPath(); g.moveTo(0, z); g.lineTo(px, z); g.stroke();
  }
  g.setLineDash([]);

  g.fillStyle = 'rgba(255,255,255,0.55)';
  const crossW = (streetW - 2) * scale;
  const stripeLen = 0.6 * scale, stripeGap = 0.5 * scale, stripeThick = 0.35 * scale;
  const setback = streetW / 2 * scale + 1 * scale;
  for (let bx = 1; bx < grid; bx += 2) {
    for (let bz = 1; bz < grid; bz += 2) {
      const ix = bx * block * scale, iz = bz * block * scale;
      for (const dz of [-setback, setback]) {
        for (let s = -crossW / 2; s < crossW / 2; s += stripeLen + stripeGap) {
          g.fillRect(ix + s, iz + dz - stripeThick / 2, stripeLen, stripeThick);
        }
      }
      for (const dx of [-setback, setback]) {
        for (let s = -crossW / 2; s < crossW / 2; s += stripeLen + stripeGap) {
          g.fillRect(ix + dx - stripeThick / 2, iz + s, stripeThick, stripeLen);
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildWindowTexture(THREE, color, night) {
  const cnv = document.createElement('canvas');
  cnv.width = 64; cnv.height = 96;
  const g = cnv.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 96);
  g.fillStyle = night;
  for (let y = 6; y < 96; y += 14) {
    for (let x = 4; x < 64; x += 12) {
      g.fillRect(x, y, 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function initCityArchitecture(scene, THREE, opts) {
  const { grid, block, streetW, lot, cityHalf, citySeed, skipBlocks = [] } = opts;
  const skipSet = new Set(skipBlocks.map(b => `${b.bx},${b.bz}`));
  const citySize = grid * block;

  const groundGeo = new THREE.PlaneGeometry(citySize, citySize);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    map: buildCityTexture(THREE, { grid, block, streetW, lot, cityHalf, citySeed, citySize }),
    roughness: 0.95, metalness: 0.02,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const buildingMaterialsByDistrict = {};
  function baseMaterialFor(district, floors) {
    const key = district.name;
    if (!buildingMaterialsByDistrict[key]) {
      const tex = buildWindowTexture(THREE, district.bodyColor, '#ffdb8a');
      tex.repeat.set(2, Math.max(1, floors));
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1, emissive: '#ffb35c', emissiveMap: tex, emissiveIntensity: 0 });
      buildingMaterialsByDistrict[key] = mat;
    }
    return buildingMaterialsByDistrict[key];
  }
  // per-building material clones (for color-tint variety); tracked so the
  // day/night loop can drive emissive intensity on every one of them
  const buildingMaterials = [];
  function variedMaterialFor(district, floors, rng) {
    const mat = baseMaterialFor(district, floors).clone();
    const hueJitter = (rng() - 0.5) * 0.05;
    const lightJitter = (rng() - 0.5) * 0.1;
    mat.color.offsetHSL(hueJitter, 0, lightJitter);
    buildingMaterials.push(mat);
    return mat;
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const buildingAABBs = [];
  const shopSigns = [];
  const nightLights = [];
  const pois = [];
  const awningMatShared = new THREE.MeshStandardMaterial({ color: '#c94f4f', roughness: 0.7 });

  const hvacMatShared = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.7 });
  const antennaMatShared = new THREE.MeshStandardMaterial({ color: '#333' });
  const towerLegMatShared = new THREE.MeshStandardMaterial({ color: '#3a3a3a' });
  const tankMatShared = new THREE.MeshStandardMaterial({ color: '#6b4a35', roughness: 0.85 });
  const tankCapMatShared = new THREE.MeshStandardMaterial({ color: '#4a3527' });
  const hvacUnitMatShared = new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.6, metalness: 0.3 });
  const escMatShared = new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.6, roughness: 0.5 });

  function addRooftopAccents(group, rng, district, w, d, height, floorH) {
    const geo = getSharedGeo(THREE);
    const roll = rng();
    if (district.hillside) {
      // small rooftop accents: skip shadow-casting on them -- visually
      // negligible shadow contribution, but each castShadow mesh is an
      // extra draw call in the shadow pass, multiplied by every building
      const hvac = new THREE.Mesh(geo.hvacSmall, hvacMatShared);
      hvac.position.set(w * 0.2, height + 0.2, d * 0.15);
      group.add(hvac);
      return;
    }
    if (roll < 0.3) {
      // antenna mast
      const antenna = new THREE.Mesh(geo.antenna, antennaMatShared);
      antenna.position.set(0, height + 1.2, 0);
      group.add(antenna);
    } else if (roll < 0.55) {
      // rooftop water tower (cylinder tank + cone cap on stilts)
      for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const leg = new THREE.Mesh(geo.towerLeg, towerLegMatShared);
        leg.position.set(lx, height + 0.6, lz);
        group.add(leg);
      }
      const tank = new THREE.Mesh(geo.tank, tankMatShared);
      tank.position.set(0, height + 1.75, 0);
      group.add(tank);
      const cap = new THREE.Mesh(geo.tankCap, tankCapMatShared);
      cap.position.set(0, height + 2.55, 0);
      group.add(cap);
    } else if (roll < 0.8) {
      // HVAC unit cluster
      for (let i = 0; i < 2; i++) {
        const hvac = new THREE.Mesh(geo.hvacUnit, hvacUnitMatShared);
        hvac.position.set((i - 0.5) * w * 0.3, height + 0.25, d * 0.2);
        group.add(hvac);
      }
    }
    // fire escape: a zigzag of small landings down one side, on mid-rise blocks
    if ((district === DISTRICTS.oldquarter || district === DISTRICTS.harbor) && rng() < 0.4 && height > floorH * 2) {
      const flights = Math.min(6, Math.floor(height / floorH));
      for (let f = 0; f < flights; f++) {
        const landing = new THREE.Mesh(geo.escLanding, escMatShared);
        landing.position.set(w / 2 + 0.45, (f + 0.5) * floorH, (f % 2 === 0 ? -0.3 : 0.3));
        group.add(landing);
      }
    }
  }

  function addBuilding(bx, bz, overrides) {
    if (!overrides && skipSet.has(`${bx},${bz}`)) return null; // reserved for a park or other feature
    const district = districtOf(bx, bz, grid);
    const cx = (bx - grid / 2 + 0.5) * block;
    const cz = (bz - grid / 2 + 0.5) * block;
    const rng = mulberry32(citySeed + bx * 1000 + bz * 7 + 3);

    if (!overrides && rng() < 0.08) return null; // open plaza / park

    const floors = overrides?.floors ?? Math.round(district.floors[0] + rng() * (district.floors[1] - district.floors[0]));
    const floorH = district.hillside ? 2.9 : 3.25;
    const heightMul = overrides?.floors ? 1 : HEIGHT_MULTIPLIERS[Math.floor(rng() * HEIGHT_MULTIPLIERS.length)];
    const height = floors * floorH * heightMul;
    const w = lot * (0.6 + rng() * 0.32);
    const d = lot * (0.6 + rng() * 0.32);

    const group = new THREE.Group();
    group.position.set(cx, 0, cz);

    const body = new THREE.Mesh(unitBox, variedMaterialFor(district, floors, rng));
    body.scale.set(w, height, d);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    if (district.hillside) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, floorH * 1.1, 4), new THREE.MeshStandardMaterial({ color: '#7a4a3a', roughness: 0.9 }));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = height + floorH * 0.45;
      roof.castShadow = true;
      group.add(roof);
    }

    addRooftopAccents(group, rng, district, w, d, height, floorH);

    const isShop = overrides?.shop ?? (rng() < district.shop);
    if (isShop) {
      const geo = getSharedGeo(THREE);
      const awning = new THREE.Mesh(geo.awning, awningMatShared);
      awning.scale.set(w * 0.9, 1, 1);
      awning.position.set(0, floorH * 0.78, d / 2 + 0.6);
      group.add(awning);

      const name = overrides?.name ?? SHOP_NAMES[Math.floor(rng() * SHOP_NAMES.length)];
      const signCnv = document.createElement('canvas');
      signCnv.width = 256; signCnv.height = 64;
      const sg = signCnv.getContext('2d');
      sg.fillStyle = '#12141a'; sg.fillRect(0, 0, 256, 64);
      sg.fillStyle = '#ffce94'; sg.font = 'bold 28px Arial'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
      sg.fillText(name, 128, 34);
      const signTex = new THREE.CanvasTexture(signCnv);
      signTex.colorSpace = THREE.SRGBColorSpace;
      const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffce94', emissiveMap: signTex, emissiveIntensity: 0 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, 0.9), signMat);
      sign.position.set(0, floorH * 0.55, d / 2 + 0.05);
      group.add(sign);
      shopSigns.push(signMat);
      if (overrides?.name) pois.push({ name, kind: overrides.poiKind || 'shop', x: cx, z: cz });

      const lamp = new THREE.PointLight('#ffce94', 0, 8);
      lamp.position.set(0, 2.2, d / 2 + 1.2);
      group.add(lamp);
      lamp.__base = 10;
      nightLights.push(lamp);
    }

    scene.add(group);
    buildingAABBs.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, bx, bz });
    return group;
  }

  for (let bx = 0; bx < grid; bx++) {
    for (let bz = 0; bz < grid; bz++) {
      addBuilding(bx, bz);
    }
  }

  // two landmarks so navigation has recognizable anchors
  addBuilding(2, 2, { floors: 26, shop: false });
  {
    const tower = buildingAABBs[buildingAABBs.length - 1];
    const beacon = new THREE.PointLight('#ff5050', 0, 20);
    beacon.position.set((tower.minX + tower.maxX) / 2, 26 * 3.25 + 1.5, (tower.minZ + tower.maxZ) / 2);
    scene.add(beacon);
    beacon.__base = 2.2;
    nightLights.push(beacon);
  }
  addBuilding(9, 2, { floors: 4, shop: true });

  // named points of interest: distinct, findable shops scattered across the
  // city (rather than the anonymous random-named shops every other building
  // may get), so the map has real destinations to show tooltips for
  const namedPOIs = [
    { bx: 1, bz: 10, name: 'Garage Motors — מוסך ומכוניות', poiKind: 'garage' },
    { bx: 10, bz: 1, name: "Iron Gym — חדר כושר", poiKind: 'gym' },
    { bx: 6, bz: 10, name: 'Bay Cycles — חנות אופנועים', poiKind: 'bikes' },
    { bx: 10, bz: 10, name: 'Meridian Outfitters — ביגוד', poiKind: 'clothes' },
    { bx: 1, bz: 1, name: "Cassie's Diner — מסעדה", poiKind: 'food' },
    { bx: 5, bz: 0, name: 'Northline Guns — חנות נשק', poiKind: 'guns' },
  ];
  for (const p of namedPOIs) {
    if (skipSet.has(`${p.bx},${p.bz}`)) continue;
    addBuilding(p.bx, p.bz, { shop: true, name: p.name, poiKind: p.poiKind, floors: 3 });
  }

  // street lamps at a subset of intersections (hit-reactive: tip over + fade when rammed)
  const lampGeo = new THREE.CylinderGeometry(0.08, 0.08, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#333' });
  const bulbGeo = new THREE.SphereGeometry(0.18, 8, 8);
  const lampPoles = [];
  for (let bx = 1; bx < grid; bx += 2) {
    for (let bz = 1; bz < grid; bz += 2) {
      const x = bx * block - cityHalf;
      const z = bz * block - cityHalf;
      const poleGroup = new THREE.Group();
      poleGroup.position.set(x, 0, z);
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(0, 4, 0);
      pole.castShadow = true;
      poleGroup.add(pole);
      const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff0d6', emissive: '#fff0d6', emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0, 8, 0);
      poleGroup.add(bulb);
      scene.add(poleGroup);
      const light = new THREE.PointLight('#fff0d6', 0, 22, 2);
      light.position.set(x, 7.6, z);
      scene.add(light);
      light.__base = 1.4;
      nightLights.push(light);
      shopSigns.push(bulbMat);
      lampPoles.push({ x, z, group: poleGroup, light, broken: false, alive: true, tilt: 0, fadeTimer: 0 });
    }
  }

  function hitLampPoles(x, z, speed) {
    if (Math.abs(speed) * 3.6 < 10) return false;
    let hitAny = false;
    for (const p of lampPoles) {
      if (!p.alive || p.broken) continue;
      if (Math.hypot(p.x - x, p.z - z) > 0.9) continue;
      p.broken = true;
      p.fadeTimer = 2.5;
      spawnDebrisBurst(p.x, 3, p.z, '#333333', 10);
      const idx = nightLights.indexOf(p.light);
      if (idx >= 0) nightLights.splice(idx, 1);
      hitAny = true;
    }
    return hitAny;
  }

  function updateLampPoles(dt) {
    for (const p of lampPoles) {
      if (!p.broken || !p.alive) continue;
      p.tilt = Math.min(p.tilt + dt * 3, Math.PI / 2.2);
      p.group.rotation.z = p.tilt;
      p.fadeTimer -= dt;
      p.light.intensity *= (1 - dt * 2);
      if (p.fadeTimer <= 0) { p.alive = false; p.group.visible = false; p.light.intensity = 0; }
    }
  }

  return {
    ground, buildingAABBs, lampPoles, nightLights, shopSigns, pois,
    buildingMaterials, hitLampPoles, updateLampPoles,
  };
}
