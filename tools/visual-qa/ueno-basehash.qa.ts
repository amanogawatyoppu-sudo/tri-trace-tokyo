import { it } from 'vitest';
import { BLOCKS, BUILDINGS, CROSSWALKS, INTERSECTIONS, LIGHTS, PARKINGS, POLES, SIGNALS, STREET_SEGS, WIRES, WORLD, BASE_SITES, JAIL_SITES, FOOTBRIDGES } from '../../src/config/map';
import { SECTORS, sectorPoint } from '../../src/sim/war';
import { inAkihabara } from '../../tests/helpers';
const Z = { x0: 1885, z0: -4545, x1: 3300, z1: -3320 };
const inUeno = (p: { x: number; z: number }) => p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1;
const hash = (v: unknown) => { const s = JSON.stringify(v); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h.toString(16); };
it('hash', () => {
  const o = (p: { x: number; z: number }) => !inUeno(p);
  const blk = (b: { x0: number; z0: number; x1: number; z1: number }) => o({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
  const out = {
    world: hash(WORLD.filter(o)), n: WORLD.filter(o).length, lights: hash(LIGHTS.filter(o)), buildings: hash(BUILDINGS.filter((b) => b.outside || o(b))),
    poles: hash(POLES.filter(o)), wires: hash(WIRES.filter(([a, b]) => o(POLES[a]) && o(POLES[b])).map(([a, b]) => [POLES[a], POLES[b]])),
    streets: hash([STREET_SEGS.filter(o), INTERSECTIONS.filter(o), CROSSWALKS.filter(o), SIGNALS.filter(o), BLOCKS.filter(blk), PARKINGS.filter(o), FOOTBRIDGES]),
    places: hash([BASE_SITES, JAIL_SITES, SECTORS.filter((s) => s.id !== 4).map((s) => sectorPoint(s.id))]),
  };
  console.log('UENOHASH', JSON.stringify(out));
  // shibuya-style outside filter + Ueno
  const inShinjuku = (p: { x: number; z: number }) => p.x > -3600 && p.x < -2160 && p.z > -2270 && p.z < -640;
  const outsideShibuya = (p: { x: number; z: number }) => !(p.x > -3600 && p.x < -1894 && p.z > 1190 && p.z < 2700);
  const newInShinjuku = (p: { group?: string }) => p.group === 'sjdeck' || p.group === 'shinjuku';
  const outside = (p: { x: number; z: number; group?: string }) => outsideShibuya(p) && !inShinjuku(p) && !newInShinjuku(p) && !inAkihabara(p) && !inUeno(p);
  console.log('SHIBUYAHASH', JSON.stringify({ world: hash(WORLD.filter(outside)), lights: hash(LIGHTS.filter(outside)), buildings: hash(BUILDINGS.filter(outside)), poles: hash(POLES.filter(outside)), n: WORLD.filter(outside).length }));
  console.log('ZONECHECK', WORLD.filter((p) => inUeno(p)).length, WORLD.filter((p) => inUeno(p) && inAkihabara(p)).length);
});
