import { describe, expect, it } from 'vitest';
import {
  BASE_SITES, BLOCKS, BUILDINGS, CROSSWALKS, FOOTBRIDGES, INTERSECTIONS, JAIL_SITES, LIGHTS, PARKINGS, POLES, SIGNALS, SITES, STREET_SEGS, UENO_HILL, WIRES, WORLD,
} from '../src/config/map';
import type { Prim, RampPrim } from '../src/config/map';
import {
  CANOPY_WALK, CULTURE_GATE, GREEN_TERRACE, GROVE, HEDGES, HEDGE_H, PLAZA, PROMENADE, RAMP_LANDING, STONE_AXIS, TRUNK, UENO_LIGHTS, UENO_TREES, WALL_H,
  WEST_RAMP, inUenoZone,
} from '../src/config/ueno';
import { NATIONS } from '../src/config/nations';
import { planPath } from '../src/ai/nav';
import { inLight } from '../src/sim/night';
import { SECTORS, sectorPoint } from '../src/sim/war';
import { canWalk, lineOfSight, supportHeight, walkLine } from '../src/sim/systems/world';
import { inIkebukuro } from '../src/config/ikebukuro';
import { inBunkyo, inShinagawa } from './helpers';

/**
 * MAP REFORGE (parallel A): 上野 GREEN HEIGHTS (layout in config/ueno.ts). Everything outside the
 * rebuilt area is hashed against the map-reforge-base map (bbe30ec), taken before Ueno was touched:
 * Shibuya, Shinjuku, Akihabara and the rest of Tokyo included. Ikebukuro and Shinagawa (the other
 * parallel reforges, merged in map-reforge-parallel-integrated) are left out too, and the hashes were
 * taken on bbe30ec with all three areas left out.
 */
const UENO = 4;
// 文京 (tests/bunkyoReforge.test.ts) is left out as well since map-reforge-bunkyo; re-taken on 897dc77 with it left out.
const BEFORE = {
  world: '7d339c70', n: 767, lights: '4f4f6f9f', buildings: 'ea8eb01c', poles: '2ef56886', wires: '52cd249d', streets: '77583c1e', places: 'b6abbd6c',
};
const hash = (v: unknown) => {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};
/** The other parallel reforges (池袋, 品川, 文京). */
const others = (p: { x: number; z: number }) => inIkebukuro(p.x, p.z) || inShinagawa(p) || inBunkyo(p);
const out = (p: { x: number; z: number }) => !inUenoZone(p.x, p.z) && !others(p);
const mine = (p: Prim) => inUenoZone(p.x, p.z);
/** Solids someone on the ground walks into (not floors, not water, not the hill's own terrain). */
const groundSolids = () => WORLD.filter((w) => mine(w) && w.kind === 'box' && w.y0 < 40 && w.y1 > 14 && w.mat !== 'water' && w.mat !== 'sidewalk');
const gap = (a: Prim, b: Prim) => Math.hypot(Math.max(Math.abs(a.x - b.x) - (a.w + b.w) / 2, 0), Math.max(Math.abs(a.z - b.z) - (a.d + b.d) / 2, 0));

