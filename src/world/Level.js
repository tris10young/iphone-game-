import * as THREE from 'three';
import {
  MeshBuilder, platform, staircase, pillar, archWall, carvedBand, parapet,
  cupola, dome, pennant, windowSlot,
} from './Build.js';
import { Materials } from './Materials.js';
import { Palette } from './Palette.js';
import { NavGraph } from '../nav/NavGraph.js';
import { RotatingStructure } from '../puzzles/RotatingStructure.js';
import { SlidingStructure } from '../puzzles/SlidingStructure.js';
import { ElevatorPlatform } from '../puzzles/ElevatorPlatform.js';

/**
 * Puzzle_01 -- "Skyward".
 *
 * One floating structure, roughly 40 metres from the underside of the start
 * platform to the temple roof, climbing in a spiral so the destination is
 * visible from the very first frame.
 *
 * The route:
 *   start platform -> stairs -> [ROTATING TOWER] -> stairs -> terrace A
 *   -> [SLIDING BRIDGE] -> terrace B -> [ELEVATOR] -> upper landing
 *   -> temple -> portal
 *
 * All layout numbers live in LAYOUT so the level can be retuned in one place.
 */

export const LAYOUT = {
  start: { x: 0, y: 0, z: 14, w: 8, d: 7 },
  stairs1: { from: { x: 0, y: 0, z: 10.3 }, to: { x: 0, y: 5, z: 5.4 }, width: 3.2, steps: 9 },
  towerBase: { x: 0, y: 5, z: 0, w: 12, d: 12 },
  drum: { x: 0, y: 5, z: 0, size: 9, height: 5.5 },
  stairs2: { from: { x: 0, y: 5, z: -5.6 }, to: { x: 0, y: 11, z: -10.6 }, width: 3.0, steps: 10 },
  terraceA: { x: 0, y: 11, z: -13, w: 9, d: 7 },
  bridge: { x: 8.75, y: 11, z: -13, length: 8.8, width: 3.0, travel: 6.5 },
  terraceB: { x: 17.5, y: 11, z: -13, w: 9, d: 9 },
  elevator: { x: 19.6, y: 11, z: -13, size: 4.6, rise: 14 },
  // The upper level doubles back west over terrace A rather than continuing
  // north. On a portrait phone the frame is far taller than it is wide, so a
  // structure that sprawls horizontally simply cannot be seen; folding the
  // route back over itself keeps the whole diorama in shot and puts the temple
  // dramatically above ground the player has already walked.
  landing: { x: 14.6, y: 25, z: -13, w: 5.2, d: 5.0 },
  temple: { x: 7, y: 25, z: -13, w: 10, d: 10, rotation: Math.PI / 2 },
  /** Portal position in the temple's local space (entrance faces local +Z). */
  portalLocal: { x: 0, y: 0, z: -4.5 },
};

/** Roughly the centre of mass of the structure -- the camera orbits this. */
export const LEVEL_FOCUS = new THREE.Vector3(7, 13.5, -5);

const STATIC_MATS = { top: Materials.stone, side: Materials.trim, deep: Materials.stoneDeep };
const COOL_MATS = { top: Materials.stoneCool, side: Materials.trim, deep: Materials.stoneDeep };

