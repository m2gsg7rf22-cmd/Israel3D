function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// procedural tree: a trunk + layered, jittered foliage clumps rather than one
// solid sphere, batched via InstancedMesh so tree count barely costs draw calls
function buildTreeBatch(scene, THREE, positions) {
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.18, 2.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4130', roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  trunks.castShadow = true;
  scene.add(trunks);

  const foliageGeo = new THREE.SphereGeometry(1, 7, 6);
  const foliageMat = new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.9 });
  const foliageLayers = 3;
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, positions.length * foliageLayers);
  foliage.castShadow = true;
  scene.add(foliage);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const posV = new THREE.Vector3();
  const scaleV = new THREE.Vector3();
  const rng = mulberry32(9911);
  let foliageIdx = 0;
  positions.forEach((p, i) => {
    const treeH = 3.6 + rng() * 1.8;
    const trunkScale = treeH / 2.2;
    posV.set(p.x, treeH * 0.24, p.z);
    scaleV.set(1, trunkScale, 1);
    m.compose(posV, q, scaleV);
    trunks.setMatrixAt(i, m);

    for (let l = 0; l < foliageLayers; l++) {
      const fy = treeH * 0.5 + l * (treeH * 0.22);
      const fr = (1.1 - l * 0.18) * (0.85 + rng() * 0.3);
      posV.set(p.x + (rng() - 0.5) * 0.3, fy, p.z + (rng() - 0.5) * 0.3);
      scaleV.set(fr, fr * 0.85, fr);
      m.compose(posV, q, scaleV);
      foliage.setMatrixAt(foliageIdx++, m);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  return { trunks, foliage };
}

function buildStreetTrees(scene, THREE, opts) {
  const { grid, block, lot, citySeed } = opts;
  const treeRng = mulberry32(citySeed + 7777);
  const candidates = [];
  for (let bx = 0; bx < grid; bx++) {
    for (let bz = 0; bz < grid; bz++) {
      if (treeRng() < 0.55) candidates.push({ bx, bz });
    }
  }
  const r = lot / 2 + 3.0;
  const positions = candidates.map(b => {
    const c = { x: (b.bx - grid / 2 + 0.5) * block, z: (b.bz - grid / 2 + 0.5) * block };
    const corner = Math.floor(treeRng() * 4);
    return { x: c.x + (corner % 2 === 0 ? -r : r), z: c.z + (corner < 2 ? -r : r) };
  });
  return buildTreeBatch(scene, THREE, positions);
}

// Central Park: a grass plaza dropped into one downtown block, with a paved
// cross-path, benches, flower-bed rings, and its own denser tree cluster
function buildCentralPark(scene, THREE, opts) {
  const { grid, block, lot } = opts;
  // occupies the block just south-east of the two landmark buildings so it
  // reads as a break in the skyline rather than colliding with them
  const bx = 4, bz = 4;
  const cx = (bx - grid / 2 + 0.5) * block;
  const cz = (bz - grid / 2 + 0.5) * block;
  const half = lot / 2;

  const grassMat = new THREE.MeshStandardMaterial({ color: '#4f9450', roughness: 0.95 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(lot, lot), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0.02, cz);
  grass.receiveShadow = true;
  scene.add(grass);

  const pathMat = new THREE.MeshStandardMaterial({ color: '#c9c2ad', roughness: 0.9 });
  const pathNS = new THREE.Mesh(new THREE.PlaneGeometry(2.2, lot), pathMat);
  pathNS.rotation.x = -Math.PI / 2;
  pathNS.position.set(cx, 0.03, cz);
  scene.add(pathNS);
  const pathEW = new THREE.Mesh(new THREE.PlaneGeometry(lot, 2.2), pathMat);
  pathEW.rotation.x = -Math.PI / 2;
  pathEW.position.set(cx, 0.03, cz);
  scene.add(pathEW);

  const flowerColors = ['#e0507a', '#f2c14e', '#7d5ba6', '#e0e0e0'];
  const flowerMat = flowerColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const bedGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 12);
  const flowerGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const bedPositions = [[-half * 0.5, -half * 0.5], [half * 0.5, -half * 0.5], [-half * 0.5, half * 0.5], [half * 0.5, half * 0.5]];
  for (let i = 0; i < bedPositions.length; i++) {
    const [ox, oz] = bedPositions[i];
    const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: '#6b5842', roughness: 0.9 }));
    bed.position.set(cx + ox, 0.08, cz + oz);
    scene.add(bed);
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const flower = new THREE.Mesh(flowerGeo, flowerMat[i % flowerMat.length]);
      flower.position.set(cx + ox + Math.cos(ang) * 0.8, 0.22, cz + oz + Math.sin(ang) * 0.8);
      scene.add(flower);
    }
  }

  const benchMat = new THREE.MeshStandardMaterial({ color: '#5a4130', roughness: 0.85 });
  const benchGeo = new THREE.BoxGeometry(1.2, 0.4, 0.4);
  for (const [ox, oz, ry] of [[-3, 0, 0], [3, 0, Math.PI], [0, -3, Math.PI / 2], [0, 3, -Math.PI / 2]]) {
    const bench = new THREE.Mesh(benchGeo, benchMat);
    bench.position.set(cx + ox, 0.2, cz + oz);
    bench.rotation.y = ry;
    bench.castShadow = true;
    scene.add(bench);
  }

  const clusterPositions = [];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const rad = half * 0.75;
    clusterPositions.push({ x: cx + Math.cos(ang) * rad, z: cz + Math.sin(ang) * rad });
  }
  buildTreeBatch(scene, THREE, clusterPositions);

  return { bounds: { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half } };
}

