# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this is

**Skyward — Puzzle 01**: a playable vertical slice of a 3D puzzle game for
iPhone, built as a web game with Three.js and WebGL. One complete level, three
puzzle mechanisms, start to finish.

Read `README.md` for the design overview and `IPHONE_BUILD_GUIDE.md` for how it
gets onto a phone. This file covers what you need to know before changing code.

## Running it

There is **no build step and no bundler**. An import map in `index.html` points
at `vendor/three/`, which is committed.

```bash
npx --yes http-server -p 8080     # then open http://localhost:8080
```

Edit a file, refresh the browser. That is the whole loop. Do not add a bundler,
a framework, or a package manifest dependency at runtime without a specific
reason — the no-build property is what makes this deployable to any static host
and testable on a phone in seconds.

`node_modules/` exists only because Three.js was installed once to copy files
into `vendor/`. Nothing at runtime reads it, and it is gitignored.

## Verifying changes

This project is visual, so **look at it**. Chromium is available and Playwright
is configured (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; never run
`playwright install`). The workflow that has been used throughout:

1. Serve the folder on a port.
2. Launch Chromium with
   `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
3. `page.goto`, wait, **click once to dismiss the title veil** (nothing runs
   until then — the veil is the audio-unlock gesture), then screenshot.
4. Drive the game through `window.game`, which exposes every subsystem.

Two caveats that will mislead you if you forget them:

- **Software rendering runs at roughly 10fps.** Combined with the `1/20` delta
  clamp in `Game._loop`, in-game time passes several times slower than wall
  clock. Timed sequences (notably the 3.4s completion) take far longer than
  their nominal duration. **Wait on the outcome, not on a timer.**
- **Frame rate here says nothing about iPhone performance.** Judge cost by draw
  calls and triangles from `renderer.info`, not fps. Current baseline: ~95 draw
  calls including the shadow pass, ~39k triangles.

A headless playthrough that walks the whole level and asserts each gate is the
best regression test available; write one rather than eyeballing a screenshot
when changing navigation or puzzle logic.

## Architecture

`src/core/Game.js` is the only place that knows about every subsystem. Everything
else knows about as few of the others as possible. Keep it that way.

The three ideas worth understanding before editing:

**1. Navigation is a graph, not a navmesh.** (`src/nav/NavGraph.js`)
Nodes store a position in their *parent's* local space, so a node parented to
the elevator rides it upward for free. Edges carry an `isOpen()` predicate
evaluated on every query, so a mechanism never pushes graph updates — it just
changes state, and "the bridge now connects" falls out. `PlayerNavigation`
re-reads world positions every frame for the same reason. If you find yourself
wanting to special-case moving platforms, you have gone wrong.

**2. Mechanisms are dumb.** (`src/puzzles/`)
`PuzzleInteractable` owns a discrete state machine, easing, and highlight.
Subclasses implement `applyState(value)` and nothing else — `RotatingStructure`
sets `rotation.y`, `SlidingStructure` sets `position.z`, `ElevatorPlatform` sets
`position.y`. All reaction to their events (sound, dust, camera nudges, hints)
lives in `PuzzleManager`. A new mechanism type should not need to touch audio or
the camera.

**3. Geometry is merged per material.** (`src/world/Build.js`)
`MeshBuilder` accumulates geometry into buckets keyed by material and emits one
merged mesh each. That is what allows genuinely ornate architecture at a mobile
draw-call budget. Two constraints follow: everything is flattened to non-indexed
(`ExtrudeGeometry` is not indexed, the primitives are, and `mergeGeometries`
requires agreement), and **merged static geometry cannot be moved individually**
— anything that moves needs its own group.

## Conventions that matter

- **`LAYOUT` in `src/world/Level.js` holds every level coordinate.** Change
  geometry there, not scattered through the builders. Nav nodes are derived from
  the same constants; if you move a platform and forget its nodes, the level
  silently becomes unsolvable — run a playthrough test.
- **`src/world/Palette.js` holds every colour**, as named schemes (`coral`,
  `amber`, `mist`), selectable with `?scheme=` in the URL. Two rules define the
  look: a saturated background behind a single architectural hue (pale on pale
  is what made an early pass read as washed out), and few colours per scene at
  three tonal steps. The tiers are load-bearing gameplay signposting, not
  decoration: static stone, a more saturated version for anything that moves,
  and *glowing* turquoise/gold for the destination only. Note that ornament uses
  a deeper non-emissive teal on purpose, so glow rather than hue marks the goal.
- **The camera is orthographic.** Parallel verticals are most of why the level
  reads as a held model. `distance` no longer affects framing — it only
  positions the camera for depth sorting. Zoom is `frustumHeight`, in metres of
  world space visible vertically.
- **No asset files.** All audio is synthesised in `AudioSystem`; all textures are
  drawn to a canvas at startup. Do not add binary assets without a reason —
  `AudioSystem.registerSample(name, url)` is the intended path for real audio.
- **iOS specifics.** Audio cannot start outside a user gesture (hence the title
  veil). `touch-action: none` and `viewport-fit=cover` are required. Safe-area
  insets feed both the CSS chrome and `CameraController.setSafeAreaLift`.

## Traps already hit — do not re-introduce

These were real bugs found by testing, and each is easy to recreate:

- **Tap targeting must use the frontmost hit only.** Casting against mechanism
  meshes separately, or allowing a generous depth tolerance, lets the rotating
  drum swallow taps meant for the stair landing in front of it — the level
  silently rearranges under the player. Screen-space "forgiveness" sampling was
  tried and is worse, because mechanisms sit directly beside walkable stone.
- **Drag must apply rotation immediately.** Feeding drag deltas only into
  velocity integrates them twice; a 120px drag spun the camera 250°. Velocity is
  for the flick after release, and `dragging` gates it.
- **Never place two coplanar faces.** The drum originally carried its own floor
  slab flush with the tower deck; the passage flickered with z-fighting. Let one
  surface own each plane.
- **The camera looks below the horizon almost always.** Most of the frame is the
  sky dome's *lower* ramp. Flat colour there reads as a white void — it needs a
  real gradient into haze. Likewise, cloud layers placed too close read as snowy
  ground and destroy the "no visible ground" requirement.
- **Portrait is narrow.** A structure that sprawls horizontally cannot be framed
  on a phone. That is why the upper level folds back west over terrace A.
- **Undersides need a bounce term.** Downward faces receive no sun, so without
  `Palette.bounce` feeding the hemisphere ground colour they collapse to near
  black and the floating masses read as heavy blots.

## Scope

The brief was one polished level and explicitly *not* multiple levels,
progression, currencies, menus, or online features. Do not add them. If asked to
extend the game, ask whether the first level is finished first.
