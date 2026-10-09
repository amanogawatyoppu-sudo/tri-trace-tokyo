import { describe, expect, it } from 'vitest';
import { SITES } from '../src/config/map';
import { STEP_SEC } from '../src/core/clock';
import type { Entity } from '../src/sim/entity';
import { teleport } from '../src/sim/entity';
import type { GameState } from '../src/sim/state';
import { drainEvents } from '../src/sim/state';
import { stepSimulation } from '../src/sim/step';
import { captureTier } from '../src/sim/systems/capture';
import { sendToJail } from '../src/sim/systems/jail';
import { find, freezeOthers, newGame } from './helpers';

/**
 * AI QUALITY PHASE 1: the chase deadlock (two AIs circling face to face for minutes)
 * and the stuck-recovery that never planned a real route again.
 */

const O = SITES.open;

/** A quiet game: no commanders handing out operations, no meetings or random events. */
function quiet(seed = 5): GameState {
  const state = newGame('sun', 'sniper', seed);
  state.nextEventAt = Infinity;
  for (const n of ['sun', 'moon', 'star'] as const) state.factions[n].nextTickAt = Infinity;
  return state;
}

/** `e` has already noticed `t` (reaction time spent). */
function noticed(state: GameState, e: Entity, t: Entity): void {
  e.ai.seen.set(t.id, { id: t.id, x: t.x, y: t.y, z: t.z, t: state.time, vx: 0, vz: 0, since: state.time - 2000 });
  e.ai.visible = [t.id];
}

function face(e: Entity, x: number, z: number): void {
  const d = Math.hypot(x - e.x, z - e.z) || 1;
  e.dirX = (x - e.x) / d;
  e.dirZ = (z - e.z) / d;
}

/** Two AI soldiers of different nations meet face to face in the open, each going for the other's back. */
function duelSetup(seed = 5) {
  const state = quiet(seed);
  const a = find(state, 'moon', 'soldier'), b = find(state, 'star', 'soldier');
  freezeOthers(state, [a, b]);
  teleport(a, O.x, O.z + 60);
  teleport(b, O.x, O.z - 60);
  face(a, b.x, b.z);
  face(b, a.x, a.z);
  noticed(state, a, b);
  noticed(state, b, a);
  return { state, a, b };
}

/** Each one's capture tier on the other just before the latest step. */
let tiersBefore: Record<number, string> = {};

/** Runs `sec` seconds; returns the longest stretch the two spent within 130 of each other, both free. */
function longestContact(state: GameState, a: Entity, b: Entity, sec: number, onEvent?: (ev: ReturnType<typeof drainEvents>[number]) => void): number {
  let since: number | null = null, longest = 0;
  for (let t = 0; t < sec; t += STEP_SEC) {
    // Where each stands relative to the other just before the step (a capture moves the victim to jail).
    tiersBefore = { [a.id]: captureTier(b, a), [b.id]: captureTier(a, b) };
    stepSimulation(state, STEP_SEC);
    for (const ev of drainEvents(state)) onEvent?.(ev);
    const close = !a.jailed && !b.jailed && Math.hypot(a.x - b.x, a.z - b.z) < 130;
    if (close) { since ??= state.time; longest = Math.max(longest, (state.time - since) / 1000); }
    else since = null;
  }
  return longest;
}

