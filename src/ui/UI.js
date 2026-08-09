/**
 * All DOM interaction lives here.
 *
 * The brief is almost no HUD, and ten levels have not changed that: one corner
 * button, a title card that fades on arrival, a line of guidance that only
 * appears if the player has gone quiet, and two panels.
 */
export class UI {
  constructor({
    levels,
    onResume, onRestart, onReplay, onNextLevel, onSelectLevel,
    onToggleAudio, onToggleQuality, onPause,
  }) {
    this.levels = levels;
    this.root = document.getElementById('ui');
    this.hintEl = document.getElementById('hint');
    this.menuEl = document.getElementById('menu');
    this.levelsEl = document.getElementById('levels');
    this.completeEl = document.getElementById('complete');
    this.menuButton = document.getElementById('menu-button');
    this.bootEl = document.getElementById('boot');
    this.bootSub = document.getElementById('boot-sub');
    this.gridEl = document.getElementById('level-grid');

    this.titleEl = document.getElementById('level-title');
    this.titleNumber = document.getElementById('level-title-number');
    this.titleName = document.getElementById('level-title-name');
    this.titleSub = document.getElementById('level-title-sub');

    this.completeTitle = document.getElementById('complete-title');
    this.completeSub = document.getElementById('complete-sub');
    this.nextButton = document.getElementById('next-level');

    this.callbacks = {
      onResume, onRestart, onReplay, onNextLevel, onSelectLevel,
      onToggleAudio, onToggleQuality, onPause,
    };
    this.menuOpen = false;
    this._titleTimer = null;

    // The completion veil. Created here because nothing else needs to know it
    // exists.
    this.fadeEl = document.createElement('div');
    Object.assign(this.fadeEl.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5',
      background: 'rgba(255,255,255,1)', opacity: '0', transition: 'none',
    });
    document.body.appendChild(this.fadeEl);

    this._buildGrid();

    this.menuButton.addEventListener('click', () => this.toggleMenu());
    this.root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      event.stopPropagation();
      this._handleAction(action, event.target.closest('[data-action]'));
    });
  }

  _handleAction(action, element) {
    switch (action) {
      case 'resume': this.closeMenu(); this.callbacks.onResume?.(); break;
      case 'restart': this.closeMenu(); this.callbacks.onRestart?.(); break;
      case 'replay': this.hideComplete(); this.callbacks.onReplay?.(); break;
      case 'next-level': this.hideComplete(); this.callbacks.onNextLevel?.(); break;
      case 'show-levels': this.showLevels(); break;
      case 'close-levels': this.hideLevels(); break;
      case 'pick-level': {
        const index = Number(element.dataset.index);
        if (element.classList.contains('locked')) return;
        this.hideLevels();
        this.hideComplete();
        this.closeMenu();
        this.callbacks.onSelectLevel?.(index);
        break;
      }
      case 'toggle-audio': this.callbacks.onToggleAudio?.(); break;
      case 'toggle-quality': this.callbacks.onToggleQuality?.(); break;
    }
  }

  /* ---- level select ---- */

  _buildGrid() {
    this.gridEl.innerHTML = '';
    this.chips = this.levels.map((level, index) => {
      const chip = document.createElement('button');
      chip.className = 'level-chip locked';
      chip.dataset.action = 'pick-level';
      chip.dataset.index = String(index);
      chip.innerHTML = `<span class="n">${index + 1}</span><span class="par"></span>`;
      this.gridEl.appendChild(chip);
      return chip;
    });
  }

  /**
   * Reflects unlock state. A locked level shows a lock rather than its par,
   * because par is a spoiler -- it tells you how many moves the answer takes.
   */
  setLevelProgress(progress, currentIndex) {
    this.chips.forEach((chip, index) => {
      const unlocked = progress.isUnlocked(index);
      const done = index < progress.highestUnlocked;
      chip.classList.toggle('locked', !unlocked);
      chip.classList.toggle('done', unlocked && done && index !== currentIndex);
      chip.classList.toggle('current', index === currentIndex);
      chip.disabled = !unlocked;
      const par = chip.querySelector('.par');
      par.textContent = unlocked ? `${this.levels[index].par} move${this.levels[index].par === 1 ? '' : 's'}` : 'locked';
    });
  }

  showLevels() {
    this.levelsEl.classList.remove('hidden');
    this.callbacks.onPause?.(true);
  }

  hideLevels() {
    this.levelsEl.classList.add('hidden');
    if (!this.menuOpen && this.completeEl.classList.contains('hidden')) {
      this.callbacks.onPause?.(false);
    }
  }

  /* ---- boot veil (also the audio-unlock gesture target) ---- */

  onBootTap(handler) {
    const once = async () => {
      this.bootSub.textContent = 'Loading';
      await handler();
      this.bootEl.classList.add('gone');
      setTimeout(() => this.bootEl.classList.add('hidden'), 950);
      this.bootEl.removeEventListener('pointerdown', once);
    };
    this.bootEl.addEventListener('pointerdown', once);
  }

  /* ---- level title card ---- */

  showLevelTitle(number, name, subtitle = '') {
    this.titleNumber.textContent = `Level ${number}`;
    this.titleName.textContent = name;
    this.titleSub.textContent = subtitle;
    this.titleEl.classList.add('show');
    clearTimeout(this._titleTimer);
    this._titleTimer = setTimeout(() => this.titleEl.classList.remove('show'), 3200);
  }

  /* ---- hint ---- */

  showHint(text) {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
  }

  hideHint() {
    this.hintEl.classList.remove('show');
  }

  /* ---- menu ---- */

  toggleMenu() {
    this.menuOpen ? this.closeMenu() : this.openMenu();
  }

  openMenu() {
    this.menuOpen = true;
    this.menuEl.classList.remove('hidden');
    this.callbacks.onPause?.(true);
  }

  closeMenu() {
    this.menuOpen = false;
    this.menuEl.classList.add('hidden');
    this.callbacks.onPause?.(false);
  }

  setAudioState(enabled) {
    const el = this.menuEl.querySelector('[data-audio-state]');
    if (el) el.textContent = enabled ? 'on' : 'off';
  }

  setQualityState(quality) {
    const el = this.menuEl.querySelector('[data-quality-state]');
    if (el) el.textContent = quality;
  }

  /* ---- completion ---- */

  showComplete({ levelNumber, levelName, hasNext, isFinale } = {}) {
    this.completeTitle.textContent = isFinale ? 'Journey Complete' : 'Puzzle Complete';
    this.completeSub.textContent = isFinale
      ? 'You have reached the top.'
      : `Level ${levelNumber} — ${levelName}`;
    this.nextButton.classList.toggle('hidden', !hasNext);
    this.completeEl.classList.remove('hidden');
    this.menuButton.classList.add('hidden');
  }

  hideComplete() {
    this.completeEl.classList.add('hidden');
    this.menuButton.classList.remove('hidden');
    this.setFade(0);
  }

  setFade(amount) {
    this.fadeEl.style.opacity = String(amount);
  }
}
