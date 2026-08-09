import * as THREE from 'three';

/**
 * Moves the traveller along a path of NavGraph nodes.
 *
 * Node world positions are re-read every frame rather than cached, which is the
 * whole reason moving platforms need no special handling: standing on the
 * elevator means standing on a node whose world position happens to be rising.
 *
 * The character is only ever at a node or between two adjacent nodes, so it can
 * never end up off an edge, inside geometry, or across a gap that is not
 * currently connected.
 */

const MAX_SPEED = 2.7;       // metres/second
const ACCEL_TIME = 0.3;      // seconds to reach full speed
const BRAKE_DISTANCE = 1.3;  // metres over which it eases to a stop
const STEP_DISTANCE = 0.82;  // metres between footstep sounds

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class PlayerNavigation {
  constructor(nav, character) {
    this.nav = nav;
    this.character = character;

    this.currentNode = null;
    /** @type {import('../nav/NavGraph.js').NavNode[] | null} */
    this.path = null;
    this.segment = 0;
    this.segmentT = 0;

    this.speed = 0;
    this._elapsed = 0;
    this._stepAccumulator = 0;
    this._listeners = { arrive: [], step: [], depart: [], blocked: [] };
  }

  on(event, fn) {
    this._listeners[event].push(fn);
    return this;
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event]) fn(payload);
  }

  get isWalking() {
    return this.path !== null;
  }

  /** Place the traveller at a node with no transition. */
  placeAt(nodeId, faceNodeId = null) {
    this.currentNode = this.nav.get(nodeId);
    this.path = null;
    this.speed = 0;
    this.segment = 0;
    this.segmentT = 0;
    this.currentNode.worldPosition(_a);
    this.character.position.copy(_a);
    if (faceNodeId) {
      this.nav.get(faceNodeId).worldPosition(_b);
      this.character.faceDirection(_b.x - _a.x, _b.z - _a.z, true);
    }
    this.character.update(0, 0);
  }

  /**
   * Walk to `nodeId` if a route currently exists.
   * @returns {boolean} whether a path was found and started.
   */
  goTo(nodeId) {
    if (!this.currentNode) return false;
    const target = this.nav.get(nodeId);
    if (target === this.currentNode && !this.isWalking) return false;

    // Re-path from where we are actually standing. Mid-segment, the node we
    // just left is the honest start -- pathing from the one ahead would let the
    // traveller reverse through geometry it has not reached yet.
    const from = this.isWalking ? this.path[this.segment] : this.currentNode;
    const path = this.nav.findPath(from.id, target.id);
    if (!path || path.length < 2) {
      this._emit('blocked', { target });
      return false;
    }

    this.path = path;
    this.segment = 0;
    this.segmentT = 0;
    this.currentNode = path[0];
    this._elapsed = 0;
    this._emit('depart', { path });
    return true;
  }

  stop() {
    if (!this.path) return;
    this.path = null;
    this.speed = 0;
    this.segmentT = 0;
  }

  /** Total remaining distance along the path, using current world positions. */
  _remainingDistance() {
    if (!this.path) return 0;
    let total = 0;
    this.path[this.segment].worldPosition(_a);
    this.path[this.segment + 1].worldPosition(_b);
    total += _a.distanceTo(_b) * (1 - this.segmentT);
    for (let i = this.segment + 1; i < this.path.length - 1; i++) {
      this.path[i].worldPosition(_a);
      this.path[i + 1].worldPosition(_b);
      total += _a.distanceTo(_b);
    }
    return total;
  }

  update(dt) {
    if (!this.path) {
      // Standing still: keep following the node, which may be moving.
      if (this.currentNode) {
        this.currentNode.worldPosition(_a);
        this.character.position.copy(_a);
      }
      this.character.update(dt, 0);
      return;
    }

    this._elapsed += dt;
    const remaining = this._remainingDistance();

    // Ease in from a standstill, ease out as the destination approaches.
    const accel = Math.min(1, this._elapsed / ACCEL_TIME);
    const brake = Math.min(1, Math.max(0.12, remaining / BRAKE_DISTANCE));
    this.speed = MAX_SPEED * accel * brake;

    let budget = this.speed * dt;
    this._stepAccumulator += budget;

    while (budget > 0 && this.path) {
      const from = this.path[this.segment];
      const to = this.path[this.segment + 1];
      from.worldPosition(_a);
      to.worldPosition(_b);
      const segmentLength = _a.distanceTo(_b);

      if (segmentLength < 1e-4) {
        this._advanceSegment();
        continue;
      }

      const step = budget / segmentLength;
      if (this.segmentT + step < 1) {
        this.segmentT += step;
        budget = 0;
      } else {
        budget -= (1 - this.segmentT) * segmentLength;
        this.segmentT = 0;
        if (!this._advanceSegment()) break;
      }
    }

    if (this.path) {
      const from = this.path[this.segment];
      const to = this.path[this.segment + 1];
      from.worldPosition(_a);
      to.worldPosition(_b);
      this.character.position.lerpVectors(_a, _b, this.segmentT);
      this.character.faceDirection(_b.x - _a.x, _b.z - _a.z);
      this.currentNode = from;
    }

    while (this._stepAccumulator >= STEP_DISTANCE) {
      this._stepAccumulator -= STEP_DISTANCE;
      if (this.path) this._emit('step', {});
    }

    this.character.update(dt, this.path ? Math.min(1, this.speed / MAX_SPEED) : 0);
  }

  /** @returns {boolean} false when the path has been completed. */
  _advanceSegment() {
    this.segment++;
    if (this.segment >= this.path.length - 1) {
      const destination = this.path[this.path.length - 1];
      this.currentNode = destination;
      destination.worldPosition(_a);
      this.character.position.copy(_a);
      this.path = null;
      this.speed = 0;
      this._stepAccumulator = 0;
      this._emit('arrive', { node: destination });
      return false;
    }
    this.currentNode = this.path[this.segment];
    return true;
  }
}
