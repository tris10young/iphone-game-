import * as THREE from 'three';
import { PuzzleInteractable } from './PuzzleInteractable.js';
import { MeshBuilder } from '../world/Build.js';
import { Materials } from '../world/Materials.js';
import { Easing } from '../core/Easing.js';

/**
 * PUZZLE 2 -- the sliding bridge.
 *
 * The deck is parked on a siding, parallel to the crossing but offset to one
 * side, resting on two plinths. A capstan wheel on the near terrace runs it
 * sideways along its rails until it lines up with both terraces at once.
 *
 * It slides *sideways*, not end-on, and that is the only arrangement that
 * actually works: a deck long enough to span the gap has nowhere to retract to
 * along its own axis without burying itself in the terrace it started from.
 * Sliding across, it meets both edges simultaneously the moment it arrives.
 *
 * The rails do the teaching. They show exactly where the bridge is going before
 * the player touches anything, so the puzzle needs no instruction text.
 */
export class SlidingStructure extends PuzzleInteractable {
  constructor({
    x = 0, y = 0, z = 0,
    length = 10, width = 3, travel = 7,
    wheel = { x: -6.1, z: 2.5 },
  } = {}) {
    super('sliding_bridge', {
      states: [-travel, 0],
      duration: 2.8,
      easing: Easing.smooth,
      initialIndex: 0,
      label: 'sliding bridge',
    });

    this.length = length;
    this.width = width;
    this.travel = travel;
    this.origin = new THREE.Vector3(x, y, z);
    this.wheelOffset = wheel;

    this.group.position.set(x, y, z);
    this.fixed.position.set(x, y, z);
    this.focus.set(x, y + 0.5, z + travel / 2);

    this._settleTime = Infinity;

    this._build();
    this.applyState(this.states[0]);
  }

  _build() {
    const m = this.materials;
    const mb = new MeshBuilder();
    const halfL = this.length / 2;
    const halfW = this.width / 2;

    // Deck: top face is the walkable surface at local y = 0, flush with the
    // terrace so the retracted bridge reads as part of the floor.
    mb.box(this.length, 0.5, this.width, m.body, { y: -0.25 });
    mb.box(this.length - 0.5, 0.14, this.width + 0.3, m.bodyDeep, { y: -0.57 });

    // Kerbs: a readable edge from a high camera, and they stop the deck
    // looking like a plank.
    for (const sign of [1, -1]) {
      mb.box(this.length, 0.26, 0.26, m.bodyDeep, { y: 0.13, z: sign * (halfW - 0.13) });
    }

    // Shallow ribs underneath. Their rhythm makes the slide legible in motion.
    const ribs = 5;
    for (let i = 0; i < ribs; i++) {
      const px = -halfL + 1.1 + (i * (this.length - 2.2)) / (ribs - 1);
      mb.box(0.4, 0.18, this.width + 0.34, m.accent, { x: px, y: -0.64 });
    }

    // Gold inlay down the centre line, brightest at the leading edge.
    mb.box(this.length - 1.4, 0.05, 0.22, m.glow, { y: 0.015 });
    mb.box(0.34, 0.09, this.width - 0.9, m.glow, { x: halfL - 0.55, y: 0.02 });

    this.pickables = mb.build(this.group);

    this._buildRails();
    this._buildWheel();
  }

  /**
   * Two rails running across the gap, under each end of the deck, spanning the
   * full travel from the siding to the crossing.
   */
  _buildRails() {
    const fx = new MeshBuilder();
    const railX = this.length / 2 - 0.6;
    const railLength = this.travel + this.width + 1.6;
    const railCentre = this.travel / 2;
    for (const sx of [-1, 1]) {
      fx.box(0.32, 0.22, railLength, Materials.stoneDeep,
        { x: sx * railX, y: -0.72, z: railCentre });
      // Sparse sleepers, so the rails never read as a floor in their own right.
      for (let i = 0; i < 4; i++) {
        const pz = railCentre - railLength / 2 + 1.2 + (i * (railLength - 2.4)) / 3;
        fx.box(0.36, 0.44, 0.36, Materials.stoneDeep, { x: sx * railX, y: -1.02, z: pz });
      }
    }
    fx.build(this.fixed, { castShadow: true, receiveShadow: false });
  }

  /** The capstan wheel: an unmistakable "turn me" object beside the crossing. */
  _buildWheel() {
    const m = this.materials;
    const wheel = new THREE.Group();
    wheel.position.set(this.wheelOffset.x, 0, this.wheelOffset.z);
    this.fixed.add(wheel);

    const base = new MeshBuilder();
    base.box(1.0, 1.25, 1.0, m.bodyDeep, { y: 0.625 });
    base.box(1.32, 0.22, 1.32, m.accent, { y: 1.34 });
    const baseMeshes = base.build(wheel);

    const spin = new THREE.Group();
    spin.position.y = 1.95;
    this.wheelSpin = spin;
    wheel.add(spin);

    const sm = new MeshBuilder();
    const rim = new THREE.TorusGeometry(0.72, 0.1, 6, 20);
    sm.add(rim, m.glow, new THREE.Matrix4().identity());
    rim.dispose();
    for (let i = 0; i < 4; i++) sm.box(1.42, 0.14, 0.14, m.accent, { rz: (i * Math.PI) / 4 });
    sm.box(0.28, 0.28, 0.42, m.glow, {});
    const spinMeshes = sm.build(spin);

    this.pickables.push(...baseMeshes, ...spinMeshes);
  }

  applyState(value) {
    this.group.position.z = this.origin.z + value;
    if (this.wheelSpin) {
      const span = this.states[1] - this.states[0];
      this.wheelSpin.rotation.z = -((value - this.states[0]) / span) * Math.PI * 2.5;
    }
  }

  update(dt) {
    const wasMoving = this.isMoving;
    super.update(dt);
    if (wasMoving && !this.isMoving) this._settleTime = 0;

    if (this._settleTime !== Infinity) {
      this._settleTime += dt;
      const k = this._settleTime / 0.5;
      if (k >= 1) {
        this._settleTime = Infinity;
        this.group.position.y = this.origin.y;
      } else {
        // One damped dip as several tonnes of stone finds its seat.
        this.group.position.y = this.origin.y - Math.sin(k * Math.PI) * 0.1 * (1 - k);
      }
    }
  }
}