export function buildLevel() {
  const root = new THREE.Group();
  root.name = 'Puzzle_01';

  const nav = new NavGraph();
  const mb = new MeshBuilder();

  buildStart(mb);
  buildTower(mb);
  buildTerraceA(mb);
  buildTerraceB(mb);
  buildLanding(mb);

  const staticMeshes = mb.build(root);
  const temple = buildTemple();
  root.add(temple.group);

  // --- mechanisms -------------------------------------------------------
  const rotating = new RotatingStructure(LAYOUT.drum);
  const sliding = new SlidingStructure({ ...LAYOUT.bridge, wheel: { x: -6.25, z: 1.5 } });
  const elevator = new ElevatorPlatform(LAYOUT.elevator);
  const mechanisms = [rotating, sliding, elevator];
  for (const mech of mechanisms) {
    root.add(mech.group, mech.fixed);
  }

  buildNav(nav, { rotating, sliding, elevator });

  const pickTargets = [
    ...staticMeshes,
    ...temple.meshes,
    ...mechanisms.flatMap((m) => m.pickables),
  ];

  return {
    root, nav, mechanisms, rotating, sliding, elevator,
    portal: temple.portal, pennant: temple.pennant, pickTargets, staticMeshes,
  };
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function buildStart(mb) {
  const s = LAYOUT.start;
  platform(mb, STATIC_MATS, { ...s, thickness: 1.0, taperDepth: 4.5 });
  carvedBand(mb, Materials.trim, { x: s.x, y: s.y - 1.35, z: s.z, w: s.w + 0.5, d: s.d + 0.5, gap: 1.1 });

  // A pair of domed markers frame the departure point without a HUD arrow.
  for (const sx of [-1, 1]) {
    pillar(mb, STATIC_MATS, { x: s.x + sx * 2.9, y: s.y, z: s.z + 2.3, height: 2.4, radius: 0.34 });
    dome(mb, Materials.ornament, { x: s.x + sx * 2.9, y: s.y + 2.4, z: s.z + 2.3, radius: 0.52, height: 0.62 });
    mb.box(0.14, 0.34, 0.14, Materials.gold, { x: s.x + sx * 2.9, y: s.y + 3.2, z: s.z + 2.3 });
  }
  parapet(mb, STATIC_MATS, { x: s.x, y: s.y, z: s.z + s.d / 2 - 0.2, length: s.w - 1.4 });

  staircase(mb, STATIC_MATS, LAYOUT.stairs1);
}

function buildTower(mb) {
  const t = LAYOUT.towerBase;
  // The tower is the level's anchor: a broad deck on a deep tapering shaft.
  mb.box(t.w, 1.2, t.d, Materials.stone, { x: t.x, y: t.y - 0.6, z: t.z });
  mb.box(t.w + 0.6, 0.3, t.d + 0.6, Materials.trim, { x: t.x, y: t.y - 1.35, z: t.z });
  mb.taper(t.w + 0.6, 5.2, 8.5, Materials.stoneDeep, { x: t.x, y: t.y - 5.75, z: t.z });
  mb.taper(5.2, 0.8, 4.0, Materials.stoneWarm, { x: t.x, y: t.y - 12.0, z: t.z });

  // Corner pillars rising past the drum give the tower a real silhouette, each
  // capped with a domed cupola so the skyline is not four flat stumps.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = t.x + sx * (t.w / 2 - 0.85);
      const pz = t.z + sz * (t.d / 2 - 0.85);
      pillar(mb, COOL_MATS, { x: px, y: t.y, z: pz, height: 7.4, radius: 0.5 });
      cupola(mb, COOL_MATS, { x: px, y: t.y + 7.4, z: pz, radius: 0.62, postHeight: 0.85,
        accent: Materials.ornament });
    }
  }

  // Windows in the tower flanks, so the shaft below the drum is not blank.
  for (const sz of [-1, 1]) {
    for (const offset of [-2.6, 0, 2.6]) {
      windowSlot(mb, STATIC_MATS, {
        x: t.x + offset, y: t.y - 4.4, z: t.z + sz * (t.w / 2 - 1.1), width: 0.62, height: 1.5,
      });
    }
  }
  carvedBand(mb, Materials.trim, { x: t.x, y: t.y + 0.18, z: t.z, w: t.w - 0.4, d: t.d - 0.4, gap: 1.5, size: 0.3 });

  staircase(mb, STATIC_MATS, LAYOUT.stairs2);
}

function buildTerraceA(mb) {
  const a = LAYOUT.terraceA;
  platform(mb, STATIC_MATS, { ...a, thickness: 0.95, taperDepth: 4.0 });
  // Fence the three sides that are not the crossing.
  parapet(mb, STATIC_MATS, { x: a.x - a.w / 2 + 0.2, y: a.y, z: a.z, length: a.d - 1.0, ry: Math.PI / 2 });
  parapet(mb, STATIC_MATS, { x: a.x, y: a.y, z: a.z - a.d / 2 + 0.2, length: a.w - 1.0 });
  pillar(mb, COOL_MATS, { x: a.x - 3.2, y: a.y, z: a.z - 2.4, height: 4.2, radius: 0.42 });
  pillar(mb, COOL_MATS, { x: a.x - 3.2, y: a.y, z: a.z + 2.4, height: 4.2, radius: 0.42 });
  mb.box(7.4, 0.4, 0.7, Materials.trim, { x: a.x - 3.2, y: a.y + 4.3, z: a.z });

  // Plinths that carry the parked bridge, so it is not floating unexplained.
  const b = LAYOUT.bridge;
  for (const rail of [-1, 1]) {
    const rx = b.x + rail * (b.length / 2 - 0.5);
    mb.box(1.1, 1.0, 1.4, Materials.stoneDeep, { x: rx, y: b.y - 0.85, z: b.z + b.travel });
  }
}

