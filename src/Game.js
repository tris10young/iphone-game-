import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Battlefield } from './Battlefield.js';
import { Army } from './Army.js';
import { CombatSystem } from './CombatSystem.js';
import { CommandController } from './CommandController.js';
import { FirstPersonController } from './FirstPersonController.js';
import { EnemyAI } from './EnemyAI.js';
import { CameraManager, CameraMode } from './CameraManager.js';
import { InputManager } from './InputManager.js';
import { UIManager } from './UIManager.js';
import { BattleManager, BattleState } from './BattleManager.js';
import { DebugView } from './DebugView.js';
import { SoldierState } from './Soldier.js';

/**
 * Composition root. Owns the renderer, the scene and the frame loop, and wires
 * the systems together. Everything gameplay-related lives in the systems — this
 * file should stay boring.
 */
export class Game {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();

    this.battlefield = new Battlefield(this.scene);
    this.input = new InputManager(this.renderer.domElement);
    this.ui = new UIManager();
    this.cameraManager = new CameraManager(window.innerWidth / window.innerHeight, this.battlefield);
    // The first person camera carries the held sword as a child, so it has to
    // be part of the scene graph for that view model to render.
    this.scene.add(this.cameraManager.fpCamera);
    this.combat = new CombatSystem(this.scene);
    this.debug = new DebugView(this.scene);

    this._commanderCentre = new THREE.Vector3();
    this._updateContext = { grid: this.combat.grid, combat: this.combat };

    this._buildBattle();

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  // -------------------------------------------------------------------------
  // Setup / teardown of a single battle
  // -------------------------------------------------------------------------
  _buildBattle() {
    const { army } = CONFIG;

    this.playerArmy = new Army({
      team: 'player',
      size: army.size,
      withCommander: true,
      spawn: army.playerSpawn,
      battlefield: this.battlefield,
      scene: this.scene,
    });

    this.enemyArmy = new Army({
      team: 'enemy',
      size: army.size,
      withCommander: false,
      spawn: army.enemySpawn,
      battlefield: this.battlefield,
      scene: this.scene,
    });

    this.commander = this.playerArmy.commander;
    this.allSoldiers = [...this.playerArmy.soldiers, ...this.enemyArmy.soldiers];
    this.combat.setSoldiers(this.allSoldiers);
    this.combat.acquisitionEnabled = true;

    this.enemyAI = new EnemyAI({ army: this.enemyArmy, targetArmy: this.playerArmy });

    this.command = new CommandController({
      scene: this.scene,
      army: this.playerArmy,
      battlefield: this.battlefield,
      cameraManager: this.cameraManager,
      ui: this.ui,
    });

    this.firstPerson = new FirstPersonController({
      commander: this.commander,
      cameraManager: this.cameraManager,
      combat: this.combat,
      battlefield: this.battlefield,
      input: this.input,
    });

    this.battle = new BattleManager({
      playerArmy: this.playerArmy,
      enemyArmy: this.enemyArmy,
      commander: this.commander,
    });
    this.battle.onStateChange = (state) => this._onBattleStateChange(state);
    this.combat.onDeath = (soldier) => this._onSoldierDeath(soldier);

    this.debug.build(this.allSoldiers);

    this.ui.setMode(CameraMode.TACTICAL);
    this.ui.setResult(BattleState.BATTLE_ACTIVE);
    this.ui.setCounts(
      this.playerArmy.aliveCount,
      this.playerArmy.size,
      this.enemyArmy.aliveCount,
      this.enemyArmy.size
    );
    this.ui.showToast('Click your army, then right-click to march', 4);

    this.battle.begin();
  }

