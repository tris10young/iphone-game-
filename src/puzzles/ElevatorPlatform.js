import * as THREE from 'three';
import { PuzzleInteractable } from './PuzzleInteractable.js';
import { MeshBuilder } from '../world/Build.js';
import { Materials } from '../world/Materials.js';
import { Easing } from '../core/Easing.js';

/**
 * PUZZLE 3 -- the ancient elevator.
 *
 * A pad set into the terrace, guided by four slender posts that climb toward
 * the temple. The player has to be standing on it to start it (`requiresRider`),
 * which makes the ride feel like a decision rather than a button press.
 *
 * The rise is deliberately the slowest movement in the game: it is the level's
 * one cinematic beat, and the camera pulls back during it to reveal how high
 * the structure really goes.
 */
export class ElevatorPlatform extends PuzzleInteractable {
  constructor({ x = 0, y = 0, z = 0, rise = 14, size = 4.6 } = {}) {
    super('elevator', {
      states: [0, rise],
      duration: 6.4,
      easing: Easing.cinematic,
      initialIndex: 0,
      label: 'elevator',
    });

    this.rise = rise;
    this.size = size;
    this.origin = new THREE.Vector3(x, y, z);
    this.requiresRider = true;

    this.group.position.set(x, y, z);
    this.fixed.position.set(x, y, z);
    this.focus.set(x, y + rise * 0.5, z);

    this._build();
    this.applyState(0, 1);
  }

  _build() {
    const m = this.materials;
    const half = this.size / 2;
    const mb = new MeshBuilder();

    // Pad. Walkable surface at local y = 0.
    mb.box(this.size, 0.55, this.size, m.body, { y: -0.275 });
    mb.box(this.size + 0.4, 0.2, this.size + 0.4, m.bodyDeep, { y: -0.62 });
    mb.taper(this.size + 0.4, this.size * 0.5, 1.1, m.bodyDeep, { y: -1.28 });

    // Gold ring inlaid in the floor: stand here.
    const ring = new THREE.TorusGeometry(half - 0.72, 0.09, 6, 26);
    ring.rotateX(Math.PI / 2);
    mb.add(ring, m.glow, new THREE.Matrix4().makeTranslation(0, 0.03, 0));
    ring.dispose();

    // Corner blocks that ride the guide posts.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        mb.box(0.7, 0.9, 0.7, m.accent, { x: sx * (half - 0.05), y: -0.1, z: sz * (half - 0.05) });
      }
    }

    // The ancient mechanism itself: a low pedestal at the back of the pad, so
    // it never sits under the character's feet.
    const pedestal = new THREE.Group();
    pedestal.position.set(0, 0, -half + 0.62);
    this.group.add(pedestal);
    const pm = new MeshBuilder();
    pm.box(1.05, 1.15, 1.05, m.bodyDeep, { y: 0.575 });
    pm.box(1.35, 0.2, 1.35, m.accent, { y: 1.23 });
    const glyph = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16);
    pm.add(glyph, m.glow, new THREE.Matrix4().makeTranslation(0, 1.36, 0));
    glyph.dispose();
    for (let i = 0; i < 4; i++) {
      pm.box(0.9, 0.07, 0.11, m.glow, { y: 1.37, ry: (i * Math.PI) / 4 });
    }
    this._pedestalMeshes = pm.build(pedestal);
    this._glyph = pedestal;

    this.pickables = [...mb.build(this.group), ...this._pedestalMeshes];

    // --- fixed: four guide posts spanning the full travel ---
    const fx = new MeshBuilder();
    const postHeight = this.rise + 2.2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        fx.cylinder(0.24, postHeight, Materials.stoneDeep,
          { x: sx * (half - 0.05), y: postHeight / 2 - 1.0, z: sz * (half - 0.05) }, 8);
        // Collars break the posts up so they read as masonry guides rather
        // than wires at this camera distance.
        for (let i = 1; i <= 3; i++) {
          fx.box(0.62, 0.28, 0.62, Materials.stoneWarm,
            { x: sx * (half - 0.05), y: -0.6 + (this.rise + 1.6) * (i / 4), z: sz * (half - 0.05) });
        }
      }
    }
    // A lintel at the top ties the posts together and frames the arrival.
    fx.box(this.size + 0.6, 0.4, 0.5, Materials.stoneWarm, { y: this.rise + 1.3, z: -half });
    fx.box(this.size + 0.6, 0.4, 0.5, Materials.stoneWarm, { y: this.rise + 1.3, z: half });
    fx.build(this.fixed, { castShadow: true });
  }

  applyState(value) {
    this.group.position.y = this.origin.y + value;
  }

  ambient(time) {
    // A slow pulse on the glyph so the player's eye finds it once they arrive.
    if (this.index === 0 && !this.isMoving) {
      this.materials.glow.emissiveIntensity =
        0.5 + 0.85 * this._highlight + Math.sin(time * 2.1) * 0.16;
    }
  }
}