describe('chase deadlock (P0)', () => {
  it('two AIs that meet face to face do not circle each other for long', () => {
    for (const seed of [5, 6, 7]) {
      const { state, a, b } = duelSetup(seed);
      const longest = longestContact(state, a, b, 40);
      // Before the fix they circled ~53 apart for the whole 40 s without a single grab.
      expect(longest).toBeLessThan(15);
    }
  }, 30_000);

  it('a duel is settled without anyone being grabbed from the front', () => {
    const { state, a, b } = duelSetup();
    const tiers: string[] = [];
    longestContact(state, a, b, 40, (ev) => {
      if (ev.type === 'CAPTURE' || ev.type === 'SOLDIER_ENDURED' || ev.type === 'CAPTURE_FAILED') {
        // Only these two can act: the grabber is whichever of them made the attempt.
        if ('attackerId' in ev && (ev.attackerId === a.id || ev.attackerId === b.id)) tiers.push(tiersBefore[ev.attackerId]);
      }
    });
    expect(tiers).not.toContain('front');
  }, 30_000);

  it('keeps going after the same enemy without flipping tactics every moment', () => {
    const { state, a, b } = duelSetup();
    // Count how often each changes what it is doing (state or target) over 40 s.
    let flips = 0;
    let prev = [a, b].map((e) => e.ai.state + ':' + e.ai.targetId);
    for (let t = 0; t < 40; t += STEP_SEC) {
      stepSimulation(state, STEP_SEC);
      drainEvents(state);
      const now = [a, b].map((e) => e.ai.state + ':' + e.ai.targetId);
      flips += now.filter((s, i) => s !== prev[i]).length;
      prev = now;
      if (a.jailed || b.jailed) break;
    }
    // A break-off is CHASE → FLEE → CHASE/SEARCH: a handful of changes, not dozens.
    expect(flips).toBeLessThan(24);
  }, 30_000);

  it('a breakaway is not chased again straight away by the one who broke off (cooldown)', () => {
    const { state, a, b } = duelSetup();
    let broke: Entity | null = null, brokeAt = 0, reengagedAfter = Infinity;
    for (let t = 0; t < 40; t += STEP_SEC) {
      stepSimulation(state, STEP_SEC);
      drainEvents(state);
      if (a.jailed || b.jailed) break;
      if (!broke) {
        broke = [a, b].find((e) => e.ai.state === 'FLEE') ?? null;
        brokeAt = state.time;
      } else if (broke.ai.state === 'CHASE' && broke.ai.targetId === (broke === a ? b : a).id) {
        reengagedAfter = Math.min(reengagedAfter, (state.time - brokeAt) / 1000);
      }
    }
    expect(broke).not.toBeNull();
    expect(reengagedAfter).toBeGreaterThan(4);
  }, 30_000);
});

describe('capture rules are unchanged', () => {
  it('an AI behind an enemy still grabs it from the back', () => {
    const state = quiet();
    const h = find(state, 'moon', 'soldier'), t = find(state, 'star', 'ranger');
    freezeOthers(state, [h, t]);
    t.stunUntil = Infinity; // stands still, back to the hunter
    teleport(t, O.x, O.z);
    t.dirX = 0; t.dirZ = -1;
    teleport(h, O.x, O.z + 70);
    face(h, t.x, t.z);
    noticed(state, h, t);
    let caught = false;
    for (let s = 0; s < 3 && !caught; s += STEP_SEC) {
      stepSimulation(state, STEP_SEC);
      caught = drainEvents(state).some((ev) => ev.type === 'CAPTURE' && ev.targetId === t.id);
    }
    expect(caught).toBe(true);
  });

  it('an enemy facing the hunter is only grabbed once the hunter has got round it', () => {
    const state = quiet();
    const h = find(state, 'moon', 'soldier'), t = find(state, 'star', 'ranger');
    freezeOthers(state, [h, t]);
    teleport(t, O.x, O.z);
    teleport(h, O.x, O.z + 100);
    face(t, h.x, h.z);
    face(h, t.x, t.z);
    t.stunUntil = Infinity; // keeps facing where the hunter started
    noticed(state, h, t);
    const tiers: string[] = [];
    for (let s = 0; s < 10 && !t.jailed; s += STEP_SEC) {
      const before = captureTier(t, h);
      stepSimulation(state, STEP_SEC);
      for (const ev of drainEvents(state)) {
        if ((ev.type === 'CAPTURE' || ev.type === 'CAPTURE_FAILED') && ev.attackerId === h.id) tiers.push(before);
      }
    }
    expect(t.jailed).toBe(true);
    expect(tiers).not.toContain('front');
  });
});

/** A spot where the old recovery left a king walking into a wall for minutes (QA: 258 s in Akihabara). */
const WALL = { x: 2345, z: -2281 }, BEYOND = { x: 2692, y: 0, z: -1999 };

function strandedSetup(role: 'king' | 'soldier') {
  const state = quiet(20);
  const e = find(state, 'moon', role);
  freezeOthers(state, [e]);
  teleport(e, WALL.x, WALL.z);
  e.ai.state = 'PATROL';
  e.ai.goal = { ...BEYOND };
  // What the old unstick left behind: a nearby point, then the far goal in a straight line through the block.
  e.ai.path = { points: [{ x: 2392, y: 0, z: -2299 }, { ...BEYOND }], i: 0, goal: e.ai.goal };
  e.ai.progressX = e.x; e.ai.progressZ = e.z; e.ai.progressAt = state.time;
  return { state, e };
}