  restart() {
    this.firstPerson.deactivate();
    this.firstPerson.dispose();
    this.command.dispose();

    this.playerArmy.dispose();
    this.enemyArmy.dispose();

    // Reset the tactical view to its opening framing.
    const T = CONFIG.tacticalCamera;
    this.cameraManager.mode = CameraMode.TACTICAL;
    this.cameraManager.transitionT = 1;
    this.cameraManager.target.set(T.startTarget.x, 0, T.startTarget.z);
    this.cameraManager.desiredTarget.copy(this.cameraManager.target);
    this.cameraManager.yaw = T.yaw;
    this.cameraManager.pitch = T.pitch;
    this.cameraManager.distance = T.distance;
    this.cameraManager.desiredDistance = T.distance;
    this.cameraManager.shake = 0;

    this._buildBattle();
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------
  start() {
    this.renderer.setAnimationLoop(() => this._frame());
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  _frame() {
    // Clamp dt so a background tab or a hitch cannot teleport the battle.
    const dt = Math.min(this.clock.getDelta(), 0.05);

    this._handleGlobalInput();

    if (!this.battle.isOver) {
      this.enemyAI.update(dt);
    }

    this.playerArmy.update(dt);
    this.enemyArmy.update(dt);

    // Grid rebuild + staggered target acquisition for everybody.
    this.combat.update(dt);

    // The player-controlled commander moves before the rest of the battle so
    // its position is current for this frame's combat and camera work.
    this.firstPerson.update(dt);

    for (let i = 0; i < this.allSoldiers.length; i++) {
      this.allSoldiers[i].update(dt, this._updateContext);
    }

    if (this.cameraManager.mode === CameraMode.TACTICAL && !this.battle.isOver) {
      this.command.update(dt, this.input);
    }

    this.cameraManager.update(dt, this.input, this.commander);
    this.battle.update(dt);

    this.ui.setCounts(
      this.playerArmy.aliveCount,
      this.playerArmy.size,
      this.enemyArmy.aliveCount,
      this.enemyArmy.size
    );
    this.ui.setPointerLockHint(this.firstPerson.active && !this.input.pointerLocked);
    this.ui.update(dt);

    this.debug.update(this.allSoldiers, this.cameraManager.getActiveCamera());

    this.input.endFrame();
    this.renderer.render(this.scene, this.cameraManager.getActiveCamera());
  }

  _handleGlobalInput() {
    if (this.input.justPressed('KeyH')) this.debug.toggle();

    if (this.input.justPressed('KeyR') && this.battle.isOver) {
      this.restart();
      return;
    }

    if (this.input.justPressed('KeyF') && !this.battle.isOver) {
      this._toggleMode();
    }

    // Any click is a user gesture — safe to start the audio context.
    if (this.input.clicks.length > 0) this.combat.resumeAudio();
  }

  _toggleMode() {
    if (this.cameraManager.mode === CameraMode.TACTICAL) {
      if (!this.commander.alive) return;
      this.cameraManager.enterFirstPerson(this.commander);
      this.firstPerson.activate();
      this.ui.setMode(CameraMode.FIRST_PERSON);
      this.ui.hideToast();
    } else {
      this.firstPerson.deactivate();
      this.cameraManager.enterTactical(this.commander.position);
      this.ui.setMode(CameraMode.TACTICAL);
    }
  }

  _onSoldierDeath(soldier) {
    // If the commander falls while the player is inside them, hand the camera
    // back to the tactical view rather than leaving it in a corpse.
    if (soldier === this.commander && this.firstPerson.active) {
      this.firstPerson.deactivate();
      this.cameraManager.enterTactical(this.commander.position);
      this.ui.setMode(CameraMode.TACTICAL);
    }
  }

  _onBattleStateChange(state) {
    this.ui.setResult(state);
    if (this.battle.isOver) {
      if (this.firstPerson.active) {
        this.firstPerson.deactivate();
        this.cameraManager.enterTactical(this.commander.position);
        this.ui.setMode(CameraMode.TACTICAL);
      }
      // Stand everyone down; survivors hold where they are.
      this.combat.acquisitionEnabled = false;
      for (const soldier of this.allSoldiers) {
        if (soldier.alive && soldier.state !== SoldierState.DEAD) {
          soldier.enemy = null;
          soldier.formationTarget.copy(soldier.position);
        }
      }
      this.playerArmy.hasOrder = false;
      this.enemyArmy.hasOrder = false;
      this.playerArmy.holding = true;
      this.enemyArmy.holding = true;
      this.command.hideMarker();
    }
  }

  _resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.cameraManager.setAspect(width / height);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.renderer.dispose();
  }
}
