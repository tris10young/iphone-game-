import * as THREE from 'three';
import {
  MeshBuilder, platform, staircase, pillar, archWall, carvedBand, parapet,
  cupola, dome, pennant,
} from './Build.js';
import { Materials } from './Materials.js';
import { Palette } from './Palette.js';
import { RotatingStructure } from '../puzzles/RotatingStructure.js';
import { SlidingStructure } from '../puzzles/SlidingStructure.js';
import { ElevatorPlatform } from '../puzzles/ElevatorPlatform.js';

/**
 * Level modules.
 *
 * Each module emits its geometry AND its navigation nodes from the same
 * numbers. That is the whole point: hand-placing ten levels is exactly the
 * situation where a platform gets nudged and its nav nodes are forgotten,
 * leaving a level that looks right and is quietly unsolvable. Here that cannot
 * happen -- move a pad and its nodes move with it.
 *
 * Every module declares ports: named nav nodes a level can link to. Port names
 * are `<moduleId>:<port>`; the module's own id alone is its main/centre node.
 */

const WARM = { top: Materials.stone, side: Materials.trim, deep: Materials.stoneDeep };
const COOL = { top: Materials.stoneCool, side: Materials.trim, deep: Materials.stoneDeep };
const styles = { warm: WARM, cool: COOL };

const v = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Context handed to every module: the shared static mesh builder, the nav
 * graph, the scene root, and the map of already-built mechanisms.
 */

/* ------------------------------------------------------------------ */
/* pad -- a walkable platform                                          */
/* ------------------------------------------------------------------ */

/**
 * Ports: `id` (centre), and `id:n` `id:s` `id:e` `id:w` at the edge midpoints,
 * each auto-linked to the centre. Only request the edges a level actually uses;
 * spare nodes make the tap-to-nearest-node snapping vaguer.
 */
export function pad(ctx, {
  id, x = 0, y = 0, z = 0, w = 8, d = 8,
  style = 'warm', taper = 3.5, thickness = 0.95,
  fence = [], pillars = [], edges = [], band = true, markers = false,
}) {
  const mats = styles[style];
  platform(ctx.mb, mats, { x, y, z, w, d, thickness, taperDepth: taper });
  if (band) {
    carvedBand(ctx.mb, Materials.trim,
      { x, y: y - thickness - 0.42, z, w: w + 0.5, d: d + 0.5, gap: 1.15, size: 0.28 });
  }

  for (const side of fence) {
    const along = side === 'n' || side === 's';
    parapet(ctx.mb, mats, {
      x: x + (side === 'e' ? w / 2 - 0.2 : side === 'w' ? -w / 2 + 0.2 : 0),
      y,
      z: z + (side === 's' ? d / 2 - 0.2 : side === 'n' ? -d / 2 + 0.2 : 0),
      length: (along ? w : d) - 1.0,
      ry: along ? 0 : Math.PI / 2,
    });
  }

  for (const [dx, dz, height = 4.2] of pillars) {
    pillar(ctx.mb, COOL, { x: x + dx, y, z: z + dz, height, radius: 0.44 });
    cupola(ctx.mb, COOL, { x: x + dx, y: y + height, z: z + dz, radius: 0.55, postHeight: 0.75,
      accent: Materials.ornament });
  }

  if (markers) {
    for (const sx of [-1, 1]) {
      const mx = x + sx * (w / 2 - 1.1);
      pillar(ctx.mb, mats, { x: mx, y, z: z + d / 2 - 1.0, height: 2.2, radius: 0.32 });
      dome(ctx.mb, Materials.ornament, { x: mx, y: y + 2.2, z: z + d / 2 - 1.0, radius: 0.48, height: 0.56 });
    }
  }

  ctx.node(id, v(x, y, z));
  const offsets = { n: [0, -d / 2 + 1.0], s: [0, d / 2 - 1.0], e: [w / 2 - 1.0, 0], w: [-w / 2 + 1.0, 0] };
  for (const side of edges) {
    const [ox, oz] = offsets[side];
    ctx.node(`${id}:${side}`, v(x + ox, y, z + oz));
    ctx.link(id, `${id}:${side}`);
  }
}

