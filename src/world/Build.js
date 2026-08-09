import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Geometry toolkit for the diorama.
 *
 * Two ideas carry the whole art direction:
 *
 * 1. Architecture is assembled from named parts (steps, pillars, arches,
 *    terraces with lips and carved bands) rather than raw boxes. A plain slab
 *    reads as a prototype; the same slab with a 12cm lip and a carved band
 *    reads as deliberate stonework.
 *
 * 2. Everything that shares a material is merged into one mesh before it
 *    reaches the GPU, so all that detail still costs only a few draw calls.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Compose a transform. Rotations are in radians, XYZ order. */
export function xform({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _p.set(x, y, z);
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/**
 * Accumulates geometry per material, then emits one merged mesh per material.
 * Reused for the static level and for each moving mechanism.
 */
export class MeshBuilder {
  constructor() {
    /** @type {Map<THREE.Material, THREE.BufferGeometry[]>} */
    this.buckets = new Map();
  }

  /** Add a geometry under `material`, transformed by `matrix`. */
  add(geometry, material, matrix) {
    // mergeGeometries requires every input to agree on indexing and on the
    // attribute set. Primitives arrive indexed but ExtrudeGeometry does not, so
    // everything is flattened to non-indexed here -- a small memory cost for
    // the freedom to mix arches and boxes in the same merged mesh.
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    // None of our materials sample a map, so extra UV sets are dead weight.
    g.deleteAttribute('uv1');
    g.deleteAttribute('uv2');
    let bucket = this.buckets.get(material);
    if (!bucket) this.buckets.set(material, (bucket = []));
    bucket.push(g);
    return this;
  }

  box(w, h, d, material, transform) {
    return this.add(new THREE.BoxGeometry(w, h, d), material, xform(transform));
  }

  /** A square frustum: the tapered underside that makes a platform read as floating. */
  taper(topSize, bottomSize, height, material, transform) {
    const g = new THREE.CylinderGeometry(
      (topSize / 2) * Math.SQRT2, (bottomSize / 2) * Math.SQRT2, height, 4, 1);
    g.rotateY(Math.PI / 4);
    return this.add(g, material, xform(transform));
  }

  cylinder(radius, height, material, transform, segments = 12) {
    return this.add(new THREE.CylinderGeometry(radius, radius, height, segments), material, xform(transform));
  }

  /** Build every accumulated bucket into merged meshes parented to `target`. */
  build(target, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [material, geometries] of this.buckets) {
      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      target.add(mesh);
      meshes.push(mesh);
      for (const g of geometries) if (g !== merged) g.dispose();
    }
    this.buckets.clear();
    return meshes;
  }
}

/* ------------------------------------------------------------------ */
/* Architectural parts                                                 */
/* ------------------------------------------------------------------ */

/**
 * A platform with a decorative lip and an optional tapered underside.
 * `y` is the walkable surface height.
 */
export function platform(mb, mats, {
  x = 0, y = 0, z = 0, w = 8, d = 8,
  thickness = 0.9, lip = 0.28, taperDepth = 3.5, ry = 0,
} = {}) {
  const top = mats.top, side = mats.side, deep = mats.deep;
  // Main slab, its top face flush with `y`.
  mb.box(w, thickness, d, top, { x, y: y - thickness / 2, z, ry });
  // Overhanging lip just under the surface reads as a carved stone edge.
  mb.box(w + lip * 2, 0.22, d + lip * 2, side, { x, y: y - thickness - 0.11, z, ry });
  if (taperDepth > 0) {
    mb.taper(w + lip * 2, Math.max(1.2, w * 0.34), taperDepth, deep,
      { x, y: y - thickness - 0.22 - taperDepth / 2, z, ry });
  }
  return { x, y, z, w, d };
}

/**
 * A run of steps climbing from `from` to `to` (both walkable surface points).
 * Only axis-aligned runs are needed by this level, which keeps it simple.
 */
export function staircase(mb, mats, { from, to, width = 3, steps = 8 }) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const run = Math.hypot(dx, dz);
  const dirX = dx / run, dirZ = dz / run;
  const stepRun = run / steps;
  const stepRise = dy / steps;
  const ry = Math.atan2(dirX, dirZ);

  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const cx = from.x + dx * t;
    const cz = from.z + dz * t;
    const surface = from.y + stepRise * (i + 1);
    // Each tread is a slab thick enough to reach the step below it, so the
    // staircase has a solid stringer rather than floating treads.
    const height = stepRise + 0.55;
    mb.box(width, height, stepRun * 1.02, mats.top, { x: cx, y: surface - height / 2, z: cz, ry });
    mb.box(width + 0.36, 0.16, stepRun * 1.02, mats.side, { x: cx, y: surface - height - 0.08, z: cz, ry });
  }
  // Cheeks either side give the run a clean silhouette from a distance.
  const midX = from.x + dx * 0.5, midZ = from.z + dz * 0.5;
  const cheekLen = run + 0.2;
  for (const side of [-1, 1]) {
    const ox = -dirZ * side * (width / 2 + 0.26);
    const oz = dirX * side * (width / 2 + 0.26);
    mb.box(0.5, 0.5, cheekLen, mats.side,
      { x: midX + ox, y: from.y + dy * 0.5 - 0.1, z: midZ + oz, ry });
  }
}

/** A tapered pillar with a base and capital. */
export function pillar(mb, mats, { x = 0, y = 0, z = 0, height = 6, radius = 0.55 }) {
  mb.box(radius * 2.9, 0.42, radius * 2.9, mats.side, { x, y: y + 0.21, z });
  mb.add(new THREE.CylinderGeometry(radius * 0.86, radius, height - 0.84, 8), mats.top,
    xform({ x, y: y + 0.42 + (height - 0.84) / 2, z }));
  mb.box(radius * 3.1, 0.42, radius * 3.1, mats.side, { x, y: y + height - 0.21, z });
}