function buildTerraceB(mb) {
  const t = LAYOUT.terraceB;
  const e = LAYOUT.elevator;
  const half = e.size / 2;
  const west = { x0: t.x - t.w / 2, x1: e.x - half };
  // Built as three blocks around the elevator well.
  const blocks = [
    { x: (west.x0 + west.x1) / 2, z: t.z, w: west.x1 - west.x0, d: t.d },
    { x: e.x + 0.05, z: t.z - t.d / 2 + 1.1, w: t.w - (west.x1 - west.x0), d: 2.2 },
    { x: e.x + 0.05, z: t.z + t.d / 2 - 1.1, w: t.w - (west.x1 - west.x0), d: 2.2 },
  ];
  for (const b of blocks) {
    platform(mb, STATIC_MATS, { x: b.x, y: t.y, z: b.z, w: b.w, d: b.d, thickness: 0.95, taperDepth: 0 });
  }
  // One shared tapered underside keeps the three blocks reading as one rock.
  mb.taper(t.w + 0.4, 4.0, 5.5, Materials.stoneDeep, { x: t.x, y: t.y - 1.2 - 2.75, z: t.z });
  mb.box(t.w + 0.5, 0.24, t.d + 0.5, Materials.trim, { x: t.x, y: t.y - 1.06, z: t.z });

  parapet(mb, STATIC_MATS, { x: t.x, y: t.y, z: t.z - t.d / 2 + 0.2, length: 4.0, ry: 0 });
  parapet(mb, STATIC_MATS, { x: t.x, y: t.y, z: t.z + t.d / 2 - 0.2, length: 4.0, ry: 0 });
  for (const sz of [-1, 1]) {
    cupola(mb, COOL_MATS, { x: t.x - 3.6, y: t.y + 4.6, z: t.z + sz * 3.4, radius: 0.55,
      postHeight: 0.75, accent: Materials.ornament });
  }
  pillar(mb, COOL_MATS, { x: t.x - 3.6, y: t.y, z: t.z - 3.4, height: 4.6, radius: 0.44 });
  pillar(mb, COOL_MATS, { x: t.x - 3.6, y: t.y, z: t.z + 3.4, height: 4.6, radius: 0.44 });
}

function buildLanding(mb) {
  const l = LAYOUT.landing;
  platform(mb, COOL_MATS, { ...l, thickness: 0.85, taperDepth: 2.6 });
  // Fenced north and south only: east is the arrival from the elevator, west is
  // the way on to the temple, and both must stay walkable.
  for (const sz of [-1, 1]) {
    parapet(mb, COOL_MATS, { x: l.x, y: l.y, z: l.z + sz * (l.d / 2 - 0.2), length: l.w - 0.6 });
  }
  carvedBand(mb, Materials.trim, { x: l.x, y: l.y - 1.15, z: l.z, w: l.w + 0.3, d: l.d + 0.3, gap: 1.2, size: 0.26 });
}

/**
 * The temple and the portal it houses.
 *
 * Built in its own local space (walkable floor at y=0, entrance facing +Z) and
 * then placed and rotated as a unit, so the upper level can be re-aimed without
 * touching a single coordinate in here.
 */
