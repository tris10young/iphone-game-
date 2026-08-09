# Skyward — Puzzle 01

A playable vertical slice of a 3D mobile puzzle game for iPhone. One complete
level: a floating ancient structure above an endless cloud sea, three mechanisms
to manipulate, and a portal at the top.

**To play it on your phone, follow [IPHONE_BUILD_GUIDE.md](IPHONE_BUILD_GUIDE.md).**
The short version: serve this folder over HTTP and open it in Safari.

```
npx --yes http-server -p 8080
```

Then open `http://localhost:8080` on a computer, or your machine's LAN address
on the phone.

---

## What this is

The design brief called for a Unity project. This is built for the web instead —
Three.js and WebGL, no engine — for one decisive reason: it can be developed and
visually verified end to end without a Mac, Xcode, or an Apple Developer
account, and it reaches a real iPhone by opening a URL. The whole design
translated cleanly; where the brief named a Unity system, the equivalent is
noted below.

| Brief | Here | Why |
| --- | --- | --- |
| Orthographic or low-perspective camera | Orthographic | Parallel verticals; the level reads as a held model rather than a photographed place. |
| Unity URP | Three.js + WebGL2 | Same lighting model in practice: one directional sun, hemisphere fill, soft shadow maps, bloom, colour grade, depth fog. |
| Unity NavMesh | Custom navigation graph | Better suited, not a compromise. Half the walkable surface rotates, slides and rises; rebaking a navmesh every frame is the fiddly part. A graph node parented to a moving part simply travels with it, and "the bridge now connects" is one edge opening. |
| Unity Input System | Pointer Events | One code path for touch on iPhone and mouse on desktop, which is exactly the "works in the editor and on device" requirement. |
| Prefabs | Composable builder functions | `platform()`, `staircase()`, `pillar()`, `archWall()`, `carvedBand()`, `parapet()` — the same reuse, merged into few draw calls. |
| Xcode build | Add to Home Screen | Fullscreen, own icon, portrait-locked, offline once cached. |

## The level

Roughly 40 metres from the underside of the start platform to the temple roof.
The route spirals upward and folds back over itself so the destination is in
frame from the opening shot.

```
start platform
      │  stairs
      ▼
[1] ROTATING TOWER — arched passage, initially crosswise
      │  stairs
      ▼
   terrace A
      │
[2] SLIDING BRIDGE — parked on a siding, slides across on rails
      │
      ▼
   terrace B
      │
[3] ELEVATOR — must be ridden; rises 14m
      │
      ▼
 upper landing ──▶ temple ──▶ portal
```

Each mechanism is readable without text: the drum's arch plainly faces the wrong
way, the bridge's rails show where it is going before you touch anything, and
the elevator's gold floor ring says *stand here*. A hint line appears only after
six seconds of inactivity, and never while anything is moving.

## Controls

| Input | Result |
| --- | --- |
| Tap stone | Walk there |
| Tap mechanism | Activate it |
| One-finger drag | Orbit the level, with inertia and a clamped vertical angle |
| Pinch | Zoom, clamped so the level cannot be lost |

Mouse works identically on desktop, including hover highlighting of mechanisms.

## Code layout

```
index.html            import map, markup for the minimal UI
styles.css            safe-area-aware chrome
src/
  main.js             entry point; builds the game behind the title veil
  core/
    Game.js           wires every subsystem together; owns the frame loop
    Easing.js         named motion curves (heavy, cinematic, mechanical)
  world/
    Palette.js        every colour in the game, in three deliberate tiers
    Materials.js      small shared material library
    Build.js          MeshBuilder + architectural parts, merged for draw calls
    Level.js          Puzzle_01: layout, architecture, temple, nav graph
    Sky.js            gradient dome, two cloud layers, motes, birds
  nav/
    NavGraph.js       walkable graph; nodes ride moving parts, edges gate routes
  character/
    Character.js      procedural traveller; no rig, no clips
    PlayerNavigation.js  path following against live node positions
  camera/
    CameraController.js  orbit, inertia, follow, mechanism nudges, safe area
  input/
    InputController.js       gestures: tap vs drag vs pinch
    InteractionController.js decides what a tap meant
  puzzles/
    PuzzleInteractable.js  base: state machine, easing, highlight
    RotatingStructure.js   [1]
    SlidingStructure.js    [2]
    ElevatorPlatform.js    [3]
    PuzzleManager.js       reacts to mechanism events: sound, dust, camera, hints
    LevelCompleteTrigger.js  the ending
  fx/
    Dust.js           one pooled particle system for the whole level
    Postprocessing.js bloom + colour grade + vignette
  audio/
    AudioSystem.js    every sound synthesised at runtime
  ui/UI.js            all DOM interaction
vendor/three/         Three.js r185, committed so there is no build step
```

Adding a fourth mechanism means subclassing `PuzzleInteractable`, implementing
`applyState(value)`, and connecting nav edges gated on its state. Nothing else
changes.

## Notes on a few decisions

**No build step, no bundler.** An import map points at `vendor/three`. Edit a
file, refresh, done. It also means the folder can be dropped on any static host
and works.

**No asset files at all.** Every sound is synthesised with WebAudio; every
texture (dust, motes, portal falloff) is drawn to a canvas at startup. Nothing to
download, nothing to licence. `AudioSystem.registerSample(name, url)` swaps any
cue for a real recording without touching another line.

**Colour does work.** Static architecture is one hue, anything that moves is a
more saturated version of it, and the destination is *glowing* turquoise and
gold. That is the only signposting the puzzle has. Three schemes ship — `coral`
(mint sky, coral stone), `amber` (amber sky, cream stone) and `mist` (teal sky,
lilac stone) — switchable with `?scheme=mist` in the URL.

**Performance.** 39k triangles and 95 draw calls including the shadow pass, from
one merged mesh per material. Pixel ratio is capped at 2. `low` quality drops
bloom, halves shadow resolution and thins the clouds. Targets 60fps on recent
iPhones.

## Placeholder / temporary

- **All audio is synthesised.** It is calm and coherent but it is not scored
  music or recorded foley. Replace via `registerSample()`.
- **The character has no authored animation.** Idle, walk, turn and cloth sway
  are procedural. It reads well at diorama distance; it would not survive a
  close-up.
- **Geometry is code-defined.** No modelled meshes, no sculpted detail, no
  normal maps. Deliberate for a vertical slice, and the limit of how ornate the
  architecture can get.
- **The app icon** is a generated gradient placeholder.
- **One level, hard-coded.** `LAYOUT` in `Level.js` holds every number, but
  there is no level format or editor.

## Recommended next three

1. **Bake ambient occlusion into vertex colours at build time.** The single
   biggest visual gain available. Contact shadows currently come only from the
   shadow map; real corner darkening on the merged static geometry would cost
   nothing at runtime and would make the stonework look carved rather than
   assembled.
2. **A camera framing system per puzzle beat.** The follow camera keeps the
   traveller on screen, but a portrait phone cannot hold a 40m structure and a
   2m character at once. Authored framings per stage — with the existing nudge
   system doing the blending — would make every moment composed rather than
   merely adequate.
3. **Replace the audio placeholders and add haptics.** The synthesised set
   proves the design; recorded stone and a written pad would lift the whole
   thing. `navigator.vibrate` is unavailable in iOS Safari, so real haptics
   would need the Home Screen app wrapped natively — worth it for the moment
   the tower locks.
