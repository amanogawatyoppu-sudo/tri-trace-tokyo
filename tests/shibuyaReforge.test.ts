import { describe, expect, it } from 'vitest';
import { BUILDINGS, LIGHTS, POLES, SHIBUYA_BUILT, STREET_SEGS, WORLD, insideLoop, WALK_EDGE } from '../src/config/map';
import { MAZE, MAZE_MAP, SKY_DECKS, SKY_H, SKY_STAIRS } from '../src/config/shibuya';
import { JAIL_SITES, BASE_SITES } from '../src/config/map';
import { NATIONS } from '../src/config/nations';
import { planPath } from '../src/ai/nav';
import { SECTORS, sectorPoint } from '../src/sim/war';
import { canWalk, lineOfSight, supportHeight, walkLine } from '../src/sim/systems/world';

/** v10 MAP REFORGE: Shibuya rebuilt as the Golden Sector (layout in config/shibuya.ts). */

/** Everything outside the rebuilt area, hashed on the v9.2 map (before the reforge). */
const OUTSIDE = { world: '2d071ac1', lights: 'bf52038', buildings: 'b32593bc', poles: 'd40b23fd', n: 688 };
const outside = (p: { x: number; z: number }) => !(p.x > -3600 && p.x < -1894 && p.z > 1190 && p.z < 2700);
/** FNV-1a over the JSON (enough to notice any change). */
const hash = (v: unknown) => {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};

describe('Shibuya reforge: the rest of Tokyo is untouched', () => {
  it('leaves every primitive, lamp, building and pole outside the rebuilt area exactly as in v9.2', () => {
    expect({
      world: hash(WORLD.filter(outside)), lights: hash(LIGHTS.filter(outside)), buildings: hash(BUILDINGS.filter(outside)),
      poles: hash(POLES.filter(outside)), n: WORLD.filter(outside).length,
    }).toEqual(OUTSIDE);
  });

  it('keeps the strategic point, the bases and the LOCK POINTs where they were', () => {
    const p = sectorPoint(1), want = SECTORS[1].pointNear;
    expect(Math.hypot(p.x - want.x, p.z - want.z)).toBeLessThan(40);
    expect(p.y).toBe(0);
    // The point stands in open ground: nothing solid within its capture radius.
    for (const w of WORLD) {
      if (w.mat === 'sidewalk' || w.y0 > 100) continue;
      const dx = Math.max(Math.abs(p.x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(p.z - w.z) - w.d / 2, 0);
      expect(Math.hypot(dx, dz), `${w.mat} ${w.group ?? ''} at ${w.x},${w.z}`).toBeGreaterThan(150);
    }
    for (const s of [...Object.values(BASE_SITES), ...Object.values(JAIL_SITES)]) expect(outside(s)).toBe(true);
  });

  it('runs the avenue unbroken through the crossing (MAIN STREET)', () => {
    const av = STREET_SEGS.filter((g) => g.kind === 'avenue' && g.x === -2700 && g.axis === 'z');
    const covered = (z: number) => av.some((g) => z > g.z - g.d / 2 - 1 && z < g.z + g.d / 2 + 1) || Math.abs(z - 1899) < 125 || Math.abs(z - 2752) < 65;
    for (let z = 1200; z < 3400; z += 20) expect(covered(z), `avenue at z ${z}`).toBe(true);
  });

  it('builds every new building inside the walkable city (clear of the railway)', () => {
    for (const b of SHIBUYA_BUILT.buildings) {
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) expect(insideLoop(x, z, WALK_EDGE + 10), b.id).toBe(true);
    }
  });
});

