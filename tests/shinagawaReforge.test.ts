import { describe, expect, it } from 'vitest';
import {
  BASE_SITES, BLOCKS, BUILDINGS, CROSSWALKS, INTERSECTIONS, JAIL_SITES, LIGHTS, PARKINGS, POLES, SHINAGAWA_BUILT, SIGNALS, STREET_SEGS, WALK_EDGE, WORLD, insideLoop,
} from '../src/config/map';
import {
  ARCH, BOULEVARD, CANOPY, DECK_H, DECK_STAIRS, FORUM, GATEWAY_POINT, PLATFORM, PLATFORM_LANE, SERVICE, SHINAGAWA_LIGHTS, SHINAGAWA_PROPS, SHINAGAWA_ZONE, TRANSIT_DECK,
} from '../src/config/shinagawa';
import { NATIONS } from '../src/config/nations';
import { planPath } from '../src/ai/nav';
import { sectorPoint } from '../src/sim/war';
import { canWalk, lineOfSight, supportHeight, walkLine } from '../src/sim/systems/world';
import { inShinagawa, inTokyoTower, inUeno } from './helpers';
import { inIkebukuro } from '../src/config/ikebukuro';

/**
 * MAP REFORGE parallel C: 品川 rebuilt as FUTURE GATEWAY (layout in config/shinagawa.ts).
 * Shibuya's hash test (tests/shibuyaReforge.test.ts) leaves this area out as well.
 */

