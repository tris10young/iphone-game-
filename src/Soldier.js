import * as THREE from 'three';
import { CONFIG } from './config.js';

const S = CONFIG.soldier;

export const SoldierState = {
  IDLE: 'IDLE',
  MARCHING: 'MARCHING',
  FIGHTING: 'FIGHTING',
  PLAYER: 'PLAYER', // directly controlled by the player in first person
  DEAD: 'DEAD',
};

// ---------------------------------------------------------------------------
// Shared geometry. Built once and reused by every soldier; materials are cloned
// per soldier so we can flash an individual on hit.
// ---------------------------------------------------------------------------
const GEO = {
  body: new THREE.CapsuleGeometry(0.32, 0.62, 4, 10),
  head: new THREE.SphereGeometry(0.2, 12, 10),
  arm: new THREE.CapsuleGeometry(0.09, 0.42, 3, 6),
  leg: new THREE.CapsuleGeometry(0.11, 0.4, 3, 6),
  blade: new THREE.BoxGeometry(0.07, 0.78, 0.16),
  hilt: new THREE.BoxGeometry(0.06, 0.1, 0.28),
  grip: new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6),
  shield: new THREE.BoxGeometry(0.06, 0.6, 0.44),
  marker: new THREE.RingGeometry(0.45, 0.62, 20),
};
GEO.marker.rotateX(-Math.PI / 2);

const MAT = {
  skin: new THREE.MeshLambertMaterial({ color: CONFIG.colors.skin }),
  steel: new THREE.MeshLambertMaterial({ color: CONFIG.colors.steel }),
  leather: new THREE.MeshLambertMaterial({ color: CONFIG.colors.leather }),
};

let _idCounter = 0;

export class Soldier {
  /**
   * @param {object} opts
   * @param {'player'|'enemy'} opts.team
   * @param {boolean} opts.isCommander
   * @param {number} opts.slot formation slot index
   * @param {import('./Battlefield.js').Battlefield} opts.battlefield
   */
  constructor({ team, isCommander = false, slot = 0, battlefield }) {
    this.id = _idCounter++;
    this.team = team;
    this.isCommander = isCommander;
    this.slot = slot;
    this.battlefield = battlefield;

    this.position = new THREE.Vector3();
    this.facing = 0; // radians, model's +Z points this way
    this.health = S.health;
    this.alive = true;
    this.state = SoldierState.IDLE;

    this.formationTarget = new THREE.Vector3();
    this.enemy = null;
    this.attackCooldown = 0;
    this.swingTimer = 0;
    this.searchTimer = Math.random() * S.targetSearchInterval;
    this.deathTimer = 0;
    this.flashTimer = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.speedScale = 0.94 + Math.random() * 0.12; // tiny variation so ranks aren't robotic

    this._buildMesh();
  }

