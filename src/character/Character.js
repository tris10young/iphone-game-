import * as THREE from 'three';
import { MeshBuilder } from '../world/Build.js';
import { Materials } from '../world/Materials.js';
import { damp } from '../core/Easing.js';

/**
 * The traveller.
 *
 * An original silhouette: a tapered cloak, a slightly oversized hood, and no
 * face. About 2.1m tall against a ~40m structure, which is the 1/19 ratio that
 * keeps the level reading as a diorama.
 *
 * All animation is procedural -- there are no rigs or clips to load. A cloak
 * that sways, a body that bobs and leans, and legs that swing is enough to
 * read as alive at this camera distance, and it costs nothing to ship.
 */
export const CHARACTER_HEIGHT = 2.1;

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'traveller';

    /** Yaw is separated from position so turning can be damped independently. */
    this.yawGroup = new THREE.Group();
    this.root.add(this.yawGroup);

    /** Everything that bobs, leans and sways hangs off here. */
    this.body = new THREE.Group();
    this.yawGroup.add(this.body);

    this._build();

    this.yaw = 0;
    this.targetYaw = 0;
    this._time = 0;
    this._walkPhase = 0;
    this._speed01 = 0;
  }

  _build() {
    const mb = new MeshBuilder();

    // Cloak: a tapered 8-sided skirt. Flat shading keeps the facets crisp.
    const cloak = new THREE.CylinderGeometry(0.3, 0.46, 1.16, 8, 1);
    mb.add(cloak, Materials.cloak, new THREE.Matrix4().makeTranslation(0, 0.62, 0));
    cloak.dispose();

    // Shoulders and a hem band, so the silhouette is not a plain cone.
    const shoulders = new THREE.CylinderGeometry(0.29, 0.33, 0.3, 8, 1);
    mb.add(shoulders, Materials.cloakDeep, new THREE.Matrix4().makeTranslation(0, 1.3, 0));
    shoulders.dispose();
    const hem = new THREE.CylinderGeometry(0.49, 0.47, 0.12, 8, 1);
    mb.add(hem, Materials.cloakDeep, new THREE.Matrix4().makeTranslation(0, 0.1, 0));
    hem.dispose();

    // Head: oversized, faceless, readable from across the level.
    const head = new THREE.IcosahedronGeometry(0.3, 1);
    mb.add(head, Materials.skin, new THREE.Matrix4().makeTranslation(0, 1.68, 0));
    head.dispose();

    this._bodyMeshes = mb.build(this.body);

    // Hood sits on its own group so it can lag behind the body's turn.
    this.hood = new THREE.Group();
    this.hood.position.y = 1.7;
    this.body.add(this.hood);
    const hoodMb = new MeshBuilder();
    const cone = new THREE.ConeGeometry(0.36, 0.52, 8);
    hoodMb.add(cone, Materials.cloak, new THREE.Matrix4().makeTranslation(0, 0.16, -0.02));
    cone.dispose();
    hoodMb.box(0.1, 0.1, 0.1, Materials.gold, { y: 0.44, ry: Math.PI / 4 });
    hoodMb.build(this.hood);

    // Legs. Barely visible under the cloak, but their swing is what makes the
    // walk read as walking rather than gliding.
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.34, 0);
      this.body.add(leg);
      const lm = new MeshBuilder();
      lm.box(0.13, 0.34, 0.16, Materials.cloakDeep, { y: -0.17 });
      lm.box(0.15, 0.09, 0.24, Materials.cloakDeep, { y: -0.36, z: 0.03 });
      lm.build(leg);
      this.legs.push(leg);
    }

    this.root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
    });
  }

  get position() {
    return this.root.position;
  }

  /** Point the traveller along a direction immediately (used on spawn/reset). */
  faceDirection(dx, dz, instant = false) {
    if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) return;
    this.targetYaw = Math.atan2(dx, dz);
    if (instant) this.yaw = this.targetYaw;
  }

  /**
   * @param {number} dt
   * @param {number} speed01 0 = standing, 1 = full walking speed.
   */
  update(dt, speed01) {
    this._time += dt;
    this._speed01 = damp(this._speed01, speed01, 10, dt);

    // Shortest-path yaw damping, so turning never spins the long way round.
    let delta = this.targetYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * (1 - Math.exp(-9 * dt));
    this.yawGroup.rotation.y = this.yaw;

    const s = this._speed01;
    this._walkPhase += dt * 7.4 * s;

    // Walk: a two-per-stride vertical bob plus a forward lean under speed.
    const bob = Math.abs(Math.sin(this._walkPhase)) * 0.075 * s;
    // Idle: a slow breath that never fully stops, so the character is alive
    // even when the player is thinking.
    const breath = Math.sin(this._time * 1.6) * 0.018 * (1 - s);
    this.body.position.y = bob + breath;
    this.body.rotation.x = -0.13 * s;
    this.body.rotation.z = Math.sin(this._walkPhase) * 0.05 * s;

    // Cloth: the hood lags the turn and sways with the stride.
    this.hood.rotation.z = Math.sin(this._walkPhase - 0.5) * 0.09 * s + Math.sin(this._time * 1.1) * 0.02;
    this.hood.rotation.x = 0.06 * s + Math.sin(this._time * 1.4) * 0.015;

    for (let i = 0; i < this.legs.length; i++) {
      const dir = i === 0 ? 1 : -1;
      this.legs[i].rotation.x = Math.sin(this._walkPhase) * 0.62 * s * dir;
    }
  }

  dispose() {
    this.root.traverse((o) => o.geometry?.dispose?.());
  }
}
