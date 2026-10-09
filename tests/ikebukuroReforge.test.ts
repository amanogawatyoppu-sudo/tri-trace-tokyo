import { describe, expect, it } from 'vitest';
import { BLOCKS, BUILDINGS, CROSSWALKS, IKEBUKURO_BUILT, LIGHTS, PARKINGS, POLES, SIGNALS, STREET_SEGS, WORLD, insideLoop, WALK_EDGE } from '../src/config/map';
import { IKB_DECKS, IKB_PLANT, IKB_SPOTS, IKB_SQUARE, IKB_STAIRS, R3, inIkebukuro } from '../src/config/ikebukuro';
import { NATIONS } from '../src/config/nations';
import { navGraph, planPath } from '../src/ai/nav';
import { SECTORS, sectorPoint } from '../src/sim/war';
import { STEP_UP, blocked, canWalk, lineOfSight, supportHeight } from '../src/sim/systems/world';
import { inBunkyo, inChuo, inShinagawa, inTokyoTower, inUeno } from './helpers';

/** MAP REFORGE: Ikebukuro rebuilt as the ROOFTOP NETWORK (layout in config/ikebukuro.ts). */

/**
 * Everything outside the rebuilt zones, hashed on the base (map-reforge-base bbe30ec) before this reforge.
 * Ueno and Shinagawa (the other parallel reforges, merged in map-reforge-parallel-integrated) are left
 * out too; the hashes were taken on bbe30ec with all three areas left out. Chuo (parallel F) is left out
 * as well: retaken on map-reforge-parallel-integrated (897dc77) with all four areas left out.
 */
