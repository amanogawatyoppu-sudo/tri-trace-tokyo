import { it } from 'vitest';
import { BUILDINGS, WORLD, LIGHTS, POLES, INTERSECTIONS, STREET_SEGS, BLOCKS, CROSSWALKS, SIGNALS, insideLoop } from '../../src/config/map';
import { sectorPoint } from '../../src/sim/war';
it('dump', () => {
  const R = { x0: -1640, x1: 800, z0: 3900, z1: 6100 };
  const inR = (p: { x: number; z: number }) => p.x > R.x0 && p.x < R.x1 && p.z > R.z0 && p.z < R.z1;
  console.log('point8', sectorPoint(8), 'point7', sectorPoint(7));
  console.log('bldg', BUILDINGS.filter((b) => !b.outside && inR(b)).map((b) => `${b.type} ${Math.round(b.x)},${Math.round(b.z)} ${Math.round(b.w)}x${Math.round(b.d)} h${b.h}`));
  console.log('prims', WORLD.filter(inR).filter((w) => w.mat !== 'bldg').map((w) => `${w.mat}/${w.group ?? ''} ${Math.round(w.x)},${Math.round(w.z)} ${Math.round(w.w)}x${Math.round(w.d)}`).join(' | '));
  console.log('lights', LIGHTS.filter(inR), 'poles', POLES.filter(inR).length, 'signals', SIGNALS.filter(inR));
  console.log('ix', INTERSECTIONS.filter(inR), 'segs', STREET_SEGS.filter(inR), 'blocks', BLOCKS.filter((b) => inR({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 })), 'cw', CROSSWALKS.filter(inR).length);
  const edge: string[] = [];
  for (let z = 3900; z <= 6000; z += 100) {
    let e = -9999, w = 9999;
    for (let x = -1700; x <= 900; x += 10) if (insideLoop(x, z, 160)) { e = Math.max(e, x); w = Math.min(w, x); }
    edge.push(`${z}:${w}..${e}`);
  }
  console.log('walkable (edge+10)', edge.join(' '));
});
