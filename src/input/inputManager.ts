export interface InputHandlers {
  onCapture: () => void;
  onSpecial: () => void;
  /** Quick half-turn to check behind (Q / 振向). */
  onFace: () => void;
  /** Squad orders: X follow me, C watch around me, V hold here; the touch button cycles them. */
  onSquad: (order: 'follow' | 'spread' | 'hold' | 'next') => void;
  /** B: light the enemy kings from the tower. */
  onBeacon?: () => void;
  /** F: the king names a double. */
  onDecoy?: () => void;
  /** 1–4 / 合図: a ping to your nation. */
  onPing?: (kind: 'king' | 'help' | 'gather' | 'danger') => void;
  /** Actions are ignored while this returns true (meeting open, game over). */
  isBlocked: () => boolean;
}

/** Character-relative intent: the camera always sits behind the character. */
export interface MoveAxes {
  /** +1 = walk forward (↑ / stick up), -1 = back away (↓ / stick down). */
  forward: number;
  /** +1 = turn right (→ / stick right), -1 = turn left (← / stick left). */
  turn: number;
}

const JOY_MAX = 40;

/** Stick: no input inside this share of the ring (a resting or slightly moved thumb). */
export const STICK_DEAD = 0.2;
/**
 * Stick: a push within this angle of straight up / down / left / right counts as exactly
 * that direction, so walking "straight on" with a thumb that is a little off does not
 * keep turning the body (sin 15°).
 */
export const STICK_AXIS_SNAP = Math.sin((15 * Math.PI) / 180);
/** Stick output eases toward the finger at this rate (1/s): ~90 % in 0.12 s, no jolts. */
export const STICK_SMOOTH_RATE = 20;

/**
 * Raw stick deflection (x right, y down, both in [-1, 1]) to move intent, with a centre
 * dead zone and axis snapping. Outside them the output grows from 0 continuously, so
 * there is no jump at the edge; turning grows with the square (fine steering near
 * straight ahead, full turn when pushed sideways).
 */
export function shapeStick(x: number, y: number): { x: number; y: number } {
  const r = Math.hypot(x, y);
  if (r <= STICK_DEAD) return { x: 0, y: 0 };
  const m = Math.min(1, (r - STICK_DEAD) / (1 - STICK_DEAD));
  const ux = x / r, uy = y / r;
  const axis = (u: number, curve: number) => {
    const a = Math.abs(u);
    if (a <= STICK_AXIS_SNAP) return 0;
    return Math.sign(u) * Math.pow((a - STICK_AXIS_SNAP) / (1 - STICK_AXIS_SNAP), curve);
  };
  // Forward keeps (nearly) full strength on a diagonal push; turning is the fine control.
  const fy = axis(uy, 1), fx = axis(ux, 2);
  const fwd = Math.min(1, Math.abs(fy) * 1.25) * Math.sign(fy);
  return { x: fx * m, y: fwd * m };
}

/** One smoothing step of the stick output toward `target` over `dtSec` (snaps to 0 when released). */
export function smoothStick(cur: { x: number; y: number }, target: { x: number; y: number }, dtSec: number): { x: number; y: number } {
  const k = 1 - Math.exp(-STICK_SMOOTH_RATE * Math.max(0, Math.min(0.1, dtSec)));
  const step = (c: number, t: number) => {
    const v = c + (t - c) * k;
    // A tiny leftover would still count as "turning" (and cancel a quick turn): settle it.
    return Math.abs(v - t) < 0.02 ? t : v;
  };
  return { x: step(cur.x, target.x), y: step(cur.y, target.y) };
}

/** Phone pinch zoom: the camera distance range (default 160; wheel on PCs keeps its own range). */
export const PINCH_MIN = 120;
export const PINCH_MAX = 240;

/** New camera distance for a pinch whose finger gap went from `startGap` to `gap` (spread = closer). */
export function pinchDistance(startDistance: number, startGap: number, gap: number): number {
  const d = startDistance * (startGap / Math.max(1, gap));
  return Math.max(PINCH_MIN, Math.min(PINCH_MAX, d));
}

