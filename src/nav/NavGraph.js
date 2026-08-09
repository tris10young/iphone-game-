import * as THREE from 'three';

/**
 * Walkable-space graph.
 *
 * A baked navmesh is the wrong tool for this level: half the walkable surface
 * sits on geometry that rotates, slides and rises, and rebaking on every frame
 * of a mechanism's animation is both expensive and fiddly. A graph sidesteps it
 * entirely -- a node can be parented to a moving part and simply travel with it,
 * and "the bridge now connects" is one edge switching from disabled to enabled.
 *
 * Node positions are stored in the local space of their parent, so world
 * positions are always derived from the parent's current transform. That is
 * what lets the character ride the elevator without any special-casing.
 */

const _v = new THREE.Vector3();

export class NavNode {
  constructor(id, local, parent = null, options = {}) {
    this.id = id;
    this.local = local.clone();
    this.parent = parent;
    /** Nodes on a mechanism are unreachable while that mechanism is in motion. */
    this.owner = options.owner ?? null;
    /** Marks the node the level-complete trigger watches for. */
    this.tag = options.tag ?? null;
    this.edges = [];
  }

  /** Current world position, following the parent transform. */
  worldPosition(target = new THREE.Vector3()) {
    target.copy(this.local);
    if (this.parent) {
      this.parent.updateWorldMatrix(true, false);
      target.applyMatrix4(this.parent.matrixWorld);
    }
    return target;
  }
}

class NavEdge {
  constructor(to, isOpen) {
    this.to = to;
    this.isOpen = isOpen ?? null;
  }
  get open() {
    return this.isOpen ? this.isOpen() === true : true;
  }
}

export class NavGraph {
  constructor() {
    /** @type {Map<string, NavNode>} */
    this.nodes = new Map();
  }

  addNode(id, local, parent = null, options = {}) {
    if (this.nodes.has(id)) throw new Error(`NavGraph: duplicate node "${id}"`);
    const node = new NavNode(id, local, parent, options);
    this.nodes.set(id, node);
    return node;
  }

  get(id) {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`NavGraph: unknown node "${id}"`);
    return node;
  }

  /**
   * Connect two nodes. `isOpen` is re-evaluated on every pathfinding query, so
   * mechanisms never have to push graph updates -- they just change state.
   */
  connect(aId, bId, isOpen = null) {
    const a = this.get(aId);
    const b = this.get(bId);
    a.edges.push(new NavEdge(b, isOpen));
    b.edges.push(new NavEdge(a, isOpen));
  }

  /** A node is only usable when its owning mechanism is at rest. */
  isNodeAvailable(node) {
    return !(node.owner && node.owner.isMoving);
  }

  /**
   * Nearest reachable node to a world point, within `maxDistance`.
   * Vertical distance is weighted heavily so a tap on an upper walkway never
   * snaps to the platform directly beneath it.
   */
  nearestNode(point, maxDistance = 4.5) {
    let best = null;
    let bestScore = Infinity;
    for (const node of this.nodes.values()) {
      if (!this.isNodeAvailable(node)) continue;
      node.worldPosition(_v);
      const dy = Math.abs(_v.y - point.y);
      const dxz = Math.hypot(_v.x - point.x, _v.z - point.z);
      if (dxz > maxDistance || dy > 2.6) continue;
      const score = dxz + dy * 2.4;
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  /**
   * A* over current world positions and currently open edges.
   * Returns an array of nodes from `fromId` to `toId`, or null.
   */
  findPath(fromId, toId) {
    const start = this.get(fromId);
    const goal = this.get(toId);
    if (start === goal) return [start];
    if (!this.isNodeAvailable(goal)) return null;

    const goalPos = goal.worldPosition(new THREE.Vector3());
    const heuristic = (node) => node.worldPosition(_v).distanceTo(goalPos);

    const gScore = new Map([[start, 0]]);
    const cameFrom = new Map();
    // The graph is small (a few dozen nodes), so a linear-scan open set is
    // faster in practice than maintaining a heap.
    const open = [start];
    const fScore = new Map([[start, heuristic(start)]]);
    const closed = new Set();

    const posA = new THREE.Vector3();
    const posB = new THREE.Vector3();

    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) {
        if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bestIndex]) ?? Infinity)) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0];
      if (current === goal) {
        const path = [current];
        let node = current;
        while (cameFrom.has(node)) {
          node = cameFrom.get(node);
          path.unshift(node);
        }
        return path;
      }
      closed.add(current);
      current.worldPosition(posA);

      for (const edge of current.edges) {
        if (!edge.open) continue;
        const next = edge.to;
        if (closed.has(next) || !this.isNodeAvailable(next)) continue;
        next.worldPosition(posB);
        const tentative = (gScore.get(current) ?? Infinity) + posA.distanceTo(posB);
        if (tentative >= (gScore.get(next) ?? Infinity)) continue;
        cameFrom.set(next, current);
        gScore.set(next, tentative);
        fScore.set(next, tentative + heuristic(next));
        if (!open.includes(next)) open.push(next);
      }
    }
    return null;
  }
}