// 文京・東京タワー・中央 (tests/bunkyoReforge.test.ts, tests/tokyoTowerReforge.test.ts, tests/chuoReforge.test.ts) are left out as well
// since map-reforge-all9; re-taken on 897dc77 with all of them left out.
const OUTSIDE = {
  world: '30dada6b', lights: '9ba6b169', buildings: '2c9fb967', poles: '33b6478', signals: '906d6319',
  crosswalks: 'a745170a', parkings: '96f01396', streets: 'd58fd48a', blocks: '7631b23', n: 727,
};
const outside = (p: { x: number; z: number }) => !inIkebukuro(p.x, p.z) && !inUeno(p) && !inShinagawa(p) && !inBunkyo(p) && !inTokyoTower(p) && !inChuo(p);
/** FNV-1a over the JSON (enough to notice any change). */
const hash = (v: unknown) => {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};
type Rect = { x0: number; z0: number; x1: number; z1: number };
const inRect = (r: Rect, x: number, z: number, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

describe('Ikebukuro reforge: the rest of Tokyo is untouched', () => {
  it('leaves every primitive, lamp, building, pole, signal, street and block outside the rebuilt zones as they were', () => {
    expect({
      world: hash(WORLD.filter(outside)), lights: hash(LIGHTS.filter(outside)), buildings: hash(BUILDINGS.filter(outside)),
      poles: hash(POLES.filter(outside)), signals: hash(SIGNALS.filter(outside)), crosswalks: hash(CROSSWALKS.filter(outside)),
      parkings: hash(PARKINGS.filter(outside)), streets: hash(STREET_SEGS.filter(outside)),
      blocks: hash(BLOCKS.filter((b) => outside({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }))),
      n: WORLD.filter(outside).length,
    }).toEqual(OUTSIDE);
  });

  it('keeps the strategic point where it was, in an open square', () => {
    const p = sectorPoint(2), want = SECTORS[2].pointNear;
    expect(Math.hypot(p.x - want.x, p.z - want.z)).toBeLessThan(40);
    expect(Math.hypot(p.x - IKB_SQUARE.x, p.z - IKB_SQUARE.z)).toBeLessThan(5);
    expect(p.y).toBe(0);
    for (const w of WORLD) {
      if (w.mat === 'sidewalk' || w.y0 > 100) continue;
      const dx = Math.max(Math.abs(p.x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(p.z - w.z) - w.d / 2, 0);
      expect(Math.hypot(dx, dz), `${w.mat} ${w.group ?? ''} at ${w.x},${w.z}`).toBeGreaterThan(150);
    }
  });

  it('builds every new building inside the walkable city (the 60-storey tower stands beyond the tracks as skyline)', () => {
    for (const b of IKEBUKURO_BUILT.buildings) {
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) expect(insideLoop(x, z, WALK_EDGE + 10), b.id).toBe(true);
    }
    expect(WORLD.filter((w) => w.group === 'tower' && inIkebukuro(w.x, w.z)).length).toBe(1);
  });

  it('is low and mid-rise: no new building above 5 floors, no glass tower in the network', () => {
    for (const b of IKEBUKURO_BUILT.buildings) expect(b.floors, b.id).toBeLessThanOrEqual(5);
    expect(WORLD.filter((w) => w.group === 'ikebukuro' && w.mat === 'glass').length).toBe(0);
  });
});

describe('Ikebukuro reforge: STREET LOOP, ROOFTOP NETWORK, BACKSTAIR CUT', () => {
  const from = { ...NATIONS.sun.base, y: 0 };
  const walk = (start: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }) => {
    const pts = planPath(start, goal);
    expect(pts).not.toBeNull();
    let b = { ...start };
    for (const p of pts!) {
      expect(canWalk(b, p.x, p.y, p.z), `${Math.round(b.x)},${Math.round(b.z)},${Math.round(b.y)} → ${Math.round(p.x)},${Math.round(p.z)},${Math.round(p.y)}`).toBe(true);
      b = { ...p }; // (canWalk ended within 3 of it: go on from the waypoint itself, free of rounding drift)
    }
    return b;
  };

  it.each(Object.entries(IKB_SPOTS))('reaches %s on foot', (_name, goal) => {
    const b = walk(from, goal);
    expect(Math.abs(b.y - goal.y)).toBeLessThan(6);
    expect(Math.hypot(b.x - goal.x, b.z - goal.z)).toBeLessThan(60);
  });

  it.each(Object.entries(IKB_SPOTS).filter(([, s]) => s.y > 100))('comes back down from %s (no traps)', (_name, start) => {
    const b = walk(start, IKB_SPOTS.loopSouth);
    expect(b.y).toBeLessThan(6);
  });

  const g = navGraph();
  const roof = (n: { y: number }) => n.y > R3 - 6;
  /** Roof-only search (never touching the street) avoiding the given rectangles. */
  const overRoofs = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, avoid: Rect[]) => {
    const near = (p: { x: number; y: number; z: number }) =>
      g.nodes.filter((n) => roof(n) && Math.abs(n.y - p.y) < 6).sort((m, n) => Math.hypot(m.x - p.x, m.z - p.z) - Math.hypot(n.x - p.x, n.z - p.z))[0];
    const s = near(a), t = near(b);
    const ok = (id: number) => roof(g.nodes[id]) && !avoid.some((r) => inRect(r, g.nodes[id].x, g.nodes[id].z, 8));
    const seen = new Set([s.id]), q = [s.id];
    while (q.length) {
      const id = q.pop()!;
      if (id === t.id) return true;
      for (const m of g.nodes[id].edges) if (!seen.has(m) && ok(m)) { seen.add(m); q.push(m); }
    }
    return false;
  };
  const deck = (id: string) => IKB_DECKS.find((k) => k.id === id)!;

  it('joins the roofs in a loop: two roof-only routes between the rows, each surviving without the other', () => {
    const { e1, signalGarden, w1, e3 } = IKB_SPOTS;
    expect(overRoofs(e1, signalGarden, [])).toBe(true);
    expect(overRoofs(e1, signalGarden, [deck('hub')])).toBe(true); // north: the lane bridge, W1, the roof stair, W2
    expect(overRoofs(e1, signalGarden, [deck('laneBridge')])).toBe(true); // middle: E2, the NETWORK HUB
    expect(overRoofs(e1, signalGarden, [deck('hub'), deck('laneBridge')])).toBe(false); // (and those are the two crossings)
    expect(overRoofs(w1, e3, [deck('hub')])).toBe(true);
    expect(overRoofs(w1, e3, [deck('laneBridge')])).toBe(true);
  });

  it('reaches the SKY SERVICE roof from the network over the SKY LINK, without touching the street', () => {
    expect(overRoofs(IKB_SPOTS.e1, IKB_SPOTS.skyServiceRoof, [])).toBe(true);
  });

  it('leaves no roof cut off: every roof node in the district is in the main network', () => {
    const roofs = g.nodes.filter((n) => roof(n) && inIkebukuro(n.x, n.z));
    expect(roofs.length).toBeGreaterThan(150);
    expect(roofs.filter((n) => !n.reachable).map((n) => `${n.x},${n.z},${Math.round(n.y)}`)).toEqual([]);
  });

  it('gives every walkable roof at least two ways down (it still reaches the street with any one bridge, hub or stair top closed)', () => {
    const touches = (k: Rect, r: Rect) => k.x0 <= r.x1 && k.x1 >= r.x0 && k.z0 <= r.z1 && k.z1 >= r.z0;
    for (const b of IKEBUKURO_BUILT.buildings.filter((b) => b.walk)) {
      const ways = IKB_DECKS.filter((k) => k.y === b.h && touches(k, b));
      expect(ways.length, b.id).toBeGreaterThanOrEqual(2);
      for (const shut of ways) {
        const s = g.nodes.find((n) => roof(n) && inRect(b, n.x, n.z, -20) && !inRect(shut, n.x, n.z, 8))!;
        const seen = new Set([s.id]), q = [s.id];
        let down = false;
        while (q.length && !down) {
          const n = g.nodes[q.pop()!];
          if (n.y < 6) down = true;
          for (const m of n.edges) if (!seen.has(m) && !inRect(shut, g.nodes[m].x, g.nodes[m].z, 8)) { seen.add(m); q.push(m); }
        }
        expect(down, `${b.id} without ${shut.id}`).toBe(true);
      }
    }
  });

  it('fences every roof edge that has nothing walkable beyond it (nobody falls, nobody jumps down)', () => {
    const surfaces: (Rect & { y: number; id: string })[] = [
      ...IKEBUKURO_BUILT.buildings.filter((b) => b.walk).map((b) => ({ ...b, y: b.h })),
      ...IKB_DECKS.map((k) => ({ ...k })),
    ];
    for (const r of surfaces) {
      const edges: [number, number, number, number, number, number][] = [
        [r.x0, r.z0, r.x1, r.z0, 0, -1], [r.x0, r.z1, r.x1, r.z1, 0, 1], [r.x0, r.z0, r.x0, r.z1, -1, 0], [r.x1, r.z0, r.x1, r.z1, 1, 0],
      ];
      for (const [ax, az, bx, bz, nx, nz] of edges) {
        const len = Math.hypot(bx - ax, bz - az);
        for (let t = 15; t < len - 15; t += 10) {
          const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
          const fenced = blocked(x - nx * 8, z - nz * 8, r.y, 14);
          const carriesOn = supportHeight(x + nx * 20, z + nz * 20, r.y + 1) >= r.y - STEP_UP;
          expect(fenced || carriesOn, `${r.id} edge at ${Math.round(x)},${Math.round(z)}`).toBe(true);
        }
      }
    }
  });

  it('keeps the stairs climbable (no steeper than a character can step)', () => {
    for (const s of IKB_STAIRS) {
      const along = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
      expect((s.high - s.low) / along, s.id).toBeLessThanOrEqual(0.8);
    }
  });
});

