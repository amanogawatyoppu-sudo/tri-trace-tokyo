import { describe, expect, it } from 'vitest';
import { BASE_SITES, BUNKYO_BUILT, JAIL_SITES, WALK_EDGE, WORLD, insideLoop } from '../src/config/map';
import {
  BEND_CORNER, BEND_H, BUNKYO_LIGHTS, BUNKYO_ZONE, FORK, RIDGE_H, RIDGE_ROAD, SLOPES, SPOTS, WALL_PATH,
} from '../src/config/bunkyo';
import { NATIONS } from '../src/config/nations';
import { planPath } from '../src/ai/nav';
import { sectorPoint } from '../src/sim/war';
import { canWalk, lineOfSight, supportHeight, walkLine } from '../src/sim/systems/world';
import { inBunkyo } from './helpers';

/**
 * MAP REFORGE parallel D: 文京 rebuilt as QUIET SLOPES (layout in config/bunkyo.ts).
 * Everything outside the zone is covered by the other districts' hash tests (Bunkyo is left out of
 * each of them, re-taken on 897dc77).
 */

const EYE = 40;
const ground = (p: { x: number; z: number }, hint = RIDGE_H + 5) => supportHeight(p.x, p.z, hint);

describe('Bunkyo reforge: what stays', () => {
  it('builds everything new inside the zone and inside the walkable city', () => {
    for (const w of WORLD) if (w.group?.startsWith('bunkyo')) expect(inBunkyo(w), `${w.group} at ${w.x},${w.z}`).toBe(true);
    for (const h of BUNKYO_BUILT.houses) {
      for (const [x, z] of [[h.x0, h.z0], [h.x1, h.z0], [h.x0, h.z1], [h.x1, h.z1]]) expect(insideLoop(x, z, WALK_EDGE + 10), h.id).toBe(true);
    }
  });

  it('keeps the strategic point (東京ドーム前), the bases and the LOCK POINTs where they were', () => {
    expect(sectorPoint(3)).toEqual({ x: 1092, y: 0, z: -2599 });
    expect(inBunkyo(sectorPoint(3))).toBe(false);
    expect(BASE_SITES).toEqual({ sun: { x: -3157, z: -1166 }, moon: { x: 2796, z: -3053 }, star: { x: -631, z: 5106 } });
    expect(JAIL_SITES).toEqual({ sun: { x: -3137, z: -1586 }, moon: { x: 2546, z: -2673 }, star: { x: -631, z: 5486 } });
    for (const s of [...Object.values(BASE_SITES), ...Object.values(JAIL_SITES)]) expect(inBunkyo(s)).toBe(false);
  });

  it('is the area the zone says', () => {
    expect(BUNKYO_ZONE).toEqual({ x0: -980, z0: -4632, x1: 480, z1: -3291 });
  });
});

