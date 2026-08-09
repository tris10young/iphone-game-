/**
 * The single source of truth for colour in the game.
 *
 * Colour does real work here, so keep the three tiers distinct:
 *   static architecture -> warm cream sandstone
 *   interactive parts   -> noticeably more saturated terracotta/rose
 *   destination         -> turquoise + gold glow
 *
 * If a new surface does not fall into one of those tiers, it probably
 * should not have its own colour.
 */
export const Palette = {
  // --- static architecture ---
  stone: 0xf4e4cb,        // warm cream sandstone, the dominant tone
  stoneWarm: 0xecd2b2,    // pale peach, for secondary faces and steps
  stoneDeep: 0xe0c5ab,    // soft terracotta shadow tone, undersides
  stoneCool: 0xe7dcd2,    // faintly cool cream, for high surfaces
  trim: 0xf7d9bd,         // decorative edging and carved bands

  // --- interactive mechanisms (more saturated on purpose) ---
  mech: 0xe2a98d,         // soft terracotta: this part moves
  mechDeep: 0xd0917a,     // its shadowed faces
  mechAccent: 0xdf9c97,   // muted pink detailing

  // --- highlights and destination ---
  gold: 0xe6c27d,         // very subtle gold, pivots and inlays
  turquoise: 0x54c3b6,    // light turquoise accent, the goal colour
  portal: 0x7fe8d8,       // portal core

  // --- character ---
  cloak: 0xc8808d,        // muted rose, reads cleanly against cream stone
  skin: 0xf6e7d5,
  cloakDeep: 0xa9646f,

  // --- atmosphere ---
  skyTop: 0x7fbcd8,
  skyHorizon: 0xf2ded4,
  cloud: 0xfbf5f2,
  cloudShade: 0xd3d3e6,
  skyBelow: 0xd4e2ef,     // pale blue just under the horizon
  skyDeep: 0x9fb6d0,      // deeper blue far below, where the eye falls away
  fog: 0xd9e5ef,
  sunLight: 0xfff0d8,
  skyLight: 0xc3d9e6,
};

/** Warm, low-saturation sun direction shared by lighting and any fake shading. */
export const SUN_DIRECTION = { x: -0.55, y: 0.72, z: 0.42 };
