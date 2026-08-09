import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SpatialGrid } from './SpatialGrid.js';
import { SoldierState } from './Soldier.js';

const S = CONFIG.soldier;

/**
 * Owns everything that hurts: target acquisition, damage application, deaths
 * and hit feedback. It also owns the spatial grid, which soldiers borrow for
 * separation steering.
 */
export class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    this.grid = new SpatialGrid(3);
    this.soldiers = [];
    this.onDeath = null; // set by Game
    this.acquisitionEnabled = true; // switched off once the battle is decided

    this._impacts = [];
    this._buildImpactPool();
  }

  setSoldiers(soldiers) {
    this.soldiers = soldiers;
  }

  /**
   * Refresh the grid and re-target. Target searches are staggered per soldier
   * (roughly 5x/second each) rather than run every frame for everybody.
   */
  update(dt) {
    this.grid.rebuild(this.soldiers);

    if (this.acquisitionEnabled) for (let i = 0; i < this.soldiers.length; i++) {
      const soldier = this.soldiers[i];
      if (!soldier.alive || soldier.state === SoldierState.PLAYER) continue;

      soldier.searchTimer -= dt;
      if (soldier.searchTimer > 0) continue;
      soldier.searchTimer = S.targetSearchInterval * (0.8 + Math.random() * 0.4);
      soldier.enemy = this.findNearestEnemy(soldier, S.engageRange);
    }

    this._updateImpacts(dt);
  }

  findNearestEnemy(soldier, radius) {
    const candidates = this.grid.query(soldier.position.x, soldier.position.z, radius);
    let best = null;
    let bestDist2 = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const other = candidates[i];
      if (!other.alive || other.team === soldier.team) continue;
      const dx = other.position.x - soldier.position.x;
      const dz = other.position.z - soldier.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        best = other;
      }
    }
    return best;
  }

  applyDamage(target, amount, source) {
    if (!target || !target.alive) return false;
    const died = target.takeDamage(amount);
    this.spawnImpact(target.position, target.team);
    this.playHitSound(died);
    if (died && this.onDeath) this.onDeath(target, source);
    return died;
  }

  /**
   * The commander's swing: a short cone check in front of the player. Hits the
   * single nearest valid enemy so one swing never mows down a rank.
   */
  resolvePlayerSwing(commander, forward) {
    const range = CONFIG.commander.attackRange;
    const candidates = this.grid.query(commander.position.x, commander.position.z, range);
    let best = null;
    let bestDist2 = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const other = candidates[i];
      if (!other.alive || other.team === commander.team) continue;
      const dx = other.position.x - commander.position.x;
      const dz = other.position.z - commander.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > range * range || d2 > bestDist2) continue;
      const d = Math.sqrt(d2) || 1;
      if ((dx / d) * forward.x + (dz / d) * forward.z < CONFIG.commander.attackArcDot) continue;
      bestDist2 = d2;
      best = other;
    }

    if (!best) return null;
    this.applyDamage(best, CONFIG.commander.damage, commander);
    return best;
  }

  // -------------------------------------------------------------------------
  // Hit feedback: a pooled puff of small quads, plus a placeholder blip.
  // -------------------------------------------------------------------------
  _buildImpactPool() {
    const geometry = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    for (let i = 0; i < 48; i++) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this._impacts.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this._impactCursor = 0;
  }

  spawnImpact(position, team) {
    const color = team === 'player' ? 0xd8e2f0 : 0xf0d8d8;
    for (let i = 0; i < 5; i++) {
      const p = this._impacts[this._impactCursor];
      this._impactCursor = (this._impactCursor + 1) % this._impacts.length;
      p.life = 0.35;
      p.mesh.visible = true;
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 0.9;
      p.mesh.position.set(position.x, position.y + 1.2, position.z);
      p.vx = (Math.random() - 0.5) * 2.4;
      p.vy = 1.2 + Math.random() * 1.6;
      p.vz = (Math.random() - 0.5) * 2.4;
    }
  }

  _updateImpacts(dt) {
    for (let i = 0; i < this._impacts.length; i++) {
      const p = this._impacts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.material.opacity = Math.max(0, p.life / 0.35) * 0.9;
    }
  }

  /** Placeholder audio — a short synthesised click, no assets required. */
  playHitSound(fatal) {
    try {
      if (!this._audio) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this._audio = new Ctx();
      }
      const ctx = this._audio;
      if (ctx.state === 'suspended') return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(fatal ? 150 : 420, now);
      osc.frequency.exponentialRampToValueAtTime(fatal ? 70 : 180, now + 0.09);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    } catch {
      /* audio is cosmetic; never let it break the battle */
    }
  }

  resumeAudio() {
    if (this._audio && this._audio.state === 'suspended') this._audio.resume();
  }
}
