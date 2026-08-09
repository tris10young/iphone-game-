import * as THREE from 'three';
import { PuzzleInteractable } from './PuzzleInteractable.js';
import { MeshBuilder, archWall, carvedBand } from '../world/Build.js';
import { Materials } from '../world/Materials.js';
import { Easing } from '../core/Easing.js';

/**
 * PUZZLE 1 -- the rotating tower section.
 *
 * A drum built into the middle of the central tower with an arched passage cut
 * straight through it. The passage starts crosswise, so the stair landing to
 * the south meets a blank wall. One activation swings it through 90 degrees and
 * the route opens.
 *
 * The read has to be instant and wordless, so: the drum is terracotta against
 * cream, gold pivot rings top and bottom say "this turns", and the arch itself
 * is plainly a doorway pointing the wrong way.
 */
export class RotatingStructure extends PuzzleInteractable {
  constructor({ x = 0, y = 0, z = 0, size = 9, height = 5.5 } = {}) {
    super('rotating_tower', {
      // Start crosswise (90 degrees off), settle square with the walkway.
      states: [Math.PI / 2, 0],
      duration: 2.6,
      easing: Easing.heavy,
      initialIndex: 0,
      label: 'rotating tower',
    });

    this.size = size;
    this.height = height;
    this.passageHalfLength = size / 2 - 0.9;

    this.group.position.set(x, y, z);
    this.fixed.position.set(x, y, z);
    this.focus.set(x, y + height * 0.5, z);

    this._build();
    this.applyState(this.states[0], 1);
  }

  _build() {
    const m = this.materials;
    const half = this.size / 2;
    const wall = 0.9;
    const mb = new MeshBuilder();

    // No floor of its own. The tower deck already provides a solid surface at
    // exactly local y=0 across the drum's whole footprint, and adding a second
    // slab there put two coplanar faces in the depth buffer -- the passage
    // flickered with z-fighting stripes. The walls simply stand on the deck.

    // Two arched faces (the passage) and two solid flanks.
    for (const sign of [1, -1]) {
      archWall(mb, m.body, {
        z: sign * (half - wall / 2), width: this.size, height: this.height,
        depth: wall, openWidth: 3.4, openHeight: 4.0,
      });
      mb.box(wall, this.height, this.size - wall * 2, m.body, { x: sign * (half - wall / 2) });
    }

    // Cap and a carved band, so the drum reads as masonry rather than a tube.
    // The lid is recessed in two steps -- a single flat slab this size reads as
    // a lump from the diorama camera, which looks almost straight down on it.
    mb.box(this.size + 0.5, 0.4, this.size + 0.5, m.body, { y: this.height + 0.2 });
    mb.box(this.size - 1.4, 0.3, this.size - 1.4, m.accent, { y: this.height + 0.55 });
    mb.box(this.size - 3.2, 0.26, this.size - 3.2, m.bodyDeep, { y: this.height + 0.83 });
    carvedBand(mb, m.accent, { y: this.height + 0.68, w: this.size + 0.1, d: this.size + 0.1, size: 0.3, gap: 1.05 });

    // Gold pivot rings: the clearest possible statement that this part turns.
    for (const ringY of [0.12, this.height + 0.58]) {
      const torus = new THREE.TorusGeometry(half + 0.34, 0.13, 6, 28);
      torus.rotateX(Math.PI / 2);
      mb.add(torus, m.glow, new THREE.Matrix4().makeTranslation(0, ringY, 0));
      torus.dispose();
    }

    // An engraved disc on each solid flank -- the obvious thing to tap.
    for (const sign of [1, -1]) {
      const disc = new THREE.CylinderGeometry(1.15, 1.15, 0.16, 20);
      disc.rotateZ(Math.PI / 2);
      mb.add(disc, m.glow, new THREE.Matrix4().makeTranslation(sign * (half + 0.02), this.height * 0.55, 0));
      disc.dispose();
      const spoke = new THREE.BoxGeometry(0.2, 0.34, 2.0);
      for (let i = 0; i < 3; i++) {
        const rot = new THREE.Matrix4().makeRotationX((i * Math.PI) / 3);
        const place = new THREE.Matrix4()
          .makeTranslation(sign * (half + 0.13), this.height * 0.55, 0).multiply(rot);
        mb.add(spoke, m.accent, place);
      }
      spoke.dispose();
    }

    this.pickables = mb.build(this.group);

    // The static collar the drum turns inside, so there is no floating gap.
    const fixedMb = new MeshBuilder();
    fixedMb.box(this.size + 1.6, 0.7, this.size + 1.6, Materials.stoneWarm, { y: -0.95 });
    fixedMb.box(this.size + 1.2, 0.4, this.size + 1.2, Materials.trim, { y: -0.5 });
    fixedMb.build(this.fixed);
  }

  applyState(value) {
    this.group.rotation.y = value;
  }
}
