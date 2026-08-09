import * as THREE from 'three';
import { Palette, SUN_DIRECTION } from '../world/Palette.js';
import { buildLevel, disposeLevel } from '../world/LevelBuilder.js';
import { LEVELS } from '../world/Levels.js';
import { Progress } from './Progress.js';
import { Sky } from '../world/Sky.js';
import { Character } from '../character/Character.js';
import { PlayerNavigation } from '../character/PlayerNavigation.js';
import { CameraController } from '../camera/CameraController.js';
import { InputController } from '../input/InputController.js';
import { InteractionController } from '../input/InteractionController.js';
import { PuzzleManager } from '../puzzles/PuzzleManager.js';
import { LevelCompleteTrigger } from '../puzzles/LevelCompleteTrigger.js';
import { DustSystem } from '../fx/Dust.js';
import { Postprocessing } from '../fx/Postprocessing.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { UI } from '../ui/UI.js';

/**
 * Wires the whole prototype together and owns the frame loop.
 *
 * Deliberately the only place that knows about every subsystem; each subsystem
 * knows about as few of the others as it can get away with.
 */

const DEFAULT_CAMERA = { azimuth: -0.5, polar: 0.94, frustumHeight: 64 };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = detectQuality();
    this.paused = false;
    this.running = false;

    this._clock = new THREE.Clock();
    this._accumulatedTime = 0;

    this._setupRenderer();
    this._setupScene();
    this._setupLevel();
    this._setupPlayer();
    this._setupCameraAndInput();
    this._setupSystems();

    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._onResize();
  }

  /* ---------------- setup ---------------- */

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality === 'high',
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral keeps pastels pastel; ACES would push the whole palette warm and
    // contrasty, which is the opposite of the brief.
    this.renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 0.97;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Palette.fog);
    // With an orthographic camera the standoff is fixed, so the level always
    // sits at roughly the same view depth. Fog therefore starts just beyond it
    // and only ever touches the cloud layers.
    this.scene.fog = new THREE.Fog(Palette.fog, 210, 620);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 1400);

    // One warm sun, one cool sky fill. Anything more and the stylised flat
    // shading starts to look muddy.
    this.sun = new THREE.DirectionalLight(Palette.sunLight, 2.15);
    this.sun.position.set(
      SUN_DIRECTION.x * 70,
      SUN_DIRECTION.y * 70,
      SUN_DIRECTION.z * 70,
    );
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const shadow = this.sun.shadow;
    shadow.camera.left = -44;
    shadow.camera.right = 44;
    shadow.camera.top = 48;
    shadow.camera.bottom = -44;
    shadow.camera.near = 8;
    shadow.camera.far = 190;
    // A small negative bias plus normalBias is what keeps contact shadows tight
    // under the stairs without shadow acne on the big flat terraces.
    shadow.bias = -0.0006;
    shadow.normalBias = 0.035;
    shadow.radius = 1.1;
    // Shadows are lightened rather than left at full strength. Pastel stone in
    // a full-black shadow goes grey and muddy, and the brief explicitly rules
    // out overly dark lighting -- this keeps occluded faces tinted, not dead.
    if ('intensity' in shadow) shadow.intensity = 0.7;
    this.scene.add(this.sun, this.sun.target);

    this.skyLight = new THREE.HemisphereLight(Palette.skyLight, Palette.bounce, 1.15);
    this.scene.add(this.skyLight);
    // A faint fill from the opposite side stops undersides going flat black.
    this.fill = new THREE.DirectionalLight(Palette.bounce, 0.55);
    this.fill.position.set(30, -14, -34);
    this.scene.add(this.fill);

    this.sky = new Sky(this.scene, { quality: this.quality });
  }

  _setupLevel() {
    // Only the things that outlive a level are built here. The level itself,
    // and everything that holds a reference into it, is built by loadLevel().
    this.dust = new DustSystem(this.scene, { capacity: this.quality === 'low' ? 120 : 220 });
    this.progress = new Progress();
    this.levelIndex = 0;
    this.level = null;
  }

  _setupPlayer() {
    // The traveller is reused across levels; only its position changes.
    this.character = new Character();
    this.scene.add(this.character.root);
  }

  _setupCameraAndInput() {
    // A placeholder focus; loadLevel() re-aims it at the real level immediately.
    this.cameraController = new CameraController(this.camera, {
      focus: new THREE.Vector3(0, 10, 0), ...DEFAULT_CAMERA,
    });
    this.cameraController.jumpTo(DEFAULT_CAMERA);

    this.input = new InputController(this.canvas);
    this.input.on('orbit', ({ dx, dy }) => this.cameraController.orbit(dx, dy));
    this.input.on('zoom', ({ ratio }) => this.cameraController.zoom(ratio));
    this.input.on('press', () => this.cameraController.setDragging(true));
    this.input.on('release', () => this.cameraController.setDragging(false));
  }

  _setupSystems() {
    this.audio = new AudioSystem();

    this.ui = new UI({
      levels: LEVELS,
      onResume: () => this._setPaused(false),
      onRestart: () => { this.restartLevel(); this._setPaused(false); },
      onReplay: () => this.restartLevel(),
      onNextLevel: () => this.loadLevel(this.levelIndex + 1),
      onSelectLevel: (index) => {
        if (!this.progress.isUnlocked(index)) return;
        this.loadLevel(index);
        this._setPaused(false);
      },
      onToggleAudio: () => {
        this.audio.setEnabled(!this.audio.enabled);
        this.ui.setAudioState(this.audio.enabled);
      },
      onToggleQuality: () => this.setQuality(this.quality === 'high' ? 'low' : 'high'),
      onPause: (paused) => this._setPaused(paused),
    });
    this.ui.setAudioState(true);
    this.ui.setQualityState(this.quality);

    this.post = new Postprocessing(this.renderer, this.scene, this.camera, { quality: this.quality });
  }

  /* ---------------- levels ---------------- */

  /**
   * Tears down the current level and builds another.
   *
   * Everything that holds a reference into a level -- navigation, interaction,
   * puzzle wiring, the completion trigger -- is rebuilt rather than reset,
   * because a half-updated controller pointing at a disposed level is a much
   * nastier class of bug than simply constructing three small objects.
   */
  loadLevel(index) {
    const clamped = Math.max(0, Math.min(LEVELS.length - 1, index));
    this._unloadLevel();

    this.levelIndex = clamped;
    this.level = buildLevel(LEVELS[clamped]);
    this.scene.add(this.level.root);

    this.navigation = new PlayerNavigation(this.level.nav, this.character);
    this.navigation.placeAt(this.level.start);

    this.interaction = new InteractionController({
      camera: this.camera,
      input: this.input,
      nav: this.level.nav,
      navigation: this.navigation,
      mechanisms: this.level.mechanisms,
      pickTargets: this.level.pickTargets,
    });

    this.puzzles = new PuzzleManager({
      level: this.level,
      audio: this.audio,
      dust: this.dust,
      cameraController: this.cameraController,
      navigation: this.navigation,
      interaction: this.interaction,
      ui: this.ui,
    });

    this.complete = new LevelCompleteTrigger({
      level: this.level,
      navigation: this.navigation,
      character: this.character,
      audio: this.audio,
      dust: this.dust,
      cameraController: this.cameraController,
      ui: this.ui,
      onComplete: () => this._onLevelComplete(),
    });

    this.dust.clear();
    this._frameLevel();
    this.audio.portalHum();

    this.ui.hideComplete();
    this.ui.hideHint();
    this.ui.showLevelTitle(clamped + 1, this.level.name, this.level.definition.subtitle);
    this.ui.setLevelProgress(this.progress, clamped);
  }

  /** Points the camera and the sun at wherever this level actually is. */
  _frameLevel() {
    const camera = { ...DEFAULT_CAMERA, ...this.level.camera };
    this.cameraController.levelFocus.copy(this.level.focus);
    this.cameraController.target.copy(this.level.focus);
    this.cameraController.jumpTo(camera);

    // The shadow camera is an orthographic box; it has to follow the level or
    // half the structure falls outside it and simply stops casting.
    this.sun.position.set(
      this.level.focus.x + SUN_DIRECTION.x * 70,
      this.level.focus.y + SUN_DIRECTION.y * 70,
      this.level.focus.z + SUN_DIRECTION.z * 70,
    );
    this.sun.target.position.copy(this.level.focus);
    this.sun.target.updateMatrixWorld();
    this.sun.shadow.needsUpdate = true;
  }

  _unloadLevel() {
    if (!this.level) return;
    this.interaction.dispose();
    this.audio.stopGrind();
    disposeLevel(this.level);
    this.level = null;
    this.navigation = null;
    this.interaction = null;
    this.puzzles = null;
    this.complete = null;
  }

  _onLevelComplete() {
    this.puzzles.completed = true;
    this.interaction.enabled = false;
    const isNewGround = this.progress.complete(this.levelIndex);
    this.ui.showComplete({
      levelNumber: this.levelIndex + 1,
      levelName: this.level.name,
      hasNext: this.levelIndex < LEVELS.length - 1,
      isFinale: this.levelIndex === LEVELS.length - 1,
      isNewGround,
    });
    this.ui.setLevelProgress(this.progress, this.levelIndex);
  }

  restartLevel() {
    this.loadLevel(this.levelIndex);
  }

  /* ---------------- lifecycle ---------------- */

  /** Called from the title tap, which is also what unlocks audio on iOS. */
  async start() {
    await this.audio.unlock();
    if (!this.level) this.loadLevel(this.progress.highestUnlocked);
    this.audio.portalHum();
    if (!this.running) {
      this.running = true;
      this._clock.start();
      this._loop();
    }
  }

  reset() {
    this.restartLevel();
  }

  setQuality(quality) {
    this.quality = quality;
    this.post.setQuality(quality);
    this.renderer.shadowMap.enabled = true;
    this.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.ui.setQualityState(quality);
    this._onResize();
  }

  _setPaused(paused) {
    this.paused = paused;
    this.input.enabled = !paused;
  }

  _onVisibility() {
    // Coming back from the home screen should not fast-forward the world.
    if (!document.hidden) this._clock.getDelta();
  }

  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Capping at 2 is the single biggest performance lever on an iPhone; the
    // visual difference above 2x is invisible at this art style.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.5);

    this.cameraController.setAspect(width / height);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.post.setSize(width, height, pixelRatio);

    // Keep the composition clear of the Dynamic Island and home indicator by
    // biasing the framing down the screen by half the difference between them.
    const styles = getComputedStyle(document.documentElement);
    const safeTop = parseFloat(styles.getPropertyValue('--safe-top')) || 0;
    const safeBottom = parseFloat(styles.getPropertyValue('--safe-bottom')) || 0;
    this.cameraController.setSafeAreaLift((safeTop - safeBottom) * 0.5, height);
  }

  /* ---------------- frame ---------------- */

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    // Clamp so a stall (a backgrounded tab, a GC pause) can never teleport the
    // traveller through a closed edge.
    const dt = Math.min(this._clock.getDelta(), 1 / 20);
    if (!this.paused) this._update(dt);
    this.post.render(dt);
  }

  _update(dt) {
    if (!this.level) return;
    this.puzzles.update(dt);
    this.navigation.update(dt);
    this.complete.update(dt);
    this.dust.update(dt);
    this.cameraController.update(dt, this.character.position);
    this.sky.update(dt, this.camera.position);

    // The pennant is the only thing that moves without being asked to. It is
    // what keeps a stone diorama from reading as a still life.
    this._pennantTime = (this._pennantTime ?? 0) + dt;
    const t = this._pennantTime;
    for (const flag of this.level.pennants) {
      flag.rotation.y = Math.sin(t * 1.7) * 0.42 + Math.sin(t * 0.63) * 0.22;
      flag.rotation.z = Math.sin(t * 2.3 + 1.0) * 0.1;
    }
  }

  dispose() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.input.dispose();
    this.audio.dispose();
    this.dust.dispose();
    this.sky.dispose();
    this.post.dispose();
    this.character.dispose();
    this._unloadLevel();
    this.renderer.dispose();
  }
}

/** Conservative device sniff, used only to pick the initial quality tier. */
function detectQuality() {
  const memory = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (memory <= 2 || cores <= 2) return 'low';
  return 'high';
}
