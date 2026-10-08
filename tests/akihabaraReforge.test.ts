import { describe, expect, it } from 'vitest';
import { ARCADE, AKIBA_BUILT, BASE_SITES, JAIL_SITES, WALK_EDGE, WORLD, insideLoop } from '../src/config/map';
import {
  ARCADE_SOUTH_DOOR, CABLE_MIN_Y, GATE_H, GRID_CABLES, GRID_GATE, GRID_TOWER, MAIN_STREET, ROUTES,
} from '../src/config/akihabara';
import { NATIONS } from '../src/config/nations';
import { planPath } from '../src/ai/nav';
import { SECTORS, sectorPoint } from '../src/sim/war';
import { canWalk, lineOfSight, supportHeight, walkLine } from '../src/sim/systems/world';
import { inAkihabara } from './helpers';

/**
 * v10 MAP REFORGE phase 3: 秋葉原 ELECTRIC GRID (layout in config/akihabara.ts). That nothing
 * outside the rebuilt areas moved is checked by the Shibuya reforge test's hash, which leaves out
 * both districts.
 */

const AKIBA = 5;
const solidAt = (x0: number, z0: number, x1: number, z1: number) =>
  WORLD.filter((w) => w.mat !== 'sidewalk' && w.mat !== 'water' && w.y0 < 50 && (w.kind === 'ramp' || w.y1 > 5)
    && x0 < w.x + w.w / 2 && x1 > w.x - w.w / 2 && z0 < w.z + w.d / 2 && z1 > w.z - w.d / 2);

describe('Akihabara reforge: what must not move', () => {
  it('keeps the strategic point in open ground, and LUNA\'s base and LOCK POINT where they were', () => {
    const p = sectorPoint(AKIBA);
    expect(Math.hypot(p.x - 2642, p.z + 2249)).toBeLessThan(40);
    expect(p.y).toBe(0);
    expect(SECTORS[AKIBA].name).toBeTruthy();
    for (const w of WORLD) {
      if (w.mat === 'sidewalk' || w.mat === 'water' || w.y0 > 100) continue;
      const dx = Math.max(Math.abs(p.x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(p.z - w.z) - w.d / 2, 0);
      if (!inAkihabara(w)) continue;
      expect(Math.hypot(dx, dz), `${w.mat} ${w.group ?? ''} at ${w.x},${w.z}`).toBeGreaterThan(150);
    }
    expect(BASE_SITES.moon).toMatchObject({ x: NATIONS.moon.base.x, z: NATIONS.moon.base.z });
    expect(JAIL_SITES.moon).toEqual({ x: 2546, z: -2673 });
    // The LOCK POINT (240 × 60) and LUNA's base (500 × 500) stay clear.
    expect(solidAt(2426, -2703, 2666, -2643)).toEqual([]);
    expect(solidAt(2546, -3303, 3046, -2803).filter(inAkihabara)).toEqual([]);
  });

  it('builds every new building inside the walkable city (clear of the railway)', () => {
    expect(AKIBA_BUILT.buildings.length).toBeGreaterThanOrEqual(12);
    for (const b of AKIBA_BUILT.buildings) {
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) expect(insideLoop(x, z, WALK_EDGE + 10), b.id).toBe(true);
    }
  });
});

