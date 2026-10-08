import { it } from 'vitest';
import { BLOCKS, BUILDINGS, CROSSWALKS, INTERSECTIONS, LIGHTS, PARKINGS, POLES, SIGNALS, STREET_SEGS, WIRES, WORLD } from '../../src/config/map';
import { inAkihabara } from '../../tests/helpers';
const Z = { x0: -1640, z0: 3940, x1: 700, z1: 5060 };
const inShg = (p: { x: number; z: number }) => p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1;
const hash = (v: unknown) => { const s = JSON.stringify(v); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h.toString(16); };
it('hash', () => {
  const o = <T extends { x: number; z: number }>(a: readonly T[]) => a.filter((p) => !inShg(p));
  console.log('SHG', JSON.stringify({ world: hash(o(WORLD)), lights: hash(o(LIGHTS)), buildings: hash(o(BUILDINGS)), poles: hash(o(POLES)), streets: hash(o(STREET_SEGS)), crossings: hash(o(INTERSECTIONS)), blocks: hash(BLOCKS.filter((b) => !inShg({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }))), signals: hash(o(SIGNALS)), zebra: hash(o(CROSSWALKS)), parking: hash(o(PARKINGS)), n: o(WORLD).length }));
  const inShinjuku = (p: { x: number; z: number }) => p.x > -3600 && p.x < -2160 && p.z > -2270 && p.z < -640;
  const outsideShibuya = (p: { x: number; z: number }) => !(p.x > -3600 && p.x < -1894 && p.z > 1190 && p.z < 2700);
  const newInShinjuku = (p: { group?: string }) => p.group === 'sjdeck' || p.group === 'shinjuku';
  const outside = (p: { x: number; z: number; group?: string }) => outsideShibuya(p) && !inShinjuku(p) && !newInShinjuku(p) && !inAkihabara(p) && !inShg(p);
  console.log('SHIBUYA', JSON.stringify({ world: hash(WORLD.filter(outside)), lights: hash(LIGHTS.filter(outside)), buildings: hash(BUILDINGS.filter(outside)), poles: hash(POLES.filter(outside)), n: WORLD.filter(outside).length }));
  console.log('wires', WIRES.length);
});
