import { describe, expect, it } from 'vitest';
import { CR } from '../src/config/constants';
import { STEP_SEC } from '../src/core/clock';
import { teleport } from '../src/sim/entity';
import { stepSimulation } from '../src/sim/step';
import type { Body } from '../src/sim/systems/world';
import { BODY_H, STEP_UP, blocked, moveBody, primsAt, pushOut, settle, supportHeight, topAt } from '../src/sim/systems/world';
import { freezeOthers, newGame } from './helpers';

/**
 * PHYSICS QUALITY PHASE 1: characters wedged at the corners of buildings, slopes and
 * railings (QA: up to 258 s), at the three places the matches showed most.
 */

/** Where bodies were found wedged in AI-only matches (feet on the ground). */
const UENO_CORNER = { x: 2722.18, y: 0, z: -3573.33 }; // under the corner of the 上野 terrace and the hill slope
const AKIBA_GAP = { x: 2088.53, y: 0, z: -2438.14 }; // between the 秋葉原 bridge slope and a pole
const TOWER_GAP = { x: -67.05, y: 0, z: 3102.66 }; // between the 東京タワー footbridge and a building

/** A wall footprint (not the body margin around it) the point is inside, for feet at y. */
function wallAt(x: number, z: number, y: number) {
  for (const p of primsAt(x, z)) {
    if (Math.abs(x - p.x) >= p.w / 2 - 0.5 || Math.abs(z - p.z) >= p.d / 2 - 0.5) continue;
    if (p.y0 >= y + BODY_H) continue;
    if (topAt(p, x, z) > y + STEP_UP) return p;
  }
  return null;
}

/** Whether the straight move a → b crosses into a wall it did not start in. */
function crossesWall(a: Body, b: Body): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d));
  const y = Math.min(a.y, b.y), start = wallAt(a.x, a.z, y);
  for (let k = 1; k <= n; k++) {
    const w = wallAt(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, y);
    if (w && w !== start) return true;
  }
  return false;
}

/** Walks a body in a direction for `sec` seconds the way characters move (move, then land). */
function walk(b: Body, dx: number, dz: number, sec: number, speed = 200, onStep?: (prev: Body) => void): void {
  const l = Math.hypot(dx, dz);
  for (let t = 0; t < sec; t += STEP_SEC) {
    const prev = { ...b };
    moveBody(b, b.x + (dx / l) * speed * STEP_SEC, b.z + (dz / l) * speed * STEP_SEC);
    settle(b, STEP_SEC);
    onStep?.(prev);
  }
}

describe('wedged bodies are pushed free (the push-out matches the collision shape)', () => {
  it('a body at the corner of the 上野 terrace and slope is pushed clear, a short way', () => {
    const b = { ...UENO_CORNER };
    expect(blocked(b.x, b.z, b.y)).toBe(true);
    pushOut(b);
    expect(blocked(b.x, b.z, b.y)).toBe(false);
    expect(Math.hypot(b.x - UENO_CORNER.x, b.z - UENO_CORNER.z)).toBeLessThanOrEqual(CR + 1);
    expect(crossesWall(UENO_CORNER, b)).toBe(false);
  });

  it('a body pinched between the 秋葉原 slope and a pole is pushed clear without shaking between the two', () => {
    const b = { ...AKIBA_GAP };
    expect(blocked(b.x, b.z, b.y)).toBe(true);
    pushOut(b);
    expect(blocked(b.x, b.z, b.y)).toBe(false);
    expect(Math.hypot(b.x - AKIBA_GAP.x, b.z - AKIBA_GAP.z)).toBeLessThanOrEqual(2 * CR);
    expect(crossesWall(AKIBA_GAP, b)).toBe(false);
    // Settled: pushing again does not move it (no back and forth).
    const once = { ...b };
    for (let i = 0; i < 10; i++) pushOut(b);
    expect(b).toEqual(once);
  });

  it('a body in a gap narrower than itself (東京タワー) is never thrown far, and can walk out along the gap', () => {
    const b = { ...TOWER_GAP };
    pushOut(b);
    expect(Math.hypot(b.x - TOWER_GAP.x, b.z - TOWER_GAP.z)).toBeLessThanOrEqual(2 * CR);
    let crossed = false;
    walk(b, 0, 1, 1.5, 200, (prev) => { crossed ||= crossesWall(prev, b); });
    expect(crossed).toBe(false);
    expect(blocked(b.x, b.z, b.y)).toBe(false);
    expect(b.z - TOWER_GAP.z).toBeGreaterThan(40);
  });
});

