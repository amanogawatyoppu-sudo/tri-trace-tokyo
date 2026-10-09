// Dumps the Tokyo Tower area (prims, streets, the strategic point and a walkability flood fill from it) for ttw-plan.py.
// OUT=/path.json npx vitest run --config tools/visual-qa/vitest.qa.ts ttw-plan
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { WORLD, STREET_SEGS, BUILDINGS, LIGHTS, insideLoop } from '../../src/config/map';
import { canWalk, supportHeight } from '../../src/sim/systems/world';
import { sectorPoint } from '../../src/sim/war';
const A = JSON.parse(process.env.AREA ?? "{\"x0\":-700,\"x1\":1700,\"z0\":1500,\"z1\":3500}");
it('dump', () => {
  const inA = (p: { x: number; z: number; w: number; d: number }) => p.x + p.w / 2 > A.x0 && p.x - p.w / 2 < A.x1 && p.z + p.d / 2 > A.z0 && p.z - p.d / 2 < A.z1;
  const prims = WORLD.filter(inA);
  const segs = STREET_SEGS.filter(inA);
  const pt = sectorPoint(7);
  const G = 20, key = (i: number, j: number, y: number) => `${i},${j},${Math.round(y / 40)}`; // one entry per cell and level
  const start = { i: Math.round((pt.x - A.x0) / G), j: Math.round((pt.z - A.z0) / G) };
  const y0 = supportHeight(pt.x, pt.z, pt.y + 30);
  const seen = new Map<string, number>([[key(start.i, start.j, y0), y0]]);
  const q: [number, number, number][] = [[start.i, start.j, y0]];
  while (q.length) {
    const [i, j, y] = q.shift()!;
    const x = A.x0 + i * G, z = A.z0 + j * G;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, nx = A.x0 + ni * G, nz = A.z0 + nj * G;
      if (nx < A.x0 || nx > A.x1 || nz < A.z0 || nz > A.z1 || !insideLoop(nx, nz, 0)) continue;
      const ny = supportHeight(nx, nz, y + 30);
      const k = key(ni, nj, ny);
      if (seen.has(k)) continue;
      if (!canWalk({ x, y, z }, nx, ny, nz)) continue;
      seen.set(k, ny); q.push([ni, nj, ny]);
    }
  }
  const open = [...seen.entries()].map(([k, y]) => { const [i, j] = k.split(',').map(Number); return [A.x0 + i * G, A.z0 + j * G, Math.round(y)]; });
  const builds = BUILDINGS.filter((b) => !b.outside && inA(b)).map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, custom: b.custom }));
  const lamps = LIGHTS.filter((l) => l.x > A.x0 && l.x < A.x1 && l.z > A.z0 && l.z < A.z1);
  writeFileSync(process.env.OUT ?? '/tmp/ttw-plan.json', JSON.stringify({ A, prims, segs, open, point: pt, builds, lamps }));
});