/** FNV-1a over the JSON (enough to notice any change). */
const hash = (v: unknown) => {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};
/** Distance from (x, z) to the nearest solid ground-level piece (pavements and things overhead don't count). */
const clearance = (x: number, z: number) => {
  let best = Infinity;
  for (const w of WORLD) {
    if (w.mat === 'sidewalk' || w.y0 > 100) continue;
    const dx = Math.max(Math.abs(x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(z - w.z) - w.d / 2, 0);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
};

describe('Shinagawa reforge: everything outside the district is untouched', () => {
  it('leaves every primitive, lamp, building, pole, street, crossing, block and signal outside the area exactly as on map-reforge-base', () => {
    // Ueno and Ikebukuro (the other parallel reforges, merged in map-reforge-parallel-integrated) are left out too.
    const out = (p: { x: number; z: number }) => !inShinagawa(p) && !inUeno(p) && !inIkebukuro(p.x, p.z) && !inTokyoTower(p);
    const o = <T extends { x: number; z: number }>(a: readonly T[]) => a.filter(out);
    expect({
      world: hash(o(WORLD)), lights: hash(o(LIGHTS)), buildings: hash(o(BUILDINGS)), poles: hash(o(POLES)), streets: hash(o(STREET_SEGS)),
      crossings: hash(o(INTERSECTIONS)), blocks: hash(BLOCKS.filter((b) => out({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }))),
      signals: hash(o(SIGNALS)), zebra: hash(o(CROSSWALKS)), parking: hash(o(PARKINGS)), n: o(WORLD).length,
    }).toEqual({
      // Taken on map-reforge-base (bbe30ec: 渋谷 + 新宿 + 秋葉原) before 品川 was touched, with 上野 and 池袋 left out.
      // 東京タワー (parallel E) is left out as well: re-taken on map-reforge-parallel-integrated (897dc77) with it excluded.
      world: '8b796f7a', lights: '87946cae', buildings: '2f0e8c61', poles: '9cd049e0', streets: 'ef0c1abf',
      crossings: 'ca9d3b4', blocks: 'ca9ee239', signals: '9f744c08', zebra: 'd0e0b952', parking: '4a570927', n: 773,
    });
  });

  it('builds everything new inside the area and inside the walkable city', () => {
    for (const w of WORLD) if (w.group?.startsWith('shg')) expect(inShinagawa(w), `${w.group} at ${w.x},${w.z}`).toBe(true);
    for (const b of SHINAGAWA_BUILT.buildings) {
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) expect(insideLoop(x, z, WALK_EDGE + 10), b.id).toBe(true);
    }
  });
});

describe('Shinagawa reforge: what stays', () => {
  it('keeps the strategic point (品川駅前) where it was, on open ground', () => {
    const p = sectorPoint(8);
    expect(p).toMatchObject({ x: GATEWAY_POINT.x, y: 0, z: GATEWAY_POINT.z });
    expect(clearance(p.x, p.z)).toBeGreaterThan(150);
  });

  it('keeps the STAR base and its LOCK POINT where they were, with nothing built on them', () => {
    expect(BASE_SITES.star).toEqual({ x: -631, z: 5106 });
    expect(JAIL_SITES.star).toEqual({ x: -631, z: 5486 });
    const B = BASE_SITES.star;
    for (const w of WORLD) {
      if (!w.group?.startsWith('shg') && !SHINAGAWA_BUILT.buildings.some((b) => Math.abs((b.x0 + b.x1) / 2 - w.x) < 1 && Math.abs((b.z0 + b.z1) / 2 - w.z) < 1)) continue;
      const inBase = Math.abs(w.x - B.x) < 250 + w.w / 2 && Math.abs(w.z - B.z) < 250 + w.d / 2;
      expect(inBase, `${w.group ?? w.mat} at ${w.x},${w.z}`).toBe(false);
    }
    // The base square stays at street level (no pavement laid on it).
    expect(supportHeight(B.x, B.z - 240, 10)).toBe(0);
  });
});

describe('Shinagawa reforge: A. GATEWAY BOULEVARD', () => {
  it('runs one clear straight from the city street to the LIGHT PLATFORM, under the arch', () => {
    const z = (BOULEVARD.road0 + BOULEVARD.road1) / 2;
    // ≥ 1,500 units (≈ 60 m) of unbroken running and an unbroken view along it.
    expect(GATEWAY_POINT.x - 40 - BOULEVARD.x0).toBeGreaterThan(1500);
    for (let x = BOULEVARD.x0 + 10; x < 60; x += 40) expect(canWalk({ x, y: 0, z }, x + 40, 0, z), `at x ${x}`).toBe(true);
    for (const dz of [-80, 0, 80]) expect(lineOfSight(BOULEVARD.x0 + 20, 40, z + dz, 40, 40, z + dz), `view at z ${z + dz}`).toBe(true);
  });

  it('keeps the walks and the road clear of furniture in the middle', () => {
    for (const w of WORLD) {
      if (w.y0 > 100 || w.mat === 'sidewalk' || !inShinagawa(w)) continue;
      const overRoad = w.x + w.w / 2 > BOULEVARD.x0 && w.x - w.w / 2 < -470 && w.z + w.d / 2 > BOULEVARD.road0 && w.z - w.d / 2 < BOULEVARD.road1;
      expect(overRoad, `${w.mat} ${w.group ?? ''} at ${w.x},${w.z}`).toBe(false);
    }
  });
});

describe('Shinagawa reforge: LIGHT PLATFORM', () => {
  it('furnishes the platform but leaves its fast lane (arch to point) empty and runnable', () => {
    const L = PLATFORM_LANE, P = GATEWAY_POINT;
    expect(SHINAGAWA_PROPS.filter((p) => p.x > PLATFORM.x0 && p.z > PLATFORM.z0 && p.z < PLATFORM.z1).length).toBeGreaterThanOrEqual(12);
    for (const w of WORLD) {
      if (w.y0 > 100 || w.mat === 'sidewalk' || !inShinagawa(w)) continue;
      const inLane = w.x + w.w / 2 > ARCH.x1 && w.x - w.w / 2 < P.x && w.z + w.d / 2 > L.z0 && w.z - w.d / 2 < L.z1;
      expect(inLane, `${w.mat} ${w.group ?? ''} at ${w.x},${w.z}`).toBe(false);
    }
    for (const z of [L.z0 + 20, (L.z0 + L.z1) / 2, L.z1 - 20]) {
      for (let x = ARCH.x1 + 10; x < P.x - 160; x += 20) expect(canWalk({ x, y: 0, z }, x + 20, 0, z), `x ${x} z ${z}`).toBe(true);
    }
  });
});

describe('Shinagawa reforge: B. TRANSIT DECK', () => {
  const from = { ...NATIONS.star.base, y: 0 };
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

  it.each([
    ['the deck (west end)', { x: -1550, y: DECK_H, z: 4260 }],
    ['the deck under the arch', { x: -520, y: DECK_H, z: 4260 }],
    ['the north frontage', { x: -1000, y: 4, z: 3930 }],
    ['inside GLASS FORUM', { x: -965, y: 4, z: 4085 }],
    ['the service corridor (west)', { x: -1500, y: 4, z: 4950 }],
    ['the service corridor (middle)', { x: -1080, y: 4, z: 4850 }],
    ['the LIGHT PLATFORM (strategic point)', { x: GATEWAY_POINT.x, y: 0, z: GATEWAY_POINT.z }],
  ])('reaches %s on foot from the STAR base', (_name, goal) => {
    const b = walkTo(goal);
    expect(Math.abs(b.y - goal.y)).toBeLessThan(6);
    expect(Math.hypot(b.x - goal.x, b.z - goal.z)).toBeLessThan(60);
  });

  it('has exactly three ways off, each no steeper than a footbridge stair', () => {
    expect(DECK_STAIRS.length).toBe(3);
    for (const s of DECK_STAIRS) {
      const along = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
      expect((DECK_H - s.low) / along).toBeLessThanOrEqual(0.55);
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const low = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z0 + 4 : s.z1 - 4 } : { x: s.dir === 1 ? s.x0 + 4 : s.x1 - 4, z: cz };
      const top = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z1 + 10 : s.z0 - 10 } : { x: s.dir === 1 ? s.x1 + 10 : s.x0 - 10, z: cz };
      expect(supportHeight(low.x, low.z, 14)).toBeLessThan(14);
      expect(supportHeight(top.x, top.z, DECK_H + 5)).toBe(DECK_H);
    }
    // Railed everywhere else: walking off the side of the deck is blocked.
    for (let x = TRANSIT_DECK.x0 + 30; x < TRANSIT_DECK.x1 - 30; x += 60) {
      expect(canWalk({ x, y: DECK_H, z: TRANSIT_DECK.z1 - 12 }, x, DECK_H, TRANSIT_DECK.z1 + 30), `south rail at x ${x}`).toBe(false);
    }
  });

  it('runs beside the boulevard: the deck and the street see each other, with head room under it', () => {
    const z = (BOULEVARD.road0 + BOULEVARD.road1) / 2;
    for (const x of [-1400, -1000, -700]) {
      expect(lineOfSight(x, DECK_H + 40, 4290, x, 40, z), `deck ↔ street at x ${x}`).toBe(true);
      expect(supportHeight(x + 100, 4260, 10)).toBe(4); // the colonnade walk under the deck
      expect(canWalk({ x: x + 100, y: 4, z: 4250 }, x + 140, 4, 4250)).toBe(true);
    }
  });
});

