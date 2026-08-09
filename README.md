# Medieval Army Battle — Mechanics Prototype

A browser prototype that exists to prove one interaction:

> Look down on a medieval army → click it → right-click to march it in formation →
> press **F** to drop into the commander in first person → fight with a sword while
> the battle carries on around you → press **F** to pull back out.

Nothing pauses when the camera changes. The 19 other soldiers keep executing their
last order, the enemy keeps advancing, and casualties keep accumulating whichever
view you're in.

This is deliberately *not* a game yet: no castles, cavalry, archers, economy,
morale, campaign map or multiplayer. See "What's deliberately missing" below.

## Running it

The project uses ES modules, so it needs to be served over HTTP (opening
`index.html` from the filesystem will be blocked by the browser's module CORS
rules). Three.js is vendored in `vendor/`, so there is no install step and no
network access required at runtime.

```bash
python3 -m http.server 8000
# or: npx http-server -p 8000
```

Then open <http://localhost:8000> in a modern browser.

### On an iPhone

It runs in mobile Safari. Serve it from your computer and open the machine's LAN
address (`http://192.168.x.x:8000`) on the phone — both devices need to be on the
same network. Hold the phone in **landscape**; portrait shows a rotate prompt.

For a fullscreen, browser-chrome-free run, use Share → *Add to Home Screen* and
launch it from the icon.

Publishing it to the App Store is a separate step and needs a Mac: wrap this
directory with [Capacitor](https://capacitorjs.com/) (`npx cap add ios`) and build
the resulting Xcode project. Nothing here blocks that — the prototype is a plain
static site with no build step and no runtime network access.

## Controls

**Tactical mode**

| Input | Action |
| --- | --- |
| Left click a soldier | Select the whole army |
| Right click terrain | March the army there in formation |
| `WASD` | Pan the camera |
| Mouse wheel | Zoom |
| Right / middle drag | Rotate the camera |
| `F` | Enter first person as the commander |
| `H` | Toggle the debug overlay |

**First person**

| Input | Action |
| --- | --- |
| `WASD` | Move (relative to where you're looking) |
| Mouse | Look (click once to capture the pointer) |
| `Shift` | Sprint |
| `Space` | Jump |
| Left mouse | Sword attack |
| `F` | Return to the tactical view |

`R` restarts after a victory or defeat.

**Touch (iPhone / iPad)**

The phone UI appears automatically on coarse-pointer devices. iOS has no pointer
lock, no right mouse button and no keyboard, so every control has a touch
equivalent:

| Input | Action |
| --- | --- |
| Tap a soldier | Select the army |
| Tap open ground (while selected) | March there — this replaces right-click |
| One finger drag | Pan the camera |
| Two finger drag | Rotate the camera |
| Pinch | Zoom |
| `FIRST PERSON` / `TACTICAL` button | Switch mode |
| Left thumbstick | Move (analogue — a light push walks slowly) |
| Drag anywhere else | Look |
| `ATTACK` | Swing; hold to keep swinging |
| `RUN` | Latching sprint toggle (a third thumb is not an option) |
| `JUMP` | Jump |
| `RESTART` | Restart after a result |

**Victory** — every enemy soldier is dead.
**Defeat** — the commander dies, or the whole player army does.

## Architecture

Systems are separated so this can be lifted into a larger project. Nothing
outside `Game.js` knows how the others are wired together.

| File | Responsibility |
| --- | --- |
| `src/main.js` | Bootstrap |
| `src/Game.js` | Composition root: renderer, scene, frame loop, mode switching |
| `src/config.js` | All tuning values — speeds, ranges, damage, camera framing |
| `src/Battlefield.js` | Terrain, lighting, sky, fog; owns `getHeight(x, z)` |
| `src/Army.js` | A group of soldiers sharing a formation centre and an order |
| `src/Formation.js` | Stateless slot geometry — where soldier *n* should stand |
| `src/Soldier.js` | One soldier: model, movement, steering, swing and death |
| `src/CombatSystem.js` | Target acquisition, damage, deaths, hit feedback, spatial grid |
| `src/CommandController.js` | Tactical selection, move orders, destination marker |
| `src/FirstPersonController.js` | Direct commander control and the held sword |
| `src/EnemyAI.js` | Red army behaviour (hold, then advance) |
| `src/CameraManager.js` | Both cameras and the blend between them |
| `src/BattleManager.js` | Battle state machine and win/lose conditions |
| `src/InputManager.js` | The only place that touches DOM input events; exposes abstract intents |
| `src/TouchControls.js` | Phone gestures, thumbstick and on-screen buttons |
| `src/UIManager.js` | The DOM overlay |
| `src/SpatialGrid.js` | Uniform grid for neighbour queries |
| `src/DebugView.js` | `H` overlay: formation slots, targets, health bars |

### How the core loop fits together

Each frame, in order:

1. `EnemyAI` may issue a new order to the red army.
2. Each `Army` advances its formation centre, rotates the block toward its
   direction of travel, and writes every soldier's slot target.
3. `CombatSystem` rebuilds the spatial grid and re-targets soldiers.
4. `FirstPersonController` moves the player-controlled commander.
5. Every `Soldier` steps: fight if engaged, otherwise walk to its slot, with
   separation steering from nearby units.
6. `CameraManager` positions the active camera (or the blend between them).
7. `BattleManager` checks the win/lose conditions.

### Notes on specific decisions

**The commander is a normal soldier.** It sits in a formation slot like everyone
else and is targetable, damageable and killable. Entering first person only sets
its state to `PLAYER`, which excludes it from formation and AI updates — nothing
else changes. Leaving first person hands it back to the army *from wherever it is
standing*; it walks back to its slot rather than teleporting.

**Input is abstract, not per-device.** Gameplay systems never read keys or mouse
buttons directly — they ask `InputManager` for intents (`moveAxis()`,
`lookDelta()`, `attackPressed()`, camera pan/orbit/zoom deltas). `TouchControls`
feeds the same intents, so the first person controller has no idea whether it is
being driven by a keyboard or a thumb, and movement is analogue on a stick for
free. Whether an *event* came from a finger is decided per pointer rather than
per device, so a touchscreen laptop still behaves like a mouse.

**Mobile rendering.** On coarse-pointer devices the pixel ratio is capped at 1.5,
MSAA is off, shadows drop to 1024 and the terrain uses half the tessellation.
Everything else is identical.

**Performance.** Even at 40 units there is no O(n²) scan: neighbour queries go
through `SpatialGrid`, target acquisition runs ~5×/second per soldier (staggered,
not synchronised), and distance comparisons stay squared. Geometry is shared
between soldiers; only materials are per-soldier, so an individual can flash on
hit. The natural next step for much larger armies is instancing.

**Formation.** 4 across × 5 deep, 2m sideways and 2.5m front-to-back. The
formation centre moves slightly slower than the soldiers so the ranks can keep
up, and the block rotates at a fixed rate rather than snapping. Soldiers break
ranks to close on an enemy within ~4.5 units and return to their slot afterwards.

## What's deliberately missing

Cavalry, archers, siege weapons, blocking, stamina, morale, retreating, terrain
generation, castles, campaign layer, economy, multiplayer, and unit progression
are all out of scope for this prototype and should be layered on top of these
systems rather than folded into them.