/* ------------------------------------------------------------------ */
/* flight -- a staircase                                               */
/* ------------------------------------------------------------------ */

/**
 * Ports: `id:a` at the bottom, `id:b` at the top, with intermediate nodes
 * chained between them so the traveller actually follows the slope.
 */
export function flight(ctx, { id, from, to, width = 3, steps = 9, style = 'warm', mid = 2 }) {
  const a = v(...from);
  const b = v(...to);
  staircase(ctx.mb, styles[style], { from: a, to: b, width, steps });

  ctx.node(`${id}:a`, a);
  let previous = `${id}:a`;
  for (let i = 1; i <= mid; i++) {
    const t = i / (mid + 1);
    const point = a.clone().lerp(b, t);
    const nodeId = `${id}:m${i}`;
    ctx.node(nodeId, point);
    ctx.link(previous, nodeId);
    previous = nodeId;
  }
  ctx.node(`${id}:b`, b);
  ctx.link(previous, `${id}:b`);
}

/* ------------------------------------------------------------------ */
/* drum -- a rotating tower section                                    */
/* ------------------------------------------------------------------ */

/**
 * A tower deck carrying a rotating drum with an arched passage through it.
 *
 * Ports: `id:s` and `id:n` are landings on the deck outside the drum, on the
 * tower's south and north edges. The passage nodes and the gated links joining
 * them to the landings are created here, so a level only has to say which
 * orientation counts as open.
 *
 * `states` are rotations in quarter-turns; the passage runs along local Z, so
 * a state of 0 connects south to north and 1 connects east to west.
 */
/** Local direction each opening name points along, before rotation. */
const OPENING_DIR = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] };

/** Which landing a world-space direction points at. */
function landingFor(dx, dz) {
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n');
}

/**
 * A tower deck carrying a rotating drum with a passage cut through it.
 *
 * Ports: `id:n` `id:s` `id:e` `id:w`, landings on the deck outside the drum.
 * They are deliberately NOT linked to each other -- the corner pillars block
 * the way round, so the drum is the only route between sides.
 *
 * `states` are rotations in quarter-turns. The gated links joining the passage
 * ends to the landings are generated here for every state, by working out which
 * way each opening actually points once rotated. That means a level can never
 * wire a drum wrongly: it picks a shape and a starting orientation, and the
 * connectivity follows.
 */
export function drum(ctx, {
  id, x = 0, y = 0, z = 0, size = 9, height = 5.5, deck = 12,
  states = [1, 0], initial = 0, shape = 'straight', shaft = 8.5, duration,
}) {
  // Tower deck. The drum stands on this, and it is the passage floor -- the
  // drum deliberately has no floor of its own (two coplanar faces z-fight).
  ctx.mb.box(deck, 1.2, deck, Materials.stone, { x, y: y - 0.6, z });
  ctx.mb.box(deck + 0.6, 0.3, deck + 0.6, Materials.trim, { x, y: y - 1.35, z });
  ctx.mb.taper(deck + 0.6, deck * 0.45, shaft, Materials.stoneDeep, { x, y: y - 1.5 - shaft / 2, z });
  ctx.mb.taper(deck * 0.45, 0.8, 4.0, Materials.stoneWarm, { x, y: y - 1.5 - shaft - 2.0, z });

  // Corner pillars. They are structural in the puzzle sense as well as the
  // visual one: they close the gap between drum and deck edge, so there is no
  // walk-around that would make the mechanism pointless.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = x + sx * (deck / 2 - 0.85);
      const pz = z + sz * (deck / 2 - 0.85);
      pillar(ctx.mb, COOL, { x: px, y, z: pz, height: height + 1.9, radius: 0.5 });
      cupola(ctx.mb, COOL, { x: px, y: y + height + 1.9, z: pz, radius: 0.62, postHeight: 0.85,
        accent: Materials.ornament });
    }
  }
  carvedBand(ctx.mb, Materials.trim, { x, y: y + 0.18, z, w: deck - 0.4, d: deck - 0.4, gap: 1.5, size: 0.3 });

  const mech = new RotatingStructure({
    x, y, z, size, height, shape,
    states: states.map((q) => (q * Math.PI) / 2),
    initialIndex: initial,
    duration,
  });
  ctx.mechanism(id, mech);

  // Landings on the deck, clear of the drum footprint.
  const reach = size / 2 + 0.9;
  ctx.node(`${id}:s`, v(x, y, z + reach));
  ctx.node(`${id}:n`, v(x, y, z - reach));
  ctx.node(`${id}:e`, v(x + reach, y, z));
  ctx.node(`${id}:w`, v(x - reach, y, z));

  // Passage nodes ride the drum, so they swing with it.
  const inner = size / 2 - 0.9;
  ctx.mechNode(`${id}:pc`, id, v(0, 0, 0));
  mech.openings.forEach((name, i) => {
    const [lx, lz] = OPENING_DIR[name];
    ctx.mechNode(`${id}:p${i}`, id, v(lx * inner, 0, lz * inner));
    ctx.link(`${id}:p${i}`, `${id}:pc`);
  });

  // For every orientation, work out which landing each opening faces.
  states.forEach((quarter, stateIndex) => {
    const angle = (quarter * Math.PI) / 2;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    mech.openings.forEach((name, i) => {
      const [lx, lz] = OPENING_DIR[name];
      // Rotation about Y: (x,z) -> (x cos + z sin, -x sin + z cos)
      const side = landingFor(lx * cos + lz * sin, -lx * sin + lz * cos);
      ctx.link(`${id}:p${i}`, `${id}:${side}`, `${id}=${stateIndex}`);
    });
  });
}