function timeToReach(state: GameState, e: Entity, goal: { x: number; z: number }, sec: number): number {
  for (let t = 0; t < sec; t += STEP_SEC) {
    stepSimulation(state, STEP_SEC);
    drainEvents(state);
    if (Math.hypot(e.x - goal.x, e.z - goal.z) < 60) return t;
  }
  return Infinity;
}

describe('route replanning (P1)', () => {
  it('a soldier whose route runs into a building plans a real route and gets there', () => {
    const { state, e } = strandedSetup('soldier');
    // Keep the goal (an idle soldier would otherwise pick a new patrol point on arrival).
    expect(timeToReach(state, e, BEYOND, 25)).toBeLessThan(25);
  });

  it('a king stuck against a wall replans to its destination instead of standing there', () => {
    const { state, e } = strandedSetup('king');
    expect(timeToReach(state, e, BEYOND, 30)).toBeLessThan(30);
  });

  it('a short bump (someone in the way) is not treated as a lost route', () => {
    const state = quiet();
    const e = find(state, 'moon', 'soldier'), other = find(state, 'moon', 'ranger');
    freezeOthers(state, [e]);
    teleport(e, O.x, O.z + 150);
    teleport(other, O.x, O.z + 110); // a frozen ally right in the way
    e.ai.state = 'PATROL';
    e.ai.goal = { x: O.x, y: 0, z: O.z - 150 };
    e.ai.path = { points: [e.ai.goal], i: 0, goal: e.ai.goal };
    face(e, O.x, O.z - 150);
    let replans = 0, last = e.ai.path;
    for (let t = 0; t < 6; t += STEP_SEC) {
      stepSimulation(state, STEP_SEC);
      if (e.ai.path !== last) { replans++; last = e.ai.path; }
      if (!e.ai.goal) break;
    }
    expect(Math.hypot(e.x - O.x, e.z - (O.z - 150))).toBeLessThan(80);
    expect(replans).toBeLessThan(4); // not re-planning every frame
  });

  it('does not replan every frame while it cannot get anywhere, and gives up on a goal it cannot reach', () => {
    const { state, e } = strandedSetup('soldier');
    // Boxed in: it cannot move at all.
    e.ai.goal = { x: 99999, y: 0, z: 99999 }; // off the map: no route exists
    e.ai.path = { points: [e.ai.goal], i: 0, goal: e.ai.goal };
    let changes = 0, last = e.ai.path;
    for (let t = 0; t < 20; t += STEP_SEC) {
      stepSimulation(state, STEP_SEC);
      if (e.ai.path !== last) { changes++; last = e.ai.path; }
    }
    expect(changes).toBeLessThan(40); // 20 s at 60 fps = 1200 frames
    // It did not keep pressing on toward the impossible goal.
    expect(e.ai.goal === null || e.ai.goal.x !== 99999).toBe(true);
  });
});

describe('priorities still hold', () => {
  it('the last free member of a nation goes to open the jail even in the middle of a duel', () => {
    const { state, a, b } = duelSetup();
    // Everyone else of a's nation (moon) is jailed by sun: a is the last one free.
    for (const o of state.entities) if (o.nation === 'moon' && o !== a) sendToJail(state, o, 'sun', null);
    drainEvents(state);
    for (let t = 0; t < 8; t += STEP_SEC) { stepSimulation(state, STEP_SEC); drainEvents(state); if (a.jailed) break; }
    if (!a.jailed) expect(a.ai.state).toBe('RESCUE');
    void b;
  });

  it('a rescue escort that was stranded still reaches the jail', () => {
    const state = quiet(20);
    const e = find(state, 'moon', 'keyholder'), pal = find(state, 'moon', 'ranger');
    freezeOthers(state, [e]);
    sendToJail(state, pal, 'sun', null);
    drainEvents(state);
    teleport(e, WALL.x, WALL.z);
    const j = pal;
    // Stale straight-line route, as left by the old recovery.
    e.ai.goal = { x: j.x, y: j.y, z: j.z };
    e.ai.path = { points: [{ x: 2392, y: 0, z: -2299 }, e.ai.goal], i: 0, goal: e.ai.goal };
    let reached = false;
    for (let t = 0; t < 60 && !reached; t += STEP_SEC) {
      stepSimulation(state, STEP_SEC);
      drainEvents(state);
      reached = Math.hypot(e.x - j.x, e.z - j.z) < 120 || !pal.jailed;
    }
    expect(reached).toBe(true);
  }, 30_000);
});
