// Dumps the Bunkyo area (prims, lanes, lamps and a walkability flood fill from 春日通り) for bk-plan.py.
// OUT=/path.json npx vitest run --config tools/visual-qa/vitest.qa.ts bk-plan
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { WORLD, STREET_SEGS, LIGHTS, insideLoop } from '../../src/config/map';
import { canWalk, supportHeight } from '../../src/sim/systems/world';
const A = { x0: -1060, x1: 560, z0: -4720, z1: -3200 };
it('dump', () => {
  const inA = (p: { x: number; z: number; w: number; d: number }) => p.x + p.w / 2 > A.x0 && p.x - p.w / 2 < A.x1 && p.z + p.d / 2 > A.z0 && p.z - p.d / 2 < A.z1;
  const prims = WORLD.filter(inA);
  const segs = STREET_SEGS.filter(inA);
  const lights = LIGHTS.filter((l) => l.x > A.x0 && l.x < A.x1 && l.z > A.z0 && l.z < A.z1);
  // Flood fill on a 20-unit grid from the avenue north of the district (ground, slopes, the ridge).
  const G = 20, key = (i: number, j: number) => `${i},${j}`;
  const start = { i: Math.round((-185 - A.x0) / G), j: Math.round((-4690 - A.z0) / G) };
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
  writeFileSync(process.env.OUT ?? '/tmp/bk-plan.json', JSON.stringify({ A, prims, segs, open, lights }));
});