describe('Bunkyo reforge: the ground', () => {
  it('stands the ridge at 104 and STONE BEND\'s corner at 70', () => {
    expect(ground(SPOTS.ridgeNorth)).toBe(RIDGE_H);
    expect(ground(SPOTS.ridgeMid)).toBe(RIDGE_H);
    expect(ground(SPOTS.terrace)).toBe(RIDGE_H);
    expect(ground(SPOTS.fork)).toBe(RIDGE_H);
    expect(ground({ x: (BEND_CORNER.x0 + BEND_CORNER.x1) / 2, z: (BEND_CORNER.z0 + BEND_CORNER.z1) / 2 }, BEND_H + 5)).toBe(BEND_H);
    for (const p of [SPOTS.lowMid, SPOTS.wallMid, SPOTS.wallNorth, SPOTS.bendFoot, SPOTS.court]) expect(ground(p, 10)).toBeLessThanOrEqual(4);
  });

  it('keeps every slope and stair no steeper than 0.55 and joined at both ends', () => {
    for (const s of SLOPES) {
      const along = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
      expect((s.high - s.low) / along, s.id).toBeLessThanOrEqual(0.55);
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const lowEnd = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z0 - 10 : s.z1 + 10 } : { x: s.dir === 1 ? s.x0 - 10 : s.x1 + 10, z: cz };
      const highEnd = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z1 + 10 : s.z0 - 10 } : { x: s.dir === 1 ? s.x1 + 10 : s.x0 - 10, z: cz };
      expect(Math.abs(ground(lowEnd, s.low + 5) - s.low), `${s.id} low end`).toBeLessThanOrEqual(4);
      expect(ground(highEnd, s.high + 5), `${s.id} high end`).toBe(s.high);
      // Walk it end to end, both ways, in small steps.
      const n = Math.ceil(along / 20);
      let b = { x: lowEnd.x, y: ground(lowEnd, s.low + 5), z: lowEnd.z };
      for (let i = 1; i <= n; i++) {
        const t = i / n, x = lowEnd.x + (highEnd.x - lowEnd.x) * t, z = lowEnd.z + (highEnd.z - lowEnd.z) * t;
        const y = ground({ x, z }, b.y + 14);
        expect(canWalk(b, x, y, z), `${s.id} up at ${x},${z}`).toBe(true);
        b = { x, y, z };
      }
      expect(b.y, `${s.id} reaches the top`).toBe(s.high);
    }
  });

  it('guards the ridge\'s open cliff edges (no walking off the RIDGE ROAD onto the LOW ROAD)', () => {
    for (let z = RIDGE_ROAD.z0 + 40; z < RIDGE_ROAD.z1 - 20; z += 60) {
      if (z > FORK.z0 && z < FORK.z1) continue;
      expect(canWalk({ x: RIDGE_ROAD.x1 - 16, y: RIDGE_H, z }, RIDGE_ROAD.x1 + 30, RIDGE_H, z), `edge at z ${z}`).toBe(false);
    }
  });
});

