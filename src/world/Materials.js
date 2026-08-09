import * as THREE from 'three';
import { Palette } from './Palette.js';

/**
 * A deliberately small material library.
 *
 * Everything static shares these instances so the merged architecture draws in
 * a handful of calls. Lambert is the right choice here: the art direction is
 * flat stylised stone, not physically based rock, and it is markedly cheaper
 * than Standard on a phone GPU.
 *
 * Mechanisms do NOT share these -- they need to glow independently, so each one
 * gets its own cloned set via `createMechanismMaterials()`.
 */

function stone(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

export const Materials = {
  stone: stone(Palette.stone),
  stoneWarm: stone(Palette.stoneWarm),
  stoneDeep: stone(Palette.stoneDeep),
  stoneCool: stone(Palette.stoneCool),
  trim: stone(Palette.trim),
  gold: stone(Palette.gold, { emissive: Palette.gold, emissiveIntensity: 0.18 }),
  turquoise: stone(Palette.turquoise, { emissive: Palette.turquoise, emissiveIntensity: 0.35 }),
  // Decorative domes and finials. Deliberately a *deeper*, non-emissive teal:
  // the destination tier keeps the light, glowing turquoise, so glow rather
  // than hue is what tells the player where the goal is.
  ornament: stone(Palette.ornament),
  cloak: stone(Palette.cloak),
  cloakDeep: stone(Palette.cloakDeep),
  skin: stone(Palette.skin),
};

/**
 * One independent material set per puzzle mechanism.
 *
 * `glow` is the emissive inlay the player reads as "this is the control";
 * `body` and `bodyDeep` are the moving stone itself. Highlighting a mechanism
 * lifts the emissive on these, which is why they cannot be shared.
 */
export function createMechanismMaterials() {
  return {
    body: stone(Palette.mech, { emissive: Palette.mech, emissiveIntensity: 0 }),
    bodyDeep: stone(Palette.mechDeep, { emissive: Palette.mechDeep, emissiveIntensity: 0 }),
    accent: stone(Palette.mechAccent, { emissive: Palette.mechAccent, emissiveIntensity: 0 }),
    glow: stone(Palette.gold, { emissive: Palette.gold, emissiveIntensity: 0.5 }),
  };
}

/** Frees every GPU resource this module owns. Called on teardown. */
export function disposeMaterials() {
  for (const material of Object.values(Materials)) material.dispose();
}
