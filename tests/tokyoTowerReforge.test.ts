import { describe, expect, it } from 'vitest';
import {
  BASE_SITES, BLOCKS, BUILDINGS, CROSSWALKS, INTERSECTIONS, JAIL_SITES, LIGHTS, PARKINGS, POLES, SIGNALS, STREET_SEGS, WALK_EDGE, WIRES, WORLD, insideLoop,
} from '../src/config/map';
import type { Prim } from '../src/config/map';
import {
  AXIS, GATE, LEGS, RED_H, RED_TERRACE, RING_H, SERVICE_LANE, SERVICE_WALL, SKY_PLAZA, STAIRS, TERRACES, TOWER_POINT, TOWER_RED, TT, TTW_ZONES, TUNNEL,
} from '../src/config/tokyoTower';
import type { TtwRect } from '../src/config/tokyoTower';
import { NATIONS, NATION_IDS } from '../src/config/nations';
import { planPath } from '../src/ai/nav';
import { POINT_R, SECTORS, sectorPoint } from '../src/sim/war';
import { canWalk, lineOfSight, supportHeight, walkLine } from '../src/sim/systems/world';
import { inBunkyo, inChuo, inTokyoTower } from './helpers';

/**
 * MAP REFORGE parallel E: 東京タワー rebuilt as RED HEIGHT (layout in config/tokyoTower.ts).
 * The other reforges' hash tests (渋谷, 上野, 池袋, 品川) leave this area out as well.
 */

/** FNV-1a over the JSON (enough to notice any change). */
const hash = (v: unknown) => {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};
const TOWER = 7;
const mine = (p: Prim) => p.group?.startsWith('ttw') ?? false;
const inRect = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
/** Walks a planned route for real, leg by leg; returns where it ends. */
const walkRoute = (from: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }) => {
  const pts = planPath(from, goal);
  expect(pts, `route to ${goal.x},${goal.z}`).not.toBeNull();
  let b = { ...from };
  for (const p of pts!) {
    expect(canWalk(b, p.x, p.y, p.z), `leg to ${Math.round(p.x)},${Math.round(p.z)}`).toBe(true);
    b = walkLine(b, p.x, p.z);
    b.y = supportHeight(b.x, b.z, b.y);
  }
  return b;
};
const EYE = 40;

describe('Tokyo Tower reforge: everything outside the district is untouched', () => {
  it('leaves every primitive, lamp, building, pole, wire, street, crossing, block and signal outside the area exactly as on map-reforge-parallel-integrated', () => {
    // 文京 (parallel D) and 中央 (parallel F) are left out as well since map-reforge-all9 (values re-taken on 897dc77 with them left out).
    const out = (p: { x: number; z: number }) => !inTokyoTower(p) && !inBunkyo(p) && !inChuo(p);
    const o = <T extends { x: number; z: number }>(a: readonly T[]) => a.filter(out);
    expect({
      world: hash(o(WORLD)), lights: hash(o(LIGHTS)), buildings: hash(o(BUILDINGS)), poles: hash(o(POLES)),
      wires: hash(WIRES.filter(([a, b]) => out(POLES[a]) && out(POLES[b])).map(([a, b]) => [POLES[a], POLES[b]])),
      streets: hash(o(STREET_SEGS)), crossings: hash(o(INTERSECTIONS)), blocks: hash(BLOCKS.filter((b) => out({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }))),
      signals: hash(o(SIGNALS)), zebra: hash(o(CROSSWALKS)), parking: hash(o(PARKINGS)), n: o(WORLD).length,
      places: hash([BASE_SITES, JAIL_SITES, SECTORS.filter((s) => s.id !== TOWER).map((s) => sectorPoint(s.id))]),
    }).toEqual({
      // Taken on map-reforge-parallel-integrated (897dc77: all six finished districts) before 東京タワー was touched.
      world: '3c541737', lights: '7cf33ec8', buildings: '2ff12757', poles: '33b6478', wires: 'dbda7fb5', streets: '26be8cb3', crossings: 'a21d9ffd',
      blocks: 'f52487ca', signals: '906d6319', zebra: 'a745170a', parking: '96f01396', n: 1114, places: '4712c8fa',
    });
  });

  it('builds everything new inside the area', () => {
    const news = WORLD.filter(mine);
    expect(news.length).toBeGreaterThan(100);
    for (const w of news) {
      for (const [x, z] of [[w.x - w.w / 2 + 1, w.z - w.d / 2 + 1], [w.x + w.w / 2 - 1, w.z + w.d / 2 - 1]]) {
        expect(TTW_ZONES.some((r) => inRect(r, x, z, 1)), `${w.group} at ${w.x},${w.z}`).toBe(true);
      }
    }
    // Nothing of the old lot is left (FootTown, its stair, the temple hall, the gravel).
    expect(WORLD.filter((w) => ['tokyoTowerLeg', 'tokyoTowerSpire', 'tokyoTower', 'footTown', 'temple'].includes(w.group ?? ''))).toEqual([]);
  });
});

