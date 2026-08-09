import { LEVELS } from '../world/Levels.js';

/**
 * Which levels the player has unlocked.
 *
 * Deliberately the smallest possible amount of state: one integer. There is no
 * score, no stars and no currency -- finishing a level unlocks the next one and
 * that is the whole progression system.
 *
 * Storage is best-effort. Private browsing on iOS can refuse localStorage
 * entirely, and a puzzle game that throws on startup because it could not save
 * a number would be a poor trade, so every access is guarded.
 */

const KEY = 'skyward.progress.v1';

export class Progress {
  constructor() {
    this.unlocked = this._read();
  }

  _read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const value = Number.parseInt(raw ?? '0', 10);
      if (Number.isInteger(value)) return clampIndex(value);
    } catch {
      // Storage unavailable. Fall through to a fresh run.
    }
    return 0;
  }

  _write() {
    try {
      window.localStorage.setItem(KEY, String(this.unlocked));
    } catch {
      // Nothing to do; progress simply will not survive a reload.
    }
  }

  /** Highest level index the player may open. */
  get highestUnlocked() {
    return this.unlocked;
  }

  isUnlocked(index) {
    return index <= this.unlocked;
  }

  get isComplete() {
    return this.unlocked >= LEVELS.length - 1;
  }

  /** Records a finished level and unlocks the next. Returns true if new ground. */
  complete(index) {
    if (index < this.unlocked) return false;
    this.unlocked = clampIndex(index + 1);
    this._write();
    return true;
  }

  reset() {
    this.unlocked = 0;
    this._write();
  }
}

function clampIndex(value) {
  return Math.max(0, Math.min(LEVELS.length - 1, value));
}
