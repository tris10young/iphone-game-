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
    this.mousePressed = new Set(); // mouse buttons pressed this frame (never touch)

    this.pointer = new THREE.Vector2(); // normalised device coords
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.clicks = []; // {button, ndc:THREE.Vector2}
    this.pointerLocked = false;

    // Device class: a phone or tablet, i.e. coarse pointer with no hover. This
    // decides the UI and render quality, never how an individual event is read
    // — plenty of laptops report touch support while being driven by a mouse.
    this.isTouch = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
    this.touchPointers = new Set(); // touch pointers currently down
    this.suppressClicks = false; // set during multi-touch gestures

    this.panDelta = { x: 0, y: 0 }; // screen px, tactical camera pan
    this.orbitDelta = { x: 0, y: 0 }; // screen px, tactical camera rotate
    this.zoomDelta = 0; // wheel-equivalent units
    this.virtualAxis = { x: 0, y: 0 }; // analogue stick: x = strafe, y = forward
    this.virtualLook = { x: 0, y: 0 }; // screen px, first person look
    this.virtualButtons = new Set(); // held: 'attack' | 'sprint'
    this.virtualPressed = new Set(); // pressed this frame: 'jump'

    this._downAt = new Map(); // button -> {x, y, moved}
    this._bind();
  }

  // -------------------------------------------------------------------------
  // Abstract intents — the only thing gameplay systems should read.
  // -------------------------------------------------------------------------

  /** Movement intent: {x: strafe, y: forward}, magnitude clamped to 1. */
  moveAxis() {
    let x = this.virtualAxis.x;
    let y = this.virtualAxis.y;
    if (this.isDown('KeyW')) y += 1;
    if (this.isDown('KeyS')) y -= 1;
    if (this.isDown('KeyD')) x += 1;
    if (this.isDown('KeyA')) x -= 1;

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y, length: Math.min(1, length) };
  }

  /** Look intent in screen pixels. Mouse only counts while the pointer is locked. */
  lookDelta() {
    const locked = this.pointerLocked;
    return {
      x: (locked ? this.mouseDX : 0) + this.virtualLook.x,
      y: (locked ? this.mouseDY : 0) + this.virtualLook.y,
    };
  }

  /**
   * Attack pressed this frame. This is an edge, not a held state: a click that
   * begins and ends between two frames would otherwise be dropped entirely.
   * A finger on the canvas is a look-drag and never counts — but a real mouse
   * button does, even on a device that also has a touchscreen.
   */
  attackPressed() {
    return this.mousePressed.has(0) || this.virtualPressed.has('attack');
  }

  /** Attack held — used for the on-screen button's auto-repeat. */
  attackHeld() {
    const mouseDown = this.isButtonDown(0) && this.touchPointers.size === 0;
    return mouseDown || this.virtualButtons.has('attack');
  }

  sprintDown() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight') || this.virtualButtons.has('sprint');
  }

  jumpPressed() {
    return this.justPressed('Space') || this.virtualPressed.has('jump');
  }

  setVirtualButton(name, down) {
    if (down) {
      if (!this.virtualButtons.has(name)) this.virtualPressed.add(name);
      this.virtualButtons.add(name);
    } else {
      this.virtualButtons.delete(name);
    }
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
      if (e.pointerType === 'touch') this.touchPointers.add(e.pointerId);
      else this.mousePressed.add(e.button);
      this._downAt.set(e.button, {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        touch: e.pointerType === 'touch',
      });
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
      this.touchPointers.delete(e.pointerId);
      const origin = this._downAt.get(e.button);
      this._downAt.delete(e.button);
      this._updatePointer(e);
      if (origin && !origin.moved && !this.suppressClicks) {
        this.clicks.push({ button: e.button, ndc: this.pointer.clone(), touch: origin.touch });
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
    this.mousePressed.clear();
    this.clicks.length = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.panDelta.x = this.panDelta.y = 0;
    this.orbitDelta.x = this.orbitDelta.y = 0;
    this.zoomDelta = 0;
    this.virtualLook.x = this.virtualLook.y = 0;
    this.virtualPressed.clear();
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