/** Movement intent from held keys plus the virtual joystick. */
export function axesFrom(keys: Readonly<Record<string, boolean>>, joy: { x: number; y: number }): MoveAxes {
  let forward = 0 - joy.y, turn = joy.x;
  if (keys['w'] || keys['arrowup']) forward += 1;
  if (keys['s'] || keys['arrowdown']) forward -= 1;
  if (keys['d'] || keys['arrowright']) turn += 1;
  if (keys['a'] || keys['arrowleft']) turn -= 1;
  return { forward: Math.max(-1, Math.min(1, forward)), turn: Math.max(-1, Math.min(1, turn)) };
}

/** Joystick knob offset for a pointer at (dx, dy) from the base centre, clamped to the ring. */
export function joystickVector(dx: number, dy: number): { x: number; y: number; px: number; py: number } {
  const d = Math.hypot(dx, dy);
  if (d > JOY_MAX) { dx = (dx / d) * JOY_MAX; dy = (dy / d) * JOY_MAX; }
  return { x: dx / JOY_MAX, y: dy / JOY_MAX, px: dx, py: dy };
}

/**
 * Collects keyboard and pointer (mouse / touch / pen) input. It never touches
 * game state: movement is read as axes, actions go to handlers, and camera
 * drags / wheel accumulate until the frame consumes them.
 */
export class InputManager {
  private keys: Record<string, boolean> = {};
  /** Raw stick deflection (the finger), and the shaped, eased output the game reads. */
  private joy = { x: 0, y: 0 };
  private joyOut = { x: 0, y: 0 };
  private joyAt = 0;
  private touchDash = false;
  private lookDX = 0;
  private lookDY = 0;
  private zoom = 0;
  /** Camera distance requested by a pinch (null when there is none to apply). */
  private pinchTo: number | null = null;
  private pinchFrom: { gap: number; distance: number } | null = null;
  /** Current camera distance, for starting a pinch (set by the frame loop). */
  cameraDistance = 160;