describe('Shibuya reforge: three ways through', () => {
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
  it.each([
    ['the SKY RING over the scramble', { x: -2700, y: SKY_H, z: 1720 }],
    ['the skywalk to the back alley', { x: -2455, y: SKY_H, z: 2300 }],
    ['the deck over the north-east lane', { x: -2250, y: SKY_H, z: 1720 }],
    ['the back alley (gate pocket)', { x: -2320, y: 4, z: 2262 }],
    ['the back alley (east lane)', { x: -2100, y: 4, z: 2414 }],
    ['the back alley (south mouth)', { x: -2135, y: 4, z: 2600 }],
    ['the north-east lane', { x: -2120, y: 4, z: 1350 }],
    ['the station square', { x: -3067, y: 0, z: 2220 }],
  ])('reaches %s on foot', (_name, goal) => {
    const b = walkTo(goal);
    expect(Math.abs(b.y - goal.y)).toBeLessThan(6);
    expect(Math.hypot(b.x - goal.x, b.z - goal.z)).toBeLessThan(60);
  });

  it('climbs the grand stair from the square onto the ring, and the alley stair back down', () => {
    for (const s of SKY_STAIRS) {
      const along = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
      expect(SKY_H / along).toBeLessThanOrEqual(0.55); // no steeper than the footbridges
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      // Foot and top: the low end is street level, the high end the deck.
      const low = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z0 + 4 : s.z1 - 4 } : { x: s.dir === 1 ? s.x0 + 4 : s.x1 - 4, z: cz };
      const top = s.axis === 'z' ? { x: cx, z: s.dir === 1 ? s.z1 + 10 : s.z0 - 10 } : { x: s.dir === 1 ? s.x1 + 10 : s.x0 - 10, z: cz };
      expect(supportHeight(low.x, low.z, 12)).toBeLessThan(12);
      expect(supportHeight(top.x, top.z, SKY_H + 5)).toBe(SKY_H);
    }
  });

  it('has lanes wide enough to pass (≥ 3 cells) and no straight view through the maze', () => {
    // Every open cell is part of a 3×3 open square (lanes are at least 3 cells wide everywhere).
    const open = (r: number, c: number) => r < 0 || r >= MAZE_MAP.length || c < 0 || c >= 12 || MAZE_MAP[r][c] === '.';
    MAZE_MAP.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== '.') return;
      let ok = false;
      for (let a = -2; a <= 0 && !ok; a++) for (let b = -2; b <= 0 && !ok; b++) {
        let all = true;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) all &&= open(r + a + i, c + b + j);
        ok = all;
      }
      expect(ok, `cell ${r},${c}`).toBe(true);
    }));
    const X = (c: number) => MAZE.x0 + (c + 0.5) * MAZE.cell, Z = (r: number) => MAZE.z0 + (r + 0.5) * MAZE.cell;
    // No lane runs straight through: every row and every column of the block is closed somewhere.
    for (let r = 0; r < MAZE_MAP.length; r++) expect(lineOfSight(X(-2), 40, Z(r), X(13), 40, Z(r)), `row ${r}`).toBe(false);
    for (let c = 0; c < 12; c++) expect(lineOfSight(X(c), 40, Z(-2), X(c), 40, Z(16)), `col ${c}`).toBe(false);
  });

  it('lets people walk under the decks (head room) and keeps the decks railed where they are open', () => {
    for (const k of SKY_DECKS) {
      const cx = (k.x0 + k.x1) / 2, cz = (k.z0 + k.z1) / 2;
      expect(supportHeight(cx, cz, SKY_H + 5)).toBe(SKY_H);
    }
    expect(WORLD.filter((w) => w.group === 'skyway' && w.kind === 'box' && w.y0 === SKY_H).length).toBeGreaterThan(8);
  });
});

describe('Shibuya reforge: as drawn', () => {
  /** Just enough of a 2D canvas for the atlas painter (node has none). */
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
      const { buildShibuya } = await import('../src/render/shibuya');
      const scene = new THREE.Scene();
      const stats = buildShibuya(scene);
      expect(JSON.stringify(WORLD)).toBe(before);
      // Merged per material (three sign levels, lit windows, deck glass) plus a few instanced pieces and one line set (lantern wires).
      expect(scene.children.length).toBeLessThanOrEqual(24);
      expect(stats.triangles).toBeLessThan(90000);
      expect(stats.buildings).toBe(SHIBUYA_BUILT.buildings.length);
      expect(stats.bays).toBeGreaterThanOrEqual(30);
      expect(stats.screens).toBeGreaterThanOrEqual(4); // plus HALO VISION and the roof billboards
      expect(stats.lamps).toBeGreaterThanOrEqual(1);
    } finally { g.document = had; }
  });

  it('never lights Shibuya in a faction colour', async () => {
    const { SHIBUYA_LIGHTS } = await import('../src/render/shibuya');
    const hueOf = (c: number) => {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return { h: 0, s: 0 };
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d / mx };
    };
    for (const c of SHIBUYA_LIGHTS) {
      const a = hueOf(c);
      if (a.s < 0.3) continue;
      for (const n of Object.values(NATIONS)) {
        const b = hueOf(n.color), gap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(gap, `${c.toString(16)} vs ${n.color.toString(16)}`).toBeGreaterThan(24);
      }
    }
  });
});