describe('Akihabara reforge: three ways through', () => {
  const walk = (from: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }) => {
    const pts = planPath(from, goal);
    expect(pts).not.toBeNull();
    let b = { ...from }, len = 0;
    for (const p of pts!) {
      expect(canWalk(b, p.x, p.y, p.z), `at ${Math.round(b.x)},${Math.round(b.z)} → ${Math.round(p.x)},${Math.round(p.z)}`).toBe(true);
      const nb = walkLine(b, p.x, p.z);
      len += Math.hypot(nb.x - b.x, nb.z - b.z);
      b = nb;
      b.y = supportHeight(b.x, b.z, b.y);
    }
    expect(Math.abs(b.y - goal.y)).toBeLessThan(6);
    expect(Math.hypot(b.x - goal.x, b.z - goal.z)).toBeLessThan(60);
    return len;
  };
  const GOALS: [string, { x: number; y: number; z: number }][] = [
    ['MAIN ELECTRIC STREET', { x: 2222, y: 0, z: -2650 }],
    ['the GRID GATE footbridge', { x: 2250, y: GATE_H, z: -2776 }],
    ['COMPONENT ALLEY (spine)', { x: 1913, y: 4, z: -2700 }],
    ['COMPONENT ALLEY (west lane)', { x: 1780, y: 4, z: -2650 }],
    ['COMPONENT ALLEY (south-west lane)', { x: 1754, y: 4, z: -2520 }],
    ['COMPONENT ALLEY (south-east lane)', { x: 2024, y: 4, z: -2484 }],
    ['the passage under P1', { x: 2024, y: 4, z: -2580 }],
    ['the parts lane east of the street', { x: 2620, y: 0, z: -2515 }],
    ['SERVICE CUT (behind POWER NODE)', { x: 2837, y: 0, z: -2700 }],
    ['SERVICE CUT (behind the stalls)', { x: 2815, y: 0, z: -2520 }],
    ['the passage under R2', { x: 2755, y: 0, z: -2662 }],
    ['DATA JUNCTION', { x: 2642, y: 0, z: -2300 }],
    ['CIRCUIT ARCADE through its south door', { x: 1911, y: 0, z: -2860 }],
  ];
  it.each(GOALS)('reaches %s on foot from LUNA\'s base and from SOL\'s', (_n, goal) => {
    walk({ ...NATIONS.moon.base, y: 0 }, goal);
    walk({ ...NATIONS.sun.base, y: 0 }, goal);
  });

  it('walks straight through both covered passages (no dead ends): P1 from the alley to the street, R2 from the yard to the back lane', () => {
    for (const [ax, bx, z, y] of [[1913, 2112, -2580, 4], [2112, 1913, -2580, 4], [2690, 2830, -2662, 0], [2830, 2690, -2662, 0]] as const) {
      const b = walkLine({ x: ax, y, z }, bx, z);
      expect(Math.abs(b.x - bx), `${ax} → ${bx} at z ${z}`).toBeLessThan(2);
    }
  });

  it('still walks CIRCUIT ARCADE end to end, and its south door is open', () => {
    const z = ARCADE.z;
    walk({ x: ARCADE.x - ARCADE.w / 2 - 60, y: 0, z }, { x: ARCADE.x + ARCADE.w / 2 + 60, y: 0, z });
    const d = ARCADE_SOUTH_DOOR, zs = ARCADE.z + ARCADE.d / 2;
    expect(solidAt(d.x - d.width / 2 + 2, zs - 20, d.x + d.width / 2 - 2, zs + 20)).toEqual([]);
  });

  it('gives the base three ways to DATA JUNCTION: the back lane shortest, the main street longest', () => {
    const base = { ...NATIONS.moon.base, y: 0 };
    const leg = (pts: { x: number; z: number }[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);
    // A: arcade's east square → street → river corner. B: arcade → south door → lanes → riverside. C: back lane.
    const A = leg([base, { x: 2400, z: -2900 }, { x: 2222, z: -2800 }, { x: 2222, z: -2520 }, { x: 2416, z: -2470 }, { x: 2642, z: -2300 }]);
    const C = leg([base, { x: 2837, z: -2800 }, { x: 2837, z: -2610 }, { x: 2815, z: -2440 }, { x: 2642, z: -2300 }]);
    expect(C).toBeLessThan(A);
    for (const via of [[{ x: 2837, y: 0, z: -2700 }, { x: 2815, y: 0, z: -2520 }], [{ x: 2222, y: 0, z: -2650 }]]) {
      let from = base;
      for (const p of [...via, { x: 2642, y: 0, z: -2300 }]) { walk(from, p); from = p; }
    }
  });

  it('keeps lanes at least 100 wide, with anything in them standing against a side', () => {
    for (const [id, r] of Object.entries(ROUTES)) {
      expect(Math.min(r.x1 - r.x0, r.z1 - r.z0), id).toBeGreaterThanOrEqual(100);
      // Poles, vending machines and meters stand flush with a lane's side; the clear width left is at least 76.
      const across = r.x1 - r.x0 < r.z1 - r.z0 ? 'x' : 'z';
      const [lo, hi] = across === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
      for (const w of solidAt(r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1).filter((w) => w.group !== 'akibaBoard')) {
        const c = across === 'x' ? w.x : w.z, h = (across === 'x' ? w.w : w.d) / 2;
        const name = `${id}: ${w.mat}@${w.x},${w.z}`;
        const fromLo = c + h - lo, fromHi = hi - (c - h);
        expect(Math.min(fromLo, fromHi), name).toBeLessThanOrEqual(24); // against a side, not in the middle
        expect(hi - lo - Math.min(fromLo, fromHi), name).toBeGreaterThanOrEqual(76);
      }
    }
    const s = MAIN_STREET;
    expect(solidAt(s.road0, s.z0, s.road1, s.z1).filter((w) => w.group !== 'akibaGate')).toEqual([]);
  });

  it('breaks long views: the lanes cannot be seen into from the street, nor the back lane from the square', () => {
    const blind: [string, number, number, number, number][] = [
      ['street → spine', 2222, -2650, 1913, -2700],
      ['street → south-west lane', 2222, -2550, 1754, -2520],
      ['street → parts lane', 2222, -2515, 2620, -2515],
      ['street → back lane', 2222, -2520, 2815, -2520],
      ['DATA JUNCTION → back lane north', 2642, -2300, 2837, -2700],
      ['base → DATA JUNCTION', 2796, -3053, 2642, -2300],
      ['arcade south door → riverside', 1911, -2800, 1911, -2300],
      ['LOCK POINT → back lane', 2546, -2673, 2815, -2520],
    ];
    for (const [n, ax, az, bx, bz] of blind) expect(lineOfSight(ax, 40, az, bx, 40, bz), n).toBe(false);
    // The main street itself is open (fast but exposed): from the arcade to the bridge foot.
    expect(lineOfSight(2222, 40, -2810, 2222, 40, -2520)).toBe(true);
  });

  it('climbs both GRID GATE stairs gently, and walks under the deck', () => {
    for (const s of GRID_GATE.stairs) {
      const along = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
      expect(GATE_H / along, s.id).toBeLessThanOrEqual(0.55);
    }
    const D = GRID_GATE.deck;
    expect(supportHeight((D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2, GATE_H + 5)).toBe(GATE_H);
    expect(supportHeight(2222, (D.z0 + D.z1) / 2, 10)).toBeLessThan(10);
    expect(GATE_H - 12).toBeGreaterThanOrEqual(50); // head room under the slab
    expect(supportHeight(2222, -2776, 10)).toBeLessThan(10);
  });

  it('hangs the GRID TOWER cables overhead: nothing to collide with, never lower than the minimum', () => {
    expect(WORLD.some((w) => /cable/i.test(w.group ?? ''))).toBe(false);
    const T = GRID_TOWER;
    for (const [bx, by] of GRID_CABLES) {
      // As the renderer hangs them: from the ring down to the far end, sagging at most 60.
      const sag = Math.max(10, Math.min(60, (Math.min(T.ring, by) - 260) * 0.8));
      let low = Infinity;
      for (let k = 0; k <= 20; k++) { const t = k / 20; low = Math.min(low, T.ring - 4 + (by - T.ring + 4) * t - sag * 4 * t * (1 - t) - 3); }
      expect(low, `cable to ${bx}`).toBeGreaterThanOrEqual(CABLE_MIN_Y);
      expect(CABLE_MIN_Y).toBeGreaterThan(GATE_H + 60); // over anyone on the footbridge
    }
  });
});

describe('Akihabara reforge: as drawn', () => {
  /** Just enough of a 2D canvas for the atlas painter (node has none). */
  function fakeDocument() {
    const ctx: Record<string, unknown> = new Proxy({}, {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
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
      const { buildAkihabara } = await import('../src/render/akihabara');
      const scene = new THREE.Scene();
      const stats = buildAkihabara(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      // Final polish: one light mesh, small props merged, 1024×1024 sign atlas (was 25 scene children, 18,276 triangles).
      expect(scene.children.length).toBeLessThanOrEqual(12);
      expect(stats.triangles).toBeLessThan(17000);
      // COMPONENT ALLEY keeps every shop, but 20–30% of its small signs and text are gone.
      const cut = 1 - stats.alleyInfo.kept / stats.alleyInfo.before;
      expect(cut).toBeGreaterThanOrEqual(0.2);
      expect(cut).toBeLessThanOrEqual(0.3);
      expect(stats.buildings).toBe(AKIBA_BUILT.buildings.length);
      expect(stats.bays).toBeGreaterThanOrEqual(24);
      expect(stats.blades).toBeGreaterThanOrEqual(20);
      expect(stats.cables).toBeGreaterThanOrEqual(GRID_CABLES.length);
      console.log('akihabara stats', JSON.stringify(stats), 'children', scene.children.length);
    } finally { g.document = had; }
  });

  it('never lights Akihabara in a faction colour (its electric blue leans violet, away from LUNA)', async () => {
    const { AKIBA_LIGHTS } = await import('../src/render/akihabara');
    const { lookFor } = await import('../src/render/districts');
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    expect(lookFor(AKIBA).palette).toEqual([...AKIBA_LIGHTS]);
    for (const c of AKIBA_LIGHTS) {
      const a = hueOf(c);
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gap, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
  });
});