/* ------------------------------------------------------------------ */
/* span -- a sliding bridge                                            */
/* ------------------------------------------------------------------ */

/**
 * A deck parked on a siding that slides sideways into line with the crossing.
 * Ports: `id:a` (low-x end) and `id:b` (high-x end), both riding the deck.
 * Levels link them to their terraces with the `id=1` gate.
 */
export function span(ctx, {
  id, x = 0, y = 0, z = 0, length = 8.8, width = 3, travel = 6.5,
  wheel = { x: -6.25, z: 1.5 }, duration,
}) {
  const mech = new SlidingStructure({ x, y, z, length, width, travel, wheel, duration });
  ctx.mechanism(id, mech);

  // Plinths under the parked deck, so it is not floating unexplained.
  for (const side of [-1, 1]) {
    ctx.mb.box(1.1, 1.0, 1.4, Materials.stoneDeep,
      { x: x + side * (length / 2 - 0.5), y: y - 0.85, z: z + travel });
  }

  const reach = length / 2 - 1.0;
  ctx.mechNode(`${id}:a`, id, v(-reach, 0, 0));
  ctx.mechNode(`${id}:c`, id, v(0, 0, 0));
  ctx.mechNode(`${id}:b`, id, v(reach, 0, 0));
  ctx.link(`${id}:a`, `${id}:c`);
  ctx.link(`${id}:c`, `${id}:b`);
}

/* ------------------------------------------------------------------ */
/* shaft -- an elevator                                                */
/* ------------------------------------------------------------------ */

/**
 * A pad on guide posts. Port `id` is the pad itself; it must be ridden, so the
 * level gates its lower link on `id=0` and its upper link on `id=1`.
 */
export function shaft(ctx, { id, x = 0, y = 0, z = 0, size = 4.6, rise = 14, duration }) {
  const mech = new ElevatorPlatform({ x, y, z, size, rise, duration });
  ctx.mechanism(id, mech);
  ctx.mechNode(id, id, v(0, 0, 0));
}

/* ------------------------------------------------------------------ */
/* shrine -- the goal                                                  */
/* ------------------------------------------------------------------ */

/**
 * A small open temple with the portal set into its rear wall.
 *
 * Built in local space and placed as a unit, so `ry` can aim it anywhere
 * without a single coordinate being recalculated. Port `id` is the standing
 * node in front of the portal, and it carries the tag the completion trigger
 * watches for.
 */