describe('Shinagawa reforge: C. SERVICE CORRIDOR and the arch', () => {
  it('keeps every corridor section and cut at least 100 wide (≥ 76 clear for a body)', () => {
    for (const s of SERVICE) expect(Math.min(s.x1 - s.x0, s.z1 - s.z0), s.id).toBeGreaterThanOrEqual(60);
    for (const s of SERVICE.filter((k) => k.id !== 'east')) {
      const across = s.x1 - s.x0 < s.z1 - s.z0 ? 'x' : 'z';
      const mid = across === 'x' ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2;
      // Walk across the section: free for at least 90.
      let free = 0;
      for (let t = (across === 'x' ? s.x0 : s.z0) + 2; t < (across === 'x' ? s.x1 : s.z1) - 2; t += 2) {
        const [x, z] = across === 'x' ? [t, mid] : [mid, t];
        if (supportHeight(x, z, 10) <= 4 && canWalk({ x, y: 4, z }, x, 4, z)) free += 2;
      }
      expect(free, s.id).toBeGreaterThanOrEqual(76);
    }
  });

  it('lets you run straight out of both cuts onto the boulevard road (nothing parked in the mouth)', () => {
    for (const id of ['cutA', 'cutB']) {
      const c = SERVICE.find((k) => k.id === id)!;
      for (const x of [(c.x0 + c.x1) / 2 - 20, (c.x0 + c.x1) / 2, (c.x0 + c.x1) / 2 + 20]) {
        for (let z = c.z1 - 60; z > BOULEVARD.road1 - 20; z -= 20) {
          const y0 = supportHeight(x, z, 10), y1 = supportHeight(x, z - 20, 10);
          expect(canWalk({ x, y: y0, z }, x, y1, z - 20), `${id} x ${x} z ${z}`).toBe(true);
        }
      }
    }
  });

  it('breaks the line of sight: the two corridor sections, and the boulevard behind the south row', () => {
    // West section ↔ middle section (offset by a building).
    expect(lineOfSight(-1600, 40, 4950, -1000, 40, 4950)).toBe(false);
    expect(lineOfSight(-1600, 40, 4850, -1000, 40, 4850)).toBe(false);
    // From the boulevard, the corridor is hidden behind the south row.
    expect(lineOfSight(-1450, 40, 4480, -1450, 40, 4950)).toBe(false);
    expect(lineOfSight(-1080, 40, 4480, -1080, 40, 4850)).toBe(false);
    // …and the cuts lead straight back onto the boulevard.
    expect(lineOfSight(-1260, 40, 4980, -1260, 40, 4480)).toBe(true);
    expect(lineOfSight(-910, 40, 4880, -910, 40, 4480)).toBe(true);
  });

  it('lets a runner duck behind a pier of GATEWAY ARCH out of sight of the boulevard', () => {
    expect(lineOfSight(-1400, 40, 4600, -440, 40, 4680)).toBe(false);
    expect(lineOfSight(-1400, 40, 4480, -440, 40, 4480)).toBe(true); // through the gate itself it is open
    // The deck passes under the lintel with room to spare.
    expect(ARCH.lintel0 - DECK_H).toBeGreaterThan(150);
    expect(supportHeight((ARCH.x0 + ARCH.x1) / 2, 4260, DECK_H + 5)).toBe(DECK_H);
  });

  it('lets you run straight through GLASS FORUM (and see through its glass)', () => {
    expect(canWalk({ x: FORUM.doorN.at, y: 4, z: FORUM.z0 - 30 }, FORUM.doorN.at, 4, FORUM.z1 + 30)).toBe(true);
    expect(lineOfSight(FORUM.x0 - 60, 40, 4100, FORUM.x1 - 40, 40, 4100)).toBe(true);
    expect(canWalk({ x: FORUM.x0 - 30, y: 4, z: 4010 }, FORUM.x0 + 30, 4, 4010)).toBe(false);
    // The canopy over the plaza is out of reach (no floor up there to get stuck on).
    expect(supportHeight((CANOPY.x0 + CANOPY.x1) / 2, (CANOPY.z0 + CANOPY.z1) / 2, CANOPY.y + 50)).toBe(0);
  });
});