/**
 * Walks a body off a ledge and returns the most steps in a row it spent overlapping a
 * wall. A body that drops into a slot it does not fit stays wedged for the rest of the
 * walk (before the fix: 54 and 58 of 60 steps).
 */
function longestWedge(from: Body, dx: number, dz: number): number {
  const c = { ...from };
  let run = 0, worst = 0;
  walk(c, dx, dz, 1, 200, () => { run = blocked(c.x, c.z, c.y) ? run + 1 : 0; worst = Math.max(worst, run); });
  return worst;
}

describe('walking off a ledge does not drop a body into a gap it cannot stand in', () => {
  it('off the side of the 東京タワー footbridge', () => {
    const b = { x: -80, y: 0, z: 3105 };
    b.y = supportHeight(b.x, b.z, 200);
    expect(b.y).toBeGreaterThan(20); // on the footbridge
    for (const [dx, dz] of [[1, 0], [1, -0.5], [1, 0.5], [1, -1.5], [1, 1.5]]) expect(longestWedge(b, dx, dz)).toBe(0);
  });

  it('off the corner of the 上野 terrace beside the hill slope', () => {
    const b = { x: 2738, y: 0, z: -3580 };
    b.y = supportHeight(b.x, b.z, 200);
    expect(b.y).toBe(65); // on the terrace
    for (const [dx, dz] of [[-1, 0], [-1, -0.3], [-1, 0.3]]) expect(longestWedge(b, dx, dz)).toBe(0);
  });
});

describe('the player gets out too', () => {
  it('a player standing where an AI was wedged walks away', () => {
    const state = newGame('moon', 'soldier', 3);
    state.nextEventAt = Infinity;
    freezeOthers(state, [state.player]);
    const p = state.player;
    teleport(p, UENO_CORNER.x, UENO_CORNER.z);
    p.x = UENO_CORNER.x; p.z = UENO_CORNER.z; p.y = 0;
    p.dirX = -1; p.dirZ = 0;
    state.input.forward = 1;
    for (let t = 0; t < 1; t += STEP_SEC) stepSimulation(state, STEP_SEC);
    expect(Math.hypot(p.x - UENO_CORNER.x, p.z - UENO_CORNER.z)).toBeGreaterThan(30);
    expect(blocked(p.x, p.z, p.y)).toBe(false);
  });
});

describe('collision still holds', () => {
  it('bodies walking into the corners around the three places never pass through a wall', () => {
    let crossed = 0, inside = 0;
    for (const c of [UENO_CORNER, AKIBA_GAP, TOWER_GAP]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const r of [40, 80]) {
          const b = { x: c.x + Math.sin(a) * r, y: 0, z: c.z + Math.cos(a) * r };
          b.y = supportHeight(b.x, b.z, 200);
          if (blocked(b.x, b.z, b.y)) continue;
          walk(b, -Math.sin(a), -Math.cos(a), 1.2, 220, (prev) => { if (crossesWall(prev, b)) crossed++; });
          if (wallAt(b.x, b.z, b.y)) inside++;
        }
      }
    }
    expect(crossed).toBe(0);
    expect(inside).toBe(0);
  });

  it('a body that clips the corner of a building walking past it is guided round, not stopped', () => {
    // 東京タワー area: walking south, 4 units too far east to clear the building at (30, 4065).
    const b = { x: -90, y: 0, z: 4157 };
    let crossed = false;
    walk(b, -0.02, -1, 1, 200, (prev) => { crossed ||= crossesWall(prev, b); });
    expect(crossed).toBe(false);
    expect(4157 - b.z).toBeGreaterThan(150);
    expect(b.x).toBeGreaterThan(-90 - CR); // only as far sideways as the corner needs
  });

  it('a body still slides along a long wall it runs into at an angle', () => {
    // Along the 上野 terrace's west face (x = 2730), below it.
    const b = { x: 2700, y: 0, z: -3540 };
    walk(b, 1, 0.5, 1);
    expect(b.x).toBeLessThan(2730 - CR + 0.5);
    expect(b.z - -3540).toBeGreaterThan(40);
  });
});
