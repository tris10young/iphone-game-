/**
 * Uniform spatial hash over the XZ plane.
 *
 * Used for neighbour queries (separation steering, target acquisition) so we
 * never do an O(n^2) scan. Rebuilt once per frame from the live soldier list;
 * cheap at 40 units and still cheap at a few thousand.
 */
export class SpatialGrid {
  constructor(cellSize = 3) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this._result = [];
  }

  _key(cx, cz) {
    // Cantor-ish pack; grid coords stay small enough for this to be collision-free.
    return cx * 100003 + cz;
  }

  rebuild(entities) {
    this.cells.clear();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.alive) continue;
      const cx = Math.floor(e.position.x / this.cellSize);
      const cz = Math.floor(e.position.z / this.cellSize);
      const key = this._key(cx, cz);
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      bucket.push(e);
    }
  }

  /**
   * Returns entities within `radius` of (x, z). The returned array is reused
   * between calls — consume it before querying again.
   */
  query(x, z, radius) {
    const out = this._result;
    out.length = 0;

    const r2 = radius * radius;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.cells.get(this._key(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          const dx = e.position.x - x;
          const dz = e.position.z - z;
          if (dx * dx + dz * dz <= r2) out.push(e);
        }
      }
    }
    return out;
  }
}
