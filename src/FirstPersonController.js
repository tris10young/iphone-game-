import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SoldierState } from './Soldier.js';

const C = CONFIG.commander;

/**
 * Direct control of the commander in first person. While active the commander
 * is removed from formation logic (state PLAYER) but is still a normal soldier
 * to everyone else — enemies target it, it can die, it takes part in the battle.
 */
export class FirstPersonController {
  constructor({ commander, cameraManager, combat, battlefield, input }) {
    this.commander = commander;
    this.cameraManager = cameraManager;
    this.combat = combat;
    this.battlefield = battlefield;
    this.input = input;

    this.active = false;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.swingTimer = 0;
    this.attackCooldown = 0;
    this.hitApplied = false;
    this.bobPhase = 0;
    this._wasAttackDown = false;
    this._forward = new THREE.Vector3();

    this._buildViewModel();
  }

  /** The sword held in view, parented to the first person camera. */
  _buildViewModel() {
    const group = new THREE.Group();

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.13, 8),
      new THREE.MeshLambertMaterial({ color: CONFIG.colors.leather })
    );
    group.add(grip);

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.025, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x8a7a5c })
    );
    guard.position.y = 0.08;
    group.add(guard);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.62, 0.014),
      new THREE.MeshLambertMaterial({ color: CONFIG.colors.steel })
    );
    blade.position.y = 0.4;
    group.add(blade);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.023, 0.1, 4),
      new THREE.MeshLambertMaterial({ color: CONFIG.colors.steel })
    );
    tip.position.y = 0.76;
    group.add(tip);

    // Resting pose: low and to the right, angled across the view. Held far
    // enough from the eye that it frames the corner instead of the screen.
    group.scale.setScalar(0.85);
    group.position.set(0.52, -0.5, -1.05);
    group.rotation.set(-0.3, 0.4, 0.45);
    group.visible = false;

    this.viewModel = group;
    this.viewModelRest = {
      position: group.position.clone(),
      rotation: group.rotation.clone(),
    };
    this.cameraManager.fpCamera.add(group);
  }

  activate() {
    if (this.active || !this.commander.alive) return;
    this.active = true;
    this.commander.state = SoldierState.PLAYER;
    this.commander.enemy = null;
    this.commander.setVisible(false);
    this.viewModel.visible = true;
    this.verticalVelocity = 0;
    this._wasAttackDown = true; // ignore the click that may have triggered the switch
    this.input.requestPointerLock();
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    // The commander stays exactly where the player left them and rejoins the
    // army from there — no teleporting back into the block.
    if (this.commander.alive) this.commander.state = SoldierState.MARCHING;
    this.commander.setVisible(true);
    this.viewModel.visible = false;
    this.input.exitPointerLock();
  }

  update(dt) {
    if (!this.active) return;
    if (!this.commander.alive) {
      this.viewModel.visible = false;
      return;
    }

    this._updateLook();
    this._updateMovement(dt);
    this._updateAttack(dt);
    this._updateViewModel(dt);
  }

  _updateLook() {
    if (!this.input.pointerLocked) return;
    const cam = this.cameraManager;
    cam.fpYaw -= this.input.mouseDX * C.lookSensitivity;
    cam.fpPitch = THREE.MathUtils.clamp(
      cam.fpPitch - this.input.mouseDY * C.lookSensitivity,
      -1.45,
      1.45
    );
    // Keep the body pointing where the camera looks (model faces +Z).
    this.commander.facing = cam.fpYaw + Math.PI;
  }

  _updateMovement(dt) {
    const input = this.input;
    const yaw = this.cameraManager.fpYaw;

    // Flat basis from the look direction.
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);

    let mx = 0;
    let mz = 0;
    if (input.isDown('KeyW')) { mx += fx; mz += fz; }
    if (input.isDown('KeyS')) { mx -= fx; mz -= fz; }
    if (input.isDown('KeyD')) { mx += rx; mz += rz; }
    if (input.isDown('KeyA')) { mx -= rx; mz -= rz; }

    const moving = mx !== 0 || mz !== 0;
    const pos = this.commander.position;

    if (moving) {
      const len = Math.hypot(mx, mz);
      const sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      const speed = sprinting ? C.sprintSpeed : C.walkSpeed;
      pos.x += (mx / len) * speed * dt;
      pos.z += (mz / len) * speed * dt;
      this.battlefield.clamp(pos);
      this.bobPhase += dt * (sprinting ? 13 : 9);
    }

    // Vertical: jump + gravity, always resolved against the terrain surface.
    const groundY = this.battlefield.getHeight(pos.x, pos.z);
    if (this.grounded && input.justPressed('Space')) {
      this.verticalVelocity = C.jumpVelocity;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.verticalVelocity -= C.gravity * dt;
      pos.y += this.verticalVelocity * dt;
      if (pos.y <= groundY) {
        pos.y = groundY;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    } else {
      pos.y = groundY;
    }

    // Subtle head bob while walking on the ground.
    this.commander.crouchOffset = this.grounded && moving ? Math.sin(this.bobPhase) * 0.045 : 0;
  }

  _updateAttack(dt) {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    const down = this.input.isButtonDown(0);
    const clicked = down && !this._wasAttackDown;
    this._wasAttackDown = down;

    // Clicking while unlocked just re-acquires the mouse.
    if (clicked && !this.input.pointerLocked) {
      this.input.requestPointerLock();
      return;
    }

    if (clicked && this.attackCooldown <= 0) {
      this.attackCooldown = C.attackCooldown;
      this.swingTimer = C.swingDuration;
      this.hitApplied = false;
      this.commander.swingTimer = C.swingDuration; // so the body animates too
    }

    if (this.swingTimer > 0) {
      const previous = this.swingTimer;
      this.swingTimer -= dt;
      const hitAt = C.swingDuration * (1 - C.hitFrame);
      if (!this.hitApplied && previous > hitAt && this.swingTimer <= hitAt) {
        this.hitApplied = true;
        this._resolveHit();
      }
    }
  }

  _resolveHit() {
    const forward = this.cameraManager.getFpForward(this._forward);
    const hit = this.combat.resolvePlayerSwing(this.commander, forward);
    if (hit) this.cameraManager.addShake(0.28);
  }

  _updateViewModel(dt) {
    const rest = this.viewModelRest;
    const vm = this.viewModel;

    // Idle sway from walking, plus a little lag behind mouse movement.
    const sway = Math.sin(this.bobPhase) * 0.012;
    const swayY = Math.cos(this.bobPhase * 2) * 0.01;
    const lagX = THREE.MathUtils.clamp(-this.input.mouseDX * 0.0006, -0.05, 0.05);
    const lagY = THREE.MathUtils.clamp(this.input.mouseDY * 0.0006, -0.05, 0.05);

    let swingRotX = 0;
    let swingRotZ = 0;
    let swingPosZ = 0;
    if (this.swingTimer > 0) {
      const t = 1 - this.swingTimer / C.swingDuration;
      // Fast chop down, slower recovery.
      const curve = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
      swingRotX = -1.9 * curve;
      swingRotZ = -0.7 * curve;
      swingPosZ = -0.16 * curve;
    }

    const target = {
      x: rest.position.x + sway + lagX,
      y: rest.position.y + swayY + lagY,
      z: rest.position.z + swingPosZ,
    };
    const k = 1 - Math.exp(-18 * dt);
    vm.position.x += (target.x - vm.position.x) * k;
    vm.position.y += (target.y - vm.position.y) * k;
    vm.position.z += (target.z - vm.position.z) * k;

    vm.rotation.x = rest.rotation.x + swingRotX;
    vm.rotation.y = rest.rotation.y;
    vm.rotation.z = rest.rotation.z + swingRotZ;
  }

  dispose() {
    this.cameraManager.fpCamera.remove(this.viewModel);
  }
}
