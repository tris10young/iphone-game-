import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Formation } from './Formation.js';
import { Soldier, SoldierState } from './Soldier.js';

/**
 * A group of soldiers that share a formation. The army owns a formation centre
 * that walks toward the current order; soldiers chase their slot relative to it.
 */
export class Army {
  /**
   * @param {object} opts
   * @param {'player'|'enemy'} opts.team
   * @param {number} opts.size
   * @param {boolean} opts.withCommander
   * @param {{x:number,z:number,facing:number}} opts.spawn
   */
  constructor({ team, size, withCommander, spawn, battlefield, scene }) {
    this.team = team;
    this.scene = scene;
    this.battlefield = battlefield;

    this.formation = new Formation(size);
    this.centre = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.destination = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.facing = spawn.facing;
    this.desiredFacing = spawn.facing;
    this.hasOrder = false;
    this.holding = false; // when true the army stops refreshing formation slots

    this.soldiers = [];
    this.commander = null;
    this._slotPos = new THREE.Vector3();

    const commanderSlot = withCommander ? this.formation.frontCentreSlot : -1;
    for (let slot = 0; slot < size; slot++) {
      const soldier = new Soldier({
        team,
        isCommander: slot === commanderSlot,
        slot,
        battlefield,
      });
      this.formation.getSlotPosition(slot, this.centre.x, this.centre.z, this.facing, this._slotPos);
      soldier.placeAt(this._slotPos.x, this._slotPos.z, this.facing);
      soldier.formationTarget.copy(this._slotPos);
      soldier.state = SoldierState.IDLE;

      if (soldier.isCommander) this.commander = soldier;
      this.soldiers.push(soldier);
      scene.add(soldier.mesh);
    }
  }

  get aliveCount() {
    let n = 0;
    for (let i = 0; i < this.soldiers.length; i++) if (this.soldiers[i].alive) n++;
    return n;
  }

  get size() {
    return this.soldiers.length;
  }

  /** Issue a move order for the formation centre. */
  moveTo(x, z) {
    this.destination.set(x, 0, z);
    this.hasOrder = true;

    const dx = x - this.centre.x;
    const dz = z - this.centre.z;
    if (dx * dx + dz * dz > 0.25) {
      this.desiredFacing = Math.atan2(dx, dz);
    }
  }

  /** True once the formation centre has arrived at its ordered destination. */
  get hasArrived() {
    const dx = this.destination.x - this.centre.x;
    const dz = this.destination.z - this.centre.z;
    return dx * dx + dz * dz <= CONFIG.formation.arriveDistance ** 2;
  }

  /**
   * Advances the formation centre + rotation and refreshes every soldier's
   * formation slot target. Soldiers themselves are stepped by the Game loop.
   */
  update(dt) {
    // Smoothly rotate the block toward the direction of travel.
    let delta = this.desiredFacing - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = CONFIG.formation.rotationRate * dt;
    this.facing += Math.max(-maxTurn, Math.min(maxTurn, delta));

    if (this.hasOrder) {
      const dx = this.destination.x - this.centre.x;
      const dz = this.destination.z - this.centre.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= CONFIG.formation.arriveDistance) {
        this.centre.x = this.destination.x;
        this.centre.z = this.destination.z;
        this.hasOrder = false;
      } else {
        const step = Math.min(dist, CONFIG.formation.centreSpeed * dt);
        this.centre.x += (dx / dist) * step;
        this.centre.z += (dz / dist) * step;
      }
      this.battlefield.clamp(this.centre);
    }

    if (this.holding) return;

    for (let i = 0; i < this.soldiers.length; i++) {
      const soldier = this.soldiers[i];
      if (!soldier.alive || soldier.state === SoldierState.PLAYER) continue;
      const target = soldier.formationTarget;
      this.formation.getSlotPosition(soldier.slot, this.centre.x, this.centre.z, this.facing, target);
      target.y = this.battlefield.getHeight(target.x, target.z);
    }
  }

  /** Centre of mass of the living soldiers — used for AI and camera framing. */
  getLivingCentre(out) {
    out.set(0, 0, 0);
    let n = 0;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      if (!s.alive) continue;
      out.add(s.position);
      n++;
    }
    if (n > 0) out.divideScalar(n);
    else out.copy(this.centre);
    return out;
  }

  dispose() {
    for (const soldier of this.soldiers) {
      this.scene.remove(soldier.mesh);
      soldier.dispose();
    }
    this.soldiers.length = 0;
  }
}
