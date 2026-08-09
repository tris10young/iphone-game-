import * as THREE from 'three';
import { damp, clamp } from '../core/Easing.js';

/**
 * Orbit camera for a miniature diorama.
 *
 * A low field of view (~22 degrees) gives the flattened, model-like look the
 * art direction needs while keeping just enough perspective to read a 40-metre
 * vertical structure -- a true orthographic camera makes the height ambiguous.
 *
 * Feel notes, since they are the point of this class:
 *   - drag has inertia and spins down smoothly; it never snaps
 *   - the vertical angle is clamped so the player cannot get under the level
 *   - the look-at target follows the traveller loosely, blended toward the
 *     level's centre of mass so the whole structure stays in frame
 *   - a mechanism in motion biases the target toward it, then releases; any
 *     touch during that cancels it immediately, so control is never taken away
 */

const ORBIT_SENSITIVITY = 0.0062;
const INERTIA_DAMPING = 3.6;
/** Ceiling on flick speed, in radians/second. */
const MAX_SPIN = 3.2;

export class CameraController {
  constructor(camera, { focus, distance = 112, minDistance = 52, maxDistance = 165 }) {
    this.camera = camera;

    this.azimuth = -0.72;
    this.polar = 1.06;            // from +Y; smaller looks down from higher up
    this.minPolar = 0.52;
    this.maxPolar = 1.35;

    this.distance = distance;
    this.targetDistance = distance;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;

    this.levelFocus = focus.clone();
    this.target = focus.clone();
    this.desired = focus.clone();

    this.velocityAzimuth = 0;
    this.velocityPolar = 0;

    this._nudge = null;
    this.dragging = false;
    this._lastOrbitTime = 0;
    this._safeAreaLift = 0;
    this._followWeight = 0.6;

    this._tmp = new THREE.Vector3();
  }

  /**
   * Shifts the framing down the screen by `pixels` worth of world space, so
   * nothing important sits under the Dynamic Island or the home indicator.
   */
  setSafeAreaLift(pixels, viewportHeight) {
    const worldPerPixel = (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.distance) / viewportHeight;
    this._safeAreaLift = pixels * worldPerPixel;
  }

  /** Called by the input layer on pointer down/up so inertia only runs after release. */
  setDragging(dragging) {
    this.dragging = dragging;
  }

  /**
   * Apply a drag delta.
   *
   * The rotation is applied *immediately* and the velocity is only recorded for
   * the flick that follows. Feeding drag deltas into velocity alone integrates
   * them twice, which made a 120px drag spin the camera through 250 degrees.
   */
  orbit(dx, dy) {
    this.cancelNudge();
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(1 / 240, (now - this._lastOrbitTime) / 1000));
    this._lastOrbitTime = now;

    const deltaAzimuth = -dx * ORBIT_SENSITIVITY;
    // Vertical drag is deliberately softer than horizontal: the level is
    // explored by turning around it, not by swinging over the top of it.
    const deltaPolar = -dy * ORBIT_SENSITIVITY * 0.55;

    this.azimuth += deltaAzimuth;
    this.polar = clamp(this.polar + deltaPolar, this.minPolar, this.maxPolar);

    // Radians per second, so the flick feels the same at any frame rate.
    this.velocityAzimuth = clamp(deltaAzimuth / dt, -MAX_SPIN, MAX_SPIN);
    this.velocityPolar = clamp(deltaPolar / dt, -MAX_SPIN, MAX_SPIN);
  }

  zoom(ratio) {
    this.cancelNudge();
    this.targetDistance = clamp(this.targetDistance * ratio, this.minDistance, this.maxDistance);
  }

  /** Gently bias framing toward a point (a mechanism that just started moving). */
  nudgeTo(point, { hold = 1.4, weight = 0.45 } = {}) {
    this._nudge = { point: point.clone(), hold, weight, age: 0, strength: 0 };
  }

  cancelNudge() {
    if (this._nudge) this._nudge.releasing = true;
  }

  /** Snap straight to a framing with no easing. Used on reset. */
  jumpTo({ azimuth, polar, distance }) {
    if (azimuth !== undefined) this.azimuth = azimuth;
    if (polar !== undefined) this.polar = polar;
    if (distance !== undefined) this.distance = this.targetDistance = distance;
    this.velocityAzimuth = this.velocityPolar = 0;
    this._nudge = null;
  }

  update(dt, followPoint) {
    // --- orbit inertia ---
    // While a finger is down the drag itself is driving the rotation, so
    // velocity is only spent after release. It still decays during the drag, so
    // pausing before lifting off correctly kills the flick.
    if (!this.dragging) {
      this.azimuth += this.velocityAzimuth * dt;
      this.polar = clamp(this.polar + this.velocityPolar * dt, this.minPolar, this.maxPolar);
    }
    const decay = Math.exp(-INERTIA_DAMPING * dt);
    this.velocityAzimuth *= decay;
    this.velocityPolar *= decay;
    if (Math.abs(this.velocityAzimuth) < 1e-4) this.velocityAzimuth = 0;
    if (Math.abs(this.velocityPolar) < 1e-4) this.velocityPolar = 0;

    this.distance = damp(this.distance, this.targetDistance, 7, dt);

    // --- where we would like to be looking ---
    this.desired.copy(this.levelFocus);
    if (followPoint) {
      // Follow the traveller, but keep a strong pull toward the level centre so
      // the structure never falls out of frame.
      this._tmp.copy(followPoint);
      this._tmp.y += 2.4;
      this.desired.lerp(this._tmp, this._followWeight);
    }

    if (this._nudge) {
      const n = this._nudge;
      n.age += dt;
      const targetStrength = n.releasing || n.age > n.hold ? 0 : 1;
      n.strength = damp(n.strength, targetStrength, n.releasing ? 4.5 : 2.2, dt);
      this.desired.lerp(n.point, n.weight * n.strength);
      if (n.strength < 0.01 && targetStrength === 0) this._nudge = null;
    }

    this.desired.y += this._safeAreaLift;

    // Target easing is slow on purpose: a camera that chases the character
    // frame-for-frame feels nervous on a phone.
    this.target.x = damp(this.target.x, this.desired.x, 2.1, dt);
    this.target.y = damp(this.target.y, this.desired.y, 1.7, dt);
    this.target.z = damp(this.target.z, this.desired.z, 2.1, dt);

    this._applyTransform();
  }

  _applyTransform() {
    const sinPolar = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * sinPolar * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.cos(this.polar),
      this.target.z + this.distance * sinPolar * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
  }
}
