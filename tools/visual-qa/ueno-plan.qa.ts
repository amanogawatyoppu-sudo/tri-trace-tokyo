// Dumps the Ueno area (prims, sites and a walkability flood fill from LUNA's base) for ueno-plan.py.
// OUT=/path.json npx vitest run --config tools/visual-qa/vitest.qa.ts
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { WORLD, STREET_SEGS, insideLoop } from '../../src/config/map';
import { NATIONS } from '../../src/config/nations';
import { canWalk, supportHeight } from '../../src/sim/systems/world';
import { sectorPoint } from '../../src/sim/war';
const A = { x0: 1800, x1: 3360, z0: -4660, z1: -2990 };
it('dump', () => {
  const inA = (p: { x: number; z: number; w: number; d: number }) => p.x + p.w / 2 > A.x0 && p.x - p.w / 2 < A.x1 && p.z + p.d / 2 > A.z0 && p.z - p.d / 2 < A.z1;
  const prims = WORLD.filter(inA);
  const segs = STREET_SEGS.filter(inA);
  // Flood fill on a 20-unit grid, ground and decks, from LUNA's base.
  const G = 20, key = (i: number, j: number) => `${i},${j}`;
  const b = NATIONS.moon.base;
  const start = { i: Math.round((b.x - A.x0) / G), j: Math.round((b.z - A.z0) / G) };
  const seen = new Map<string, number>([[key(start.i, start.j), 0]]);
  const q: [number, number, number][] = [[start.i, start.j, 0]];
  while (q.length) {
    const [i, j, y] = q.shift()!;
    const x = A.x0 + i * G, z = A.z0 + j * G;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, nx = A.x0 + ni * G, nz = A.z0 + nj * G;
      if (nx < A.x0 || nx > A.x1 || nz < A.z0 || nz > A.z1 || !insideLoop(nx, nz, 0)) continue;
      const ny = supportHeight(nx, nz, y + 30);
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      if (!canWalk({ x, y, z }, nx, ny, nz)) continue;
      seen.set(k, ny); q.push([ni, nj, ny]);
    }
  }
  const open = [...seen.entries()].map(([k, y]) => { const [i, j] = k.split(',').map(Number); return [A.x0 + i * G, A.z0 + j * G, Math.round(y)]; });
  writeFileSync(process.env.OUT ?? '/tmp/ueno-dump.json', JSON.stringify({ A, prims, segs, open, base: b, jail: NATIONS.moon.jail, point: sectorPoint(4) }));
});