  constructor(canvas: HTMLCanvasElement, handlers: InputHandlers) {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (handlers.isBlocked()) return;
      if (e.key === ' ') { e.preventDefault(); handlers.onCapture(); }
      if (k === 'z' && !e.repeat) handlers.onSpecial();
      if (k === 'q' && !e.repeat) handlers.onFace();
      if (k === 'b' && !e.repeat) handlers.onBeacon?.();
      if (k === 'f' && !e.repeat) handlers.onDecoy?.();
      if (!e.repeat && k >= '1' && k <= '4') handlers.onPing?.((['king', 'help', 'gather', 'danger'] as const)[Number(k) - 1]);
      if (!e.repeat && (k === 'x' || k === 'c' || k === 'v')) handlers.onSquad(k === 'x' ? 'follow' : k === 'c' ? 'spread' : 'hold');
      if (k.startsWith('arrow')) e.preventDefault(); // don't scroll the page
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    // Keys released while the window is unfocused never send keyup.
    window.addEventListener('blur', () => { this.keys = {}; this.touchDash = false; });

    const action = (fn: () => void) => () => { if (!handlers.isBlocked()) fn(); };
    byId('btnCapture').addEventListener('click', action(handlers.onCapture));
    byId('btnSpecial').addEventListener('click', action(handlers.onSpecial));
    // Touch buttons act on press so they work while another finger holds the joystick.
    this.pressButton(byId('mCap'), action(handlers.onCapture));
    this.pressButton(byId('mSpec'), action(handlers.onSpecial));
    this.pressButton(byId('mFace'), action(handlers.onFace));
    this.pressButton(byId('mSquad'), action(() => handlers.onSquad('next')));
    // 合図: a small menu on phones, buttons in the side panel on PCs.
    const menu = byId('pingMenu');
    this.pressButton(byId('mPing'), action(() => { menu.hidden = !menu.hidden; }));
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-ping]'))) {
      const fire = action(() => { handlers.onPing?.(b.dataset.ping as 'king' | 'help' | 'gather' | 'danger'); menu.hidden = true; });
      if (b.closest('#pingMenu')) this.pressButton(b, fire);
      else b.addEventListener('click', fire);
    }
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('#squadBox [data-order]'))) {
      b.addEventListener('click', action(() => handlers.onSquad(b.dataset.order as 'follow' | 'spread' | 'hold')));
    }
    this.bindDash(byId('mDash'), byId('mCap'), action(handlers.onCapture));
    this.bindJoystick(byId('joyBase'), byId('joyStick'));
    this.bindCamera(canvas);
  }

  private pressButton(el: HTMLElement, fn: () => void): void {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  }

  /**
   * Dash is held while its finger stays down. Sliding that finger onto TRACE fires TRACE
   * and keeps dashing, so one thumb does both (press dash, roll onto TRACE).
   */
  private bindDash(el: HTMLElement, cap: HTMLElement, onCapture: () => void): void {
    let onCap = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.touchDash = true;
      onCap = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.touchDash) return;
      const r = cap.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside && !onCap) onCapture();
      onCap = inside;
      cap.classList.toggle('slid', inside);
    });
    const off = () => { this.touchDash = false; onCap = false; cap.classList.remove('slid'); };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
  }

  private bindJoystick(base: HTMLElement, stick: HTMLElement): void {
    let id: number | null = null;
    const move = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      const v = joystickVector(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      stick.style.transform = `translate(${v.px}px, ${v.py}px)`;
      this.joy.x = v.x;
      this.joy.y = v.y;
    };
    const reset = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.joy.x = this.joy.y = 0;
      stick.style.transform = '';
    };
    base.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      base.setPointerCapture(e.pointerId);
      move(e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    base.addEventListener('pointerup', reset);
    base.addEventListener('pointercancel', reset);
    base.addEventListener('lostpointercapture', reset);
  }

  /**
   * One finger on the 3D view tilts the camera; two fingers pinch to zoom. Only touches
   * that start on the view itself count: a finger that went down on the stick or a
   * button never reaches here, so it can't move the camera.
   */
  private bindCamera(canvas: HTMLCanvasElement): void {
    const pts = new Map<number, { x: number; y: number }>();
    let lookId: number | null = null;
    const gap = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    canvas.addEventListener('pointerdown', (e) => {
      if (pts.size >= 2) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (pts.size === 1) lookId = e.pointerId;
      else { lookId = null; this.pinchFrom = { gap: gap(), distance: this.cameraDistance }; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const q = pts.get(e.pointerId);
      if (!q) return;
      if (e.pointerId === lookId) {
        this.lookDX += e.clientX - q.x;
        this.lookDY += e.clientY - q.y;
      }
      q.x = e.clientX;
      q.y = e.clientY;
      if (pts.size === 2 && this.pinchFrom) this.pinchTo = pinchDistance(this.pinchFrom.distance, this.pinchFrom.gap, gap());
    });
    const end = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (e.pointerId === lookId) lookId = null;
      // After a pinch the remaining finger does not start tilting (it would jolt the view).
      if (pts.size < 2) this.pinchFrom = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom += Math.sign(e.deltaY); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Keyboard as before; the stick through its dead zone, axis snap and easing. */
  moveAxes(now = performance.now()): MoveAxes {
    const dt = this.joyAt ? (now - this.joyAt) / 1000 : 1 / 60;
    this.joyAt = now;
    this.joyOut = smoothStick(this.joyOut, shapeStick(this.joy.x, this.joy.y), dt);
    return axesFrom(this.keys, this.joyOut);
  }

  get dash(): boolean {
    return !!this.keys['shift'] || this.touchDash;
  }

  /** Whether a key (lower-case `KeyboardEvent.key`) is held. */
  held(key: string): boolean {
    return !!this.keys[key];
  }

  /** Returns and clears the pixel drag accumulated since the last call. */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return out;
  }

  /** Returns and clears the camera distance a pinch asked for (null: no pinch since last call). */
  consumePinch(): number | null {
    const d = this.pinchTo;
    this.pinchTo = null;
    return d;
  }

  /** Returns and clears accumulated wheel steps (+ = zoom out). */
  consumeZoom(): number {
    const z = this.zoom;
    this.zoom = 0;
    return z;
  }
}

function byId(id: string): HTMLElement {
  return document.getElementById(id)!;
}
