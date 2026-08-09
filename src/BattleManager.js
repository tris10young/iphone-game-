export const BattleState = {
  INITIALISING: 'INITIALISING',
  BATTLE_ACTIVE: 'BATTLE_ACTIVE',
  PLAYER_VICTORY: 'PLAYER_VICTORY',
  PLAYER_DEFEAT: 'PLAYER_DEFEAT',
};

/**
 * Owns the battle state machine and win/lose conditions. Keeps the rest of the
 * simulation ignorant of whether the battle is "over" — units simply stop being
 * ordered around once a result is reached.
 */
export class BattleManager {
  constructor({ playerArmy, enemyArmy, commander }) {
    this.playerArmy = playerArmy;
    this.enemyArmy = enemyArmy;
    this.commander = commander;
    this.state = BattleState.INITIALISING;
    this.onStateChange = null;
    this.elapsed = 0;
  }

  begin() {
    this._setState(BattleState.BATTLE_ACTIVE);
  }

  get isOver() {
    return (
      this.state === BattleState.PLAYER_VICTORY || this.state === BattleState.PLAYER_DEFEAT
    );
  }

  update(dt) {
    if (this.state !== BattleState.BATTLE_ACTIVE) return;
    this.elapsed += dt;

    if (this.enemyArmy.aliveCount === 0) {
      this._setState(BattleState.PLAYER_VICTORY);
      return;
    }
    if (!this.commander.alive || this.playerArmy.aliveCount === 0) {
      this._setState(BattleState.PLAYER_DEFEAT);
    }
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    if (this.onStateChange) this.onStateChange(state);
  }
}