describe('Ueno reforge: the rest of Tokyo is untouched', () => {
  it('leaves every primitive, lamp, building, pole, street and place outside Ueno exactly as on map-reforge-base', () => {
    const blk = (b: { x0: number; z0: number; x1: number; z1: number }) => out({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
    expect({
      world: hash(WORLD.filter(out)), n: WORLD.filter(out).length, lights: hash(LIGHTS.filter(out)), buildings: hash(BUILDINGS.filter((b) => (b.outside || !inUenoZone(b.x, b.z)) && !others(b))),
      poles: hash(POLES.filter(out)), wires: hash(WIRES.filter(([a, b]) => out(POLES[a]) && out(POLES[b])).map(([a, b]) => [POLES[a], POLES[b]])),
      streets: hash([STREET_SEGS.filter(out), INTERSECTIONS.filter(out), CROSSWALKS.filter(out), SIGNALS.filter(out), BLOCKS.filter(blk), PARKINGS.filter(out), FOOTBRIDGES]),
      places: hash([BASE_SITES, JAIL_SITES, SECTORS.filter((s) => s.id !== UENO).map((s) => sectorPoint(s.id))]),
    }).toEqual(BEFORE);
  });

  it('keeps LUNA\'s base, its LOCK POINT, the hill and the pond where they were, and the base clear', () => {
    expect(BASE_SITES.moon).toMatchObject({ x: NATIONS.moon.base.x, z: NATIONS.moon.base.z });
    expect(JAIL_SITES.moon).toEqual({ x: 2546, z: -2673 });
    expect(WORLD.filter((w) => w.group === 'hill' && w.kind === 'box')).toContainEqual(expect.objectContaining({ x: UENO_HILL.x, z: UENO_HILL.z, w: 560, d: 560, y1: 130 }));
    expect(WORLD.filter((w) => w.group === 'pond' && inUenoZone(w.x, w.z))).toEqual([expect.objectContaining({ x: 2125, z: -3437, w: 460, d: 340 })]);
    // Nothing of Ueno's stands in LUNA's base (500 × 500).
    const b = BASE_SITES.moon;
    expect(WORLD.filter((w) => mine(w) && Math.abs(w.x - b.x) < 250 + w.w / 2 && Math.abs(w.z - b.z) < 250 + w.d / 2)).toEqual([]);
  });

  it('keeps the strategic point on top of the hill, with nothing standing within its radius', () => {
    const p = sectorPoint(UENO), want = SECTORS[UENO].pointNear;
    expect(Math.hypot(p.x - want.x, p.z - want.z)).toBeLessThan(40);
    expect(p.y).toBe(UENO_HILL.top);
    for (const w of WORLD) {
      if (!mine(w) || w.kind !== 'box' || w.y1 <= UENO_HILL.top + 14 || w.y0 > UENO_HILL.top + 50) continue;
      const dx = Math.max(Math.abs(p.x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(p.z - w.z) - w.d / 2, 0);
      expect(Math.hypot(dx, dz), `${w.group} at ${w.x},${w.z}`).toBeGreaterThan(150);
    }
  });
});

describe('Ueno reforge: three ways up', () => {
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
  const base = { ...NATIONS.moon.base, y: 0 };
  it.each([
    ['the square', { x: 2550, y: 0, z: -3550 }],
    ['GRAND PROMENADE (north end)', { x: 2250, y: 0, z: -4450 }],
    ['the top of the WEST RAMP', { x: 2410, y: 130, z: -4250 }],
    ['GROVE PATH (south)', { x: 2075, y: 0, z: -3870 }],
    ['GROVE PATH (under the trellis)', { x: 2000, y: 0, z: -3960 }],
    ['GROVE PATH (north)', { x: 1990, y: 0, z: -4300 }],
    ['the STONE AXIS landing', { x: 2800, y: 65, z: -3555 }],
    ['GREEN TERRACE', { x: 2800, y: 130, z: -3760 }],
    ['CANOPY WALK (east end)', { x: 3100, y: 0, z: -4430 }],
    ['the east lawn', { x: 3100, y: 0, z: -4000 }],
    ['the strategic point', { ...sectorPoint(UENO) }],
  ])('reaches %s on foot from LUNA\'s base', (_n, goal) => {
    walk(base, goal);
  });

  it('reaches the hilltop from SOL\'s and STAR\'s bases too', () => {
    walk({ ...NATIONS.sun.base, y: 0 }, { ...sectorPoint(UENO) });
    walk({ ...NATIONS.star.base, y: 0 }, { ...sectorPoint(UENO) });
  });

  it('builds the STONE AXIS as one long stair (two flights and a landing) rising onto GREEN TERRACE', () => {
    const flights = WORLD.filter((w): w is RampPrim => w.kind === 'ramp' && w.style === 'stairs' && mine(w));
    expect(flights.length).toBe(2);
    for (const f of flights) {
      expect(f.group).toBe('hill'); // the stair lights (nosings and lanterns) light every Ueno flight, as before
      expect((f.hHigh - f.hLow) / f.d).toBeLessThanOrEqual(0.5);
    }
    const x = (STONE_AXIS.x0 + STONE_AXIS.x1) / 2;
    expect(STONE_AXIS.lower.z1 - STONE_AXIS.upper.z0).toBeGreaterThanOrEqual(320); // long: 320 from foot to terrace
    expect(supportHeight(x, STONE_AXIS.lower.z1 - 4, 10)).toBeLessThan(6);
    expect(supportHeight(x, (STONE_AXIS.landing.z0 + STONE_AXIS.landing.z1) / 2, 70)).toBe(65);
    expect(supportHeight(x, GREEN_TERRACE.z1 - 20, 135)).toBe(130);
    // Lit at its foot in the night rules (the old stair had no lamp at all).
    expect(inLight(x, STONE_AXIS.lower.z1 + 20)).toBe(true);
    // On LUNA's base axis, framed by CULTURE GATE.
    expect(Math.abs(x - NATIONS.moon.base.x)).toBeLessThan(10);
    expect(CULTURE_GATE.x).toBe(x);
  });

  it('climbs the WEST RAMP onto the plateau at a gentle gradient', () => {
    const r = WORLD.find((w): w is RampPrim => w.kind === 'ramp' && w.group === 'uenoRamp')!;
    expect((r.hHigh - r.hLow) / r.d).toBeLessThan(0.45);
    expect(supportHeight((WEST_RAMP.x0 + WEST_RAMP.x1) / 2, RAMP_LANDING.z1 - 30, 135)).toBe(130);
    expect(SITES.hillSlopeFoot.x).toBe((WEST_RAMP.x0 + WEST_RAMP.x1) / 2);
  });

  it('joins A and B through three gaps in the hedge, and all three at the square and on the plateau', () => {
    const hz = [...HEDGES].sort((a, b) => b.z1 - a.z1);
    let gaps = 0;
    for (let i = 0; i < hz.length - 1; i++) if (hz[i].z0 - hz[i + 1].z1 >= 90) gaps++;
    expect(gaps).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < hz.length - 1; i++) {
      const z = (hz[i].z0 + hz[i + 1].z1) / 2;
      expect(canWalk({ x: 2050, y: 0, z }, 2250, 0, z), `gap at z ${z}`).toBe(true);
    }
    // The square reaches the promenade, the grove's south end and the stair foot without leaving the ground.
    expect(canWalk({ x: 2550, y: 0, z: -3660 }, 2250, 0, -3660)).toBe(true);
    expect(canWalk({ x: 2250, y: 0, z: -3646 }, 2080, 0, -3646)).toBe(true);
    expect(canWalk({ x: 2550, y: 0, z: -3381 }, 2800, 0, -3381)).toBe(true);
    // On the plateau: from the ramp's landing to GREEN TERRACE.
    expect(canWalk({ x: 2440, y: 130, z: -4250 }, 2600, 130, -4180)).toBe(true);
    expect(canWalk({ x: 2600, y: 130, z: -4180 }, 2800, 130, -3790)).toBe(true);
  });
});

describe('Ueno reforge: wide views, trees that matter', () => {
  it('keeps GRAND PROMENADE open end to end (a long straight view) and lit at night', () => {
    const x = (PROMENADE.x0 + PROMENADE.x1) / 2;
    expect(lineOfSight(x, 40, PROMENADE.z1 - 20, x, 28, PROMENADE.z0 + 20)).toBe(true); // ~890 long
    expect(groundSolids().filter((w) => w.x + w.w / 2 > PROMENADE.x0 + 1 && w.x - w.w / 2 < PROMENADE.x1 - 1 && w.z + w.d / 2 > PROMENADE.z0 && w.z - w.d / 2 < PROMENADE.z1)).toEqual([]);
    let lit = 0, n = 0;
    for (let z = PROMENADE.z1 - 40; z > PROMENADE.z0 + 40; z -= 40) for (const dx of [-60, 0, 60]) { n++; if (inLight(x + dx, z)) lit++; }
    expect(lit / n).toBeGreaterThan(0.9);
  });

  it('cuts the view across the grove now and then, but never closes it (no maze)', () => {
    // From the promenade, looking west across the grove at someone in it: some lines blocked, many open.
    let blocked = 0, n = 0;
    for (let z = GROVE.z1 - 30; z > GROVE.z0 + 30; z -= 15) {
      n++;
      if (!lineOfSight(2250, 40, z, 1960, 28, z + 40)) blocked++;
    }
    expect(blocked / n).toBeGreaterThan(0.2);
    expect(blocked / n).toBeLessThan(0.7);
    // And the grove is mostly dark at night (no lamp in it).
    let dark = 0, m = 0;
    for (let z = GROVE.z1 - 30; z > GROVE.z0 + 30; z -= 40) for (const x of [1920, 1990]) { m++; if (!inLight(x, z)) dark++; }
    expect(dark / m).toBeGreaterThan(0.6);
  });

  it('sees the square from GREEN TERRACE, and sees over the low walls and hedges from the hill', () => {
    let seen = 0, n = 0;
    for (let x = PLAZA.x0 + 30; x < PLAZA.x1; x += 60) for (let z = PLAZA.z1 - 30; z > -3700; z -= 60) {
      n++;
      if (lineOfSight(2700, 130 + 40, GREEN_TERRACE.z1 + 10, x, 28, z)) seen++;
    }
    expect(seen / n).toBeGreaterThan(0.85);
    expect(HEDGE_H).toBeLessThan(50);
    expect(WALL_H).toBeLessThan(50);
    // From the top of the WEST RAMP, the promenade below is in view.
    expect(lineOfSight(2440, 170, -4200, 2250, 28, -3900)).toBe(true);
  });

  it('uses trunks that hide someone for a moment, spaced so the grove is never a thicket', () => {
    const trunks = WORLD.filter((w) => w.group === 'uenoTree');
    expect(trunks.length).toBe(UENO_TREES.length);
    for (const t of trunks) expect(t.w).toBe(TRUNK);
    // Standing right behind a trunk breaks the line of sight from the far side.
    const t = trunks.find((w) => w.y0 === 0)!;
    expect(lineOfSight(t.x - 200, 40, t.z, t.x + 20, 28, t.z)).toBe(false);
    expect(lineOfSight(t.x - 200, 40, t.z + 40, t.x + 20, 28, t.z + 40)).toBe(true);
    for (let i = 0; i < trunks.length; i++) for (let j = i + 1; j < trunks.length; j++) {
      if (trunks[i].y0 !== trunks[j].y0) continue;
      expect(gap(trunks[i], trunks[j])).toBeGreaterThan(70);
    }
  });

  it('leaves no squeeze between solids: pieces either touch or leave room to pass (ground and plateau)', () => {
    const levels = [groundSolids(), WORLD.filter((w) => mine(w) && w.kind === 'box' && w.y0 >= 120 && w.y0 < 140 && w.y1 > 144)];
    for (const list of levels) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const g = gap(list[i], list[j]);
        if (g === 0) continue;
        expect(g, `${list[i].group}@${list[i].x},${list[i].z} – ${list[j].group}@${list[j].x},${list[j].z}`).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('keeps CANOPY WALK a broad walk between the trees and the cliff', () => {
    for (let x = CANOPY_WALK.x0 + 40; x < CANOPY_WALK.x1 - 40; x += 40) {
      expect(canWalk({ x, y: 0, z: -4430 }, x + 40, 0, -4430), `x ${x}`).toBe(true);
    }
    expect(lineOfSight(2200, 40, -4430, 3180, 28, -4430)).toBe(true);
  });
});

describe('Ueno reforge: as drawn', () => {
  /** Just enough of a 2D canvas for the sign atlas painter (node has none). */
  function fakeDocument() {
    const ctx: Record<string, unknown> = new Proxy({}, {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => {}),
      set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
    });
    return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }

  it('draws the park in a handful of meshes, a bounded triangle budget, and leaves the world alone', async () => {
    const g = globalThis as unknown as { document?: unknown };
    const had = g.document;
    g.document = fakeDocument();
    try {
      const THREE = await import('three');
      const before = JSON.stringify(WORLD);
      const { buildUeno } = await import('../src/render/ueno');
      const scene = new THREE.Scene();
      const stats = buildUeno(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      expect(scene.children.length).toBe(stats.meshes);
      expect(stats.meshes).toBeLessThanOrEqual(18);
      expect(stats.triangles).toBeLessThan(30000);
      expect(stats.trees).toBe(UENO_TREES.length);
      expect(stats.lamps).toBeGreaterThanOrEqual(10);
    } finally { g.document = had; }
  });

  it('never lights Ueno in a faction colour', () => {
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    for (const c of UENO_LIGHTS) {
      const a = hueOf(c);
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gp = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gp, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
  });
});
