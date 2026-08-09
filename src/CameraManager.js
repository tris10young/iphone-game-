import * as THREE from 'three';
import { CONFIG } from './config.js';

const T = CONFIG.tacticalCamera;

export const CameraMode = {
  TACTICAL: 'TACTICAL',
  FIRST_PERSON: 'FIRST_PERSON',
};

/**
 * Owns both cameras and the blend between them. Nothing else touches camera
 * transforms: FirstPersonController writes yaw/pitch here, CommandController
 * reads the active camera for picking.
 */
export class CameraManager {
  constructor(aspect, battlefield) {
    this.battlefield = battlefield;

    this.tacticalCamera = new THREE.PerspectiveCamera(50, aspect, 0.5, 800);
    this.fpCamera = new THREE.PerspectiveCamera(72, aspect, 0.1, 800);
    this.blendCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 800);

    this.mode = CameraMode.TACTICAL;
    this.transitionT = 1; // 1 == settled
    this.transitionFrom = CameraMode.TACTICAL;

    // Tactical orbit state.
    this.target = new THREE.Vector3(T.startTarget.x, 0, T.startTarget.z);
    this.desiredTarget = this.target.clone();
    this.yaw = T.yaw;
    this.pitch = T.pitch;
    this.distance = T.distance;
    this.desiredDistance = T.distance;

    // First person look state.
    this.fpYaw = 0;
    this.fpPitch = 0;
    this.shake = 0;

