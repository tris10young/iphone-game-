import * as THREE from 'three';

/**
 * Tracks puzzle state and owns the reaction to every mechanism event: sound,
 * dust, camera nudges and the single line of guidance text.
 *
 * Keeping this wiring in one place is what lets the mechanisms stay dumb --
 * `RotatingStructure` knows how to rotate and nothing about audio or cameras.
 */

const STEPS = [
  {
    id: 'approach',
    hint: 'Tap anywhere on the stone to walk.',
    done: (ctx) => ctx.visited.has('tower_s'),
  },
  {
    id: 'rotate',
    hint: 'The passage faces the wrong way. Tap the tower.',
    done: (ctx) => ctx.mechanisms.rotating.isAligned,
  },
  {
    id: 'cross-tower',
    hint: '',
    done: (ctx) => ctx.visited.has('ta_c') || ctx.visited.has('ta_in'),
  },
  {
    id: 'bridge',
    hint: 'Turn the wheel to bring the bridge across.',
    done: (ctx) => ctx.mechanisms.sliding.isAligned,
  },
  {
    id: 'cross-bridge',
    hint: '',
    done: (ctx) => ctx.visited.has('tb_c') || ctx.visited.has('tb_w'),
  },
  {
    id: 'board',
    hint: 'Step onto the platform.',
    done: (ctx) => ctx.visited.has('lift'),
  },
  {
    id: 'ride',
    hint: 'Touch the mechanism to rise.',
    done: (ctx) => ctx.mechanisms.elevator.index === 1,
  },
  {
    id: 'temple',
    hint: '',
    done: (ctx) => ctx.completed,
  },
];

export class PuzzleManager {
  constructor({ level, audio, dust, cameraController, navigation, interaction, ui }) {
    this.level = level;
    this.audio = audio;
    this.dust = dust;
    this.camera = cameraController;
    this.navigation = navigation;
    this.interaction = interaction;
    this.ui = ui;

    this.mechanisms = {
      rotating: level.rotating,
      sliding: level.sliding,
      elevator: level.elevator,
    };

    this.visited = new Set();
    this.completed = false;
    this.stepIndex = 0;
    this._hintTimer = 0;
    this._hintShown = null;
    this._time = 0;

    this._wire();
  }

  _wire() {
    const { rotating, sliding, elevator } = this.mechanisms;

    // --- rotating tower: heavy, grinding, then a hard mechanical lock ---
    rotating.on('start', () => {
      this.audio.startGrind(rotating.duration);
      this.camera.nudgeTo(rotating.focus, { hold: rotating.duration * 0.55, weight: 0.4 });
    });
    rotating.on('progress', ({ t }) => {
      // Dust sheds from the joint for as long as the stone is turning.
      if (Math.random() < 0.55 && t < 0.96) {
        const angle = Math.random() * Math.PI * 2;
        const radius = rotating.size / 2 + 0.2;
        this.dust.burst(
          new THREE.Vector3(
            rotating.group.position.x + Math.cos(angle) * radius,
            rotating.group.position.y + 0.1,
            rotating.group.position.z + Math.sin(angle) * radius,
          ),
          { count: 2, spread: 0.5, speed: 0.5, drift: -0.1, life: 1.5 },
        );
      }
    });
    rotating.on('settle', () => {
      this.audio.stopGrind();
      this.audio.lock();
      this.dust.burst(rotating.focus, { count: 20, spread: 3.2, speed: 1.3, drift: -0.15, life: 1.9 });
      this.interaction.refreshHover();
    });

    // --- sliding bridge: smooth travel, then a low settling impact ---
    sliding.on('start', () => {
      this.audio.startGrind(sliding.duration);
      this.camera.nudgeTo(sliding.focus, { hold: sliding.duration * 0.5, weight: 0.34 });
    });
    sliding.on('settle', () => {
      this.audio.stopGrind();
      this.audio.impact();
      const p = sliding.group.position;
      for (const offset of [-sliding.length / 2, sliding.length / 2]) {
        this.dust.burst(new THREE.Vector3(p.x + offset, p.y - 0.3, p.z),
          { count: 12, spread: 1.0, speed: 0.7, drift: -0.5, life: 1.7 });
      }
      this.interaction.refreshHover();
    });

    // --- elevator: the level's one cinematic beat ---
    elevator.on('start', () => {
      this.audio.startGrind(elevator.duration);
      // Pull back and lift as it rises, revealing how far up the temple is.
      this.camera.nudgeTo(
        new THREE.Vector3(elevator.focus.x, elevator.origin.y + elevator.rise * 0.65, elevator.focus.z),
        { hold: elevator.duration, weight: 0.5 },
      );
      this.camera.targetDistance = Math.min(this.camera.maxDistance, this.camera.distance + 9);
    });
    elevator.on('settle', () => {
      this.audio.stopGrind();
      this.audio.lock();
      this.dust.burst(
        new THREE.Vector3(elevator.group.position.x, elevator.group.position.y - 0.6, elevator.group.position.z),
        { count: 16, spread: 2.4, speed: 0.6, drift: -0.4, life: 2.0 },
      );
      this.interaction.refreshHover();
    });

    // --- player feedback ---
    this.navigation.on('step', () => this.audio.footstep());
    this.navigation.on('arrive', ({ node }) => {
      this.visited.add(node.id);
      this._evaluate();
    });
    this.navigation.on('depart', ({ path }) => {
      for (const node of path) this.visited.add(node.id);
      this._evaluate();
    });

    this.interaction.on('activate', ({ mechanism }) => {
      this.audio.chime(mechanism === this.mechanisms.elevator ? 4 : 0);
      this._hintTimer = 0;
    });
    this.interaction.on('reject', () => this.audio.reject());
  }

  /** Advance the guidance step and refresh the on-screen hint. */
  _evaluate() {
    while (this.stepIndex < STEPS.length - 1 && STEPS[this.stepIndex].done(this)) {
      this.stepIndex++;
      this._hintTimer = 0;
      this._hintShown = null;
    }
  }

  update(dt) {
    this._time += dt;
    for (const mechanism of Object.values(this.mechanisms)) {
      mechanism.update(dt);
      mechanism.ambient(this._time);
    }
    this._evaluate();

    // Hints appear only after the player has had a moment to work it out
    // unaided, and never while something is moving.
    const step = STEPS[this.stepIndex];
    const busy = Object.values(this.mechanisms).some((m) => m.isMoving) || this.navigation.isWalking;
    if (busy || this.completed) {
      this._hintTimer = 0;
      if (this._hintShown) { this.ui.hideHint(); this._hintShown = null; }
      return;
    }

    this._hintTimer += dt;
    if (step.hint && this._hintTimer > 6 && this._hintShown !== step.id) {
      this.ui.showHint(step.hint);
      this._hintShown = step.id;
    }
  }

  reset() {
    this.visited.clear();
    this.completed = false;
    this.stepIndex = 0;
    this._hintTimer = 0;
    this._hintShown = null;
    this.ui.hideHint();
    this.mechanisms.rotating.reset(0);
    this.mechanisms.sliding.reset(0);
    this.mechanisms.elevator.reset(0);
    this.audio.stopGrind();
  }
}
