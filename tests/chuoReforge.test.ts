import { describe, expect, it } from 'vitest';
import {
  BASE_SITES, BLOCKS, BUILDINGS, CROSSWALKS, FOOTBRIDGES, INTERSECTIONS, JAIL_SITES, LIGHTS, PARKINGS, POLES, SIGNALS, STREET_SEGS, TOWER, WALK_EDGE, WIRES, WORLD,
  insideLoop,
} from '../src/config/map';
import {
  ANNEXES, AXIS, CHUO_LIGHTS, CHUO_ZONE, CONTROL_POINT, CORE, CORE_BACK, CORE_COURT, CORE_UNIT, CORE_ZONE_R, DATA_WALL, GATES, HALLS, HALL_LANES, PLAZA, RING, RING_LANES, TERRACES, TERRACE_STEP,
} from '../src/config/chuo';
import { SHIBUYA_ZONES } from '../src/config/shibuya';
import { SHINJUKU_ZONES } from '../src/config/shinjuku';
import { inIkebukuro } from '../src/config/ikebukuro';
import { inUenoZone } from '../src/config/ueno';
import { NATIONS } from '../src/config/nations';
import { navGraph, planPath } from '../src/ai/nav';
import { CENTRAL, SECTORS, sectorPoint } from '../src/sim/war';
import { canWalk, lineOfSight, supportHeight, walkLine } from '../src/sim/systems/world';
import { inAkihabara, inChuo, inShinagawa } from './helpers';

/**
 * MAP REFORGE parallel F: 中央 rebuilt as CONTROL CORE (layout in config/chuo.ts). Everything
 * outside the area is hashed against map-reforge-parallel-integrated (897dc77), taken before Chuo
 * was touched: the six finished districts (渋谷・新宿・秋葉原・上野・池袋・品川) included.
 */

/** FNV-1a over the JSON (enough to notice any change). */
const hash = (v: unknown) => {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};
type P = { x: number; z: number; group?: string };
const out = (p: P) => !inChuo(p);
const inRects = (rs: readonly { x0: number; z0: number; x1: number; z1: number }[]) => (p: P) => rs.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1);
/** The six finished districts, as their own tests draw them. */
const FINISHED: Record<string, (p: P) => boolean> = {
  shibuya: inRects(SHIBUYA_ZONES),
  shinjuku: (p) => inRects(SHINJUKU_ZONES)(p) || p.group === 'sjdeck' || p.group === 'shinjuku',
  akihabara: inAkihabara,
  ueno: (p) => inUenoZone(p.x, p.z),
  ikebukuro: (p) => inIkebukuro(p.x, p.z),
  shinagawa: inShinagawa,
};
/** Taken on 897dc77 (before Chuo was touched) with the same expressions. */
const BEFORE = {
  outside: {
    world: 'f1105245', n: 1162, lights: '2dd04a87', buildings: '9f8ff422', poles: 'b792db12', wires: 'a820035b', streets: 'd648d7f6', places: '17e7cc4f',
  },
  finished: { shibuya: '96b6bebf', shinjuku: 'b15ebda2', akihabara: '7cbc8f0', ueno: 'e972924c', ikebukuro: '1d044565', shinagawa: '53e249a5' } as Record<string, string>,
};

const solidNear = (x: number, z: number, r: number, ground = true) =>
  WORLD.filter((w) => w.mat !== 'sidewalk' && (!ground || w.y0 < 40) && !(w.kind === 'box' && w.y1 <= TERRACE_STEP * 2 && w.group === 'chuoTerrace')
    && Math.hypot(Math.max(Math.abs(x - w.x) - w.w / 2, 0), Math.max(Math.abs(z - w.z) - w.d / 2, 0)) < r);

