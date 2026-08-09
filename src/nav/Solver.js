/**
 * Exhaustive level solver.
 *
 * Hand-placed levels go wrong silently: a platform moves, a gate points at the
 * wrong state, and the result still looks completely fine while being
 * impossible. So every level is proved solvable by brute force rather than by
 * playing it once and hoping.
 *
 * The search is a breadth-first walk over (mechanism states, where the player
 * is standing). Because it is breadth-first over *activations*, the first time
 * it reaches the portal is the genuine minimum number of taps -- which is also
 * the honest difficulty rating for the level.
 *
 * The state space is tiny (a handful of mechanisms with two to four states
 * each), so exhaustive really is exhaustive.
 */

/**
 * @param {object} level A level built by buildLevel().
 * @param {object} [options] `fromNodeId` starts the search from wherever the
 *   player actually is, which is what turns this into a live hint system.
 * @returns {{solvable: boolean, par: number, sequence: string[], reachable: number, visited: number}}
 */
export function solveLevel(level, { fromNodeId = null } = {}) {
  const mechanisms = level.mechanisms;
  const startNode = level.nav.get(fromNodeId ?? level.start);
  const goal = [...level.nav.nodes.values()].find((node) => node.tag === 'portal');
  if (!goal) throw new Error(`Level ${level.id}: no node tagged "portal"`);

  // Snapshot, because deciding reachability means driving the real mechanisms.
  const original = mechanisms.map((m) => ({ index: m.index, moving: m.isMoving }));
  const applyStates = (tuple) => {
    mechanisms.forEach((mechanism, i) => {
      mechanism.index = tuple[i];
      mechanism.isMoving = false;
    });
  };

  const key = (tuple, nodeId) => `${tuple.join(',')}|${nodeId}`;
  // The search always begins from wherever the mechanisms currently are, which
  // is the level's initial state during an audit and the live state for a hint.
  const startTuple = mechanisms.map((m) => m.index);

  const queue = [{ tuple: startTuple, node: startNode, cost: 0, sequence: [] }];
  const seen = new Set([key(startTuple, startNode.id)]);
  let result = { solvable: false, par: Infinity, sequence: [], reachable: 0, visited: 0 };

  while (queue.length) {
    const current = queue.shift();
    result.visited++;
    applyStates(current.tuple);

    // Everywhere the player can walk to right now costs no activations, so it
    // belongs in the same BFS layer.
    const reachable = walkableFrom(current.node);
    if (current.cost === 0) result.reachable = reachable.size;

    for (const node of reachable) {
      if (node.tag === 'portal') {
        restore(mechanisms, original);
        return { ...result, solvable: true, par: current.cost, sequence: current.sequence };
      }
    }

    for (let i = 0; i < mechanisms.length; i++) {
      const mechanism = mechanisms[i];
      if (mechanism.states.length < 2) continue;

      // Every node the player could be standing on is explored, not just one.
      // Where you stand genuinely matters even for mechanisms that can be
      // tapped from anywhere: turn a drum while standing inside its passage and
      // you are carried round to a different exit. Collapsing this to one
      // representative node made the search incomplete, and it silently missed
      // exactly that solution on the last level.
      for (const node of reachable) {
        // A lift only answers to someone standing on it; everything else can be
        // tapped from anywhere, because the camera can see the whole level.
        if (mechanism.requiresRider && node.owner !== mechanism) continue;

        const next = current.tuple.slice();
        next[i] = (next[i] + 1) % mechanism.states.length;
        const id = key(next, node.id);
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push({
          tuple: next,
          node,
          cost: current.cost + 1,
          // `at` is load-bearing: a caller replaying this solution has to stand
          // in the same place, or it will not reproduce.
          sequence: [...current.sequence, { id: mechanism.levelId ?? String(i), to: next[i], at: node.id }],
        });
      }
    }
  }

  restore(mechanisms, original);
  return result;
}

function restore(mechanisms, original) {
  mechanisms.forEach((mechanism, i) => {
    mechanism.index = original[i].index;
    mechanism.isMoving = original[i].moving;
    mechanism.applyState(mechanism.states[mechanism.index], 1);
  });
}

/** Every node reachable from `from` through currently open edges. */
function walkableFrom(from) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const node = stack.pop();
    for (const edge of node.edges) {
      if (!edge.open || seen.has(edge.to)) continue;
      seen.add(edge.to);
      stack.push(edge.to);
    }
  }
  return seen;
}

/**
 * Checks a level is not just solvable but *interesting*: the portal must be out
 * of reach before anything is touched. A level that is already solved is a bug
 * every bit as much as one that cannot be solved.
 */
export function auditLevel(level) {
  const solution = solveLevel(level);
  const startNode = level.nav.get(level.start);
  const reachableAtStart = walkableFrom(startNode);
  const alreadyOpen = [...reachableAtStart].some((node) => node.tag === 'portal');

  const orphans = [...level.nav.nodes.values()]
    .filter((node) => node.edges.length === 0)
    .map((node) => node.id);

  return {
    id: level.id,
    name: level.name,
    solvable: solution.solvable,
    par: solution.par,
    declaredPar: level.definition.par,
    sequence: solution.sequence,
    alreadyOpen,
    orphans,
    nodes: level.nav.nodes.size,
    mechanisms: level.mechanisms.length,
  };
}
