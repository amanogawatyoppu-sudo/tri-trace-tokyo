import { describe, expect, it } from 'vitest';
import { axesFrom, joystickVector } from '../src/input/inputManager';

const none = { x: 0, y: 0 };

describe('keyboard / joystick intent (character-relative)', () => {
  it.each([
    ['w', 1, 0], ['s', -1, 0], ['d', 0, 1], ['a', 0, -1],
    ['arrowup', 1, 0], ['arrowdown', -1, 0], ['arrowright', 0, 1], ['arrowleft', 0, -1],
  ])('%s → forward %d, turn %d', (key, forward, turn) => {
    expect(axesFrom({ [key]: true }, none)).toEqual({ forward, turn });
  });

  it('opposite keys cancel and combinations mix', () => {
    expect(axesFrom({ w: true, s: true }, none)).toEqual({ forward: 0, turn: 0 });
    expect(axesFrom({ w: true, d: true }, none)).toEqual({ forward: 1, turn: 1 });
  });

  it('joystick up walks forward, sideways turns; values stay in [-1, 1]', () => {
    expect(axesFrom({}, { x: 0, y: -1 })).toEqual({ forward: 1, turn: 0 });
    expect(axesFrom({}, { x: 1, y: 0 })).toEqual({ forward: 0, turn: 1 });
    expect(axesFrom({ w: true }, { x: 0, y: -1 })).toEqual({ forward: 1, turn: 0 });
  });
});

describe('joystickVector', () => {
  it('scales inside the ring and clamps outside it', () => {
    expect(joystickVector(20, 0)).toEqual({ x: 0.5, y: 0, px: 20, py: 0 });
    const v = joystickVector(0, -400);
    expect(v.y).toBeCloseTo(-1, 9);
    expect(v.py).toBeCloseTo(-40, 9);
  });
});

// ---------- Mobile control quality phase 1 ----------
import { InputManager, PINCH_MAX, PINCH_MIN, STICK_DEAD, pinchDistance, shapeStick, smoothStick } from '../src/input/inputManager';
import { avoidHud } from '../src/ui/objectiveMarkers';

const deg = (a: number, r = 1) => ({ x: Math.sin((a * Math.PI) / 180) * r, y: -Math.cos((a * Math.PI) / 180) * r });

describe('stick dead zone and shaping', () => {
  it('ignores a thumb resting near the centre', () => {
    for (const a of [0, 37, 90, 200, 300]) expect(shapeStick(deg(a, STICK_DEAD * 0.95).x, deg(a, STICK_DEAD * 0.95).y)).toEqual({ x: 0, y: 0 });
  });

  it('a push up to 15° off straight ahead walks straight on without turning', () => {
    for (const a of [-14.9, -10, -5, 5, 10, 14.9]) {
      const v = deg(a);
      const s = shapeStick(v.x, v.y);
      expect(s.x).toBe(0);
      expect(s.y).toBeCloseTo(-1, 6);
    }
  });

  it('grows continuously from the dead-zone edge and the snap angle (no jump)', () => {
    let prev = 0;
    for (let r = STICK_DEAD; r <= 1.0001; r += 0.01) {
      const y = -shapeStick(0, -r).y;
      expect(y - prev).toBeLessThan(0.05);
      prev = y;
    }
    expect(prev).toBeCloseTo(1, 6);
    let prevTurn = 0;
    for (let a = 0; a <= 90; a += 1) {
      const v = deg(a), t = shapeStick(v.x, v.y).x;
      expect(t).toBeGreaterThanOrEqual(prevTurn);
      expect(t - prevTurn).toBeLessThan(0.06);
      prevTurn = t;
    }
    expect(prevTurn).toBeCloseTo(1, 6);
  });

  it('a diagonal push still walks at good speed and turns gently', () => {
    const v = deg(45), s = shapeStick(v.x, v.y);
    expect(-s.y).toBeGreaterThan(0.7);
    expect(s.x).toBeGreaterThan(0.2);
    expect(s.x).toBeLessThan(0.5);
  });

  it('eases toward the finger and settles exactly (no endless creep)', () => {
    let o = { x: 0, y: 0 };
    o = smoothStick(o, { x: 1, y: -1 }, 1 / 60);
    expect(o.x).toBeGreaterThan(0.2);
    expect(o.x).toBeLessThan(0.5); // not a snap
    for (let i = 0; i < 12; i++) o = smoothStick(o, { x: 1, y: -1 }, 1 / 60);
    expect(o).toEqual({ x: 1, y: -1 });
    for (let i = 0; i < 12; i++) o = smoothStick(o, { x: 0, y: 0 }, 1 / 60);
    expect(o).toEqual({ x: 0, y: 0 }); // released: stops within ~0.2 s, exactly 0
  });

  it('a short dip into the dead zone while sweeping does not stop the character', () => {
    let o = { x: 0, y: -1 };
    o = smoothStick(o, { x: 0, y: 0 }, 1 / 60); // one frame at the centre
    o = smoothStick(o, { x: 0, y: -1 }, 1 / 60);
    expect(-o.y).toBeGreaterThan(0.6);
  });

  it('keyboard intent is unchanged (stick at rest)', () => {
    expect(axesFrom({ w: true, d: true }, none)).toEqual({ forward: 1, turn: 1 });
    expect(axesFrom({ s: true, a: true }, none)).toEqual({ forward: -1, turn: -1 });
  });
});