/** Walks a planned path from `from` to `goal` the way a body moves (every leg must be walkable). */
const walkPath = (from: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }) => {
  const pts = planPath(from, goal);
  expect(pts, `no path to ${goal.x},${goal.z}`).not.toBeNull();
  let b = { ...from };
  for (const p of pts!) {
    expect(canWalk(b, p.x, p.y, p.z), `at ${Math.round(b.x)},${Math.round(b.z)} → ${Math.round(p.x)},${Math.round(p.z)}`).toBe(true);
    b = walkLine(b, p.x, p.z);
    b.y = supportHeight(b.x, b.z, b.y);
  }
  return { end: b, pts: pts! };
};
/** Straight legs a runner takes (each must be walkable from the last). */
const walkLegs = (pts: [number, number][], step = 20) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
      const y0 = supportHeight(x0, z0, 10), y1 = supportHeight(x1, z1, y0 + 12);
      expect(canWalk({ x: x0, y: y0, z: z0 }, x1, y1, z1), `leg ${i} at ${Math.round(x0)},${Math.round(z0)}`).toBe(true);
    }
  }
};

describe('Chuo reforge: everything outside the district is untouched', () => {
  it('leaves every primitive, lamp, building, pole, street and place outside 中央 exactly as on map-reforge-parallel-integrated', () => {
    const blk = (b: { x0: number; z0: number; x1: number; z1: number }) => out({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
    expect({
      world: hash(WORLD.filter(out)), n: WORLD.filter(out).length, lights: hash(LIGHTS.filter(out)), buildings: hash(BUILDINGS.filter((b) => b.outside || out(b))),
      poles: hash(POLES.filter(out)), wires: hash(WIRES.filter(([a, b]) => out(POLES[a]) && out(POLES[b])).map(([a, b]) => [POLES[a], POLES[b]])),
      streets: hash([STREET_SEGS.filter(out), INTERSECTIONS.filter(out), CROSSWALKS.filter(out), SIGNALS.filter(out), BLOCKS.filter(blk), PARKINGS.filter(out), FOOTBRIDGES]),
      places: hash([BASE_SITES, JAIL_SITES, SECTORS.map((s) => sectorPoint(s.id))]),
    }).toEqual(BEFORE.outside);
  });

  it('leaves the six finished districts exactly as they were', () => {
    const got: Record<string, string> = {};
    for (const [k, inside] of Object.entries(FINISHED)) got[k] = hash([WORLD.filter(inside), BUILDINGS.filter(inside), LIGHTS.filter(inside), POLES.filter(inside)]);
    expect(got).toEqual(BEFORE.finished);
    // …and nothing new of Chuo's stands in any of them.
    for (const w of WORLD) if (w.group?.startsWith('chuo')) for (const [k, inside] of Object.entries(FINISHED)) expect(inside(w), `${w.group} in ${k}`).toBe(false);
  });

  it('builds everything new inside the area and inside the walkable city', () => {
    for (const w of WORLD) {
      if (!w.group?.startsWith('chuo')) continue;
      expect(inChuo(w), `${w.group} at ${w.x},${w.z}`).toBe(true);
      for (const [x, z] of [[w.x - w.w / 2, w.z - w.d / 2], [w.x + w.w / 2, w.z - w.d / 2], [w.x - w.w / 2, w.z + w.d / 2], [w.x + w.w / 2, w.z + w.d / 2]]) {
        expect(insideLoop(x, z, WALK_EDGE), `${w.group} corner ${x},${z}`).toBe(true);
      }
    }
    expect(CHUO_ZONE).toEqual({ x0: 700, z0: 160, x1: 2060, z1: 1260 });
  });
});

describe('Chuo reforge: what stays', () => {
  it('keeps the strategic point (日比谷公園) where it was, on open ground', () => {
    expect(sectorPoint(CENTRAL)).toEqual({ x: CONTROL_POINT.x, y: 0, z: CONTROL_POINT.z });
    // The spot itself is clear; cover (pylons, a terrace) stands inside the capture radius, not on it.
    expect(solidNear(CONTROL_POINT.x, CONTROL_POINT.z, 30)).toEqual([]);
  });

  it('builds the CONTROL CORE on the 管制塔: the tower and its zone stay, open and level', () => {
    expect({ x: TOWER.x, z: TOWER.z, r: TOWER.r }).toEqual({ x: CORE.x, z: CORE.z, r: CORE_ZONE_R });
    // Only the control unit (the old mast's footprint) stands in the tower zone.
    const inZone = solidNear(CORE.x, CORE.z, CORE_ZONE_R + 14);
    expect(inZone.map((w) => [w.x, w.z, w.w, w.d])).toEqual([[CORE.x, CORE.z, CORE_UNIT.half * 2, CORE_UNIT.half * 2]]);
    // The ring of ground round the unit (r 66, inside the zone) is level street (the rules count y < 30) and walkable all the way round.
    const ring: [number, number][] = [];
    for (let a = 0; a <= 64; a++) ring.push([CORE.x + Math.cos((a / 64) * Math.PI * 2) * 66, CORE.z + Math.sin((a / 64) * Math.PI * 2) * 66]);
    for (const [x, z] of ring) expect(supportHeight(x, z, 10)).toBe(0);
    walkLegs(ring, 10);
  });

  it('keeps the bases and LOCK POINTs where they were (none in this sector)', () => {
    for (const n of ['sun', 'moon', 'star'] as const) {
      expect(BASE_SITES[n]).toMatchObject({ x: NATIONS[n].base.x, z: NATIONS[n].base.z });
      expect(inChuo(BASE_SITES[n])).toBe(false);
      expect(inChuo(JAIL_SITES[n])).toBe(false);
    }
  });
});

describe('Chuo reforge: A. CORE AXIS', () => {
  it('runs straight from the west edge through WEST GATE and the plaza to the core, open to the eye', () => {
    walkLegs([[AXIS.x0 - 60, CORE.z], [AXIS.x1, CORE.z]]);
    for (const dz of [-60, 0, 60]) walkLegs([[AXIS.x0 - 60, CORE.z + dz], [AXIS.x1 - 20, CORE.z + dz]]);
    for (const dz of [-60, 0, 60]) expect(lineOfSight(AXIS.x0, 40, CORE.z + dz, AXIS.x1, 40, CORE.z + dz), `view at dz ${dz}`).toBe(true);
    // Seen from the far end of the axis, the core itself stands at the end of it.
    expect(lineOfSight(AXIS.x0, 40, CORE.z, CORE.x - CORE_UNIT.half - 2, 120, CORE.z)).toBe(true);
    // Nothing solid in the axis itself (the pylons line it outside).
    for (const w of WORLD) {
      if (!w.group?.startsWith('chuo') || w.y0 > 100) continue;
      const over = w.x + w.w / 2 > AXIS.x0 && w.x - w.w / 2 < AXIS.x1 && w.z + w.d / 2 > AXIS.z0 + 1 && w.z - w.d / 2 < AXIS.z1 - 1;
      expect(over, `${w.group} at ${w.x},${w.z}`).toBe(false);
    }
  });
});

describe('Chuo reforge: B. RING ROUTE', () => {
  const lane = (id: string) => RING_LANES.find((l) => l.id === id)!;
  const mid = (a: number, b: number) => (a + b) / 2;

  it('goes all the way round (behind the core on the east), at least 100 wide everywhere', () => {
    const n = lane('n'), w = lane('w'), s = lane('s'), e = lane('e');
    const yN = mid(n.z0, n.z1), yS = mid(s.z0, s.z1), xW = mid(w.x0, w.x1), xE = mid(e.x0, e.x1);
    walkLegs([[xW, yN], [xE, yN], [xE, 900], [1640, 1000], [1560, yS], [xW, yS], [xW, yN]]);
    for (const l of RING_LANES) expect(Math.min(l.x1 - l.x0, l.z1 - l.z0), l.id).toBeGreaterThanOrEqual(110);
    // Clear across: the north, west and south lanes, and the east lane behind the core.
    const across = (x0: number, z0: number, x1: number, z1: number) => {
      let free = 0;
      const n_ = Math.round(Math.hypot(x1 - x0, z1 - z0) / 2);
      for (let k = 0; k <= n_; k++) {
        const x = x0 + ((x1 - x0) * k) / n_, z = z0 + ((z1 - z0) * k) / n_;
        if (canWalk({ x, y: 0, z }, x, 0, z)) free += 2;
      }
      return free;
    };
    expect(across(1160, n.z0 + 1, 1160, n.z1 - 1)).toBeGreaterThanOrEqual(90);
    expect(across(w.x0 + 1, 900, w.x1 - 1, 900)).toBeGreaterThanOrEqual(90);
    expect(across(1160, s.z0 + 1, 1160, s.z1 - 1)).toBeGreaterThanOrEqual(90);
    expect(across(CORE_BACK.x1 + 1, CORE.z, DATA_WALL.x0 - 1, CORE.z)).toBeGreaterThanOrEqual(90);
    // The SE turn by the tracks.
    expect(across(1560, 1000, 1560 + 140, 1000 - 140)).toBeGreaterThanOrEqual(90);
  });

  it('runs behind the core: the ring sees the core through its glass back but cannot cut through', () => {
    const x = mid(CORE_BACK.x1, DATA_WALL.x0);
    expect(lineOfSight(x, 40, CORE.z + 40, CORE.x + CORE_UNIT.half + 4, 40, CORE.z + 40)).toBe(true);
    expect(canWalk({ x: x, y: 0, z: CORE.z + 40 }, CORE.x + 70, 0, CORE.z + 40)).toBe(false);
  });

  it('is a long way round: the ring from the north gate to the south gate is much longer than straight across', () => {
    const N = GATES.find((g) => g.id === 'north')!, S = GATES.find((g) => g.id === 'south')!;
    const a = { x: mid(N.x0, N.x1), y: 0, z: N.z0 - 60 }, b = { x: mid(S.x0, S.x1), y: 0, z: S.z1 + 60 };
    const straight = walkPath(a, b).pts;
    const len = (pts: { x: number; z: number }[], s: { x: number; z: number }) => pts.reduce((acc, p, i) => acc + Math.hypot(p.x - (i ? pts[i - 1].x : s.x), p.z - (i ? pts[i - 1].z : s.z)), 0);
    const direct = len(straight, a);
    expect(direct).toBeLessThan(800); // straight through the plaza
    // Round the west side of the ring.
    const xW = mid(lane('w').x0, lane('w').x1), ring = Math.abs(a.x - xW) + (b.z - a.z) + Math.abs(b.x - xW);
    expect(ring).toBeGreaterThan(direct * 1.4);
  });
});

describe('Chuo reforge: C. CONTROL PASSAGE', () => {
  it.each(HALLS.map((h) => [h.id, h] as const))('lets you through the %s hall from the ring to the core, weaving between the racks', (_id, h) => {
    const outerZ = h.outer === 'n' ? h.z0 - 40 : h.z1 + 40, innerZ = h.outer === 'n' ? h.z1 + 30 : h.z0 - 30;
    const r0 = h.racks[0], r1 = h.racks[1], L = HALL_LANES;
    const aisle = (r0.z0 + r0.z1 + r1.z0 + r1.z1) / 4 + (h.outer === 'n' ? -35 : 35); // past the aisle's middle column
    walkLegs([[L.in, outerZ], [L.in, aisle], [L.out, aisle], [L.out, innerZ], [CORE.x, h.outer === 'n' ? CORE.z - 50 : CORE.z + 50]], 10);
    // The racks cut the view through the hall for a moment (in from the ring, out at the core).
    // From anywhere in the way in to anywhere in the way out.
    for (const dx of [-40, 0, 40]) for (const dx2 of [-40, 0, 40]) expect(lineOfSight(L.in + dx, 40, outerZ, L.out + dx2, 40, innerZ), `diagonal ${dx},${dx2}`).toBe(false);
    for (let x = 1370; x <= 1590; x += 10) expect(lineOfSight(x, 40, outerZ, x, 40, innerZ), `straight down at x ${x}`).toBe(false);
    // …and the racks really cross: no straight run down the hall.
    expect(r0.x1 - r1.x0).toBeGreaterThanOrEqual(20);
    // Wider than an Akihabara alley at every squeeze (≥ 100 clear past each rack).
    for (const r of h.racks) {
      const gap = r.x0 <= h.walls[0].x1 ? 1600 - r.x1 : r.x0 - h.walls[0].x1;
      expect(gap).toBeGreaterThanOrEqual(110);
    }
    // Covered (a facility interior), the roof out of reach.
    expect(supportHeight(1510, (h.z0 + h.z1) / 2, 60)).toBe(0);
  });

  it('is the short way to the core from outside: shorter than the gate and the plaza', () => {
    const from = { x: 1520, y: 0, z: 180 };
    const viaC = walkPath(from, { x: CORE.x, y: 0, z: CORE.z - 60 }).pts;
    const len = (pts: { x: number; z: number }[]) => pts.reduce((acc, p, i) => acc + Math.hypot(p.x - (i ? pts[i - 1].x : from.x), p.z - (i ? pts[i - 1].z : from.z)), 0);
    // Through the north gate: across to the gate, down into the plaza, along to the core.
    const viaGate = Math.abs(from.x - 1160) + (560 - from.z) + Math.abs(CORE.x - 1160);
    expect(len(viaC)).toBeLessThan(viaGate * 0.75);
  });
});

describe('Chuo reforge: CONTROL CORE from every side', () => {
  it('reaches the core from the west, north, south and the ring (four ways in)', () => {
    const goal = { x: CORE.x - 60, y: 0, z: CORE.z };
    for (const from of [{ x: 600, z: CORE.z }, { x: 1160, z: 100 }, { x: 1160, z: 1300 }, { x: 1690, z: 600 }, { x: 1520, z: 180 }, { x: 1500, z: 1200 }]) {
      const { end } = walkPath({ ...from, y: 0 }, goal);
      expect(Math.hypot(end.x - goal.x, end.z - goal.z), `from ${from.x},${from.z}`).toBeLessThan(60);
    }
    // Three open mouths onto the core court: the plaza (west) and the two halls.
    walkLegs([[CORE_COURT.x0 - 80, CORE.z], [CORE.x - 60, CORE.z]]);
    walkLegs([[HALL_LANES.out, CORE_COURT.z0 - 20], [HALL_LANES.out, CORE_COURT.z0 + 30], [CORE.x, CORE.z - 60]]);
    walkLegs([[HALL_LANES.out, CORE_COURT.z1 + 20], [HALL_LANES.out, CORE_COURT.z1 - 30], [CORE.x, CORE.z + 60]]);
  });

  it('is reached by AI from every base: the core, the point, both halls, the ring behind the core and the gates', () => {
    const goals = [
      { x: CORE.x - 60, y: 0, z: CORE.z }, { x: CONTROL_POINT.x, y: 0, z: CONTROL_POINT.z }, { x: 1510, y: 0, z: 470 }, { x: 1510, y: 0, z: 950 },
      { x: 1690, y: 0, z: CORE.z }, { x: 1160, y: 0, z: 460 }, { x: 1160, y: 0, z: 960 }, { x: 970, y: 0, z: CORE.z }, { x: 880, y: 0, z: 360 }, { x: 880, y: 0, z: 1060 },
    ];
    for (const n of ['sun', 'moon', 'star'] as const) {
      const from = { ...NATIONS[n].base, y: 0 };
      for (const g of goals) {
        const { end } = walkPath(from, g);
        expect(Math.hypot(end.x - g.x, end.z - g.z), `${n} → ${g.x},${g.z}`).toBeLessThan(60);
      }
    }
  });
});

describe('Chuo reforge: no dead ends, no empty field', () => {
  it('connects every walkable spot of the area to the rest (no sealed pockets you can enter, no blind alleys)', () => {
    const g = navGraph();
    const mine = g.nodes.filter((n) => n.reachable && inChuo(n));
    expect(mine.length).toBeGreaterThan(200);
    // Every reachable node in the area can be left two ways (an alley's dead end would have one).
    // The only exceptions are grid nodes squeezed against a slim post (a pillar or pylon): the open
    // floor goes on round the post, which the 50-unit grid cannot see; a handful at most.
    const post = (n: { x: number; z: number }) => WORLD.some((w) => w.group?.startsWith('chuo') && w.w <= 30 && w.d <= 30 && w.y0 < 40 && Math.hypot(n.x - w.x, n.z - w.z) <= 50);
    const single = mine.filter((n) => n.edges.length < 2);
    for (const n of single) expect(post(n), `node ${n.x},${n.z}`).toBe(true);
    expect(single.length).toBeLessThanOrEqual(4);
    // Ground nodes in the area that are not reachable lie only in the sealed strip behind DATA WALL.
    for (const n of g.nodes.filter((k) => !k.reachable && k.y === 0 && inChuo(k))) expect(n.x, `unreachable ${n.x},${n.z}`).toBeGreaterThan(DATA_WALL.x0);
  });

  it('furnishes the plaza: cover everywhere but the axis, no open square wider than 260', () => {
    const solids = WORLD.filter((w) => w.group?.startsWith('chuo') && w.y0 < 40 && (w.kind === 'box' && w.y1 > 30));
    const free = (x0: number, z0: number, s: number) => !solids.some((w) => w.x + w.w / 2 > x0 && w.x - w.w / 2 < x0 + s && w.z + w.d / 2 > z0 && w.z - w.d / 2 < z0 + s);
    for (let x = PLAZA.x0; x + 260 <= PLAZA.x1; x += 10) for (let z = PLAZA.z0; z + 260 <= PLAZA.z1; z += 10) expect(free(x, z, 260), `open 260 at ${x},${z}`).toBe(false);
    // Two raised control terraces (level changes you can step onto anywhere), and cover objects in the plaza.
    for (const t of TERRACES) {
      expect(supportHeight((t.top.x0 + t.top.x1) / 2, (t.top.z0 + t.top.z1) / 2, 30)).toBe(TERRACE_STEP * 2);
      walkLegs([[t.x1 + 30, (t.top.z0 + t.top.z1) / 2], [(t.top.x0 + t.top.x1) / 2, (t.top.z0 + t.top.z1) / 2]], 6);
    }
    expect(solids.filter((w) => w.x > PLAZA.x0 && w.x < PLAZA.x1 && w.z > PLAZA.z0 && w.z < PLAZA.z1).length).toBeGreaterThanOrEqual(12);
  });

  it('frames the ring with annexes and gaps: every way in stays open', () => {
    expect(ANNEXES.length).toBe(6);
    // The ways in from outside: the axis (west), the north and south gates, and both sides of the core (C).
    walkLegs([[1160, 100], [1160, 560]]);
    walkLegs([[1160, 1320], [1160, 860]]);
    walkLegs([[1520, 140], [1520, RING.z0 + 60]]);
    walkLegs([[1500, 1250], [1500, RING.z1 - 60]]);
  });
});

describe('Chuo reforge: as drawn', () => {
  /** Just enough of a 2D canvas for the atlas painter (node has none). */
  function fakeDocument() {
    const ctx: Record<string, unknown> = new Proxy({}, {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
      set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
    });
    return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }

  it('draws the district in a bounded number of meshes and triangles, instanced, with far detail dropped, and leaves the world alone', async () => {
    const g = globalThis as unknown as { document?: unknown };
    const had = g.document;
    g.document = fakeDocument();
    try {
      const THREE = await import('three');
      const before = JSON.stringify(WORLD);
      const { buildChuo } = await import('../src/render/chuo');
      const scene = new THREE.Scene();
      const stats = buildChuo(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      expect(scene.children.length).toBeLessThanOrEqual(24);
      expect(stats.triangles).toBeLessThan(60000);
      expect(stats.annexes).toBe(ANNEXES.length);
      expect(stats.instanced).toBeGreaterThanOrEqual(4);
      expect(stats.lods).toBe(2);
      expect(stats.flag.material.color).toBeDefined();
      const lods = scene.children.filter((o) => (o as { isLOD?: boolean }).isLOD) as unknown as { levels: { distance: number; object: { children: unknown[] } }[] }[];
      for (const l of lods) {
        expect(l.levels.length).toBe(2);
        expect(l.levels[1].object.children.length).toBe(0);
      }
    } finally { g.document = had; }
  });

  it('never lights Chuo in a faction colour (LUNA\'s blue in particular)', () => {
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, gg = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    for (const c of CHUO_LIGHTS) {
      const a = hueOf(c);
      // The blue-white and the greys stay nearly white (never read as LUNA's sky blue).
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gap, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
    expect(CHUO_LIGHTS.filter((c) => hueOf(c).s >= 0.3).length).toBe(1); // only a little green
  });
});
