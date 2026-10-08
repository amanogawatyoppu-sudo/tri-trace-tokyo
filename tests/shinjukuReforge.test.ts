import { describe, expect, it } from 'vitest';
import { BASE_SITES, INTERSECTIONS, JAIL_SITES, SHINJUKU_BUILT, STREET_SEGS, WORLD, WALK_EDGE, insideLoop } from '../src/config/map';
import { AVENUE, DECKS, DECK_H, HIGH_DECKS, HIGH_H, LANES, SHINJUKU_LIGHTS, SHINJUKU_STAIRS } from '../src/config/shinjuku';
import { NATIONS } from '../src/config/nations';
import { planPath } from '../src/ai/nav';
import { SECTORS, sectorPoint } from '../src/sim/war';
import { canWalk, supportHeight, walkLine } from '../src/sim/systems/world';

/**
 * v10.1 MAP REFORGE: the centre of Shinjuku rebuilt as VERTICAL CITY (layout in config/shinjuku.ts).
 * That the rest of Tokyo is untouched is checked with Shibuya's hashes (tests/shibuyaReforge.test.ts).
 */

/** Distance from (x, z) to the nearest solid ground-level piece (pavements, decks and stairs overhead don't count). */
const clearance = (x: number, z: number, skip: (w: (typeof WORLD)[number]) => boolean = () => false) => {
  let best = Infinity;
  for (const w of WORLD) {
    if (w.mat === 'sidewalk' || w.y0 > 100 || skip(w)) continue;
    const dx = Math.max(Math.abs(x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(z - w.z) - w.d / 2, 0);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
};

describe('Shinjuku reforge: what stays', () => {
  it('keeps the strategic point (新宿御苑前) where it was, in open ground', () => {
    const p = sectorPoint(0), want = SECTORS[0].pointNear;
    expect(Math.hypot(p.x - want.x, p.z - want.z)).toBeLessThan(40);
    expect(p.y).toBe(0);
    // The garden's own trees and pond were there before (and stay); nothing built stands within the capture radius.
    expect(clearance(p.x, p.z, (w) => w.mat === 'tree' || w.mat === 'water')).toBeGreaterThan(150);
  });

  it('keeps the SOL base and its LOCK POINT where they were, with the square around the base open', () => {
    expect(BASE_SITES.sun).toMatchObject({ x: -3157, z: -1166 });
    expect(Math.hypot(JAIL_SITES.sun.x + 3137, JAIL_SITES.sun.z + 1586)).toBeLessThan(40);
    // Nothing stands within 150 of the base (the square stays open round it).
    expect(clearance(BASE_SITES.sun.x, BASE_SITES.sun.z)).toBeGreaterThan(150);
  });

  it('builds every new building inside the walkable city (clear of the railway)', () => {
    for (const b of SHINJUKU_BUILT.buildings) {
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) expect(insideLoop(x, z, WALK_EDGE + 10), b.id).toBe(true);
    }
    // VERTICAL CITY: three towers over 20 storeys.
    expect(SHINJUKU_BUILT.buildings.filter((b) => b.floors >= 20).length).toBe(3);
  });
});

describe('Shinjuku reforge: the main street', () => {
  it('runs 明治通り unbroken from the walk-up to the garden, through the VERTICAL CROSS', () => {
    const av = STREET_SEGS.filter((g) => g.x === AVENUE.x && g.axis === 'z');
    const crossing = INTERSECTIONS.filter((ix) => ix.x === AVENUE.x && ix.z === -1350);
    expect(crossing.length).toBe(1);
    const covered = (z: number) => av.some((g) => z > g.z - g.d / 2 - 1 && z < g.z + g.d / 2 + 1) || crossing.some((ix) => Math.abs(z - ix.z) < ix.d / 2 + 1);
    for (let z = AVENUE.z0 + 10; z < AVENUE.z1; z += 20) expect(covered(z), `avenue at z ${z}`).toBe(true);
  });

  it('keeps the avenue clear: nothing solid on the roadway', () => {
    for (let z = AVENUE.z0 + 30; z < AVENUE.z1 - 30; z += 40) {
      expect(canWalk({ x: AVENUE.x, y: 0, z }, AVENUE.x, 0, z + 40), `at z ${z}`).toBe(true);
    }
  });
});

describe('Shinjuku reforge: ground, deck and high routes', () => {
  const from = { ...NATIONS.sun.base, y: 0 };
  const walkTo = (goal: { x: number; y: number; z: number }) => {
    const pts = planPath(from, goal);
    expect(pts).not.toBeNull();
    let b = { ...from };
    for (const p of pts!) {
      expect(canWalk(b, p.x, p.y, p.z)).toBe(true);
      b = walkLine(b, p.x, p.z);
      b.y = supportHeight(b.x, b.z, b.y);
    }
    return b;
  };
  const cell = (r: number, c: number) => ({ x: LANES.x0 + (c + 0.5) * LANES.cell, z: LANES.z0 + (r + 0.5) * LANES.cell });
  it.each([
    ['the VERTICAL CROSS', { x: -2700, y: 0, z: -1350 }],
    ['the strategic point', { x: -2847, y: 0, z: -474 }],
    ['NIGHT LANES (the middle lane)', { ...cell(4, 4), y: 0 }],
    ['NIGHT LANES (the north mouth)', { ...cell(1, 4), y: 0 }],
    ['DECK 2 over 靖国通り', { x: -2455, y: DECK_H, z: -1350 }],
    ['DECK 2 across the avenue', { x: -2700, y: DECK_H, z: -1745 }],
    ['DECK 2 down the square', { x: -2945, y: DECK_H, z: -1450 }],
    ['the SKY BRIDGE', { x: -2700, y: HIGH_H, z: -765 }],
    ['T2 roof', { x: -2300, y: HIGH_H, z: -740 }],
    ['T3 roof', { x: -3030, y: HIGH_H, z: -800 }],
  ])('reaches %s on foot', (_name, goal) => {
    const b = walkTo(goal);
    expect(Math.abs(b.y - goal.y)).toBeLessThan(6);
    expect(Math.hypot(b.x - goal.x, b.z - goal.z)).toBeLessThan(60);
  });

  it('has stairs no steeper than the footbridges, from their foot to their top', () => {
    for (const s of SHINJUKU_STAIRS) {
      const run = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
      expect((s.hHigh - s.hLow) / run, s.id).toBeLessThanOrEqual(0.55);
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const low = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z0 + 4 : s.z1 - 4 } : { x: s.dir === 1 ? s.x0 + 4 : s.x1 - 4, z: cz };
      const top = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z1 + 10 : s.z0 - 10 } : { x: s.dir === 1 ? s.x1 + 10 : s.x0 - 10, z: cz };
      expect(supportHeight(low.x, low.z, s.hLow + 12), `${s.id} foot`).toBeLessThan(s.hLow + 12);
      expect(supportHeight(top.x, top.z, s.hHigh + 5), `${s.id} top`).toBe(s.hHigh);
    }
  });

  it('lets people walk under DECK 2 and keeps both levels railed', () => {
    for (const k of [...DECKS, ...HIGH_DECKS]) {
      const cx = (k.x0 + k.x1) / 2, cz = (k.z0 + k.z1) / 2;
      expect(supportHeight(cx, cz, (DECKS.includes(k) ? DECK_H : HIGH_H) + 5), k.id).toBe(DECKS.includes(k) ? DECK_H : HIGH_H);
    }
    expect(supportHeight(-2700, -1745, 10)).toBe(0); // the avenue under the deck's arm
    expect(WORLD.filter((w) => w.group === 'sjdeck' && w.kind === 'box' && (w.y0 === DECK_H || w.y0 === HIGH_H)).length).toBeGreaterThan(8);
  });
});

describe('Shinjuku reforge: as drawn', () => {
  function fakeDocument() {
    const ctx: Record<string, unknown> = new Proxy({}, {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => {}),
      set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
    });
    return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }

  it('draws the district in a handful of meshes, a bounded triangle budget, and leaves the world alone', async () => {
    const g = globalThis as unknown as { document?: unknown };
    const had = g.document;
    g.document = fakeDocument();
    try {
      const THREE = await import('three');
      const before = JSON.stringify(WORLD);
      const { buildShinjuku } = await import('../src/render/shinjuku');
      const scene = new THREE.Scene();
      const stats = buildShinjuku(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      expect(scene.children.length).toBeLessThanOrEqual(24);
      expect(stats.triangles).toBeLessThan(90000);
      expect(stats.buildings).toBe(SHINJUKU_BUILT.buildings.length);
      expect(stats.bays).toBeGreaterThanOrEqual(30);
    } finally { g.document = had; }
  });

  it('never lights Shinjuku in a faction colour', () => {
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    for (const c of SHINJUKU_LIGHTS) {
      const a = hueOf(c);
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gap, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
  });
});
