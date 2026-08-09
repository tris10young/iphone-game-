import { CONFIG } from './config.js';

/**
 * Owns nothing but geometry: given a slot index, a centre and a facing angle it
 * returns where that soldier should stand. Deliberately stateless so other
 * formation shapes (wedge, line, column) can be dropped in later.
 */
export class Formation {
  constructor(count, columns = CONFIG.army.columns) {
    this.count = count;
    this.columns = columns;
    this.rows = Math.ceil(count / columns);
    this.spacingX = CONFIG.army.spacingX;
    this.spacingZ = CONFIG.army.spacingZ;

    // Local-space offsets, computed once. x = sideways, z = front(+)/back(-).
    this.offsets = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / columns);
      const col = i % columns;
      const rowWidth = Math.min(columns, count - row * columns);
      this.offsets.push({
        x: (col - (rowWidth - 1) / 2) * this.spacingX,
        z: ((this.rows - 1) / 2 - row) * this.spacingZ,
      });
    }
  }

  /** Slot index for the centre of the front rank — where the commander stands. */
  get frontCentreSlot() {
    return Math.floor(Math.min(this.columns, this.count) / 2);
  }

  /**
   * World position of a slot. Writes into `out` (a THREE.Vector3-like) to avoid
   * allocating inside the per-frame loop.
   */
  getSlotPosition(slot, centreX, centreZ, facing, out) {
    const offset = this.offsets[slot] || this.offsets[0];
    const sin = Math.sin(facing);
    const cos = Math.cos(facing);

    // forward = (sin, cos), right = (cos, -sin)
    out.x = centreX + offset.x * cos + offset.z * sin;
    out.z = centreZ - offset.x * sin + offset.z * cos;
    return out;
  }

  /** Rough radius of the block, used for spacing armies and camera framing. */
  get radius() {
    return Math.max(
      (this.columns * this.spacingX) / 2,
      (this.rows * this.spacingZ) / 2
    );
  }
}
