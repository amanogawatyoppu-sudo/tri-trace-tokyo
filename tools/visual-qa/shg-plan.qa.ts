// Dumps the Shinagawa area (prims, the strategic point and a walkability flood fill from it) for shg-plan.py.
// OUT=/path.json npx vitest run --config tools/visual-qa/vitest.qa.ts shg-plan
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { WORLD, STREET_SEGS, insideLoop } from '../../src/config/map';
import { canWalk, supportHeight } from '../../src/sim/systems/world';
import { sectorPoint } from '../../src/sim/war';
const A = { x0: -1640, x1: 700, z0: 3940, z1: 5060 };
it('dump', () => {
  const inA = (p: { x: number; z: number; w: number; d: number }) => p.x + p.w / 2 > A.x0 && p.x - p.w / 2 < A.x1 && p.z + p.d / 2 > A.z0 && p.z - p.d / 2 < A.z1;
  const prims = WORLD.filter(inA);
  const segs = STREET_SEGS.filter(inA);
  const pt = sectorPoint(8);
  // Flood fill on a 20-unit grid, ground and decks, from the strategic point.
  const G = 20, key = (i: number, j: number) => `${i},${j}`;
  const start = { i: Math.round((pt.x - A.x0) / G), j: Math.round((pt.z - A.z0) / G) };
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
  writeFileSync(process.env.OUT ?? '/tmp/shg-plan.json', JSON.stringify({ A, prims, segs, open, point: pt }));
});
