import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { SpatialGrid } from "./SpatialGrid";
import { createWindowMaterial } from "./WindowShaderMaterial";
import {
  makeAsphaltTexture,
  makeRoadLaneTexture,
  makeCrosswalkTexture,
  makeBrickTexture,
  makeCobblestoneTexture,
  makeConcreteTexture,
} from "./proceduralTextures";
export const ROAD_HALF_WIDTH = 13; // 26m wide avenues
export const CURB_OFFSET = 17.45; // sidewalk curb offset from road centerline
export const BLOCK_SIZE = 46;
export const CELL_PITCH = BLOCK_SIZE + ROAD_HALF_WIDTH * 2; // 72
export const CITY_BLOCKS = 5;
export const CITY_HALF = (CITY_BLOCKS * CELL_PITCH) / 2;

type District = "financial" | "commercial" | "waterfront";

export interface StreetLight {
  position: THREE.Vector3;
}

export interface SpawnPoints {
  player: THREE.Vector3;
  car: THREE.Vector3;
  bike: THREE.Vector3;
}

export class CityBuilder {
  scene: THREE.Scene;
  grid = new SpatialGrid(20);
  streetLights: StreetLight[] = [];
  windowMaterials: THREE.ShaderMaterial[] = [];
  spawnPoints: SpawnPoints = {
    player: new THREE.Vector3(0, 0, 20),
    car: new THREE.Vector3(8, 0, 20),
    bike: new THREE.Vector3(-8, 0, 20),
  };
  waterZ = 0;
  hasWater = false;

  private asphaltTex = makeAsphaltTexture();
  private laneTex = makeRoadLaneTexture();
  private crosswalkTex = makeCrosswalkTexture();
  private cobbleTex = makeCobblestoneTexture();
  private concreteTex = makeConcreteTexture();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private districtForRow(bz: number): District {
    if (bz <= 1) return "financial";
    if (bz <= 3) return "commercial";
    return "waterfront";
  }

  build() {
    this.buildGround();
    this.buildRoadNetwork();

    const halfBlocks = (CITY_BLOCKS - 1) / 2;
    const towers: { pos: THREE.Vector3; height: number }[] = [];

    for (let bx = 0; bx < CITY_BLOCKS; bx++) {
      for (let bz = 0; bz < CITY_BLOCKS; bz++) {
        const cx = (bx - halfBlocks) * CELL_PITCH;
        const cz = (bz - halfBlocks) * CELL_PITCH;
        const district = this.districtForRow(bz);

        if (bx === Math.floor(CITY_BLOCKS / 2) && bz === Math.floor(CITY_BLOCKS / 2)) {
          // Keep center block as a plaza spawn area — no building.
          this.buildPlaza(cx, cz);
          continue;
        }

        if (district === "financial") {
          const h = this.buildFinancialBlock(cx, cz);
          towers.push({ pos: new THREE.Vector3(cx, 0, cz), height: h });
        } else if (district === "commercial") {
          this.buildCommercialBlock(cx, cz);
        } else {
          this.buildResidentialBlock(cx, cz, bz);
        }
      }
    }

    // Skybridges between adjacent financial towers.
    for (let i = 0; i < towers.length - 1; i++) {
      const a = towers[i];
      const b = towers[i + 1];
      if (a.pos.distanceTo(b.pos) < CELL_PITCH * 1.2 && Math.random() > 0.4) {
        this.buildSkybridge(a.pos, b.pos, Math.min(a.height, b.height) * 0.6);
      }
    }

    this.buildStreetLights();
  }

  // ---------------------------------------------------------------- Ground