describe('Bunkyo reforge: three routes, all joined, no dead ends', () => {
  const walk = (from: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }) => {
    const pts = planPath(from, goal);
    expect(pts, `path ${from.x},${from.z} → ${goal.x},${goal.z}`).not.toBeNull();
    let b = { ...from };
    for (const p of pts!) {
      expect(canWalk(b, p.x, p.y, p.z), `step to ${p.x},${p.y},${p.z}`).toBe(true);
      b = walkLine(b, p.x, p.z);
      b.y = supportHeight(b.x, b.z, b.y);
    }
    return b;
  };
  const at = (p: { x: number; z: number }) => ({ x: p.x, y: ground(p), z: p.z });
  const ROUTES: [string, { x: number; z: number }][] = [
    ['A. RIDGE ROAD (north)', SPOTS.ridgeNorth],
    ['A. RIDGE ROAD (middle)', SPOTS.ridgeMid],
    ['RIDGE TERRACE', SPOTS.terrace],
    ['B. the fork of the TWIN SLOPES', SPOTS.fork],
    ['B. STONE BEND foot', SPOTS.bendFoot],
    ['C. WALL PATH (north)', SPOTS.wallNorth],
    ['C. WALL PATH (middle)', SPOTS.wallMid],
    ['C. WALL PATH (south)', SPOTS.wallSouth],
    ['LOW ROAD (north)', SPOTS.lowNorth],
    ['LOW ROAD (south)', SPOTS.lowSouth],
    ['SLOPE GATE foot', SPOTS.gateFoot],
    ['QUIET COURT', SPOTS.court],
  ];

  it.each(ROUTES)('an AI reaches %s from the LUNA base, and gets from there to the strategic point', (_n, p) => {
    const goal = at(p);
    const b = walk({ ...NATIONS.moon.base, y: 0 }, goal);
    expect(Math.abs(b.y - goal.y)).toBeLessThan(6);
    expect(Math.hypot(b.x - goal.x, b.z - goal.z)).toBeLessThan(60);
    const sp = sectorPoint(3);
    const c = walk(goal, sp);
    expect(Math.hypot(c.x - sp.x, c.z - sp.z)).toBeLessThan(60);
  });

  it('gets from the district to the SOL and STAR bases too', () => {
    for (const n of ['sun', 'star'] as const) {
      const base = { ...NATIONS[n].base, y: 0 };
      const b = walk(at(SPOTS.wallMid), base);
      expect(Math.hypot(b.x - base.x, b.z - base.z), n).toBeLessThan(60);
    }
  });

  it('joins the routes at several places (ridge ↔ slope lane ↔ wall path ↔ low road)', () => {
    const joins: [{ x: number; z: number }, { x: number; z: number }][] = [
      [SPOTS.wallMid, SPOTS.ridgeMid], // KAMI-ZAKA / NAKA-ZAKA
      [SPOTS.ridgeMid, SPOTS.lowMid], // TWIN SLOPES
      [SPOTS.gateFoot, SPOTS.ridgeNorth], // SLOPE GATE
      [SPOTS.bendFoot, SPOTS.terrace], // STONE BEND
      [SPOTS.terrace, SPOTS.lowSouth], // TERRACE STAIR and the river lane
    ];
    for (const [a, b] of joins) {
      const pts = planPath(at(a), at(b));
      expect(pts, `${a.x},${a.z} → ${b.x},${b.z}`).not.toBeNull();
      // A direct join, not a detour round the district (which is ≈ 1,460 × 1,340): at most down a
      // TWIN SLOPE and back along the LOW ROAD.
      let len = 0, prev = at(a);
      for (const p of pts!) { len += Math.hypot(p.x - prev.x, p.z - prev.z); prev = { x: p.x, y: p.y, z: p.z }; }
      expect(len, `${a.x},${a.z} → ${b.x},${b.z}`).toBeLessThan(1300);
    }
  });

  it('leaves no dead end on the WALL PATH: both ends of every section lead on', () => {
    for (const s of WALL_PATH) {
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const ends = s.x1 - s.x0 > s.z1 - s.z0 ? [{ x: s.x0 + 30, z: cz }, { x: s.x1 - 30, z: cz }] : [{ x: cx, z: s.z0 + 30 }, { x: cx, z: s.z1 - 30 }];
      for (const e of ends) {
        // Each end is open to at least two directions (a corridor goes on, a corner turns): count
        // the free 40-unit steps out of it.
        let open = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const y = ground(e, 10);
          if (canWalk({ x: e.x, y, z: e.z }, e.x + dx * 40, ground({ x: e.x + dx * 40, z: e.z + dz * 40 }, y + 14), e.z + dz * 40)) open++;
        }
        expect(open, `${s.id} end at ${e.x},${e.z}`).toBeGreaterThanOrEqual(2);
      }
    }
    // The long section runs unbroken under the 石垣 from the jog down its middle, then steps west
    // round the last pole's line and straight onto the foot of STONE BEND (which climbs east from there).
    const L = WALL_PATH[2], mx = (L.x0 + L.x1) / 2;
    const line: [number, number][] = [[mx, L.z0 + 10], [mx, L.z1 - 30], [L.x0 + 18, L.z1 - 30], [L.x0 + 18, -3475], [-700, -3475]];
    let b = { x: line[0][0], y: 0, z: line[0][1] };
    for (const [x, z] of line.slice(1)) {
      const y = ground({ x, z }, b.y + 14);
      expect(canWalk(b, x, y, z), `to ${x},${z}`).toBe(true);
      b = { x, y, z };
    }
  });
});

