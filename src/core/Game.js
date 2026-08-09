import * as THREE from 'three';
import { Palette, SUN_DIRECTION } from '../world/Palette.js';
import { buildLevel, LEVEL_FOCUS } from '../world/Level.js';
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

const START_CAMERA = { azimuth: -0.45, polar: 0.96, frustumHeight: 54 };

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
      LEVEL_FOCUS.x + SUN_DIRECTION.x * 70,
      LEVEL_FOCUS.y + SUN_DIRECTION.y * 70,
      LEVEL_FOCUS.z + SUN_DIRECTION.z * 70,
    );
    this.sun.target.position.copy(LEVEL_FOCUS);
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
    this.level = buildLevel();
    this.scene.add(this.level.root);
    this.dust = new DustSystem(this.scene, { capacity: this.quality === 'low' ? 120 : 220 });
  }

  _setupPlayer() {
    this.character = new Character();
    this.scene.add(this.character.root);
    this.navigation = new PlayerNavigation(this.level.nav, this.character);
    this.navigation.placeAt('start', 'start_n');
  }

  _setupCameraAndInput() {
    this.cameraController = new CameraController(this.camera, {
      focus: LEVEL_FOCUS,
      frustumHeight: START_CAMERA.frustumHeight,
    });
    this.cameraController.jumpTo(START_CAMERA);

    this.input = new InputController(this.canvas);
    this.input.on('orbit', ({ dx, dy }) => this.cameraController.orbit(dx, dy));
    this.input.on('zoom', ({ ratio }) => this.cameraController.zoom(ratio));
    this.input.on('press', () => this.cameraController.setDragging(true));
    this.input.on('release', () => this.cameraController.setDragging(false));

    this.interaction = new InteractionController({
      camera: this.camera,
      input: this.input,
      nav: this.level.nav,
      navigation: this.navigation,
      mechanisms: this.level.mechanisms,
      pickTargets: this.level.pickTargets,
    });
  }

  _setupSystems() {
    this.audio = new AudioSystem();

    this.ui = new UI({
      onResume: () => this._setPaused(false),
      onRestart: () => { this.reset(); this._setPaused(false); },
      onReplay: () => this.reset(),
      onToggleAudio: () => {
        this.audio.setEnabled(!this.audio.enabled);
        this.ui.setAudioState(this.audio.enabled);
      },
      onToggleQuality: () => this.setQuality(this.quality === 'high' ? 'low' : 'high'),
      onPause: (paused) => this._setPaused(paused),
    });
    this.ui.setAudioState(true);
    this.ui.setQualityState(this.quality);

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
      onComplete: () => {
        this.puzzles.completed = true;
        this.interaction.enabled = false;
        this.ui.showComplete();
      },
    });

    this.post = new Postprocessing(this.renderer, this.scene, this.camera, { quality: this.quality });
  }

  /* ---------------- lifecycle ---------------- */

  /** Called from the title tap, which is also what unlocks audio on iOS. */
  async start() {
    await this.audio.unlock();
    this.audio.portalHum();
    if (!this.running) {
      this.running = true;
      this._clock.start();
      this._loop();
    }
  }

  reset() {
    this.puzzles.reset();
    this.complete.reset();
    this.dust.clear();
    this.navigation.placeAt('start', 'start_n');
    this.cameraController.jumpTo(START_CAMERA);
    this.cameraController.target.copy(LEVEL_FOCUS);
    this.interaction.enabled = true;
    this.ui.hideComplete();
    this.ui.hideHint();
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
    this.puzzles.update(dt);
    this.navigation.update(dt);
    this.complete.update(dt);
    this.dust.update(dt);
    this.cameraController.update(dt, this.character.position);
    this.sky.update(dt, this.camera.position);

    // The pennant is the only thing that moves without being asked to. It is
    // what keeps a stone diorama from reading as a still life.
    if (this.level.pennant) {
      this._pennantTime = (this._pennantTime ?? 0) + dt;
      const t = this._pennantTime;
      this.level.pennant.rotation.y = Math.sin(t * 1.7) * 0.42 + Math.sin(t * 0.63) * 0.22;
      this.level.pennant.rotation.z = Math.sin(t * 2.3 + 1.0) * 0.1;
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
    for (const mechanism of this.level.mechanisms) mechanism.dispose();
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