describe('pinch zoom range', () => {
  it('spreading the fingers brings the camera in, pinching takes it out, within the range', () => {
    expect(pinchDistance(160, 100, 200)).toBe(PINCH_MIN);
    expect(pinchDistance(160, 100, 120)).toBeCloseTo(133.3, 1);
    expect(pinchDistance(160, 200, 160)).toBe(200);
    expect(pinchDistance(160, 300, 50)).toBe(PINCH_MAX);
    expect(PINCH_MIN).toBeLessThan(160);
    expect(PINCH_MAX).toBeGreaterThan(160);
  });
});

describe('objective markers keep clear of the HUD', () => {
  const hint = { x0: 300, y0: 44, x1: 560, y1: 62 }, btns = { x0: 690, y0: 180, x1: 830, y1: 378 };
  it('a marker under the guide text moves just below it', () => {
    expect(avoidHud(420, 50, 30, [hint, btns], 390)).toBe(62 + 15 + 2);
  });
  it('a marker on the buttons moves above them', () => {
    expect(avoidHud(760, 300, 30, [hint, btns], 390)).toBe(180 - 15 - 2);
  });
  it('a marker clear of the HUD stays put', () => {
    expect(avoidHud(420, 200, 90, [hint, btns], 390)).toBe(200);
  });
});

// A tiny DOM stand-in, enough to drive the real InputManager with pointer events.
class El extends EventTarget {
  style: Record<string, string> = {};
  hidden = false;
  dataset: Record<string, string> = {};
  classes = new Set<string>();
  classList = { toggle: (c: string, on?: boolean) => { if (on ?? !this.classes.has(c)) this.classes.add(c); else this.classes.delete(c); }, remove: (c: string) => this.classes.delete(c), add: (c: string) => this.classes.add(c) };
  constructor(public rect = { left: 0, top: 0, width: 0, height: 0 }) { super(); }
  setPointerCapture(): void { /* captured */ }
  closest(): null { return null; }
  getBoundingClientRect() { const r = this.rect; return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }; }
}

function rig() {
  const els: Record<string, El> = {
    joyBase: new El({ left: 14, top: 276, width: 100, height: 100 }), joyStick: new El(),
    mDash: new El({ left: 696, top: 316, width: 60, height: 60 }), mCap: new El({ left: 762, top: 312, width: 68, height: 68 }),
    mSquad: new El({ left: 696, top: 196, width: 60, height: 52 }),
  };
  const get = (id: string) => (els[id] ??= new El());
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = new EventTarget();
  g.document = { getElementById: get, querySelectorAll: () => [] };
  const calls = { capture: 0, squad: 0 };
  const canvas = new El({ left: 0, top: 0, width: 844, height: 390 });
  const input = new InputManager(canvas as unknown as HTMLCanvasElement, {
    onCapture: () => calls.capture++, onSpecial: () => {}, onFace: () => {}, onSquad: () => calls.squad++, isBlocked: () => false,
  });
  let t = 1000;
  const frames = (n: number) => { let a = input.moveAxes(t); for (let i = 1; i < n; i++) a = input.moveAxes((t += 1000 / 60)); return a; };
  const send = (el: El, type: string, id: number, x: number, y: number) => el.dispatchEvent(Object.assign(new Event(type), { pointerId: id, clientX: x, clientY: y }));
  return { els, canvas, input, calls, frames, send };
}

