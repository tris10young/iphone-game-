import * as THREE from 'three';
import { createMechanismMaterials } from '../world/Materials.js';
import { damp } from '../core/Easing.js';

/**
 * Base class for anything the player can activate.
 *
 * Responsibilities shared by every mechanism:
 *   - own a transform group and its own material set (so it can glow alone)
 *   - expose `pickables` for the interaction raycast
 *   - run a single eased state transition at a time and report progress
 *   - drive its highlight
 *
 * Subclasses implement `applyState(value)` -- how their transform maps to a
 * scalar state -- and nothing else. That is what keeps new mechanism types
 * cheap to add later.
 */
export class PuzzleInteractable {
  /**
   * @param {string} id
   * @param {object} options
   * @param {number[]} options.states Discrete positions this mechanism snaps between.
   * @param {number} options.duration Seconds per transition.
   * @param {(t:number)=>number} options.easing
   */
  constructor(id, { states, duration = 2.2, easing, initialIndex = 0, label = '', kind = '' }) {
    this.id = id;
    this.label = label;
    /** Coarse type, so generic code can react without instanceof checks. */
    this.kind = kind;
    /** The part that actually moves. */
    this.group = new THREE.Group();
    this.group.name = id;
    /** Rails, guide posts and controls that stay put while `group` moves. */
    this.fixed = new THREE.Group();
    this.fixed.name = `${id}_fixed`;
    this.materials = createMechanismMaterials();

    this.states = states;
    this.duration = duration;
    this.easing = easing;
    this.index = initialIndex;
    this.targetIndex = initialIndex;

    /** Meshes the interaction raycaster tests against. */
    this.pickables = [];
    /** Where camera nudges are centred when this mechanism moves. */
    this.focus = new THREE.Vector3();
    /** When true, the player must be standing on this mechanism to activate it. */
    this.requiresRider = false;

    this._elapsed = 0;
    this._from = states[initialIndex];
    this._to = states[initialIndex];
    this.isMoving = false;
    this.enabled = true;

    this._highlight = 0;
    this._highlightTarget = 0;
    this._listeners = { start: [], settle: [], progress: [] };
  }

  on(event, fn) {
    this._listeners[event].push(fn);
    return this;
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event]) fn(payload, this);
  }

  /** The scalar state currently applied to the transform. */
  get value() {
    return this._current ?? this.states[this.index];
  }

  /** True when the mechanism sits in the state that completes its puzzle step. */
  get isAligned() {
    return !this.isMoving && this.index === this.states.length - 1;
  }

  /** Advance to the next state, wrapping. Ignored while already moving. */
  activate() {
    if (this.isMoving || !this.enabled) return false;
    const next = (this.index + 1) % this.states.length;
    return this.moveTo(next);
  }

  moveTo(index) {
    if (this.isMoving || !this.enabled || index === this.index) return false;
    this._from = this.states[this.index];
    this._to = this.states[index];
    this.targetIndex = index;
    this._elapsed = 0;
    this.isMoving = true;
    this._emit('start', { from: this._from, to: this._to });
    return true;
  }

  /** Snap back to a state with no animation. Used by Replay. */
  reset(index) {
    this.index = this.targetIndex = index;
    this._from = this._to = this.states[index];
    this._elapsed = 0;
    this.isMoving = false;
    this._current = this.states[index];
    this.applyState(this._current, 1);
    this._highlight = this._highlightTarget = 0;
    this._applyHighlight();
  }

  setHighlight(on) {
    this._highlightTarget = on ? 1 : 0;
  }

  update(dt) {
    if (this.isMoving) {
      this._elapsed += dt;
      const raw = Math.min(1, this._elapsed / this.duration);
      const eased = this.easing(raw);
      this._current = this._from + (this._to - this._from) * eased;
      this.applyState(this._current, raw);
      this._emit('progress', { t: raw, eased });
      if (raw >= 1) {
        this.isMoving = false;
        this.index = this.targetIndex;
        this._current = this._to;
        this.applyState(this._current, 1);
        this._emit('settle', { index: this.index });
      }
    }

    if (this._highlight !== this._highlightTarget) {
      this._highlight = damp(this._highlight, this._highlightTarget, 12, dt);
      if (Math.abs(this._highlight - this._highlightTarget) < 0.004) this._highlight = this._highlightTarget;
      this._applyHighlight();
    }
  }

  _applyHighlight() {
    const h = this._highlight;
    this.materials.body.emissiveIntensity = 0.1 * h;
    this.materials.bodyDeep.emissiveIntensity = 0.1 * h;
    this.materials.accent.emissiveIntensity = 0.14 * h;
    this.materials.glow.emissiveIntensity = 0.5 + 0.85 * h;
  }

  /** Subclasses map the scalar state onto their transform here. */
  applyState(_value, _t) {}

  /** Idle motion (breathing glow etc). Called every frame with elapsed time. */
  ambient(_time) {}

  dispose() {
    for (const m of Object.values(this.materials)) m.dispose();
    for (const root of [this.group, this.fixed]) root.traverse((o) => o.geometry?.dispose?.());
  }
}
