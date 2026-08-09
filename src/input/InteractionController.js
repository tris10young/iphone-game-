import * as THREE from 'three';

/**
 * Decides what a tap meant.
 *
 * A single raycast decides everything. If the frontmost surface under the
 * finger belongs to a mechanism, the tap activates it; otherwise the tap is
 * movement, and the hit point snaps to the nearest currently reachable
 * navigation node.
 */
export class InteractionController {
  constructor({ camera, input, nav, navigation, mechanisms, pickTargets }) {
    this.camera = camera;
    this.input = input;
    this.nav = nav;
    this.navigation = navigation;
    this.mechanisms = mechanisms;
    this.pickTargets = pickTargets;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.enabled = true;

    this._meshToMechanism = new Map();
    for (const mechanism of mechanisms) {
      for (const mesh of mechanism.pickables) this._meshToMechanism.set(mesh, mechanism);
    }

    this._listeners = { activate: [], move: [], reject: [], focus: [] };
    this._hovered = null;

    input.on('tap', (p) => this._onTap(p));
    input.on('hover', (p) => this._onHover(p));
    input.on('press', (p) => this._onHover(p));
    input.on('release', () => this._setHovered(null));
  }

  on(event, fn) {
    this._listeners[event].push(fn);
    return this;
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event]) fn(payload);
  }

  _cast(clientX, clientY, objects) {
    this.input.ndc(clientX, clientY, this.pointer);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, false);
  }

  /**
   * The frontmost mechanism in a set of hits, or null.
   *
   * It must genuinely be the nearest surface. Accepting a mechanism found
   * anywhere along the ray was a real bug -- the drum's floor slab sits just
   * behind the stair landing, so tapping the landing to walk there silently
   * rotated the tower instead. The small tolerance only covers decals that lie
   * flush on a mechanism's own surface, like the gold inlay on the bridge deck.
   */
  _frontMechanism(hits) {
    if (!hits.length) return null;
    const mechanismHit = hits.find((hit) => this._meshToMechanism.has(hit.object));
    if (!mechanismHit || mechanismHit.distance > hits[0].distance + 0.3) return null;
    return this._meshToMechanism.get(mechanismHit.object);
  }

  /**
   * Mechanism under the pointer.
   *
   * Deliberately a single, direct hit test with no screen-space forgiveness.
   * Sampling a ring around the tap was tried and is actively harmful here: the
   * drum stands immediately behind the stair landing and the elevator pedestal
   * sits on its own pad, so any radius large enough to help reaches a mechanism
   * that the player was not pointing at. Every control is large on screen at
   * this camera distance -- the drum is 9m across, the capstan around 40px --
   * so an exact hit is a fair requirement, and being wrong here silently
   * rearranges the level under the player.
   */
  _mechanismNear(x, y) {
    return this._frontMechanism(this._cast(x, y, this.pickTargets));
  }

  _onHover({ x, y }) {
    if (!this.enabled) return this._setHovered(null);
    const mechanism = this._mechanismNear(x, y);
    this._setHovered(mechanism && this._canActivate(mechanism) ? mechanism : null);
  }

  _setHovered(mechanism) {
    if (this._hovered === mechanism) return;
    this._hovered?.setHighlight(false);
    this._hovered = mechanism;
    this._hovered?.setHighlight(true);
  }

  /** An elevator you are not standing on should not answer to a tap. */
  _canActivate(mechanism) {
    if (!mechanism.enabled || mechanism.isMoving) return false;
    if (mechanism.requiresRider) {
      const node = this.navigation.currentNode;
      return !this.navigation.isWalking && node?.owner === mechanism;
    }
    return true;
  }

  _onTap({ x, y }) {
    if (!this.enabled) return;

    const hits = this._cast(x, y, this.pickTargets);
    if (!hits.length) return;

    const mechanism = this._mechanismNear(x, y);
    if (mechanism && this._canActivate(mechanism)) {
      // Stop first: walking while the ground rotates underfoot looks wrong, and
      // the graph would be re-pathing against nodes that are in motion.
      this.navigation.stop();
      if (mechanism.activate()) {
        this._emit('activate', { mechanism });
        return;
      }
    }

    // Falling through is deliberate. Tapping a lift you are not standing on
    // should walk you to it rather than doing nothing and beeping.
    const node = this.nav.nearestNode(hits[0].point, 5.0);
    if (node && this.navigation.goTo(node.id)) {
      this._emit('move', { node, point: hits[0].point });
      return;
    }
    this._emit('reject', { mechanism, node, point: hits[0].point });
  }

  /** Keep the highlight honest when a mechanism becomes (un)available. */
  refreshHover() {
    if (this._hovered && !this._canActivate(this._hovered)) this._setHovered(null);
  }
}