describe('Tokyo Tower reforge: the strategic point and the tower', () => {
  it('keeps the strategic point at the tower\'s foot, on open ground in SKY PLAZA', () => {
    const p = sectorPoint(TOWER), want = SECTORS[TOWER].pointNear;
    expect(Math.hypot(p.x - want.x, p.z - want.z)).toBeLessThan(40);
    expect(Math.hypot(p.x - TOWER_POINT.x, p.z - TOWER_POINT.z)).toBeLessThan(40);
    expect(p.y).toBe(0);
    expect(inRect(SKY_PLAZA, p.x, p.z, -POINT_R / 2)).toBe(true);
    for (const w of WORLD) {
      if (w.mat === 'sidewalk' || w.y0 > 100 || (w.kind === 'box' && w.y1 <= 2)) continue;
      const dx = Math.max(Math.abs(p.x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(p.z - w.z) - w.d / 2, 0);
      expect(Math.hypot(dx, dz), `${w.group ?? w.mat} at ${w.x},${w.z}`).toBeGreaterThan(POINT_R);
    }
  });

  it('stands the tower on four legs in the plaza, solid enough to break a line of sight', () => {
    expect(LEGS.length).toBe(4);
    for (const [x, z] of LEGS) {
      expect(inRect(SKY_PLAZA, x, z)).toBe(true);
      // Two people either side of a leg cannot see each other; a step aside and they can.
      expect(lineOfSight(x - 60, EYE, z, x + 60, EYE, z)).toBe(false);
      expect(lineOfSight(x - 60, EYE, z + 70, x + 60, EYE, z + 70)).toBe(true);
    }
  });

  it('paints the tower a deep red, well away from SOL\'s orange and STAR\'s yellow', () => {
    const hsl = (c: number) => {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
      const h = max === min ? 0 : max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
      return { h: h * 60, l };
    };
    const red = hsl(TOWER_RED);
    expect(red.l).toBeLessThan(0.35); // deep, not a bright signal red
    for (const n of ['sun', 'star'] as const) expect(Math.abs(hsl(NATIONS[n].color).h - red.h)).toBeGreaterThan(18);
  });
});

describe('Tokyo Tower reforge: A. RED AXIS', () => {
  it('runs straight from the avenue through TOWER GATE to the tower with an unbroken view', () => {
    const x = (AXIS.x0 + AXIS.x1) / 2 + 30; // beside the point's beam, on the carriageway
    expect(AXIS.z1 - (TT.z + 200)).toBeGreaterThan(900); // ≥ 35 m of running straight at the tower
    for (let z = AXIS.z1 - 10; z > TT.z + 240; z -= 40) expect(canWalk({ x, y: 0, z }, x, 0, z - 40), `at z ${z}`).toBe(true);
    for (const dx of [-90, -30, 40]) expect(lineOfSight(x + dx, EYE, AXIS.z1 - 20, x + dx, EYE, TT.z + 240), `view at x ${x + dx}`).toBe(true);
    // The gate opening is wider than the axis' running line and taller than anyone.
    expect(GATE.pierE.x0 - GATE.pierW.x1).toBeGreaterThan(160);
    expect(GATE.lintel0).toBeGreaterThan(200);
  });

  it('is in full view of the terraces above it (the risk of the fast way)', () => {
    for (const z of [2500, 2700, 2900]) {
      expect(lineOfSight(150, RING_H + EYE, z, 487, EYE, z + 40), `west terrace sees the axis at z ${z}`).toBe(true);
      expect(lineOfSight(830, RING_H + EYE, Math.min(z, 2690), 487, EYE, z), `east terrace sees the axis at z ${z}`).toBe(true);
    }
    expect(lineOfSight(487, RED_H + EYE, RED_TERRACE.z1 - 10, 487, EYE, 3200)).toBe(true); // RED TERRACE down the axis
  });
});

describe('Tokyo Tower reforge: B. TERRACE RING and RED TERRACE', () => {
  it.each(NATION_IDS)('reaches the ring, RED TERRACE, the plaza and the service lane on foot from the %s base', (n) => {
    const from = { ...NATIONS[n].base, y: 0 };
    for (const goal of [
      { x: 105, y: RING_H, z: 2300 }, // west terrace
      { x: 870, y: RING_H, z: 2200 }, // east terrace
      { x: (RED_TERRACE.x0 + RED_TERRACE.x1) / 2, y: RED_H, z: (RED_TERRACE.z0 + RED_TERRACE.z1) / 2 },
      { x: 300, y: 0, z: 2650 }, // SKY PLAZA
      { x: 1000, y: 0, z: 2700 }, // service lane
    ]) {
      const b = walkRoute(from, goal);
      expect(Math.abs(b.y - goal.y), `${n} → ${goal.x},${goal.z}`).toBeLessThan(6);
      expect(Math.hypot(b.x - goal.x, b.z - goal.z), `${n} → ${goal.x},${goal.z}`).toBeLessThan(60);
    }
  });

  it('has a way down from the ring in several directions, none steeper than the walker climbs', () => {
    expect(STAIRS.length).toBe(8);
    for (const s of STAIRS) {
      const run = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0, wide = s.axis === 'x' ? s.z1 - s.z0 : s.x1 - s.x0;
      expect((s.high - s.low) / run, s.id).toBeLessThanOrEqual(0.54);
      expect(wide, s.id).toBeGreaterThanOrEqual(80);
    }
    // Down from the ring: into the plaza (2), to the gate (2), to the avenue (1), to the service lane (1).
    expect(STAIRS.filter((s) => s.low === 0 && s.high === RING_H).length).toBe(6);
  });

  it('sees down into the plaza from the terrace edge (rails are mesh, not walls)', () => {
    expect(lineOfSight(160, RING_H + EYE, 2500, 400, EYE, 2450)).toBe(true);
    expect(lineOfSight(815, RING_H + EYE, 2250, 600, EYE, 2600)).toBe(true);
  });

  it('rails every edge where the ground drops away, so nobody walks off the ring or RED TERRACE', () => {
    const tops: { r: TtwRect; y: number }[] = [...TERRACES.map((t) => ({ r: t, y: RING_H })), { r: TUNNEL, y: RING_H }, { r: RED_TERRACE, y: RED_H }];
    for (const { r, y } of tops) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      // Walk out from the middle of the top towards each side, a little off-centre: never drops below the top.
      for (const [tx, tz] of [[r.x0 - 60, cz + 7], [r.x1 + 60, cz - 7], [cx + 5, r.z0 - 60], [cx - 5, r.z1 + 60]]) {
        const b = walkLine({ x: cx, y, z: cz }, tx, tz);
        b.y = supportHeight(b.x, b.z, b.y);
        const onStair = STAIRS.some((s) => inRect(s, b.x, b.z, 2));
        if (!onStair) expect(b.y, `from ${cx},${cz} towards ${tx},${tz}`).toBeGreaterThan(y - 13);
      }
    }
  });
});