function buildTemple() {
  const t = LAYOUT.temple;
  const group = new THREE.Group();
  group.name = 'temple';
  group.position.set(t.x, t.y, t.z);
  group.rotation.y = t.rotation;

  const mb = new MeshBuilder();
  platform(mb, COOL_MATS, { x: 0, y: 0, z: 0, w: t.w, d: t.d, thickness: 1.0, taperDepth: 3.6 });
  carvedBand(mb, Materials.trim, { y: -1.4, w: t.w + 0.4, d: t.d + 0.4, gap: 1.15, size: 0.3 });

  // Colonnade down both long sides, carrying an architrave.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      pillar(mb, COOL_MATS, { x: sx * (t.w / 2 - 1.1), y: 0, z: -3.3 + i * 2.2, height: 5.2, radius: 0.46 });
    }
    mb.box(1.5, 0.5, t.d - 1.6, Materials.stone, { x: sx * (t.w / 2 - 1.1), y: 5.45, z: 0 });
  }
  // Entrance arch, so arrival is framed.
  archWall(mb, Materials.stone, {
    z: t.d / 2 - 0.6, width: t.w - 1.0, height: 6.2,
    depth: 1.0, openWidth: 3.6, openHeight: 4.6,
  });
  // Rear wall, pierced by the portal doorway itself rather than standing behind
  // it -- the goal should be a way through the temple, not an object inside it.
  archWall(mb, Materials.stone, {
    y: 0, z: -t.d / 2 + 0.5, width: t.w - 1.0, height: 6.2,
    depth: 1.0, openWidth: 3.2, openHeight: 4.4,
  });

  // The roof covers only the rear bay, over the portal. A full lid would be
  // correct architecture and completely wrong for this game -- the camera looks
  // down on the temple, and a closed roof hides the one thing the player has
  // spent the whole level climbing toward.
  const roofDepth = 3.4;
  const roofZ = -t.d / 2 + roofDepth / 2 + 0.2;
  mb.box(t.w + 0.4, 0.55, roofDepth + 0.4, Materials.stone, { y: 6.2, z: roofZ });
  mb.box(t.w - 1.6, 0.5, roofDepth, Materials.stoneWarm, { y: 6.7, z: roofZ });
  mb.box(t.w - 3.4, 0.45, roofDepth - 1.2, Materials.trim, { y: 7.15, z: roofZ });
  mb.box(0.6, 0.8, 0.6, Materials.gold, { y: 7.75, z: roofZ, ry: Math.PI / 4 });

  const meshes = mb.build(group);

  // A pennant over the temple. It is the only thing in the level that moves
  // without the player asking, which is exactly why it earns its triangles.
  const mast = pennant(group, Materials.stoneCool, Materials.ornament,
    { y: 8.1, z: roofZ, height: 3.0 });
  group.userData.pennant = mast.flag;

  const portal = buildPortal();
  group.add(portal);
  return { group, portal, meshes, pennant: mast.flag };
}

function buildPortal() {
  const p = LAYOUT.portalLocal;
  const portal = new THREE.Group();
  portal.name = 'portal';
  portal.position.set(p.x, p.y, p.z);

  // A slim turquoise lining inside the doorway, colour-coding it as the goal
  // without competing with the light itself.
  const frameMb = new MeshBuilder();
  for (const sx of [-1, 1]) {
    frameMb.box(0.22, 4.5, 1.06, Materials.turquoise, { x: sx * 1.68, y: 2.1 });
  }
  frameMb.box(3.6, 0.22, 1.06, Materials.turquoise, { y: 4.5 });
  frameMb.box(0.55, 0.55, 0.55, Materials.gold, { y: 4.95, ry: Math.PI / 4 });
  frameMb.build(portal);

  // The light itself. Both sheets are masked by a soft radial gradient: a
  // hard-edged additive quad reads as a flat teal panel filling the doorway,
  // which is exactly what it looked like before the mask was added.
  const glowTexture = makeGlowTexture();
  const glowMat = new THREE.MeshBasicMaterial({
    color: Palette.portal,
    map: glowTexture,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.3), glowMat);
  glow.position.set(0, 2.2, 0.05);
  glow.name = 'portalGlow';
  portal.add(glow);
  portal.userData.glow = glow;
  portal.userData.glowMaterial = glowMat;

  // A wider, fainter halo that sells light spilling onto the temple floor.
  const haloMat = new THREE.MeshBasicMaterial({
    color: Palette.portal, map: glowTexture, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), haloMat);
  halo.position.set(0, 2.3, 0.42);
  portal.add(halo);
  portal.userData.halo = halo;
  portal.userData.haloMaterial = haloMat;

  const light = new THREE.PointLight(Palette.portal, 14, 16, 2);
  light.position.set(0, 2.4, 1.6);
  portal.add(light);
  portal.userData.light = light;

  return portal;
}

/**
 * Soft radial falloff, generated rather than loaded so the game ships with no
 * image assets. Elliptical so the portal reads as a doorway of light rather
 * than a circle.
 */
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

/* ------------------------------------------------------------------ */
/* Navigation graph                                                    */
/* ------------------------------------------------------------------ */

const v = (x, y, z) => new THREE.Vector3(x, y, z);

