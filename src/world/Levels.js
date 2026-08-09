/**
 * The ten levels.
 *
 * Difficulty is escalated with four knobs, deliberately rather than by making
 * things fiddly:
 *
 *   1. How many mechanisms stand between you and the portal.
 *   2. How many orientations a drum has. A straight passage is symmetric, so
 *      180 degrees is the same as 0 and it is really a two-way switch. An
 *      *elbow* passage makes all four orientations distinct, turning the drum
 *      into a router that decides which of four landings joins which.
 *   3. Whether order matters -- a bridge whose wheel you can only reach after
 *      riding the lift cannot be solved in any order you like.
 *   4. Whether a mechanism must be used more than once, including going back.
 *
 * Every level is verified by the solver in tests/audit-levels.mjs, which brute-forces
 * the whole mechanism state space and reports the true minimum number of
 * activations. `par` below is that verified number, not a guess.
 *
 * Geometry conventions, to keep hand-placed coordinates trustworthy:
 *   - staircases run at 45 degrees, so run == rise
 *   - a drum's deck is 12x12 and its landings sit 5.4m from centre
 *   - platforms that meet should share an edge exactly; never overlap, because
 *     two coplanar top faces at the same height z-fight
 */

export const LEVELS = [
  {
    id: 'l1',
    name: 'First Steps',
    subtitle: 'The passage faces the wrong way.',
    par: 1,
    start: 'p0',
    focus: [0, 7, -6],
    camera: { azimuth: -0.42, polar: 0.95, frustumHeight: 58 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, states: [1, 0], initial: 0 },
      { kind: 'flight', id: 'f2', from: [0, 5, -6.0], to: [0, 10, -12.5] },
      { kind: 'pad', id: 'p2', x: 0, y: 10, z: -15.5, w: 8, d: 6, edges: ['n', 's'], fence: ['e', 'w'] },
      { kind: 'shrine', id: 'sh', x: 0, y: 10, z: -23, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:n', 'f2:a'], ['f2:b', 'p2:s'],
      ['p2:n', 'sh:door'],
    ],
  },

  {
    id: 'l2',
    name: 'The Span',
    subtitle: 'The rails already reach across.',
    par: 1,
    start: 'p0',
    focus: [9, 6, -2],
    camera: { azimuth: -0.75, polar: 0.95, frustumHeight: 54 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 10, w: 8, d: 7, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 6.5], to: [0, 5, 1.5] },
      { kind: 'pad', id: 'p1', x: 0, y: 5, z: -1.5, w: 9, d: 7, edges: ['s', 'e'], fence: ['w', 'n'], pillars: [[-3.2, -2.4]] },
      { kind: 'span', id: 'b1', x: 8.75, y: 5, z: -1.5, wheel: { x: -6.25, z: 1.5 } },
      { kind: 'pad', id: 'p2', x: 17.5, y: 5, z: -1.5, w: 8, d: 8, edges: ['w', 'n'], fence: ['e', 's'] },
      { kind: 'shrine', id: 'sh', x: 17.5, y: 5, z: -10, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'p1:s'],
      ['p1:e', 'b1:a', 'b1=1'], ['b1:b', 'p2:w', 'b1=1'],
      ['p2:n', 'sh:door'],
    ],
  },

  {
    id: 'l3',
    name: 'The Turn',
    subtitle: 'This passage bends.',
    par: 2,
    start: 'p0',
    focus: [7, 7, 2],
    camera: { azimuth: -0.7, polar: 0.95, frustumHeight: 56 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      // Elbow: enters one face, leaves the face at right angles. Starting two
      // quarter-turns away from the useful orientation makes this a two-tap
      // level without any extra machinery.
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, shape: 'elbow', states: [0, 1, 2, 3], initial: 2 },
      { kind: 'flight', id: 'f2', from: [6.0, 5, 0], to: [12.5, 10, 0] },
      { kind: 'pad', id: 'p2', x: 15.5, y: 10, z: 0, w: 6, d: 8, edges: ['w', 'n'], fence: ['e', 's'] },
      { kind: 'shrine', id: 'sh', x: 15.5, y: 10, z: -8.5, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:e', 'f2:a'], ['f2:b', 'p2:w'],
      ['p2:n', 'sh:door'],
    ],
  },

  {
    id: 'l4',
    name: 'Crossing',
    subtitle: 'Two mechanisms, one route.',
    par: 2,
    start: 'p0',
    focus: [8, 9, -8],
    camera: { azimuth: -0.6, polar: 0.94, frustumHeight: 64 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, states: [1, 0], initial: 0 },
      { kind: 'flight', id: 'f2', from: [0, 5, -6.0], to: [0, 10, -12.5] },
      { kind: 'pad', id: 'p1', x: 0, y: 10, z: -15.5, w: 9, d: 7, edges: ['s', 'e'], fence: ['w', 'n'] },
      { kind: 'span', id: 'b1', x: 8.75, y: 10, z: -15.5, wheel: { x: -6.25, z: 1.5 } },
      { kind: 'pad', id: 'p2', x: 17.5, y: 10, z: -15.5, w: 8, d: 8, edges: ['w', 'n'], fence: ['e', 's'] },
      { kind: 'shrine', id: 'sh', x: 17.5, y: 10, z: -24, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:n', 'f2:a'], ['f2:b', 'p1:s'],
      ['p1:e', 'b1:a', 'b1=1'], ['b1:b', 'p2:w', 'b1=1'],
      ['p2:n', 'sh:door'],
    ],
  },

  {
    id: 'l5',
    name: 'Ascent',
    subtitle: 'Some things must be ridden.',
    par: 2,
    start: 'p0',
    focus: [0, 12, -14],
    camera: { azimuth: -0.5, polar: 0.92, frustumHeight: 70 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, states: [1, 0], initial: 0 },
      { kind: 'pad', id: 'p1', x: 0, y: 5, z: -10, w: 8, d: 6, edges: ['s', 'n'], fence: ['e', 'w'] },
      { kind: 'shaft', id: 'e1', x: 0, y: 5, z: -15.3, size: 4.6, rise: 14 },
      { kind: 'pad', id: 'p2', x: 0, y: 19, z: -20.5, w: 8, d: 6, edges: ['s', 'n'], fence: ['e', 'w'] },
      { kind: 'shrine', id: 'sh', x: 0, y: 19, z: -28, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:n', 'p1:s'],
      ['p1:n', 'e1', 'e1=0'], ['e1', 'p2:s', 'e1=1'],
      ['p2:n', 'sh:door'],
    ],
  },

  {
    id: 'l6',
    name: 'Skyward',
    subtitle: 'All three, in their turn.',
    par: 3,
    start: 'p0',
    focus: [9, 13, -12],
    camera: { azimuth: -0.5, polar: 0.93, frustumHeight: 76 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, states: [1, 0], initial: 0 },
      { kind: 'flight', id: 'f2', from: [0, 5, -6.0], to: [0, 11, -13.0], steps: 11 },
      { kind: 'pad', id: 'p1', x: 0, y: 11, z: -16, w: 9, d: 7, edges: ['s', 'e'], fence: ['w', 'n'] },
      { kind: 'span', id: 'b1', x: 8.75, y: 11, z: -16, wheel: { x: -6.25, z: 1.5 } },
      { kind: 'pad', id: 'p2', x: 17.5, y: 11, z: -16, w: 9, d: 9, edges: ['w', 'n'], fence: ['e', 's'] },
      { kind: 'shaft', id: 'e1', x: 17.5, y: 11, z: -23.6, size: 4.6, rise: 14 },
      { kind: 'pad', id: 'p3', x: 17.5, y: 25, z: -29.5, w: 7, d: 6, edges: ['s', 'n'], fence: ['e', 'w'] },
      { kind: 'shrine', id: 'sh', x: 17.5, y: 25, z: -37, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:n', 'f2:a'], ['f2:b', 'p1:s'],
      ['p1:e', 'b1:a', 'b1=1'], ['b1:b', 'p2:w', 'b1=1'],
      ['p2:n', 'e1', 'e1=0'], ['e1', 'p3:s', 'e1=1'],
      ['p3:n', 'sh:door'],
    ],
  },

  {
    id: 'l7',
    name: 'The Knot',
    subtitle: 'Nothing here is on the way to anything else.',
    par: 3,
    start: 'p0',
    focus: [8, 14, -12],
    camera: { azimuth: -0.55, polar: 0.92, frustumHeight: 82 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, shape: 'elbow', states: [0, 1, 2, 3], initial: 3 },

      // East out of the first drum, over a bridge, to a lift.
      { kind: 'flight', id: 'f2', from: [6.0, 5, 0], to: [12.5, 10, 0] },
      { kind: 'pad', id: 'p1', x: 16, y: 10, z: 0, w: 7, d: 7, edges: ['w', 'n'], fence: ['e', 's'] },
      { kind: 'shaft', id: 'e1', x: 16, y: 10, z: -8.0, size: 4.6, rise: 11 },
      { kind: 'pad', id: 'p2', x: 16, y: 21, z: -13.5, w: 7, d: 6, edges: ['s', 'w'], fence: ['e', 'n'] },

      // The bridge back west is driven from up here, and lands on a terrace
      // that the first drum must be re-aimed to serve.
      { kind: 'span', id: 'b1', x: 7.5, y: 21, z: -13.5, length: 8.8, travel: 6.5, wheel: { x: 6.0, z: 1.4 } },
      { kind: 'pad', id: 'p3', x: -1, y: 21, z: -13.5, w: 8, d: 7, edges: ['e', 'n'], fence: ['w', 's'] },
      { kind: 'shrine', id: 'sh', x: -1, y: 21, z: -21.5, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:e', 'f2:a'], ['f2:b', 'p1:w'],
      ['p1:n', 'e1', 'e1=0'], ['e1', 'p2:s', 'e1=1'],
      ['p2:w', 'b1:b', 'b1=1'], ['b1:a', 'p3:e', 'b1=1'],
      ['p3:n', 'sh:door'],
    ],
  },

  {
    id: 'l8',
    name: 'Order of Things',
    subtitle: 'Three mechanisms, and one of them is stubborn.',
    par: 4,
    start: 'p0',
    focus: [8, 14, -6],
    camera: { azimuth: -0.55, polar: 0.93, frustumHeight: 80 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, shape: 'elbow', states: [0, 1, 2, 3], initial: 2 },
      { kind: 'flight', id: 'f2', from: [6.0, 5, 0], to: [12.5, 10, 0] },
      { kind: 'pad', id: 'p1', x: 16, y: 10, z: 0, w: 7, d: 7, edges: ['w', 'n'], fence: ['e', 's'] },
      { kind: 'shaft', id: 'e1', x: 16, y: 10, z: -6.6, size: 4.6, rise: 11 },
      { kind: 'pad', id: 'p2', x: 16, y: 21, z: -12.5, w: 7, d: 6, edges: ['s', 'w'], fence: ['e', 'n'] },
      { kind: 'span', id: 'b1', x: 7.25, y: 21, z: -12.5, wheel: { x: 6.0, z: 1.4 } },
      { kind: 'pad', id: 'p3', x: -1.5, y: 21, z: -12.5, w: 8, d: 7, edges: ['e', 'n'], fence: ['w', 's'] },
      { kind: 'shrine', id: 'sh', x: -1.5, y: 21, z: -20.5, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:e', 'f2:a'], ['f2:b', 'p1:w'],
      ['p1:n', 'e1', 'e1=0'], ['e1', 'p2:s', 'e1=1'],
      ['p2:w', 'b1:b', 'b1=1'], ['b1:a', 'p3:e', 'b1=1'],
      ['p3:n', 'sh:door'],
    ],
  },

  {
    id: 'l9',
    name: 'Four Winds',
    subtitle: 'One drum, two journeys.',
    par: 5,
    start: 'p0',
    focus: [2, 11, -10],
    camera: { azimuth: -0.62, polar: 0.93, frustumHeight: 74 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },

      // Two elbows in series. Each is a router, and the second one is only
      // reachable through a particular exit of the first.
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, shape: 'elbow', states: [0, 1, 2, 3], initial: 1 },
      { kind: 'flight', id: 'f2', from: [6.0, 5, 0], to: [12.5, 10, 0] },
      { kind: 'drum', id: 'd2', x: 19, y: 10, z: 0, shape: 'elbow', states: [0, 1, 2, 3], initial: 0 },
      { kind: 'flight', id: 'f3', from: [19, 10, -6.0], to: [19, 15, -12.5] },
      { kind: 'pad', id: 'p2', x: 19, y: 15, z: -15.5, w: 8, d: 6, edges: ['s', 'n'], fence: ['e', 'w'] },
      { kind: 'shrine', id: 'sh', x: 19, y: 15, z: -23, ry: 0, w: 9, d: 9 },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:e', 'f2:a'], ['f2:b', 'd2:w'],
      ['d2:n', 'f3:a'], ['f3:b', 'p2:s'],
      ['p2:n', 'sh:door'],
    ],
  },

  {
    id: 'l10',
    name: 'The Long Climb',
    subtitle: 'Everything you have learned.',
    par: 6,
    start: 'p0',
    focus: [8, 17, -14],
    camera: { azimuth: -0.52, polar: 0.9, frustumHeight: 96 },
    modules: [
      { kind: 'pad', id: 'p0', x: 0, y: 0, z: 13.5, w: 8, d: 6, edges: ['n'], markers: true, fence: ['s'] },
      { kind: 'flight', id: 'f1', from: [0, 0, 10.5], to: [0, 5, 5.9] },
      { kind: 'drum', id: 'd1', x: 0, y: 5, z: 0, shape: 'elbow', states: [0, 1, 2, 3], initial: 2 },

      // East, across the first bridge.
      { kind: 'pad', id: 'p1', x: 10.5, y: 5, z: 0, w: 7, d: 7, edges: ['w', 'n'], fence: ['s'] },
      { kind: 'flight', id: 'fa', from: [6.0, 5, 0], to: [7.5, 5, 0], steps: 2, mid: 0 },
      { kind: 'shaft', id: 'e1', x: 10.5, y: 5, z: -8.0, size: 4.6, rise: 13 },
      { kind: 'pad', id: 'p2', x: 10.5, y: 18, z: -13.5, w: 8, d: 6, edges: ['s', 'w'], fence: ['e', 'n'] },

      { kind: 'span', id: 'b1', x: 2.0, y: 18, z: -13.5, length: 8.8, travel: 6.5, wheel: { x: 6.4, z: 1.4 } },
      { kind: 'drum', id: 'd2', x: -8.5, y: 18, z: -13.5, shape: 'straight', states: [0, 1], initial: 0 },

      { kind: 'flight', id: 'f3', from: [-8.5, 18, -19.5], to: [-8.5, 23, -26.0] },
      { kind: 'pad', id: 'p4', x: -8.5, y: 23, z: -29, w: 8, d: 6, edges: ['s', 'n'], fence: ['e', 'w'] },
      { kind: 'shrine', id: 'sh', x: -8.5, y: 23, z: -36.5, ry: 0, w: 10, d: 10, grand: true },
    ],
    links: [
      ['p0:n', 'f1:a'], ['f1:b', 'd1:s'],
      ['d1:e', 'fa:a'], ['fa:b', 'p1:w'],
      ['p1:n', 'e1', 'e1=0'], ['e1', 'p2:s', 'e1=1'],
      ['p2:w', 'b1:b', 'b1=1'], ['b1:a', 'd2:e', 'b1=1'],
      ['d2:n', 'f3:a'], ['f3:b', 'p4:s'],
      ['p4:n', 'sh:door'],
    ],
  },
];

export const LEVEL_COUNT = LEVELS.length;

export function levelAt(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}