describe('Tokyo Tower reforge: C. SERVICE SLOPE', () => {
  it('runs the lane from the gate side to the tower\'s foot (tunnel) and up the slope, out of sight of the plaza', () => {
    const lane = (SERVICE_LANE.x0 + SERVICE_LANE.x1) / 2;
    expect(SERVICE_LANE.x1 - SERVICE_LANE.x0).toBeGreaterThanOrEqual(120); // not a squeeze
    for (let z = SERVICE_LANE.z1 - 10; z > SERVICE_LANE.z0 + 50; z -= 40) expect(canWalk({ x: lane, y: 0, z }, lane, 0, z - 40), `lane at z ${z}`).toBe(true);
    // Through the tunnel under the east terrace to the south-east leg.
    const tz = (TUNNEL.z0 + TUNNEL.z1) / 2;
    expect(canWalk({ x: lane, y: 0, z: tz }, 760, 0, tz)).toBe(true);
    // Hidden from the plaza by the east terrace.
    for (const z of [2650, 2800]) expect(lineOfSight(500, EYE, z, lane, EYE, z)).toBe(false);
    // The slope climbs onto the landing.
    const s = STAIRS.find((q) => q.id === 'service')!;
    const b = walkLine({ x: lane, y: 0, z: s.z1 + 20 }, lane, s.z0 - 20);
    expect(supportHeight(b.x, b.z, b.y + 2)).toBeCloseTo(RING_H, 0);
    // SERVICE WALL has nothing to stand on.
    for (const w of WORLD) if (w.group === 'ttwService') expect(w.noFloor, `${w.x},${w.z}`).toBe(true);
    expect(SERVICE_WALL.every((w) => w.h > RING_H + 100)).toBe(true);
  });
});

