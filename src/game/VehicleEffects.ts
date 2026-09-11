import * as THREE from "three";

/**
 * GPU-buffer-backed tire skid mark ribbon. A fixed pool of quads is reused
 * as a ring buffer so no per-frame allocation occurs.
 */
export class SkidTrail {
  mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private positions: Float32Array;
  private alphas: Float32Array;
  private cursor = 0;
  private maxQuads: number;

  constructor(scene: THREE.Scene, maxQuads = 300) {
    this.maxQuads = maxQuads;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxQuads * 4 * 3);
    this.alphas = new Float32Array(maxQuads * 4);
    const indices = new Uint32Array(maxQuads * 6);
    for (let i = 0; i < maxQuads; i++) {
      const v = i * 4;
      const o = i * 6;
      indices[o] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v;
      indices[o + 4] = v + 2;
      indices[o + 5] = v + 3;
    }
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geo.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.02, 0.02, 0.02, vAlpha * 0.55);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  addMark(left: THREE.Vector3, right: THREE.Vector3, prevLeft: THREE.Vector3, prevRight: THREE.Vector3) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.maxQuads;
    const v = i * 4 * 3;
    const p = this.positions;
    p[v] = prevLeft.x; p[v + 1] = 0.03; p[v + 2] = prevLeft.z;
    p[v + 3] = prevRight.x; p[v + 4] = 0.03; p[v + 5] = prevRight.z;
    p[v + 6] = right.x; p[v + 7] = 0.03; p[v + 8] = right.z;
    p[v + 9] = left.x; p[v + 10] = 0.03; p[v + 11] = left.z;
    const a = i * 4;
    this.alphas[a] = this.alphas[a + 1] = this.alphas[a + 2] = this.alphas[a + 3] = 0.6;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.maxQuads * 6);
  }
}

/** Lightweight CPU particle system for drift/nitro smoke. */
export class SmokeParticles {
  points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private positions: Float32Array;
  private velocities: Float32Array;
  private lifetimes: Float32Array;
  private ages: Float32Array;
  private count: number;
  private cursor = 0;

  constructor(scene: THREE.Scene, count = 200, color = 0xcccccc) {
    this.count = count;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.lifetimes = new Float32Array(count);
    this.ages = new Float32Array(count).fill(999);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({ color, size: 0.55, transparent: true, opacity: 0.35, depthWrite: false });
    this.points = new THREE.Points(this.geo, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(origin: THREE.Vector3, dir: THREE.Vector3, count: number) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      this.positions[i * 3] = origin.x;
      this.positions[i * 3 + 1] = origin.y;
      this.positions[i * 3 + 2] = origin.z;
      this.velocities[i * 3] = dir.x * 0.6 + (Math.random() - 0.5) * 1.2;
      this.velocities[i * 3 + 1] = 0.6 + Math.random() * 0.8;
      this.velocities[i * 3 + 2] = dir.z * 0.6 + (Math.random() - 0.5) * 1.2;
      this.lifetimes[i] = 0.5 + Math.random() * 0.6;
      this.ages[i] = 0;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.ages[i] > this.lifetimes[i]) continue;
      this.ages[i] += dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