/**
 * A rectangular wall with an arched opening cut through it, extruded along Z.
 * Used for the tower passage and the temple facades.
 */
export function archWall(mb, material, {
  x = 0, y = 0, z = 0, ry = 0,
  width = 6, height = 6, depth = 1.2,
  openWidth = 3, openHeight = 4.4,
}) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();

  const hole = new THREE.Path();
  const r = openWidth / 2;
  const straight = Math.max(0.1, openHeight - r);
  hole.moveTo(-r, 0);
  hole.lineTo(-r, straight);
  hole.absarc(0, straight, r, Math.PI, 0, true);
  hole.lineTo(r, 0);
  hole.closePath();
  shape.holes.push(hole);

  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  mb.add(g, material, xform({ x, y, z, ry }));
  g.dispose();
}

/**
 * A band of small carved blocks around a rectangular footprint.
 * Cheap, but it is most of what separates "stonework" from "box".
 */
export function carvedBand(mb, material, { x = 0, y = 0, z = 0, w = 8, d = 8, size = 0.34, gap = 0.9 }) {
  const place = (px, pz) => mb.box(size, size, size, material, { x: px, y, z: pz, ry: Math.PI / 4 });
  const countX = Math.max(2, Math.floor(w / gap));
  const countZ = Math.max(2, Math.floor(d / gap));
  for (let i = 0; i <= countX; i++) {
    const px = x - w / 2 + (w * i) / countX;
    place(px, z - d / 2);
    place(px, z + d / 2);
  }
  for (let i = 1; i < countZ; i++) {
    const pz = z - d / 2 + (d * i) / countZ;
    place(x - w / 2, pz);
    place(x + w / 2, pz);
  }
}

/** A short balustrade wall, used to fence terraces so edges read as safe. */
export function parapet(mb, mats, { x = 0, y = 0, z = 0, length = 6, ry = 0, height = 0.85 }) {
  mb.box(length, height, 0.34, mats.top, { x, y: y + height / 2, z, ry });
  mb.box(length + 0.3, 0.18, 0.5, mats.side, { x, y: y + height + 0.09, z, ry });
}

/**
 * A faceted dome cap. Eight segments on purpose -- a smooth hemisphere fights
 * the flat-shaded, hand-built feel of everything around it.
 */
export function dome(mb, material, { x = 0, y = 0, z = 0, radius = 0.8, height = 0.9 }) {
  const g = new THREE.SphereGeometry(radius, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, height / radius, 1);
  mb.add(g, material, xform({ x, y, z }));
  g.dispose();
}

/**
 * A small domed canopy on short posts. The most useful single ornament in the
 * kit: it turns the top of any pillar or corner into deliberate architecture.
 */
export function cupola(mb, mats, { x = 0, y = 0, z = 0, radius = 0.85, postHeight = 1.1, accent }) {
  const inset = radius * 0.62;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      mb.box(0.2, postHeight, 0.2, mats.side, { x: x + sx * inset, y: y + postHeight / 2, z: z + sz * inset });
    }
  }
  mb.box(radius * 2.3, 0.22, radius * 2.3, mats.side, { x, y: y + postHeight + 0.11, z });
  dome(mb, accent ?? mats.top, { x, y: y + postHeight + 0.22, z, radius, height: radius * 1.15 });
  mb.box(0.16, 0.42, 0.16, mats.top, { x, y: y + postHeight + radius * 1.15 + 0.42, z });
}

/**
 * A pennant on a slender mast. Pure decoration, and worth every triangle: a
 * single moving scrap of fabric is what stops a stone diorama reading as dead.
 * Returns the flag mesh so the caller can animate it.
 */
export function pennant(parent, mastMaterial, flagMaterial, { x = 0, y = 0, z = 0, height = 3.2 }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);

  const mb = new MeshBuilder();
  mb.cylinder(0.075, height, mastMaterial, { y: height / 2 }, 6);
  mb.box(0.24, 0.24, 0.24, mastMaterial, { y: height + 0.1, ry: Math.PI / 4 });
  mb.build(group);

  // A two-triangle streamer, drawn double-sided so it reads from any orbit.
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0, 1.7, 0.22, 0, 0, -0.72, 0,
    1.7, 0.22, 0, 1.55, -0.42, 0, 0, -0.72, 0,
  ]), 3));
  flag.computeVertexNormals();
  const mesh = new THREE.Mesh(flag, flagMaterial);
  mesh.position.set(0.06, height - 0.35, 0);
  mesh.castShadow = true;
  group.add(mesh);

  return { group, flag: mesh };
}

/** A recessed arched window slot. Reads as depth for the cost of two boxes. */
export function windowSlot(mb, mats, { x = 0, y = 0, z = 0, ry = 0, width = 0.7, height = 1.4, depth = 0.3 }) {
  mb.box(width + 0.34, height + 0.34, depth * 0.5, mats.side, { x, y: y + height / 2, z, ry });
  mb.box(width, height, depth, mats.deep, { x, y: y + height / 2, z, ry });
  const cap = new THREE.CylinderGeometry(width / 2, width / 2, depth, 8, 1, false, 0, Math.PI);
  cap.rotateZ(-Math.PI / 2);
  cap.rotateY(Math.PI / 2);
  mb.add(cap, mats.deep, xform({ x, y: y + height, z, ry }));
  cap.dispose();
}
