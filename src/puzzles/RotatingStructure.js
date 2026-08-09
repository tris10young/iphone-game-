import * as THREE from 'three';
import { PuzzleInteractable } from './PuzzleInteractable.js';
import { MeshBuilder, archWall, carvedBand } from '../world/Build.js';
import { Materials } from '../world/Materials.js';
import { Easing } from '../core/Easing.js';

/**
 * PUZZLE 1 -- the rotating tower section.
 *
 * A drum built into the middle of a tower with an arched passage cut through
 * it. The passage starts crosswise, so the stair landing outside meets a blank
 * wall; activating it swings the drum and the route opens.
 *
 * The passage comes in two shapes, and the difference is most of the game's
 * difficulty range:
 *   'straight' -- enters one side, leaves the opposite side. Two useful
 *                 orientations, and 180 degrees is the same as 0.
 *   'elbow'    -- enters one side, leaves the side at right angles. All four
 *                 orientations are distinct, so the drum becomes a router: it
 *                 decides which of four landings connects to which.
 *
 * The read has to be instant and wordless, so: the drum is terracotta against
 * cream, gold pivot rings top and bottom say "this turns", and the arch itself
 * is plainly a doorway pointing the wrong way.
 */
export class RotatingStructure extends PuzzleInteractable {
  constructor({
    x = 0, y = 0, z = 0, size = 9, height = 5.5,
    states = [Math.PI / 2, 0], initialIndex = 0, duration = 2.6, shape = 'straight',
  } = {}) {
    super('rotating_tower', {
      states,
      duration,
      easing: Easing.heavy,
      initialIndex,
      label: 'rotating tower',
      kind: 'rotate',
    });

    this.size = size;
    this.height = height;
    this.shape = shape;
    /** Local directions the passage opens onto, as unit-ish axis names. */
    this.openings = shape === 'elbow' ? ['+z', '+x'] : ['+z', '-z'];
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

    // Four faces: arched where the passage opens, solid everywhere else.
    const faces = [
      { name: '+z', ry: 0, x: 0, z: half - wall / 2 },
      { name: '-z', ry: 0, x: 0, z: -(half - wall / 2) },
      { name: '+x', ry: Math.PI / 2, x: half - wall / 2, z: 0 },
      { name: '-x', ry: Math.PI / 2, x: -(half - wall / 2), z: 0 },
    ];
    for (const face of faces) {
      if (this.openings.includes(face.name)) {
        archWall(mb, m.body, {
          x: face.x, z: face.z, ry: face.ry,
          width: this.size, height: this.height,
          depth: wall, openWidth: 3.4, openHeight: 4.0,
        });
      } else {
        const along = face.ry === 0;
        mb.box(along ? this.size : wall, this.height, along ? wall : this.size,
          m.body, { x: face.x, z: face.z });
      }
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

    // An engraved disc on every solid face -- the obvious thing to tap, and it
    // has to follow the openings so it never lands on a doorway.
    const solid = ['+z', '-z', '+x', '-x'].filter((name) => !this.openings.includes(name));
    for (const name of solid) {
      const axis = name[1];
      const sign = name[0] === '+' ? 1 : -1;
      const cx = axis === 'x' ? sign * (half + 0.02) : 0;
      const cz = axis === 'z' ? sign * (half + 0.02) : 0;
      const spin = axis === 'x' ? Math.PI / 2 : 0;

      const disc = new THREE.CylinderGeometry(1.15, 1.15, 0.16, 20);
      disc.rotateZ(Math.PI / 2);
      disc.rotateY(spin);
      mb.add(disc, m.glow, new THREE.Matrix4().makeTranslation(cx, this.height * 0.55, cz));
      disc.dispose();

      const spoke = new THREE.BoxGeometry(0.2, 0.34, 2.0);
      for (let i = 0; i < 3; i++) {
        const place = new THREE.Matrix4()
          .makeTranslation(cx * 1.1, this.height * 0.55, cz * 1.1)
          .multiply(new THREE.Matrix4().makeRotationY(spin))
          .multiply(new THREE.Matrix4().makeRotationX((i * Math.PI) / 3));
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
