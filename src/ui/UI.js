/**
 * All DOM interaction lives here.
 *
 * The brief is almost no HUD, so this is small by design: one corner button,
 * one line of guidance that only appears when the player has been still for a
 * while, a pause panel, and the completion panel.
 */
export class UI {
  constructor({ onResume, onRestart, onReplay, onToggleAudio, onToggleQuality, onPause }) {
    this.root = document.getElementById('ui');
    this.hintEl = document.getElementById('hint');
    this.menuEl = document.getElementById('menu');
    this.completeEl = document.getElementById('complete');
    this.menuButton = document.getElementById('menu-button');
    this.bootEl = document.getElementById('boot');
    this.bootSub = document.getElementById('boot-sub');

    this.callbacks = { onResume, onRestart, onReplay, onToggleAudio, onToggleQuality, onPause };
    this.menuOpen = false;

    // The completion veil. Created here rather than in markup because nothing
    // else ever needs to know it exists.
    this.fadeEl = document.createElement('div');
    Object.assign(this.fadeEl.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5',
      background: '#f6ead7', opacity: '0', transition: 'none',
    });
    document.body.appendChild(this.fadeEl);

    this.menuButton.addEventListener('click', () => this.toggleMenu());
    this.root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      event.stopPropagation();
      this._handleAction(action);
    });
  }

  _handleAction(action) {
    switch (action) {
      case 'resume': this.closeMenu(); this.callbacks.onResume?.(); break;
      case 'restart': this.closeMenu(); this.callbacks.onRestart?.(); break;
      case 'replay': this.hideComplete(); this.callbacks.onReplay?.(); break;
      case 'toggle-audio': this.callbacks.onToggleAudio?.(); break;
      case 'toggle-quality': this.callbacks.onToggleQuality?.(); break;
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

  showComplete() {
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
