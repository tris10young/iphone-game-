/**
 * Colour.
 *
 * Two rules carry the whole look:
 *
 * 1. The background is a saturated field and the architecture is a single hue
 *    sitting near-opposite it. Pale stone on a pale sky is what made an earlier
 *    pass read as washed out -- contrast between sky and stone is the whole
 *    difference between "soft" and "striking".
 *
 * 2. Few colours per scene, each at three tonal steps (lit face, side face,
 *    underside). Flat blocks with crisp boundaries, never gradients.
 *
 * On top of that sits the gameplay tier system, which must survive any scheme:
 *    static architecture -> the scheme's stone hue
 *    interactive parts   -> clearly more saturated, same family
 *    destination         -> turquoise + gold, used nowhere else
 */

/** Named schemes. Switch at runtime with ?scheme=amber in the URL. */
export const SCHEMES = {
  /** Coral architecture against a mint sky. The boldest contrast of the three. */
  coral: {
    stone: 0xf0ab92,
    stoneWarm: 0xe4907a,
    stoneDeep: 0xd9917c,
    stoneCool: 0xf8cbb8,
    trim: 0xfadcc9,

    mech: 0xdd7a6d,
    mechDeep: 0xc2635c,
    mechAccent: 0xe89a86,

    gold: 0xf2c97e,
    turquoise: 0x3fb9ab,
    portal: 0x7dead9,

    cloak: 0x5c4a63,
    cloakDeep: 0x453751,
    skin: 0xfae3d2,

    skyTop: 0x8ecdba,
    skyHorizon: 0xf4ddc9,
    skyBelow: 0xbfdfd2,
    skyDeep: 0x9dcbbd,
    cloud: 0xfdf3ec,
    cloudShade: 0xdfe9de,
    fog: 0xd7e8de,
    sunLight: 0xfff2dd,
    skyLight: 0xbcdcd2,
    bounce: 0xf0d3c4,
    ornament: 0x35807d,
  },

  /** Cream-gold architecture against a warm amber sky. Late afternoon. */
  amber: {
    stone: 0xf7e2b4,
    stoneWarm: 0xecc98d,
    stoneDeep: 0xd0a468,
    stoneCool: 0xfaeed0,
    trim: 0xfdefcd,

    mech: 0xd98a5e,
    mechDeep: 0xbb6d46,
    mechAccent: 0xe8a878,

    gold: 0xfad98a,
    turquoise: 0x2f8f8c,
    portal: 0x6fded0,

    cloak: 0x4b4260,
    cloakDeep: 0x362f49,
    skin: 0xfaeada,

    skyTop: 0xe7a95a,
    skyHorizon: 0xf8d9a0,
    skyBelow: 0xefc98d,
    skyDeep: 0xe0b47c,
    cloud: 0xfdf0dc,
    cloudShade: 0xecc9a0,
    fog: 0xf3d6a8,
    sunLight: 0xfff0d2,
    skyLight: 0xf0c68f,
    bounce: 0xf6dcb4,
    ornament: 0x2d6b6e,
  },

  /** Pale lilac stone against a deep teal sky. The coolest and calmest. */
  mist: {
    stone: 0xefe4e8,
    stoneWarm: 0xdcc9d6,
    stoneDeep: 0xbfa8bd,
    stoneCool: 0xf7eff2,
    trim: 0xfaf1f3,

    mech: 0xe08a95,
    mechDeep: 0xc16b7c,
    mechAccent: 0xeaa8ad,

    gold: 0xf0cd8c,
    turquoise: 0x45b0b4,
    portal: 0x88e6e2,

    cloak: 0x4a4a68,
    cloakDeep: 0x363654,
    skin: 0xf6e6e0,

    skyTop: 0x6cbcc2,
    skyHorizon: 0xe9d7dd,
    skyBelow: 0xa8d3d6,
    skyDeep: 0x83bcc4,
    cloud: 0xfbf6f8,
    cloudShade: 0xd6dfe8,
    fog: 0xcfe2e6,
    sunLight: 0xfff4e6,
    skyLight: 0xaed6dc,
    bounce: 0xe4dee8,
    ornament: 0x3f8c93,
  },
};

export const DEFAULT_SCHEME = 'coral';

function chooseScheme() {
  try {
    const requested = new URLSearchParams(window.location.search).get('scheme');
    if (requested && SCHEMES[requested]) return requested;
  } catch {
    // No URL available (tests, workers). Fall through to the default.
  }
  return DEFAULT_SCHEME;
}

export const ACTIVE_SCHEME = chooseScheme();

/**
 * The live palette. Materials read this once at module-evaluation time, so the
 * scheme is fixed for the session -- a puzzle should not change colour
 * underneath the player mid-solve.
 */
export const Palette = { ...SCHEMES[ACTIVE_SCHEME] };

/** Warm, low-saturation sun direction shared by lighting and any fake shading. */
export const SUN_DIRECTION = { x: -0.55, y: 0.72, z: 0.42 };
