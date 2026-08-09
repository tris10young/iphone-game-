import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Prototype-grade enemy behaviour: hold briefly, then march the whole formation
 * at the player army and let per-soldier combat do the rest. No tactics yet.
 */
export class EnemyAI {
  constructor({ army, targetArmy }) {
    this.army = army;
    this.targetArmy = targetArmy;
    this.delayTimer = CONFIG.enemyAI.advanceDelay;
    this.reassessTimer = 0;
    this.advancing = false;
    this._centre = new THREE.Vector3();
  }

  update(dt) {
    if (this.army.aliveCount === 0 || this.targetArmy.aliveCount === 0) return;

    if (!this.advancing) {
      this.delayTimer -= dt;
      if (this.delayTimer > 0) return;
      this.advancing = true;
      this.reassessTimer = 0;
    }

    this.reassessTimer -= dt;
    if (this.reassessTimer > 0) return;
    this.reassessTimer = CONFIG.enemyAI.reassessInterval;

    // March toward the player army, stopping just short so the front ranks meet
    // instead of the formations trying to occupy the same ground.
    this.targetArmy.getLivingCentre(this._centre);
    const dx = this._centre.x - this.army.centre.x;
    const dz = this._centre.z - this.army.centre.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return;

    const stop = Math.min(dist, CONFIG.enemyAI.stopDistance);
    this.army.moveTo(
      this._centre.x - (dx / dist) * stop,
      this._centre.z - (dz / dist) * stop
    );
  }

  reset() {
    this.delayTimer = CONFIG.enemyAI.advanceDelay;
    this.reassessTimer = 0;
    this.advancing = false;
  }
}