export function shrine(ctx, { id, x = 0, y = 0, z = 0, ry = 0, w = 10, d = 10, grand = false }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = ry;
  group.name = `${id}_shrine`;
  ctx.root.add(group);

  const mb = new MeshBuilder();
  platform(mb, COOL, { x: 0, y: 0, z: 0, w, d, thickness: 1.0, taperDepth: 3.6 });
  carvedBand(mb, Materials.trim, { y: -1.4, w: w + 0.4, d: d + 0.4, gap: 1.15, size: 0.3 });

  const columns = grand ? 4 : 3;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < columns; i++) {
      const pz = -d / 2 + 2.4 + (i * (d - 4.8)) / Math.max(1, columns - 1);
      pillar(mb, COOL, { x: sx * (w / 2 - 1.1), y: 0, z: pz, height: 5.2, radius: 0.46 });
    }
    mb.box(1.5, 0.5, d - 1.6, Materials.stone, { x: sx * (w / 2 - 1.1), y: 5.45, z: 0 });
  }

  // Entrance arch, and the portal itself pierced through the rear wall.
  archWall(mb, Materials.stone, {
    z: d / 2 - 0.6, width: w - 1.0, height: 6.2, depth: 1.0, openWidth: 3.6, openHeight: 4.6,
  });
  archWall(mb, Materials.stone, {
    z: -d / 2 + 0.5, width: w - 1.0, height: 6.2, depth: 1.0, openWidth: 3.2, openHeight: 4.4,
  });

  const roofDepth = 3.4;
  const roofZ = -d / 2 + roofDepth / 2 + 0.2;
  mb.box(w + 0.4, 0.55, roofDepth + 0.4, Materials.stone, { y: 6.2, z: roofZ });
  mb.box(w - 1.6, 0.5, roofDepth, Materials.stoneWarm, { y: 6.7, z: roofZ });
  mb.box(w - 3.4, 0.45, roofDepth - 1.2, Materials.trim, { y: 7.15, z: roofZ });
  mb.box(0.6, 0.8, 0.6, Materials.gold, { y: 7.75, z: roofZ, ry: Math.PI / 4 });
  const meshes = mb.build(group);

  const mast = pennant(group, Materials.stoneCool, Materials.ornament, { y: 8.1, z: roofZ, height: 3.0 });
  ctx.pennants.push(mast.flag);

  const portal = buildPortal(v(0, 0, -d / 2 + 0.5));
  group.add(portal);
  ctx.portal = portal;
  ctx.pickTargets.push(...meshes);

  // The standing node in front of the portal, transformed out of local space.
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const lz = -d / 2 + 2.3;
  ctx.node(id, v(x + lz * sin, y, z + lz * cos), { tag: 'portal' });
  const lz2 = 1.0;
  ctx.node(`${id}:in`, v(x + lz2 * sin, y, z + lz2 * cos));
  ctx.link(`${id}:in`, id);
  const lz3 = d / 2 - 1.4;
  ctx.node(`${id}:door`, v(x + lz3 * sin, y, z + lz3 * cos));
  ctx.link(`${id}:door`, `${id}:in`);
}

function buildPortal(position) {
  const portal = new THREE.Group();
  portal.name = 'portal';
  portal.position.copy(position);

  const frameMb = new MeshBuilder();
  for (const sx of [-1, 1]) frameMb.box(0.22, 4.5, 1.06, Materials.turquoise, { x: sx * 1.68, y: 2.1 });
  frameMb.box(3.6, 0.22, 1.06, Materials.turquoise, { y: 4.5 });
  frameMb.box(0.55, 0.55, 0.55, Materials.gold, { y: 4.95, ry: Math.PI / 4 });
  frameMb.build(portal);

  const texture = makeGlowTexture();
  const glowMat = new THREE.MeshBasicMaterial({
    color: Palette.portal, map: texture, transparent: true, opacity: 0.62,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.3), glowMat);
  glow.position.set(0, 2.2, 0.05);
  portal.add(glow);

  const haloMat = new THREE.MeshBasicMaterial({
    color: Palette.portal, map: texture, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), haloMat);
  halo.position.set(0, 2.3, 0.42);
  portal.add(halo);

  const light = new THREE.PointLight(Palette.portal, 14, 16, 2);
  light.position.set(0, 2.4, 1.6);
  portal.add(light);

  portal.userData = { glow, glowMaterial: glowMat, halo, haloMaterial: haloMat, light };
  return portal;
}

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const MODULES = { pad, flight, drum, span, shaft, shrine };
