import type { AABB, BuildingCollider } from "./types";

/**
 * Simple uniform spatial grid for broad-phase collision / raycast target
 * queries, avoiding external physics engines. Colliders are inserted into
 * every cell their AABB overlaps.
 */
export class SpatialGrid {
  private cellSize: number;
  private cells = new Map<string, BuildingCollider[]>();
  private nextId = 0;
  all: BuildingCollider[] = [];

  constructor(cellSize = 20) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number) {
    return `${cx},${cz}`;
  }

  insert(box: Omit<BuildingCollider, "id">): BuildingCollider {
    const collider: BuildingCollider = { ...box, id: this.nextId++ };
    this.all.push(collider);
    const cx0 = Math.floor(box.minX / this.cellSize);
    const cx1 = Math.floor(box.maxX / this.cellSize);
    const cz0 = Math.floor(box.minZ / this.cellSize);
    const cz1 = Math.floor(box.maxZ / this.cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = this.key(cx, cz);
        let arr = this.cells.get(k);
        if (!arr) {
          arr = [];
          this.cells.set(k, arr);
        }
        arr.push(collider);
      }
    }
    return collider;
  }

  queryRadius(x: number, z: number, radius: number): BuildingCollider[] {
    const results: BuildingCollider[] = [];
    const seen = new Set<number>();
    const cx0 = Math.floor((x - radius) / this.cellSize);
    const cx1 = Math.floor((x + radius) / this.cellSize);
    const cz0 = Math.floor((z - radius) / this.cellSize);
    const cz1 = Math.floor((z + radius) / this.cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (const c of arr) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            results.push(c);
          }
        }
      }
    }
    return results;
  }

  /** Ray vs AABB (2D footprint, ignoring Y) — returns distance to hit or null. */
  static rayAABB2D(ox: number, oz: number, dx: number, dz: number, box: AABB): number | null {
    let tmin = -Infinity;
    let tmax = Infinity;
    if (Math.abs(dx) < 1e-8) {
      if (ox < box.minX || ox > box.maxX) return null;
    } else {
      const t1 = (box.minX - ox) / dx;
      const t2 = (box.maxX - ox) / dx;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
    if (Math.abs(dz) < 1e-8) {
      if (oz < box.minZ || oz > box.maxZ) return null;
    } else {
      const t1 = (box.minZ - oz) / dz;
      const t2 = (box.maxZ - oz) / dz;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
    if (tmax < 0 || tmin > tmax) return null;
    return tmin > 0 ? tmin : tmax;
  }

  static circleIntersectsAABB(x: number, z: number, r: number, box: AABB): boolean {
    const cx = Math.max(box.minX, Math.min(x, box.maxX));
    const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }
}