describe('touch controls (InputManager with pointer events)', () => {
  it('a thumb a little off centre on the stick walks straight, no turning', () => {
    const { els, frames, send } = rig();
    send(els.joyBase, 'pointerdown', 1, 64, 326); // centre
    send(els.joyBase, 'pointermove', 1, 64 + 6, 326 - 3); // a nudge inside the dead zone
    expect(frames(20)).toEqual({ forward: 0, turn: 0 });
    send(els.joyBase, 'pointermove', 1, 64 + 7, 326 - 40); // ~10° right of straight up
    const a = frames(20);
    expect(a.turn).toBe(0);
    expect(a.forward).toBeCloseTo(1, 6);
  });

  it('stick fingers never move the camera; a finger on the view tilts it', () => {
    const { els, canvas, input, send } = rig();
    send(els.joyBase, 'pointerdown', 1, 64, 326);
    send(els.joyBase, 'pointermove', 1, 64, 250);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
    send(canvas, 'pointerdown', 2, 400, 200);
    send(canvas, 'pointermove', 2, 400, 230);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 30 });
    send(els.mDash, 'pointerdown', 3, 726, 346);
    send(els.mDash, 'pointermove', 3, 700, 300);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
    expect(input.consumePinch()).toBeNull();
  });

  it('two fingers on the view pinch-zoom (and do not tilt)', () => {
    const { canvas, input, send } = rig();
    input.cameraDistance = 160;
    send(canvas, 'pointerdown', 1, 380, 200);
    send(canvas, 'pointerdown', 2, 460, 200);
    send(canvas, 'pointermove', 1, 340, 200);
    send(canvas, 'pointermove', 2, 500, 200); // gap 80 → 160: closer
    expect(input.consumePinch()).toBe(PINCH_MIN);
    send(canvas, 'pointermove', 1, 400, 200);
    send(canvas, 'pointermove', 2, 440, 200); // gap 40: further out, clamped
    expect(input.consumePinch()).toBe(PINCH_MAX);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('pinching with one finger on the stick does not zoom (only view fingers count)', () => {
    const { els, canvas, input, send } = rig();
    send(els.joyBase, 'pointerdown', 1, 64, 326);
    send(canvas, 'pointerdown', 2, 400, 200);
    send(els.joyBase, 'pointermove', 1, 40, 326);
    send(canvas, 'pointermove', 2, 500, 200);
    expect(input.consumePinch()).toBeNull();
  });

  it('dash + TRACE with one thumb: slide from dash onto TRACE fires TRACE and keeps dashing', () => {
    const { els, input, calls, send } = rig();
    send(els.mDash, 'pointerdown', 1, 726, 346);
    expect(input.dash).toBe(true);
    send(els.mDash, 'pointermove', 1, 750, 346); // still on dash
    expect(calls.capture).toBe(0);
    send(els.mDash, 'pointermove', 1, 780, 346); // onto TRACE
    expect(calls.capture).toBe(1);
    expect(input.dash).toBe(true);
    send(els.mDash, 'pointermove', 1, 790, 340); // staying there does not repeat it
    expect(calls.capture).toBe(1);
    send(els.mDash, 'pointerup', 1, 790, 340);
    expect(input.dash).toBe(false);
  });

  it('dash held with one finger, TRACE pressed with another (two-finger way still works)', () => {
    const { els, input, calls, send } = rig();
    send(els.mDash, 'pointerdown', 1, 726, 346);
    send(els.mCap, 'pointerdown', 2, 796, 346);
    expect(calls.capture).toBe(1);
    expect(input.dash).toBe(true);
  });

  it('the squad button acts on press', () => {
    const { els, calls, send } = rig();
    send(els.mSquad, 'pointerdown', 1, 726, 222);
    expect(calls.squad).toBe(1);
  });
});