// Outskirts: a rolling-grass greenbelt ring beyond the city grid, with a
// handful of rocky mounds standing in for cliffside terrain and a simple
// perimeter loop road. Scoped down from a full coastal cliff/terrain system.
function buildOutskirts(scene, THREE, opts) {
  const { cityHalf } = opts;
  const outerHalf = cityHalf + 220;

  const grassMat = new THREE.MeshStandardMaterial({ color: '#5a8a4d', roughness: 1 });
  const ringGeo = new THREE.RingGeometry(cityHalf + 2, outerHalf, 48, 4);
  const ring = new THREE.Mesh(ringGeo, grassMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.05;
  ring.receiveShadow = true;
  scene.add(ring);

  // rolling hills: instanced low bumps scattered around the greenbelt
  const hillGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const hillMat = new THREE.MeshStandardMaterial({ color: '#6a9a55', roughness: 1 });
  const hillRng = mulberry32(4242);
  const hillCount = 40;
  const hills = new THREE.InstancedMesh(hillGeo, hillMat, hillCount);
  hills.receiveShadow = true;
  hills.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  for (let i = 0; i < hillCount; i++) {
    const ang = hillRng() * Math.PI * 2;
    const rad = cityHalf + 20 + hillRng() * (outerHalf - cityHalf - 40);
    const size = 8 + hillRng() * 18;
    pos.set(Math.cos(ang) * rad, -size * 0.3, Math.sin(ang) * rad);
    scl.set(size, size * 0.5, size);
    m.compose(pos, q, scl);
    hills.setMatrixAt(i, m);
  }
  hills.instanceMatrix.needsUpdate = true;
  scene.add(hills);

  // rocky cliffside outcrops nearer the "coast" edge (north side, +Z)
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.95, flatShading: true });
  const rockCount = 24;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.castShadow = true;
  const rockRng = mulberry32(5151);
  for (let i = 0; i < rockCount; i++) {
    const t = i / rockCount;
    const x = -outerHalf + t * outerHalf * 2 + (rockRng() - 0.5) * 20;
    const z = outerHalf - 15 + (rockRng() - 0.5) * 15;
    const size = 3 + rockRng() * 5;
    pos.set(x, size * 0.3, z);
    q.setFromEuler(new THREE.Euler(rockRng() * Math.PI, rockRng() * Math.PI, rockRng() * Math.PI));
    scl.set(size, size, size);
    m.compose(pos, q, scl);
    rocks.setMatrixAt(i, m);
  }
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);

  // simple coastal perimeter road loop, flush with the ring
  const roadMat = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.9 });
  const roadRadius = cityHalf + 12;
  const roadGeo = new THREE.RingGeometry(roadRadius - 4, roadRadius + 4, 64);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  road.receiveShadow = true;
  scene.add(road);

  return { outerHalf, roadRadius };
}

export function initNature(scene, THREE, opts) {
  const trees = buildStreetTrees(scene, THREE, opts);
  const park = buildCentralPark(scene, THREE, opts);
  const outskirts = buildOutskirts(scene, THREE, opts);
  return { trees, park, outskirts };
}