  // -------------------------------------------------------------------------
  // Model
  // -------------------------------------------------------------------------
  _buildMesh() {
    const isPlayer = this.team === 'player';
    const tunicColor = isPlayer ? CONFIG.colors.player : CONFIG.colors.enemy;
    const accentColor = isPlayer ? CONFIG.colors.playerAccent : CONFIG.colors.enemyAccent;

    this.tunicMaterial = new THREE.MeshLambertMaterial({ color: tunicColor });
    this.accentMaterial = new THREE.MeshLambertMaterial({ color: accentColor });

    const group = new THREE.Group();

    const body = new THREE.Mesh(GEO.body, this.tunicMaterial);
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    this.body = body;

    const head = new THREE.Mesh(GEO.head, MAT.skin);
    head.position.y = 1.63;
    head.castShadow = true;
    group.add(head);

    // Commanders get a small crest so they read at a glance from the tactical view.
    if (this.isCommander) {
      const crest = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.3, 8),
        this.accentMaterial
      );
      crest.position.y = 1.86;
      crest.castShadow = true;
      group.add(crest);
    }

    const legL = new THREE.Mesh(GEO.leg, MAT.leather);
    legL.position.set(-0.15, 0.38, 0);
    legL.castShadow = true;
    group.add(legL);
    const legR = new THREE.Mesh(GEO.leg, MAT.leather);
    legR.position.set(0.15, 0.38, 0);
    legR.castShadow = true;
    group.add(legR);
    this.legL = legL;
    this.legR = legR;

    // Sword arm pivots at the shoulder so one rotation animates arm + blade.
    const swordArm = new THREE.Group();
    swordArm.position.set(0.4, 1.35, 0);
    group.add(swordArm);
    this.swordArm = swordArm;

    const arm = new THREE.Mesh(GEO.arm, MAT.skin);
    arm.position.y = -0.24;
    arm.castShadow = true;
    swordArm.add(arm);

    const grip = new THREE.Mesh(GEO.grip, MAT.leather);
    grip.position.set(0, -0.5, 0.12);
    grip.rotation.x = Math.PI / 2;
    swordArm.add(grip);

    const hilt = new THREE.Mesh(GEO.hilt, MAT.steel);
    hilt.position.set(0, -0.5, 0.22);
    swordArm.add(hilt);

    const blade = new THREE.Mesh(GEO.blade, MAT.steel);
    blade.position.set(0, -0.5, 0.65);
    blade.rotation.x = Math.PI / 2;
    blade.castShadow = true;
    swordArm.add(blade);

    // Shield arm.
    const shield = new THREE.Mesh(GEO.shield, this.accentMaterial);
    shield.position.set(-0.42, 1.15, 0.12);
    shield.rotation.y = 0.25;
    shield.castShadow = true;
    group.add(shield);

    const shieldArm = new THREE.Mesh(GEO.arm, MAT.skin);
    shieldArm.position.set(-0.4, 1.12, 0);
    shieldArm.castShadow = true;
    group.add(shieldArm);

    // Team ring on the ground.
    const marker = new THREE.Mesh(
      GEO.marker,
      new THREE.MeshBasicMaterial({
        color: tunicColor,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    marker.position.y = 0.03;
    group.add(marker);
    this.marker = marker;

    this.mesh = group;
  }

  // -------------------------------------------------------------------------
  // Placement
  // -------------------------------------------------------------------------
  placeAt(x, z, facing = 0) {
    this.position.set(x, this.battlefield.getHeight(x, z), z);
    this.facing = facing;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = facing;
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------
  update(dt, ctx) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this._setFlash(false);
    }

    if (this.state === SoldierState.DEAD) {
      this._updateDeath(dt);
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.swingTimer > 0) this.swingTimer -= dt;

    // The commander in first person is driven by FirstPersonController; it owns
    // position and facing, we only keep the visual bits in sync.
    if (this.state === SoldierState.PLAYER) {
      this._updateSwing();
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.facing;
      return;
    }

    let moved = false;

    if (this.enemy && this.enemy.alive) {
      moved = this._updateFighting(dt, ctx);
    } else {
      this.enemy = null;
      this.state = SoldierState.MARCHING;
      moved = this._moveToward(this.formationTarget.x, this.formationTarget.z, dt, ctx, S.slotArriveDistance);
    }

    this._updateVisuals(dt, moved);
  }

  _updateFighting(dt, ctx) {
    this.state = SoldierState.FIGHTING;
    const dx = this.enemy.position.x - this.position.x;
    const dz = this.enemy.position.z - this.position.z;
    const dist2 = dx * dx + dz * dz;

    this._faceTowards(dx, dz, dt);

    if (dist2 > S.attackRange * S.attackRange) {
      // Close the gap — soldiers break ranks to reach an engaged enemy.
      return this._moveToward(this.enemy.position.x, this.enemy.position.z, dt, ctx, S.attackRange * 0.85);
    }

    if (this.attackCooldown <= 0) {
      this.attackCooldown = S.attackCooldown * (0.85 + Math.random() * 0.3);
      this.swingTimer = S.swingDuration;
      ctx.combat.applyDamage(this.enemy, S.damage, this);
    }
    return false;
  }

  /** Steer toward (tx, tz) with neighbour separation. Returns true if it moved. */
  _moveToward(tx, tz, dt, ctx, arriveDistance) {
    let dx = tx - this.position.x;
    let dz = tz - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    let vx = 0;
    let vz = 0;
    let moving = false;

    if (dist > arriveDistance) {
      // Speed up a little when lagging behind the formation.
      const urgency = Math.min(S.catchUpMultiplier, 1 + dist * 0.06);
      const speed = S.speed * this.speedScale * urgency;
      vx = (dx / dist) * speed;
      vz = (dz / dist) * speed;
      moving = true;
    }

    // Lightweight separation from nearby units.
    const neighbours = ctx.grid.query(this.position.x, this.position.z, S.separationRadius);
    for (let i = 0; i < neighbours.length; i++) {
      const other = neighbours[i];
      if (other === this || !other.alive) continue;
      const ox = this.position.x - other.position.x;
      const oz = this.position.z - other.position.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < 0.0001) {
        // Perfectly stacked: nudge apart deterministically by id.
        vx += Math.cos(this.id) * S.separationForce;
        vz += Math.sin(this.id) * S.separationForce;
        continue;
      }
      if (d2 < S.separationRadius * S.separationRadius) {
        const d = Math.sqrt(d2);
        const push = (1 - d / S.separationRadius) * S.separationForce;
        vx += (ox / d) * push;
        vz += (oz / d) * push;
      }
    }

    if (vx === 0 && vz === 0) return false;

    // Never overshoot the target in a single step.
    let stepX = vx * dt;
    let stepZ = vz * dt;
    if (moving) {
      const step = Math.sqrt(stepX * stepX + stepZ * stepZ);
      if (step > dist) {
        stepX *= dist / step;
        stepZ *= dist / step;
      }
      this._faceTowards(dx, dz, dt);
    }

    this.position.x += stepX;
    this.position.z += stepZ;
    this.battlefield.clamp(this.position);
    this.position.y = this.battlefield.getHeight(this.position.x, this.position.z);
    return moving;
  }

  _faceTowards(dx, dz, dt) {
    if (dx === 0 && dz === 0) return;
    const desired = Math.atan2(dx, dz);
    let delta = desired - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxStep = S.turnRate * dt;
    this.facing += Math.max(-maxStep, Math.min(maxStep, delta));
  }

  _updateVisuals(dt, moving) {
    const bob = moving ? Math.sin(this.walkPhase) * 0.05 : 0;
    if (moving) this.walkPhase += dt * 9;

    this.mesh.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.mesh.rotation.y = this.facing;

    const swing = moving ? Math.sin(this.walkPhase) * 0.45 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;

    this._updateSwing();
  }

  _updateSwing() {
    if (this.swingTimer > 0) {
      // 0 -> 1 -> 0 over the swing, chopping down and returning to guard.
      const t = 1 - this.swingTimer / S.swingDuration;
      const curve = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      this.swordArm.rotation.x = -2.2 * curve;
    } else {
      this.swordArm.rotation.x *= 0.85;
    }
  }

  _updateDeath(dt) {
    if (this.deathTimer >= S.deathDuration) return;
    this.deathTimer = Math.min(S.deathDuration, this.deathTimer + dt);
    const t = this.deathTimer / S.deathDuration;
    const eased = 1 - (1 - t) * (1 - t); // ease-out; reads like a body giving way
    this.mesh.rotation.z = eased * (Math.PI / 2) * this.deathDirection;
    this.mesh.position.y = this.position.y - eased * 0.25;
  }

  // -------------------------------------------------------------------------
  // Combat hooks (called by CombatSystem)
  // -------------------------------------------------------------------------
  takeDamage(amount) {
    if (!this.alive) return false;
    this.health -= amount;
    this.flash();
    if (this.health <= 0) {
      this.kill();
      return true;
    }
    return false;
  }

  kill() {
    this.alive = false;
    this.health = 0;
    this.state = SoldierState.DEAD;
    this.enemy = null;
    this.deathTimer = 0;
    this.deathDirection = Math.random() < 0.5 ? -1 : 1;
    this.marker.visible = false;
    this.mesh.visible = true;
  }

  flash(duration = 0.12) {
    this.flashTimer = duration;
    this._setFlash(true);
  }

  _setFlash(on) {
    this.tunicMaterial.emissive.setHex(on ? 0x772222 : 0x000000);
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }

  dispose() {
    this.tunicMaterial.dispose();
    this.accentMaterial.dispose();
    this.marker.material.dispose();
  }
}
