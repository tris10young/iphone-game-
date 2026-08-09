import * as THREE from 'three';
import { MeshBuilder } from './Build.js';
import { NavGraph } from '../nav/NavGraph.js';
import { MODULES } from './Modules.js';

/**
 * Turns a level definition into a scene graph, a navigation graph and a set of
 * mechanisms.
 *
 * A level is a list of module placements plus the links between their ports.
 * Modules own the relationship between geometry and navigation, so this file
 * only has to wire ports together and resolve gates.
 *
 * Gate syntax on a link is `<mechanismId>=<stateIndex>`: the link is open only
 * while that mechanism has settled into that state. Because edges re-evaluate
 * their predicate on every query, a mechanism never has to notify anything.
 */

export function buildLevel(definition) {
  const root = new THREE.Group();
  root.name = definition.id;

  const nav = new NavGraph();
  const mb = new MeshBuilder();
  const mechanismsById = new Map();
  const mechanisms = [];
  const pendingLinks = [];

  const ctx = {
    mb,
    root,
    pickTargets: [],
    pennants: [],
    portal: null,

    node(id, position, options = {}) {
      nav.addNode(id, position, null, options);
    },

    /** A node that rides a mechanism, expressed in that mechanism's local space. */
    mechNode(id, mechanismId, local, options = {}) {
      const mechanism = mechanismsById.get(mechanismId);
      if (!mechanism) throw new Error(`Level ${definition.id}: node "${id}" references unknown mechanism "${mechanismId}"`);
      nav.addNode(id, local, mechanism.group, { ...options, owner: mechanism });
    },

    /** Links are deferred so modules may link ports declared later. */
    link(a, b, gate = null) {
      pendingLinks.push([a, b, gate]);
    },

    mechanism(id, instance) {
      instance.levelId = id;
      mechanismsById.set(id, instance);
      mechanisms.push(instance);
      root.add(instance.group, instance.fixed);
    },
  };

  for (const placement of definition.modules) {
    const build = MODULES[placement.kind];
    if (!build) throw new Error(`Level ${definition.id}: unknown module "${placement.kind}"`);
    build(ctx, placement);
  }

  for (const [a, b, gate] of definition.links ?? []) pendingLinks.push([a, b, gate]);

  const staticMeshes = mb.build(root);

  for (const [a, b, gate] of pendingLinks) {
    nav.connect(a, b, gate ? makeGate(gate, mechanismsById, definition.id) : null);
  }

  const pickTargets = [
    ...staticMeshes,
    ...ctx.pickTargets,
    ...mechanisms.flatMap((m) => m.pickables),
  ];

  if (!ctx.portal) throw new Error(`Level ${definition.id}: no shrine module, so there is no goal`);

  return {
    definition,
    id: definition.id,
    name: definition.name,
    root,
    nav,
    mechanisms,
    mechanismsById,
    portal: ctx.portal,
    pennants: ctx.pennants,
    pickTargets,
    staticMeshes,
    start: definition.start,
    startFacing: definition.startFacing ?? null,
    focus: new THREE.Vector3(...definition.focus),
    camera: definition.camera ?? {},
  };
}

/** `"drum1=0"` -> a predicate that is true only when drum1 has settled in state 0. */
function makeGate(expression, mechanismsById, levelId) {
  const [id, rawIndex] = expression.split('=');
  const mechanism = mechanismsById.get(id.trim());
  if (!mechanism) throw new Error(`Level ${levelId}: gate "${expression}" references unknown mechanism`);
  const index = Number(rawIndex);
  if (!Number.isInteger(index)) throw new Error(`Level ${levelId}: gate "${expression}" has no state index`);
  if (index < 0 || index >= mechanism.states.length) {
    throw new Error(`Level ${levelId}: gate "${expression}" is out of range for ${mechanism.states.length} states`);
  }
  return () => !mechanism.isMoving && mechanism.index === index;
}

/** Releases every GPU resource a built level owns. */
export function disposeLevel(level) {
  level.root.traverse((object) => {
    object.geometry?.dispose?.();
    // Shared Materials are owned by the library, not by any one level; only
    // per-level materials (portal glow, mechanism sets) are disposed here.
    if (object.material?.userData?.perLevel) object.material.dispose();
  });
  for (const mechanism of level.mechanisms) mechanism.dispose();
  const portalData = level.portal?.userData;
  portalData?.glowMaterial?.map?.dispose();
  portalData?.glowMaterial?.dispose();
  portalData?.haloMaterial?.dispose();
  level.root.removeFromParent();
}
