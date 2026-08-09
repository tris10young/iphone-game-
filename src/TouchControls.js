/**
 * Touch input for phones and tablets. iOS has no pointer lock, no right mouse
 * button and no keyboard, so every control has a touch equivalent:
 *
 *  Tactical   one finger drag  → pan          two fingers → rotate + pinch zoom
 *             tap a soldier    → select army  tap the ground (while selected) → move order
 *  First person  left stick → move   drag anywhere else → look   buttons → attack / sprint / jump
 *
 * Everything is funnelled through InputManager's abstract intents, so no
 * gameplay system knows whether it is being driven by a mouse or a thumb.
 */
const LOOK_SCALE = 1.9; // touch drags are shorter than mouse movement
const DRAG_THRESHOLD = 6; // px before a touch counts as a drag rather than a tap

export class TouchControls {
  constructor({ input, game, canvas }) {
    this.input = input;
    this.game = game;
    this.canvas = canvas;

    this.pointers = new Map(); // pointerId -> {x, y, startX, startY, moved}
    this._pinchDistance = 0;
    this._twoFingerCentre = null;

    this.elements = {
      root: document.getElementById('touch-ui'),
      stick: document.getElementById('stick'),
      stickKnob: document.getElementById('stick-knob'),
      fpButtons: document.getElementById('touch-fp'),
      tacticalButtons: document.getElementById('touch-tactical'),
      attack: document.getElementById('btn-attack'),
      sprint: document.getElementById('btn-sprint'),
      jump: document.getElementById('btn-jump'),
      mode: document.getElementById('btn-mode'),
      modeTactical: document.getElementById('btn-mode-tactical'),
      restart: document.getElementById('btn-restart'),
    };

    document.body.classList.add('touch');
    this.elements.root.classList.remove('hidden');

    this._bindCanvas();
    this._bindStick();
    this._bindButtons();
  }

  // -------------------------------------------------------------------------
  // Canvas gestures
  // -------------------------------------------------------------------------
  _bindCanvas() {
    this._onDown = (e) => {
      if (e.pointerType !== 'touch') return;
      this.game.combat.resumeAudio(); // iOS only allows this inside a gesture
      this.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      });
      if (this.pointers.size >= 2) {
        // A second finger means a camera gesture, never a tap order.
        this.input.suppressClicks = true;
        this._beginTwoFinger();
      }
    };

    this._onMove = (e) => {
      if (e.pointerType !== 'touch') return;
      const p = this.pointers.get(e.pointerId);
      if (!p) return;

      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.abs(e.clientX - p.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - p.startY) > DRAG_THRESHOLD) {
        p.moved = true;
      }

      if (this.pointers.size >= 2) {
        this._updateTwoFinger();
        return;
      }
      if (!p.moved) return;

      if (this.game.isFirstPerson()) {
        this.input.virtualLook.x += dx * LOOK_SCALE;
        this.input.virtualLook.y += dy * LOOK_SCALE;
      } else {
        this.input.panDelta.x += dx;
        this.input.panDelta.y += dy;
      }
    };

    this._onUp = (e) => {
      if (e.pointerType !== 'touch') return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this._twoFingerCentre = null;
      // InputManager's pointerup listener runs before this one, so the final
      // lift of a pinch is still suppressed — exactly what we want.
      if (this.pointers.size === 0) this.input.suppressClicks = false;
    };

    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  _beginTwoFinger() {
    const [a, b] = [...this.pointers.values()];
    this._pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    this._twoFingerCentre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  _updateTwoFinger() {
    if (this.game.isFirstPerson()) return;
    const [a, b] = [...this.pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    if (this._pinchDistance > 0) {
      // Match the sign convention of a mouse wheel: spreading fingers zooms in.
      this.input.zoomDelta += (this._pinchDistance - distance) * 2.2;
    }
    if (this._twoFingerCentre) {
      this.input.orbitDelta.x += centre.x - this._twoFingerCentre.x;
      this.input.orbitDelta.y += centre.y - this._twoFingerCentre.y;
    }

    this._pinchDistance = distance;
    this._twoFingerCentre = centre;
  }

  // -------------------------------------------------------------------------
  // Virtual stick
  // -------------------------------------------------------------------------
  _bindStick() {
    const stick = this.elements.stick;
    const knob = this.elements.stickKnob;
    let activeId = null;
    let origin = { x: 0, y: 0 };
    let radius = 40; // recomputed on touch so the knob never leaves its base

    const reset = () => {
      activeId = null;
      this.input.virtualAxis.x = 0;
      this.input.virtualAxis.y = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };

    stick.addEventListener('pointerdown', (e) => {
      activeId = e.pointerId;
      const rect = stick.getBoundingClientRect();
      origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      radius = (rect.width - knob.getBoundingClientRect().width) / 2;
      stick.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const length = Math.hypot(dx, dy);
      if (length > radius) {
        dx = (dx / length) * radius;
        dy = (dy / length) * radius;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.input.virtualAxis.x = dx / radius;
      this.input.virtualAxis.y = -dy / radius; // screen down == walk backwards
    });

    for (const event of ['pointerup', 'pointercancel', 'pointerleave']) {
      stick.addEventListener(event, (e) => {
        if (e.pointerId === activeId) reset();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Buttons
  // -------------------------------------------------------------------------
  _bindButtons() {
    const hold = (element, name) => {
      element.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        element.classList.add('pressed');
        this.input.setVirtualButton(name, true);
      });
      for (const event of ['pointerup', 'pointercancel', 'pointerleave']) {
        element.addEventListener(event, () => {
          element.classList.remove('pressed');
          this.input.setVirtualButton(name, false);
        });
      }
    };

    hold(this.elements.attack, 'attack');
    hold(this.elements.jump, 'jump');

    // Sprint latches — holding a third thumb down is not an option.
    const sprint = this.elements.sprint;
    sprint.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const on = !sprint.classList.contains('pressed');
      sprint.classList.toggle('pressed', on);
      this.input.setVirtualButton('sprint', on);
    });

    const tap = (element, handler) => {
      element.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handler();
      });
    };

    tap(this.elements.mode, () => this.game.requestModeToggle());
    tap(this.elements.modeTactical, () => this.game.requestModeToggle());
    tap(this.elements.restart, () => this.game.requestRestart());
  }

  /** Sprint must not stay latched across a mode switch. */
  clearHeldButtons() {
    this.input.setVirtualButton('sprint', false);
    this.input.setVirtualButton('attack', false);
    this.elements.sprint.classList.remove('pressed');
    this.elements.attack.classList.remove('pressed');
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }
}
