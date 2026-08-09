import * as THREE from 'three';

const CLICK_DRAG_THRESHOLD = 5; // px of movement before a click counts as a drag

/**
 * Single place that talks to the DOM for keyboard and mouse. Systems read from
 * it; nothing else attaches listeners. Per-frame values (clicks, mouse delta,
 * wheel, just-pressed keys) are cleared by endFrame().
 */
export class InputManager {
  constructor(domElement) {
    this.dom = domElement;

    this.keys = new Set();
    this.pressed = new Set(); // keys that went down this frame
    this.buttons = new Set(); // mouse buttons currently held

    this.pointer = new THREE.Vector2(); // normalised device coords
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.clicks = []; // {button, ndc:THREE.Vector2}
    this.pointerLocked = false;

    this._downAt = new Map(); // button -> {x, y, moved}
    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      // Stop the page scrolling out from under the battlefield.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this._onBlur = () => {
      this.keys.clear();
      this.buttons.clear();
    };

    this._onPointerDown = (e) => {
      this.buttons.add(e.button);
      this._downAt.set(e.button, { x: e.clientX, y: e.clientY, moved: false });
      this._updatePointer(e);
    };

    this._onPointerMove = (e) => {
      this._updatePointer(e);
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
      for (const [button, origin] of this._downAt) {
        if (
          Math.abs(e.clientX - origin.x) > CLICK_DRAG_THRESHOLD ||
          Math.abs(e.clientY - origin.y) > CLICK_DRAG_THRESHOLD
        ) {
          origin.moved = true;
        }
        void button;
      }
    };

    this._onPointerUp = (e) => {
      this.buttons.delete(e.button);
      const origin = this._downAt.get(e.button);
      this._downAt.delete(e.button);
      this._updatePointer(e);
      if (origin && !origin.moved) {
        this.clicks.push({ button: e.button, ndc: this.pointer.clone() });
      }
    };

    this._onWheel = (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    };

    this._onContextMenu = (e) => e.preventDefault();

    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this.dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    this.dom.addEventListener('wheel', this._onWheel, { passive: false });
    this.dom.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  _updatePointer(e) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  justPressed(code) {
    return this.pressed.has(code);
  }

  isButtonDown(button) {
    return this.buttons.has(button);
  }

  /** Clicks of the given button that happened this frame (no drag). */
  takeClicks(button) {
    return this.clicks.filter((c) => c.button === button);
  }

  requestPointerLock() {
    if (document.pointerLockElement !== this.dom) this.dom.requestPointerLock();
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  endFrame() {
    this.pressed.clear();
    this.clicks.length = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.dom.removeEventListener('wheel', this._onWheel);
    this.dom.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
