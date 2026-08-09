import { BattleState } from './BattleManager.js';
import { CameraMode } from './CameraManager.js';

/** Thin wrapper over the DOM overlay. No game logic lives here. */
export class UIManager {
  constructor() {
    this.playerCount = document.getElementById('player-count');
    this.enemyCount = document.getElementById('enemy-count');
    this.modeValue = document.getElementById('mode-value');
    this.toast = document.getElementById('toast');
    this.result = document.getElementById('result');
    this.resultTitle = document.getElementById('result-title');
    this.crosshair = document.getElementById('crosshair');
    this.controlsTactical = document.getElementById('controls-tactical');
    this.controlsFp = document.getElementById('controls-fp');
    this.lockHint = document.getElementById('lock-hint');
    this.touchTactical = document.getElementById('touch-tactical');
    this.touchFp = document.getElementById('touch-fp');
    this.touchRestart = document.getElementById('btn-restart');

    this._toastTimer = 0;
    this._lastPlayer = -1;
    this._lastEnemy = -1;
  }

  setCounts(playerAlive, playerTotal, enemyAlive, enemyTotal) {
    if (playerAlive !== this._lastPlayer) {
      this.playerCount.textContent = `${playerAlive}/${playerTotal}`;
      this._lastPlayer = playerAlive;
    }
    if (enemyAlive !== this._lastEnemy) {
      this.enemyCount.textContent = `${enemyAlive}/${enemyTotal}`;
      this._lastEnemy = enemyAlive;
    }
  }

  setMode(mode) {
    const firstPerson = mode === CameraMode.FIRST_PERSON;
    this.modeValue.textContent = firstPerson ? 'FIRST PERSON MODE' : 'TACTICAL MODE';
    this.controlsTactical.classList.toggle('hidden', firstPerson);
    this.controlsFp.classList.toggle('hidden', !firstPerson);
    this.crosshair.classList.toggle('hidden', !firstPerson);
    this.touchTactical.classList.toggle('hidden', firstPerson);
    this.touchFp.classList.toggle('hidden', !firstPerson);
  }

  setPointerLockHint(visible) {
    this.lockHint.classList.toggle('hidden', !visible);
  }

  setSelection(selected) {
    if (!selected) this.hideToast();
  }

  showToast(text, duration = 1.6) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this._toastTimer = duration;
  }

  hideToast() {
    this.toast.classList.remove('show');
    this._toastTimer = 0;
  }

  setResult(state) {
    if (state === BattleState.PLAYER_VICTORY || state === BattleState.PLAYER_DEFEAT) {
      const victory = state === BattleState.PLAYER_VICTORY;
      this.resultTitle.textContent = victory ? 'VICTORY' : 'DEFEAT';
      this.resultTitle.classList.toggle('victory', victory);
      this.resultTitle.classList.toggle('defeat', !victory);
      this.result.classList.remove('hidden');
      this.touchRestart.classList.remove('hidden');
      // The touch controls would sit on top of the result screen.
      this.touchTactical.classList.add('hidden');
      this.touchFp.classList.add('hidden');
    } else {
      this.result.classList.add('hidden');
      this.touchRestart.classList.add('hidden');
    }
  }

  update(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.toast.classList.remove('show');
    }
  }
}