describe('Ikebukuro reforge: chase moments', () => {
  const EYE = 40;
  it('lets the roofs see the street below through the fences (and the street see the roofs)', () => {
    const Y = R3 + EYE;
    const lines: [string, number[]][] = [
      ['SKY LINK → the avenue', [-2042, Y, -4700, -2300, EYE, -4600]],
      ['W1 at its fence → the avenue', [-2330, Y, -4553, -2330, EYE, -4650]],
      ['E3 → the side street', [-1998, Y, -4170, -1800, EYE, -4170]],
      ['NETWORK HUB → the back lane', [-2200, Y, -4152, -2200, EYE, -4040]],
      ['SIGNAL GARDEN → the south road', [-2330, Y, -4054, -2330, EYE, -3950]],
      ['SKY SERVICE → the station square', [-2066, Y, -5200, IKB_SQUARE.x, EYE, IKB_SQUARE.z]],
    ];
    for (const [name, [ax, ay, az, bx, by, bz]] of lines) {
      expect(lineOfSight(ax, ay, az, bx, by, bz), name).toBe(true);
      expect(lineOfSight(bx, by, bz, ax, ay, az), name).toBe(true);
    }
    // The fences are chain-link: they stop bodies, not eyes.
    expect(WORLD.filter((w) => w.group === 'ikebukuro' && w.noFloor && w.kind === 'box' && w.y1 - w.y0 === 32).every((w) => w.seeThrough)).toBe(true);
  });

  it('lets the roof plant break line of sight (hide behind the equipment)', () => {
    for (const q of IKB_PLANT.filter((q) => q.h >= 55)) {
      const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, half = (q.x1 - q.x0) / 2 + 20;
      expect(lineOfSight(cx - half, q.y + EYE, cz, cx + half, q.y + EYE, cz), q.id).toBe(false);
    }
  });
});

describe('Ikebukuro reforge: as drawn', () => {
  /** Just enough of a 2D canvas for the atlas painter (node has none). */
  function fakeDocument() {
    const ctx: Record<string, unknown> = new Proxy({}, {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => {}),
      set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
    });
    return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }

  it('draws the district in a handful of meshes, with the roof equipment instanced, and leaves the world alone', async () => {
    const g = globalThis as unknown as { document?: unknown };
    const had = g.document;
    g.document = fakeDocument();
    try {
      const THREE = await import('three');
      const before = JSON.stringify(WORLD);
      const { buildIkebukuro } = await import('../src/render/ikebukuro');
      const scene = new THREE.Scene();
      const stats = buildIkebukuro(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      expect(scene.children.length).toBeLessThanOrEqual(30);
      expect(stats.instanced).toBeGreaterThanOrEqual(6);
      expect(stats.triangles).toBeLessThan(120000);
      expect(stats.buildings).toBe(IKEBUKURO_BUILT.buildings.length);
      expect(stats.treads).toBeGreaterThan(50);
      expect(stats.fencePanels).toBeGreaterThan(20);
      expect(stats.parapets).toBeGreaterThan(8); // ordinary roof edges drawn as parapets (collision unchanged)
      expect(stats.lamps).toBeGreaterThanOrEqual(1);
    } finally { g.document = had; }
  });

  it('never lights Ikebukuro in a faction colour', async () => {
    const { IKEBUKURO_LIGHTS } = await import('../src/render/ikebukuro');
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    for (const c of IKEBUKURO_LIGHTS) {
      const a = hueOf(c);
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gap, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
  });
});
