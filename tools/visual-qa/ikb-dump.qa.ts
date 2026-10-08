// @ts-nocheck
// Plan dump for the Ikebukuro review (not part of the test suite: copy into tests/ and run with OUT=<file>).
import { it } from 'vitest';
import { WORLD, STREET_SEGS, LIGHTS } from '../src/config/map';
import { sectorPoint } from '../src/sim/war';
import { walkLine } from '../src/sim/systems/world';
import { writeFileSync } from 'node:fs';
it('dump', () => {
  const R = { x0: -2700, x1: -1100, z0: -5600, z1: -3900 };
  const inR = (p) => p.x + p.w / 2 > R.x0 && p.x - p.w / 2 < R.x1 && p.z + p.d / 2 > R.z0 && p.z - p.d / 2 < R.z1;
  const pt = sectorPoint(2);
  // Walkable reach from the strategic point on a 20-unit grid, in 3D (stairs and roofs included).
  const G = 20, key = (x, z, y) => `${x},${z},${Math.round(y / 4)}`;
  const sx = Math.round(pt.x / G) * G, sz = Math.round(pt.z / G) * G;
  const seen = new Map(); const q = [{ x: sx, y: 0, z: sz }]; seen.set(key(sx, sz, 0), q[0]);
  while (q.length) {
    const b = q.pop();
    for (const [dx, dz] of [[G, 0], [-G, 0], [0, G], [0, -G]]) {
      const nx = b.x + dx, nz = b.z + dz;
      if (nx < R.x0 - 200 || nx > R.x1 + 200 || nz < R.z0 - 200 || nz > R.z1 + 200) continue;
      const e = walkLine(b, nx, nz);
      if (Math.hypot(e.x - nx, e.z - nz) > 2) continue;
      const k = key(nx, nz, e.y);
      if (seen.has(k)) continue;
      const c = { x: nx, y: e.y, z: nz }; seen.set(k, c); q.push(c);
    }
  }
  const walk = [...seen.values()].filter((c) => c.x >= R.x0 && c.x <= R.x1 && c.z >= R.z0 && c.z <= R.z1).map((c) => [c.x, c.z, Math.round(c.y)]);
  writeFileSync(process.env.OUT, JSON.stringify({ R, point: pt, world: WORLD.filter(inR), streets: STREET_SEGS.filter(inR), lights: LIGHTS.filter((l) => l.x > R.x0 && l.x < R.x1 && l.z > R.z0 && l.z < R.z1), walk }));
}, 900000);