  private buildGround() {
    const size = CITY_HALF * 2 + 40;
    const groundGeo = new THREE.PlaneGeometry(size, size);
    const asphalt = this.asphaltTex.clone();
    asphalt.needsUpdate = true;
    asphalt.repeat.set(size / 8, size / 8);
    // MeshPhysicalMaterial's clearcoat gives a cheap "wet asphalt" sheen
    // without the cost of a second full-scene reflector render pass.
    const groundMat = new THREE.MeshPhysicalMaterial({
      map: asphalt,
      roughness: 0.85,
      metalness: 0.05,
      color: 0x555a5f,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.02;
    this.scene.add(ground);

    // Waterfront strip beyond the last residential row — a single low-res
    // planar reflector for the dynamic wet ocean surface (spec 4.C).
    const waterZ = CITY_HALF + 20;
    this.waterZ = waterZ;
    this.hasWater = true;
    const reflector = new Reflector(new THREE.PlaneGeometry(size, 90), {
      color: 0x0c2233,
      textureWidth: 256,
      textureHeight: 256,
      clipBias: 0.003,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, -0.01, waterZ + 45);
    this.scene.add(reflector);
  }

  private buildPlaza(cx: number, cz: number) {
    const size = BLOCK_SIZE - 6;
    const geo = new THREE.PlaneGeometry(size, size);
    const cobble = this.cobbleTex.clone();
    cobble.needsUpdate = true;
    cobble.repeat.set(size / 4, size / 4);
    const mat = new THREE.MeshStandardMaterial({ map: cobble, roughness: 1 });
    const plaza = new THREE.Mesh(geo, mat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(cx, 0.01, cz);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      this.buildBench(cx + Math.cos(angle) * 10, cz + Math.sin(angle) * 10, angle);
    }
    this.buildTree(cx + 6, cz + 6);
    this.buildTree(cx - 6, cz - 6);
    this.buildTree(cx + 6, cz - 6);
    this.buildTree(cx - 6, cz + 6);
  }

  // ------------------------------------------------------------ Road grid

  private buildRoadNetwork() {
    const extent = CITY_HALF + 20;
    for (let i = 0; i <= CITY_BLOCKS; i++) {
      const pos = (i - CITY_BLOCKS / 2) * CELL_PITCH;
      this.buildRoadStrip(pos, true, extent);
      this.buildRoadStrip(pos, false, extent);
    }
  }

  private buildRoadStrip(centerCoord: number, alongX: boolean, extent: number) {
    const width = ROAD_HALF_WIDTH * 2;
    const length = extent * 2;
    const geo = new THREE.PlaneGeometry(alongX ? length : width, alongX ? width : length);
    const lane = this.laneTex.clone();
    lane.needsUpdate = true;
    lane.repeat.set(alongX ? length / 16 : 1, alongX ? 1 : length / 16);
    if (!alongX) lane.rotation = Math.PI / 2;
    const mat = new THREE.MeshStandardMaterial({ map: lane, roughness: 0.85, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(alongX ? 0 : centerCoord, 0.015, alongX ? centerCoord : 0);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Concrete crash barriers along the road edge (used for vault detection).
    const barrierGeo = new THREE.BoxGeometry(alongX ? length : 0.6, 0.6, alongX ? 0.6 : length);
    const barrierMat = new THREE.MeshStandardMaterial({ map: this.concreteTex, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const offset = ROAD_HALF_WIDTH + 0.3;
      const bx = alongX ? 0 : centerCoord + side * offset;
      const bz = alongX ? centerCoord + side * offset : 0;
      const barrier = new THREE.Mesh(barrierGeo, barrierMat);
      barrier.position.set(bx, 0.3, bz);
      barrier.castShadow = true;
      this.scene.add(barrier);
    }

    // Crosswalks at every other intersection along this strip.
    const cwMat = new THREE.MeshStandardMaterial({ map: this.crosswalkTex });
    for (let i = -CITY_BLOCKS / 2; i <= CITY_BLOCKS / 2; i++) {
      const crossPos = i * CELL_PITCH;
      const cwGeo = new THREE.PlaneGeometry(alongX ? 6 : width - 2, alongX ? width - 2 : 6);
      const cw = new THREE.Mesh(cwGeo, cwMat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(alongX ? crossPos : centerCoord, 0.02, alongX ? centerCoord : crossPos);
      this.scene.add(cw);
    }
  }

  // -------------------------------------------------------------- Financial

  private buildFinancialBlock(cx: number, cz: number): number {
    const group = new THREE.Group();
    const footprint = BLOCK_SIZE - 10;
    const baseW = footprint * (0.55 + Math.random() * 0.25);
    const baseD = footprint * (0.55 + Math.random() * 0.25);
    const baseH = 26 + Math.random() * 14;
    const towerH = baseH + 30 + Math.random() * 70;
    const towerW = baseW * 0.66;
    const towerD = baseD * 0.66;

    const hue = 0.55 + Math.random() * 0.08;
    const glassColor = new THREE.Color().setHSL(hue, 0.35, 0.42);
    const windowMat = createWindowMaterial({ baseColor: glassColor, gridX: 4, gridY: 10, glow: 1.1 });
    this.windowMaterials.push(windowMat);

    const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), windowMat);
    base.position.y = baseH / 2;
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), windowMat);
    tower.position.y = baseH + towerH / 2;
    tower.castShadow = tower.receiveShadow = true;
    group.add(tower);

    // Roof props: HVAC units, antenna, occasional helipad.
    const roofY = baseH + towerH;
    const hvacMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.2), hvacMat);
      hvac.position.set((Math.random() - 0.5) * towerW * 0.5, roofY + 0.7, (Math.random() - 0.5) * towerD * 0.5);
      hvac.castShadow = true;
      group.add(hvac);
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 10, 6), hvacMat);
    antenna.position.set(0, roofY + 5, 0);
    group.add(antenna);