    this._forward = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this._applyTactical();
  }

  get isTransitioning() {
    return this.transitionT < 1;
  }

  getActiveCamera() {
    if (this.isTransitioning) return this.blendCamera;
    return this.mode === CameraMode.TACTICAL ? this.tacticalCamera : this.fpCamera;
  }

  /** Camera used for ground/unit picking — always the tactical one. */
  get pickCamera() {
    return this.tacticalCamera;
  }

  setAspect(aspect) {
    for (const cam of [this.tacticalCamera, this.fpCamera, this.blendCamera]) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  // -------------------------------------------------------------------------
  // Mode switching
  // -------------------------------------------------------------------------
  enterFirstPerson(commander) {
    if (this.mode === CameraMode.FIRST_PERSON) return;
    this.transitionFrom = CameraMode.TACTICAL;
    this.transitionT = 0;
    this.mode = CameraMode.FIRST_PERSON;
    // Start looking the way the commander already faces.
    this.fpYaw = commander.facing + Math.PI;
    this.fpPitch = 0;
    this._captureBlendStart(this.tacticalCamera);
  }

  enterTactical(focusPoint) {
    if (this.mode === CameraMode.TACTICAL) return;
    this.transitionFrom = CameraMode.FIRST_PERSON;
    this.transitionT = 0;
    this.mode = CameraMode.TACTICAL;
    // Pull up over wherever the commander is standing.
    this.target.set(focusPoint.x, 0, focusPoint.z);
    this.desiredTarget.copy(this.target);
    this._captureBlendStart(this.fpCamera);
  }

  _captureBlendStart(fromCamera) {
    this.blendCamera.position.copy(fromCamera.position);
    this.blendCamera.quaternion.copy(fromCamera.quaternion);
    this.blendCamera.fov = fromCamera.fov;
    this.blendCamera.updateProjectionMatrix();
  }

  addShake(amount) {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  /** Flat forward vector for the first person commander. */
  getFpForward(out = this._forward) {
    out.set(-Math.sin(this.fpYaw), 0, -Math.cos(this.fpYaw));
    return out;
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------
  update(dt, input, commander) {
    if (this.mode === CameraMode.TACTICAL) this._updateTacticalControls(dt, input);
    this._applyTactical(dt);

    if (commander) this._applyFirstPerson(commander);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.isTransitioning) this._updateBlend(dt);
  }

  _updateTacticalControls(dt, input) {
    // Pan with WASD, relative to where the camera is looking.
    const panScale = (this.distance / T.distance) * T.panSpeed * dt;
    const fx = Math.sin(this.yaw + Math.PI);
    const fz = Math.cos(this.yaw + Math.PI);
    let mx = 0;
    let mz = 0;
    if (input.isDown('KeyW')) { mx += fx; mz += fz; }
    if (input.isDown('KeyS')) { mx -= fx; mz -= fz; }
    if (input.isDown('KeyA')) { mx += fz; mz -= fx; }
    if (input.isDown('KeyD')) { mx -= fz; mz += fx; }
    if (mx !== 0 || mz !== 0) {
      const len = Math.hypot(mx, mz);
      this.desiredTarget.x += (mx / len) * panScale;
      this.desiredTarget.z += (mz / len) * panScale;
      this.battlefield.clamp(this.desiredTarget);
    }

    // Drag-pan (touch): move the world under the finger.
    if (input.panDelta.x !== 0 || input.panDelta.y !== 0) {
      const k = this.distance * T.dragPanSpeed;
      // left = (fz, -fx); dragging right pushes the camera left.
      this.desiredTarget.x += fz * input.panDelta.x * k + fx * input.panDelta.y * k;
      this.desiredTarget.z += -fx * input.panDelta.x * k + fz * input.panDelta.y * k;
      this.battlefield.clamp(this.desiredTarget);
    }

    // Zoom: mouse wheel or pinch, both in wheel-equivalent units.
    const zoom = input.wheel + input.zoomDelta;
    if (zoom !== 0) {
      this.desiredDistance = THREE.MathUtils.clamp(
        this.desiredDistance * (1 + zoom * T.zoomSpeed),
        T.minDistance,
        T.maxDistance
      );
    }

    // Rotate: right/middle drag, or a two-finger drag.
    const dragging = input.isButtonDown(2) || input.isButtonDown(1);
    const rotX = (dragging ? input.mouseDX : 0) + input.orbitDelta.x;
    const rotY = (dragging ? input.mouseDY : 0) + input.orbitDelta.y;
    if (rotX !== 0 || rotY !== 0) {
      this.yaw -= rotX * T.rotateSpeed;
      this.pitch = THREE.MathUtils.clamp(this.pitch + rotY * T.rotateSpeed, T.minPitch, T.maxPitch);
    }
  }

  _applyTactical(dt = 1 / 60) {
    const k = 1 - Math.exp(-T.smoothing * dt);
    this.target.lerp(this.desiredTarget, k);
    this.distance += (this.desiredDistance - this.distance) * k;

    const horizontal = Math.cos(this.pitch) * this.distance;
    const cam = this.tacticalCamera;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontal
    );

    // Never dip below the ground.
    const floor = this.battlefield.getHeight(cam.position.x, cam.position.z) + 3;
    if (cam.position.y < floor) cam.position.y = floor;

    cam.lookAt(this.target);
  }

  _applyFirstPerson(commander) {
    const cam = this.fpCamera;
    cam.rotation.order = 'YXZ';
    cam.position.set(
      commander.position.x,
      commander.position.y + CONFIG.commander.eyeHeight + (commander.crouchOffset || 0),
      commander.position.z
    );
    cam.rotation.y = this.fpYaw;
    cam.rotation.x = this.fpPitch;
    cam.rotation.z = 0;

    if (this.shake > 0) {
      const s = this.shake;
      cam.rotation.x += (Math.random() - 0.5) * s * 0.12;
      cam.rotation.y += (Math.random() - 0.5) * s * 0.12;
      cam.rotation.z = (Math.random() - 0.5) * s * 0.08;
    }
  }

  _updateBlend(dt) {
    this.transitionT = Math.min(1, this.transitionT + dt / CONFIG.transition.duration);
    const t = this.transitionT;
    const eased = t * t * (3 - 2 * t); // smoothstep

    const to = this.mode === CameraMode.TACTICAL ? this.tacticalCamera : this.fpCamera;
    const from = this.transitionFrom === CameraMode.TACTICAL ? this.tacticalCamera : this.fpCamera;

    // `from` is the camera we left; it keeps updating, which keeps the blend
    // stable even though the commander is moving underneath us.
    this.blendCamera.position.lerpVectors(from.position, to.position, eased);
    this.blendCamera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, eased);
    this.blendCamera.fov = THREE.MathUtils.lerp(from.fov, to.fov, eased);
    this.blendCamera.updateProjectionMatrix();
  }
}
