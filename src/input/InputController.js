/**
 * Unified pointer input for touch and mouse.
 *
 * Pointer Events give us one code path for an iPhone and for a mouse in a
 * desktop browser, which is exactly the "works in the editor and on device"
 * requirement. Gestures are resolved here and published as intents, so nothing
 * downstream has to know whether a finger or a cursor produced them.
 *
 *   one pointer, moved  -> orbit (with inertia applied by the camera)
 *   one pointer, still  -> tap
 *   two pointers        -> pinch zoom; orbit is suppressed for that gesture
 */

const TAP_MOVE_TOLERANCE = 12;   // px of slop still counted as a tap
const TAP_TIME_LIMIT = 400;      // ms

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    /** @type {Map<number, {x:number,y:number,startX:number,startY:number,time:number}>} */
    this.pointers = new Map();

    this.enabled = true;
    this._pinchDistance = 0;
    this._moved = 0;
    this._gestureWasPinch = false;

    this._listeners = { orbit: [], zoom: [], tap: [], hover: [], press: [], release: [] };

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onContextMenu = (e) => e.preventDefault();

    canvas.addEventListener('pointerdown', this._onDown, { passive: false });
    canvas.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp, { passive: false });
    window.addEventListener('pointercancel', this._onUp, { passive: false });
    canvas.addEventListener('contextmenu', this._onContextMenu);
    // Safari still fires these for pinch on some versions; block page zoom.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      canvas.addEventListener(type, this._onContextMenu, { passive: false });
    }
  }

  on(event, fn) {
    this._listeners[event].push(fn);
    return this;
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event]) fn(payload);
  }

  /** Normalised device coordinates for raycasting. */
  ndc(clientX, clientY, target) {
    const rect = this.canvas.getBoundingClientRect();
    target.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    target.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return target;
  }

  _onDown(event) {
    if (!this.enabled) return;
    event.preventDefault();
    this.canvas.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY,
      time: performance.now(),
    });

    if (this.pointers.size === 1) {
      this._moved = 0;
      this._gestureWasPinch = false;
      this._emit('press', { x: event.clientX, y: event.clientY });
    } else if (this.pointers.size === 2) {
      this._pinchDistance = this._currentPinchDistance();
      this._gestureWasPinch = true;
    }
  }

  _onMove(event) {
    if (!this.enabled) return;

    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      // No button held: this is a desktop hover, used for mechanism highlights.
      this._emit('hover', { x: event.clientX, y: event.clientY });
      return;
    }

    event.preventDefault();
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size === 1) {
      this._moved += Math.hypot(dx, dy);
      this._emit('orbit', { dx, dy });
    } else if (this.pointers.size === 2) {
      const distance = this._currentPinchDistance();
      if (this._pinchDistance > 0) {
        this._emit('zoom', { ratio: this._pinchDistance / distance });
      }
      this._pinchDistance = distance;
    }
  }

  _onUp(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.pointers.delete(event.pointerId);
    this.canvas.releasePointerCapture?.(event.pointerId);

    const heldFor = performance.now() - pointer.time;
    const travelled = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);

    if (this.pointers.size === 0) {
      this._emit('release', {});
      const isTap = !this._gestureWasPinch
        && travelled <= TAP_MOVE_TOLERANCE
        && heldFor <= TAP_TIME_LIMIT;
      if (isTap && this.enabled) {
        this._emit('tap', { x: event.clientX, y: event.clientY });
      }
    } else if (this.pointers.size === 1) {
      // Coming out of a pinch: reset so the remaining finger does not jump the
      // camera by the full delta since the pinch began.
      this._pinchDistance = 0;
      const [remaining] = [...this.pointers.values()];
      remaining.startX = remaining.x;
      remaining.startY = remaining.y;
    }
  }

  _currentPinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      this.canvas.removeEventListener(type, this._onContextMenu);
    }
  }
}