    if (Math.random() > 0.6) {
      const padGeo = new THREE.CircleGeometry(Math.min(towerW, towerD) * 0.3, 24);
      const padMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, emissive: 0xffcc55, emissiveIntensity: 0.15 });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = roofY + 0.02;
      group.add(pad);
    }

    group.position.set(cx + (Math.random() - 0.5) * 6, 0, cz + (Math.random() - 0.5) * 6);
    this.scene.add(group);

    this.grid.insert({
      minX: group.position.x - towerW / 2,
      maxX: group.position.x + towerW / 2,
      minZ: group.position.z - towerD / 2,
      maxZ: group.position.z + towerD / 2,
      minY: 0,
      maxY: roofY,
      isWall: true,
    });

    return roofY;
  }

  private buildSkybridge(a: THREE.Vector3, b: THREE.Vector3, height: number) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length() - 20;
    if (length < 6) return;
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const angle = Math.atan2(dir.z, dir.x);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x9fd3e8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(length, 3, 4), mat);
    bridge.position.set(mid.x, height, mid.z);
    bridge.rotation.y = -angle;
    bridge.castShadow = true;
    this.scene.add(bridge);
  }

  // ------------------------------------------------------------ Commercial

  private buildCommercialBlock(cx: number, cz: number) {
    const group = new THREE.Group();
    const w = BLOCK_SIZE - 12 + Math.random() * 4;
    const d = BLOCK_SIZE - 12 + Math.random() * 4;
    const h = 12 + Math.random() * 10;

    const windowMat = createWindowMaterial({ baseColor: new THREE.Color(0x2b3540), gridX: 6, gridY: 3, glow: 1.3 });
    this.windowMaterials.push(windowMat);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), windowMat);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    // Ground-floor shopfront awning with neon sign.
    const awningMat = new THREE.MeshStandardMaterial({ color: 0xaa2244, roughness: 0.6 });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.6, 2.4), awningMat);
    awning.position.set(0, 4, d / 2 + 1.2);
    awning.castShadow = true;
    group.add(awning);

    const neonColors = [0xff2b6d, 0x22e0ff, 0xffd23f, 0x7dff5c];
    const neonColor = neonColors[Math.floor(Math.random() * neonColors.length)];
    const neonMat = new THREE.MeshStandardMaterial({ color: neonColor, emissive: neonColor, emissiveIntensity: 2.2 });
    const neon = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 1.1, 0.3), neonMat);
    neon.position.set(0, 5.6, d / 2 + 1.3);
    group.add(neon);

    // Water tower on roof.
    if (Math.random() > 0.5) {
      const wtMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.8 });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 2.6, 8), wtMat);
      tank.position.set(w * 0.25, h + 3.4, -d * 0.2);
      const legsGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6);
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(legsGeo, wtMat);
        const a = (i / 4) * Math.PI * 2;
        leg.position.set(tank.position.x + Math.cos(a) * 1.1, h + 1.7, tank.position.z + Math.sin(a) * 1.1);
        group.add(leg);
      }
      group.add(tank);
    }

    // Fire escape (stacked horizontal bars on side facade).
    const escapeMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
    for (let level = 0; level < 3; level++) {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 1.2), escapeMat);
      platform.position.set(-w / 2 - 0.6, 3 + level * 3.2, -d / 4);
      group.add(platform);
    }

    // Alley dumpster.
    const dumpsterMat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.7 });
    const dumpster = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.2), dumpsterMat);
    dumpster.position.set(w / 2 + 1.5, 0.6, -d / 3);
    dumpster.castShadow = true;
    group.add(dumpster);

    group.position.set(cx, 0, cz);
    this.scene.add(group);

    this.grid.insert({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      minY: 0,
      maxY: h,
      isWall: true,
    });
    // Low vaultable obstacle: dumpster.
    this.grid.insert({
      minX: cx + w / 2 + 0.5,
      maxX: cx + w / 2 + 2.5,
      minZ: cz - d / 3 - 0.6,
      maxZ: cz - d / 3 + 0.6,
      minY: 0,
      maxY: 1.2,
      isWall: false,
    });

    this.buildTree(cx - w / 2 - 3, cz + d / 2 + 3);
    this.buildTrashCan(cx + w / 2 - 2, cz + d / 2 + 2);
  }

  // ---------------------------------------------------------- Residential

  private buildResidentialBlock(cx: number, cz: number, bz: number) {
    const isWaterfront = bz === CITY_BLOCKS - 1;
    const group = new THREE.Group();
    const w = BLOCK_SIZE - 14;
    const d = BLOCK_SIZE - 14;
    const h = 9 + Math.random() * 8;

    const brickTex = makeBrickTexture(Math.random() > 0.5 ? "#8a5a44" : "#7a4a3a");
    const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), brickMat);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    const windowMat = createWindowMaterial({ baseColor: new THREE.Color(0x3a2a20), gridX: 4, gridY: Math.max(2, Math.round(h / 3)), glow: 0.9 });
    this.windowMaterials.push(windowMat);
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.85), windowMat);
    facade.position.set(0, h / 2, d / 2 + 0.05);
    group.add(facade);

    // Balconies.
    const balconyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
    for (let level = 1; level < Math.floor(h / 3); level++) {
      const balcony = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.15, 1.1), balconyMat);
      balcony.position.set(-w * 0.2, level * 3, d / 2 + 0.6);
      group.add(balcony);
    }

    if (isWaterfront) {
      const craneMat = new THREE.MeshStandardMaterial({ color: 0xd88a2a, metalness: 0.4 });
      const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 6), craneMat);
      craneBase.position.set(w / 2 + 4, 6, d / 2 + 10);
      const craneArm = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 0.5), craneMat);
      craneArm.position.set(w / 2 + 4 + 6, 12, d / 2 + 10);
      group.add(craneBase, craneArm);

      const plazaTex = this.cobbleTex.clone();
      plazaTex.needsUpdate = true;
      plazaTex.repeat.set(6, 6);
      const dock = new THREE.Mesh(new THREE.PlaneGeometry(w + 10, 14), new THREE.MeshStandardMaterial({ map: plazaTex }));
      dock.rotation.x = -Math.PI / 2;
      dock.position.set(cx, 0.01, cz + d / 2 + 12);
      this.scene.add(dock);
    }

    group.position.set(cx, 0, cz);
    this.scene.add(group);

    this.grid.insert({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      minY: 0,
      maxY: h,
      isWall: true,
    });

    this.buildTree(cx - w / 2 - 2, cz - d / 2 - 2);
    this.buildBench(cx + w / 2 + 2, cz, Math.PI / 2);
  }

  // ------------------------------------------------------------- Props

  private buildTree(x: number, z: number) {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.2, 6), trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 });
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 8), leavesMat);
    leaves.position.y = 3.4;
    leaves.castShadow = true;
    group.add(trunk, leaves);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.grid.insert({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, minY: 0, maxY: 4.5, isWall: false });
  }

  private buildBench(x: number, z: number, rot: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.5), mat);
    bench.position.set(x, 0.25, z);
    bench.rotation.y = rot;
    bench.castShadow = true;
    this.scene.add(bench);
  }

  private buildTrashCan(x: number, z: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x336655, metalness: 0.3 });
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.7, 8), mat);
    can.position.set(x, 0.35, z);
    can.castShadow = true;
    this.scene.add(can);
    this.grid.insert({ minX: x - 0.32, maxX: x + 0.32, minZ: z - 0.32, maxZ: z + 0.32, minY: 0, maxY: 0.7, isWall: false });
  }

  private buildStreetLights() {
    const positions: THREE.Vector3[] = [];
    const spacing = CELL_PITCH;
    for (let i = -CITY_BLOCKS / 2; i <= CITY_BLOCKS / 2 && positions.length < 38; i++) {
      for (const side of [-1, 1]) {
        if (positions.length >= 38) break;
        const x = i * spacing;
        const z = CURB_OFFSET * side + (Math.floor(i) % 2 === 0 ? 6 : -6);
        positions.push(new THREE.Vector3(x, 0, z));
      }
    }
    while (positions.length < 38) {
      const i = Math.floor(Math.random() * CITY_BLOCKS - CITY_BLOCKS / 2);
      positions.push(new THREE.Vector3(i * spacing + (Math.random() - 0.5) * 10, 0, CURB_OFFSET * (Math.random() > 0.5 ? 1 : -1)));
    }

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffdca8, emissive: 0xffb35c, emissiveIntensity: 1.6 });
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffcf8f, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false });

    positions.slice(0, 38).forEach((pos, idx) => {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
      pole.position.y = 3;
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), poleMat);
      arm.position.set(0.7, 5.9, 0);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), lampMat);
      lamp.position.set(1.35, 5.75, 0);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 12, 1, true), coneMat);
      cone.position.set(1.35, 3.8, 0);
      group.add(pole, arm, lamp, cone);
      group.position.copy(pos);
      this.scene.add(group);
      this.streetLights.push({ position: pos.clone().setY(5.75) });

      // Give a subset real dynamic point lights to keep perf sane.
      if (idx % 4 === 0) {
        const light = new THREE.PointLight(0xffb35c, 8, 16, 2);
        light.position.set(pos.x + 1.35, 5.7, pos.z);
        light.castShadow = false;
        this.scene.add(light);
      }
    });
  }

  update(time: number) {
    for (const m of this.windowMaterials) m.uniforms.uTime.value = time;
  }
}