describe('Tokyo Tower reforge: what the shared files let through', () => {
  it('dims only Tokyo Tower\'s strategic point (render/warView.ts tests the point against SKY PLAZA)', () => {
    for (const s of SECTORS) {
      const p = sectorPoint(s.id);
      expect(inRect(SKY_PLAZA, p.x, p.z), `${s.name}`).toBe(s.id === TOWER);
    }
  });

  it('lets through only rails standing on the edge of their own stair (tests/map.test.ts)', () => {
    const rails = WORLD.filter((w) => w.group === 'ttwRail'), stairs = WORLD.filter((w) => w.group === 'ttwStair');
    let n = 0;
    for (const r of rails) {
      for (const s of stairs) {
        if (Math.abs(r.x - s.x) >= (r.w + s.w) / 2 - 2 || Math.abs(r.z - s.z) >= (r.d + s.d) / 2 - 2) continue;
        n++;
        // The rail is a thin strip along one of the stair's sides (or across its high end), inside its footprint.
        const alongX = r.w > r.d;
        const edge = alongX ? Math.min(Math.abs(r.z - (s.z - s.d / 2)), Math.abs(r.z - (s.z + s.d / 2))) : Math.min(Math.abs(r.x - (s.x - s.w / 2)), Math.abs(r.x - (s.x + s.w / 2)));
        expect(edge, `rail at ${r.x},${r.z} on stair at ${s.x},${s.z}`).toBeLessThanOrEqual(4);
        expect(inTokyoTower(r) && inTokyoTower(s)).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('Tokyo Tower reforge: safety', () => {
  it('leaves nobody stuck: every walkable spot in the district has a way to the strategic point', () => {
    const p = sectorPoint(TOWER);
    let tried = 0;
    for (const r of TTW_ZONES) {
      for (let x = r.x0 + 40; x < r.x1; x += 120) {
        for (let z = r.z0 + 40; z < r.z1; z += 120) {
          const y = supportHeight(x, z, 400);
          const solid = WORLD.some((w) => w.kind === 'box' && inRect({ x0: w.x - w.w / 2, x1: w.x + w.w / 2, z0: w.z - w.d / 2, z1: w.z + w.d / 2 }, x, z, 16) && w.y1 > y + 12 && w.y0 < y + 60);
          if (solid || y > RED_H + 1 || !insideLoop(x, z, WALK_EDGE)) continue; // inside a wall, on a roof nobody reaches, past the city's edge
          tried++;
          expect(planPath({ x, y, z }, p), `from ${x},${y},${z}`).not.toBeNull();
        }
      }
    }
    expect(tried).toBeGreaterThan(40);
  });
});
