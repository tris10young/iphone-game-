import * as THREE from 'three';
import { solveLevel } from '../nav/Solver.js';

/**
 * Tracks puzzle state and owns the reaction to every mechanism event: sound,
 * dust, camera nudges and the single line of guidance.
 *
 * Keeping this wiring in one place is what lets mechanisms stay dumb --
 * `RotatingStructure` knows how to rotate and nothing about audio or cameras --
 * and it is why ten levels needed no new wiring at all. Everything here
 * dispatches on `mechanism.kind`, so a level is just a different arrangement of
 * the same three parts.
 */

/** Hints are phrased by mechanism type; there is no per-level hint text. */
const HINTS = {
  rotate: 'Something here needs to turn.',
  slide: 'A bridge is not where it should be.',
  lift: 'Ride the platform.',
  liftBoard: 'Step onto the platform first.',
  walk: 'Tap the stone to walk.',
  stuck: 'Try turning something else.',
  ride: 'Stand inside it, then turn it.',
};

export class PuzzleManager {
  constructor({ level, audio, dust, cameraController, navigation, interaction, ui }) {
    this.level = level;
    this.audio = audio;
    this.dust = dust;
    this.camera = cameraController;
    this.navigation = navigation;
    this.interaction = interaction;
    this.ui = ui;

    this.completed = false;
    this.hasWalked = false;
    this.hasActivated = false;
    this._hintTimer = 0;
    this._hintShown = null;
    this._time = 0;
    this._scratch = new THREE.Vector3();

    for (const mechanism of level.mechanisms) this._wire(mechanism);
    this._wirePlayer();
  }

  /** Every mechanism gets the same treatment, chosen by its kind. */
  _wire(mechanism) {
    mechanism.on('start', () => {
      this.audio.startGrind(mechanism.duration);
      const hold = mechanism.kind === 'lift' ? mechanism.duration : mechanism.duration * 0.55;
      const focus = mechanism.kind === 'lift'
        ? this._scratch.set(mechanism.focus.x, mechanism.origin.y + mechanism.rise * 0.65, mechanism.focus.z)
        : mechanism.focus;
      this.camera.nudgeTo(focus, { hold, weight: mechanism.kind === 'lift' ? 0.5 : 0.38 });
      if (mechanism.kind === 'lift') {
        // Pull back as it climbs, so the ride reveals how far up this goes.
        this.camera.targetHeight = Math.min(this.camera.maxHeight, this.camera.frustumHeight + 16);
      }
    });

    if (mechanism.kind === 'rotate') {
      mechanism.on('progress', ({ t }) => {
        // Dust sheds from the joint for as long as the stone is turning.
        if (Math.random() < 0.5 && t < 0.96) {
          const angle = Math.random() * Math.PI * 2;
          const radius = mechanism.size / 2 + 0.2;
          this.dust.burst(
            this._scratch.set(
              mechanism.group.position.x + Math.cos(angle) * radius,
              mechanism.group.position.y + 0.1,
              mechanism.group.position.z + Math.sin(angle) * radius,
            ),
            { count: 2, spread: 0.5, speed: 0.5, drift: -0.1, life: 1.5 },
          );
        }
      });
    }

    mechanism.on('settle', () => {
      this.audio.stopGrind();
      if (mechanism.kind === 'slide') {
        this.audio.impact();
        const p = mechanism.group.position;
        for (const offset of [-mechanism.length / 2, mechanism.length / 2]) {
          this.dust.burst(this._scratch.set(p.x + offset, p.y - 0.3, p.z),
            { count: 10, spread: 1.0, speed: 0.7, drift: -0.5, life: 1.7 });
        }
      } else {
        this.audio.lock();
        const p = mechanism.kind === 'lift'
          ? this._scratch.set(mechanism.group.position.x, mechanism.group.position.y - 0.6, mechanism.group.position.z)
          : mechanism.focus;
        this.dust.burst(p, { count: 16, spread: 2.6, speed: 1.0, drift: -0.2, life: 1.9 });
      }
      this.interaction.refreshHover();
      this._hintTimer = 0;
      this._hintShown = null;
    });
  }

  _wirePlayer() {
    this.navigation.on('step', () => this.audio.footstep());
    this.navigation.on('depart', () => {
      this.hasWalked = true;
      this._hintTimer = 0;
    });
    this.interaction.on('activate', ({ mechanism }) => {
      this.hasActivated = true;
      this.audio.chime(mechanism.kind === 'lift' ? 4 : 0);
      this._hintTimer = 0;
      this._hintShown = null;
    });
    this.interaction.on('reject', () => this.audio.reject());
  }

  /**
   * Works out what to say by actually solving the level from where the player
   * is standing right now.
   *
   * This is the same exhaustive search that proves the levels are solvable, so
   * a hint can never be wrong or stale, and not one line of hint text had to be
   * written per level. If the search finds no route, the player has genuinely
   * tangled themselves and is told to try something else.
   */
  _currentHint() {
    if (!this.hasWalked) return HINTS.walk;

    const node = this.navigation.currentNode;
    const solution = solveLevel(this.level, { fromNodeId: node?.id });
    if (!solution.solvable) return HINTS.stuck;
    if (!solution.sequence.length) return null;

    const step = solution.sequence[0];
    const mechanism = this.level.mechanismsById.get(step.id);
    if (!mechanism) return null;

    if (mechanism.kind === 'lift') {
      return node?.owner === mechanism ? HINTS.lift : HINTS.liftBoard;
    }
    // The solution needs the player carried by the thing they are turning.
    const standOn = this.level.nav.nodes.get(step.at);
    if (standOn?.owner === mechanism && node?.owner !== mechanism) return HINTS.ride;
    return HINTS[mechanism.kind] ?? null;
  }

  update(dt) {
    this._time += dt;
    for (const mechanism of this.level.mechanisms) {
      mechanism.update(dt);
      mechanism.ambient(this._time);
    }

    // Guidance appears only after the player has had a real chance to work it
    // out unaided, and never while anything is in motion.
    const busy = this.level.mechanisms.some((m) => m.isMoving) || this.navigation.isWalking;
    if (busy || this.completed) {
      this._hintTimer = 0;
      if (this._hintShown) { this.ui.hideHint(); this._hintShown = null; }
      return;
    }

    this._hintTimer += dt;
    if (this._hintTimer > 8 && !this._hintShown) {
      const hint = this._currentHint();
      if (hint) {
        this.ui.showHint(hint);
        this._hintShown = hint;
      }
    }
  }
}