describe('Shinagawa reforge: as drawn', () => {
  /** Just enough of a 2D canvas for the atlas painter (node has none). */
  function fakeDocument() {
    const ctx: Record<string, unknown> = new Proxy({}, {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
      set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
    });
    return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }

  it('draws the district in a bounded number of meshes and triangles, with far detail dropped, and leaves the world alone', async () => {
    const g = globalThis as unknown as { document?: unknown };
    const had = g.document;
    g.document = fakeDocument();
    try {
      const THREE = await import('three');
      const before = JSON.stringify(WORLD);
      const { buildShinagawa } = await import('../src/render/shinagawa');
      const scene = new THREE.Scene();
      const stats = buildShinagawa(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      expect(scene.children.length).toBeLessThanOrEqual(30);
      expect(stats.triangles).toBeLessThan(70000);
      expect(stats.buildings).toBe(SHINAGAWA_BUILT.buildings.length);
      // Small repeated pieces are instanced; near detail sits in LODs that drop it far away.
      expect(stats.instanced).toBeGreaterThanOrEqual(5);
      expect(stats.lods).toBeGreaterThanOrEqual(3);
      const lods = scene.children.filter((o) => (o as { isLOD?: boolean }).isLOD) as unknown as { levels: { distance: number; object: { children: unknown[] } }[] }[];
      for (const l of lods) {
        expect(l.levels.length).toBe(2);
        expect(l.levels[1].object.children.length).toBe(0);
      }
    } finally { g.document = had; }
  });

  it('never lights Shinagawa in a faction colour', () => {
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, gg = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    for (const c of SHINAGAWA_LIGHTS) {
      const a = hueOf(c);
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gap, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
  });

  it('is the area the zone says', () => {
    expect(SHINAGAWA_ZONE).toEqual({ x0: -1640, z0: 3940, x1: 700, z1: 5060 });
  });
});