describe('Bunkyo reforge: sight', () => {
  it('hides the RIDGE ROAD from the foot of SLOPE GATE: over the crest the runner drops out of view', () => {
    const f = SPOTS.gateFoot;
    expect(lineOfSight(f.x, EYE, f.z, SPOTS.ridgeMid.x, RIDGE_H + EYE, SPOTS.ridgeMid.z)).toBe(false);
    expect(lineOfSight(f.x, EYE, f.z, f.x, EYE + 30, -4450)).toBe(true); // up the slope itself is open
  });

  it('hides a runner going down the far side of the ridge from the foot of KAMI-ZAKA', () => {
    // On TWIN SLOPES (N), a third of the way down from the LOW ROAD.
    expect(lineOfSight(-600, EYE, -4120, -70, 36 + EYE, -4150)).toBe(false);
    // …but once on the ridge, the lane below is in plain view.
    expect(lineOfSight(SPOTS.ridgeNorth.x, RIDGE_H + EYE, -4150, -70, 36 + EYE, -4150)).toBe(true);
  });

  it('lets the high road and the low road watch each other through the guard fence', () => {
    for (const z of [-4200, -4100, -4000]) {
      expect(lineOfSight(-140, RIDGE_H + EYE, z, 60, EYE, z), `ridge → low road at z ${z}`).toBe(true);
      expect(lineOfSight(60, EYE, z, -140, RIDGE_H + EYE, z), `low road → ridge at z ${z}`).toBe(true);
    }
    // Further south the ridge looks down on TWIN SLOPES (S), and RIDGE TERRACE over the valley.
    expect(lineOfSight(-140, RIDGE_H + EYE, -3600, -70, 60 + EYE, -3600)).toBe(true);
    expect(lineOfSight(SPOTS.terrace.x, RIDGE_H + EYE, SPOTS.terrace.z, SPOTS.lowSouth.x, EYE, SPOTS.lowSouth.z)).toBe(true);
  });

  it('cuts sight along the WALL PATH: the 石垣 hides it from the ridge and its corner hides the north section', () => {
    // From the RIDGE ROAD the WALL PATH is behind the houses on the ridge.
    expect(lineOfSight(SPOTS.ridgeMid.x, RIDGE_H + EYE, SPOTS.ridgeMid.z, SPOTS.wallMid.x, EYE, SPOTS.wallMid.z)).toBe(false);
    // Round the jog: from the long section a runner who turns west into the jog, or keeps to the
    // far side of the north section, is out of sight (only a narrow diagonal past the corner is open).
    expect(lineOfSight(SPOTS.wallMid.x, EYE, SPOTS.wallMid.z, -950, EYE, -4280)).toBe(false);
    expect(lineOfSight(SPOTS.wallMid.x, EYE, SPOTS.wallMid.z, -860, EYE, -4560)).toBe(false);
    expect(lineOfSight(SPOTS.wallSouth.x, EYE, SPOTS.wallSouth.z, SPOTS.wallNorth.x, EYE, SPOTS.wallNorth.z)).toBe(false);
    // The side lane is a straight crossing; from further down the path it is round a corner.
    expect(lineOfSight(SPOTS.wallSouth.x, EYE, SPOTS.wallSouth.z, -940, EYE, -3955)).toBe(false);
    // From the LOW ROAD the WALL PATH is behind the whole ridge.
    expect(lineOfSight(SPOTS.lowMid.x, EYE, SPOTS.lowMid.z, SPOTS.wallMid.x, EYE, SPOTS.wallMid.z)).toBe(false);
  });
});

describe('Bunkyo reforge: as drawn', () => {
  /** Just enough of a 2D canvas for the texture painter (node has none). */
  function fakeDocument() {
    const ctx: Record<string, unknown> = new Proxy({}, {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop: () => {} }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' || k === 'createImageData' ? (w = 1, h = 1) => ({ data: new Uint8ClampedArray(4 * w * h) }) : () => {}),
      set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
    });
    return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }

  it('draws the district in a bounded number of meshes and triangles and leaves the world alone', async () => {
    const g = globalThis as unknown as { document?: unknown };
    const had = g.document;
    g.document = fakeDocument();
    try {
      const THREE = await import('three');
      const before = JSON.stringify(WORLD);
      const { buildBunkyo } = await import('../src/render/bunkyo');
      const scene = new THREE.Scene();
      const stats = buildBunkyo(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      expect(stats.meshes).toBeLessThanOrEqual(45);
      expect(stats.triangles).toBeLessThan(60000);
      expect(stats.houses).toBe(BUNKYO_BUILT.houses.length);
      expect(stats.instanced).toBeGreaterThanOrEqual(5);
    } finally { g.document = had; }
  });

  it('lights Bunkyo only in warm house-lamp colours, never a faction colour', () => {
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, gg = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    for (const c of BUNKYO_LIGHTS) {
      const a = hueOf(c);
      expect(a.h < 50 || a.s < 0.1, c.toString(16)).toBe(true);
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gap, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
  });
});