function buildNav(nav, { rotating, sliding, elevator }) {
  const L = LAYOUT;

  // --- start platform and first staircase ---
  nav.addNode('start', v(L.start.x, 0, L.start.z + 1.6));
  nav.addNode('start_n', v(L.start.x, 0, L.stairs1.from.z));
  nav.addNode('stair1_a', v(0, 1.67, 8.67));
  nav.addNode('stair1_b', v(0, 3.33, 7.03));
  nav.addNode('tower_s', v(0, 5, L.stairs1.to.z));
  nav.connect('start', 'start_n');
  nav.connect('start_n', 'stair1_a');
  nav.connect('stair1_a', 'stair1_b');
  nav.connect('stair1_b', 'tower_s');

  // --- rotating tower passage (nodes ride the drum) ---
  const drumOpts = { owner: rotating };
  const reach = L.drum.size / 2 - 0.9;
  nav.addNode('drum_s', v(0, 0, reach), rotating.group, drumOpts);
  nav.addNode('drum_c', v(0, 0, 0), rotating.group, drumOpts);
  nav.addNode('drum_n', v(0, 0, -reach), rotating.group, drumOpts);
  nav.connect('drum_s', 'drum_c');
  nav.connect('drum_c', 'drum_n');

  nav.addNode('tower_n', v(0, 5, L.stairs2.from.z));
  // The passage only connects when the drum has settled square.
  const drumAligned = () => rotating.isAligned;
  nav.connect('tower_s', 'drum_s', drumAligned);
  nav.connect('drum_n', 'tower_n', drumAligned);

  // --- second staircase down to terrace A ---
  nav.addNode('stair2_a', v(0, 7, -7.27));
  nav.addNode('stair2_b', v(0, 9, -8.93));
  nav.addNode('ta_in', v(0, 11, L.stairs2.to.z));
  nav.connect('tower_n', 'stair2_a');
  nav.connect('stair2_a', 'stair2_b');
  nav.connect('stair2_b', 'ta_in');

  // --- terrace A ---
  nav.addNode('ta_c', v(L.terraceA.x, 11, L.terraceA.z));
  nav.addNode('ta_w', v(L.terraceA.x - 3.0, 11, L.terraceA.z));
  nav.addNode('ta_e', v(L.terraceA.x + 4.0, 11, L.terraceA.z));
  nav.connect('ta_in', 'ta_c');
  nav.connect('ta_c', 'ta_w');
  nav.connect('ta_c', 'ta_e');

  // --- sliding bridge (nodes ride the deck) ---
  const bridgeOpts = { owner: sliding };
  const deckReach = L.bridge.length / 2 - 1.0;
  nav.addNode('bridge_in', v(-deckReach, 0, 0), sliding.group, bridgeOpts);
  nav.addNode('bridge_c', v(0, 0, 0), sliding.group, bridgeOpts);
  nav.addNode('bridge_out', v(deckReach, 0, 0), sliding.group, bridgeOpts);
  nav.connect('bridge_in', 'bridge_c');
  nav.connect('bridge_c', 'bridge_out');

  const bridgeAligned = () => sliding.isAligned;
  nav.addNode('tb_w', v(L.terraceB.x - L.terraceB.w / 2 + 0.7, 11, L.terraceB.z));
  nav.connect('ta_e', 'bridge_in', bridgeAligned);
  nav.connect('bridge_out', 'tb_w', bridgeAligned);

  // --- terrace B up to the elevator ---
  nav.addNode('tb_c', v(L.terraceB.x - 2.0, 11, L.terraceB.z));
  nav.connect('tb_w', 'tb_c');

  nav.addNode('lift', v(0, 0, 0), elevator.group, { owner: elevator });
  const liftDown = () => !elevator.isMoving && elevator.index === 0;
  const liftUp = () => !elevator.isMoving && elevator.index === 1;
  nav.connect('tb_c', 'lift', liftDown);

  // --- upper landing, temple, portal ---
  // The temple is rotated, so its walkway nodes are defined in temple-local
  // space and transformed once here rather than hand-converted.
  const T = L.temple;
  const templeWorld = (lx, lz) => {
    const cos = Math.cos(T.rotation), sin = Math.sin(T.rotation);
    return v(T.x + lx * cos + lz * sin, T.y, T.z - lx * sin + lz * cos);
  };

  nav.addNode('landing_e', v(L.landing.x + L.landing.w / 2 - 0.9, 25, L.landing.z));
  nav.addNode('landing_w', v(L.landing.x - L.landing.w / 2 + 0.6, 25, L.landing.z));
  nav.connect('lift', 'landing_e', liftUp);
  nav.connect('landing_e', 'landing_w');

  nav.addNode('temple_in', templeWorld(0, T.d / 2 - 1.3));
  nav.addNode('temple_c', templeWorld(0, 0));
  nav.addNode('portal', templeWorld(0, L.portalLocal.z + 1.8), null, { tag: 'portal' });
  nav.connect('landing_w', 'temple_in');
  nav.connect('temple_in', 'temple_c');
  nav.connect('temple_c', 'portal');
}
