import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxPrim } from '../config/map';
import { CURB, GROUND_FLOOR, IKEBUKURO_BUILT, LIGHTS, STOREY, WORLD, prng } from '../config/map';
import type { IkbBuilding, IkbSide, IkbStair } from '../config/ikebukuro';
import { IKB_ALLEY, IKB_DECKS, IKB_LANE, IKB_PLANT, IKB_SQUARE, IKB_STAIRS, R3 } from '../config/ikebukuro';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { nearFade } from './city';
import { radialGlowTexture, roofTexture, sharedFacadeTexture } from './textures';
import type { FacadeKind } from './textures';

/**
 * MAP REFORGE — 池袋 ROOFTOP NETWORK, as drawn.
 *
 * Low and mid-rise buildings whose roofs are the place: fenced roofs with plant rooms, FRP
 * water tanks, air-con units, antennas, pipes and the steel backs of billboards; narrow steel
 * bridges and stairs between them; fire escapes down to the street and the back lane. The
 * streets stay plain (grey, dark blue, white plant, a little violet, red accents) so the roof
 * line reads first. The ROOFTOP LOOP is traced in red along the fences round the lane court,
 * the NETWORK HUB carries a relay cabinet with status lights, SIGNAL GARDEN mixes antenna masts
 * with planters, SKY SERVICE has the big plant room and the fire escape on the station square.
 *
 * Repeated roof equipment comes from a handful of instanced meshes (air-con, tanks, vents,
 * antennas, dishes, fence posts, stair treads, shrubs); everything else is merged per material
 * (one 1024×512 atlas for every sign; façades share the generic city's textures).
 */

/** Ikebukuro's light colours: red accent, violet, cool white, grey-white (never a faction hue; see tests). */
export const IKEBUKURO_LIGHTS = [0xff2a3a, 0x8a5cff, 0xeef2ff, 0xc8d0dc] as const;
const RED = IKEBUKURO_LIGHTS[0], VIOLET = IKEBUKURO_LIGHTS[1], WHITE = IKEBUKURO_LIGHTS[2];

/** Signs are drawn at design size on a 1024² scratch canvas, then copied into the packed 1024×512 texture. */
const ATLAS = 1024, PACK_W = 1024, PACK_H = 512;
type Cell = [number, number, number, number];
const CELLS = {
  window: (i: number): Cell => [(i % 4) * 256, Math.floor(i / 4) * 160, 256, 160],
  name: (i: number): Cell => [(i % 4) * 256, 320 + Math.floor(i / 4) * 48, 256, 48],
  blade: (i: number): Cell => [i * 64, 416, 64, 256],
  way: (i: number): Cell => [512 + (i % 2) * 256, 416 + Math.floor(i / 2) * 80, 256, 80],
  fascia: (i: number): Cell => [0, 672 + i * 48, 1024, 48],
  cabinet: [0, 768, 256, 256] as Cell,
  board: (i: number): Cell => [256 + i * 256, 768, 256, 160],
  station: [768, 768, 256, 96] as Cell,
  swatch: [790, 900, 40, 40] as Cell,
};
const way4 = (i: number): Cell => [512 + ((i - 4) % 2) * 256, 576 + Math.floor((i - 4) / 2) * 48, 256, 48];
/** Where each design cell lands in the texture: shop windows, blades, the cabinet and fascias at half size, boards at ¾. */
const PACKED = new Map<string, Cell>();
{
  const put = (c: Cell, p: Cell) => PACKED.set(c.join(), p);
  for (let i = 0; i < 8; i++) {
    put(CELLS.window(i), [i * 128, 0, 128, 80]);
    put(CELLS.name(i), [(i % 4) * 256, 80 + Math.floor(i / 4) * 48, 256, 48]);
    put(CELLS.blade(i), [i * 32, 336, 32, 128]);
  }
  for (let i = 0; i < 4; i++) put(CELLS.way(i), [(i % 2) * 256, 176 + Math.floor(i / 2) * 80, 256, 80]);
  for (let i = 4; i < 8; i++) put(way4(i), [512, 176 + (i - 4) * 48, 256, 48]);
  put(CELLS.station, [768, 176, 256, 96]);
  put(CELLS.cabinet, [768, 272, 128, 128]);
  put(CELLS.swatch, [904, 280, 24, 24]);
  put(CELLS.board(0), [256, 336, 192, 120]);
  put(CELLS.board(1), [512, 368, 192, 120]);
  for (let i = 0; i < 2; i++) put(CELLS.fascia(i), [0, 464 + i * 24, 512, 24]);
}
const NAMES = ['GRAY DELI', 'KOMA BOOKS', 'ROOF CAFE', 'TSUKI CURRY', 'NORTH GEAR', 'AOI DENKI', '7F STUDIO', 'MINT RAMEN'];
const BLADES = ['喫茶', '古書', '定食', 'ラーメン', '整体', '中古', 'カフェ', '画材'];
const WAY: [string, string, string][] = [
  ['屋上回廊', 'ROOFTOP LOOP', '↻'], ['中継', 'NETWORK HUB', '◎'], ['屋上庭園', 'SIGNAL GARDEN', '▲'], ['設備棟', 'SKY SERVICE', '↗'],
  ['裏階段', 'BACKSTAIR', '↑'], ['周回道路', 'STREET LOOP', '⟳'], ['駅前広場', 'STATION SQ.', '←'], ['連絡橋', 'SKY LINK', '↕'],
];
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS;
  c.height = ATLAS;
  const g = c.getContext('2d')!;
  const rnd = prng(4417);
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = '800') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  // Shop windows: quieter than Shibuya (lit interiors behind dark frames, a door on one side).
  for (let i = 0; i < 8; i++) {
    const [x, y, w, h] = CELLS.window(i);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, i % 3 === 2 ? '#dfe6f2' : '#f3eee4');
    grd.addColorStop(1, i % 3 === 2 ? '#9aa6b8' : '#b9b0a2');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    // Interiors: shelves of books / counters / racks / tables.
    if (i % 4 === 0) for (let r = 0; r < 4; r++) for (let k = 0; k < 24; k++) { g.fillStyle = `hsl(${200 + rnd() * 60},${10 + rnd() * 20}%,${30 + rnd() * 40}%)`; g.fillRect(x + 14 + k * 9.5, y + 34 + r * 28, 7, 20); }
    else if (i % 4 === 1) { g.fillStyle = '#4a4f58'; g.fillRect(x + 12, y + 104, w - 24, 46); for (let k = 0; k < 5; k++) { g.fillStyle = '#fff6e0'; g.beginPath(); g.arc(x + 40 + k * 44, y + 46, 8, 0, Math.PI * 2); g.fill(); } }
    else if (i % 4 === 2) for (let k = 0; k < 6; k++) { g.fillStyle = `hsl(${220 + rnd() * 50},${15 + rnd() * 25}%,${35 + rnd() * 35}%)`; g.fillRect(x + 20 + k * 38, y + 40, 26, 80 + rnd() * 20); }
    else { g.fillStyle = '#5a5048'; for (let k = 0; k < 3; k++) g.fillRect(x + 24 + k * 76, y + 110, 52, 8); g.fillStyle = '#f0ebe0'; g.fillRect(x + 12, y + 30, w - 24, 8); }
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath(); g.moveTo(x + 30, y + h); g.lineTo(x + 110, y); g.lineTo(x + 150, y); g.lineTo(x + 70, y + h); g.fill();
    g.fillStyle = '#2a2d33';
    g.fillRect(x, y, w, 7); g.fillRect(x, y + h - 9, w, 9); g.fillRect(x, y, 6, h); g.fillRect(x + w - 6, y, 6, h);
    const door = i % 2 ? x + w - 70 : x + 6;
    g.fillRect(door + (i % 2 ? 0 : 58), y, 6, h);
  }
  // Name bands: mostly white or charcoal panels, one violet, one red rule.
  NAMES.forEach((n, i) => {
    const [x, y, w, h] = CELLS.name(i);
    const dark = i % 2 === 0;
    g.fillStyle = dark ? '#22252c' : '#eef0f3';
    g.fillRect(x, y, w, h);
    g.fillStyle = css(i % 3 === 0 ? RED : i % 3 === 1 ? VIOLET : 0x8a93a3);
    g.fillRect(x, y + h - 5, w, 5);
    text(n, x + w / 2, y + h / 2 - 2, 25, dark ? '#f2f4f8' : '#1d2026');
  });
  // Small blade signs (fewer and dimmer than Shibuya's).
  BLADES.forEach((wd, i) => {
    const [x, y, w, h] = CELLS.blade(i);
    g.fillStyle = i % 3 === 0 ? css(VIOLET) : i % 3 === 1 ? '#eef0f3' : '#22252c';
    g.fillRect(x, y, w, h);
    g.strokeStyle = i % 3 === 1 ? '#22252c' : 'rgba(255,255,255,.8)';
    g.lineWidth = 3;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    const n = [...wd].length, step = Math.min(52, 220 / n);
    [...wd].forEach((ch, k) => text(ch, x + w / 2, y + h / 2 + (k - (n - 1) / 2) * step, 38, i % 3 === 1 ? '#1d2026' : '#ffffff', 'center', '900'));
  });
  // Wayfinding plates: charcoal with a red or violet arrow block.
  WAY.forEach(([jp, en, arrow], i) => {
    const [x, y, w, h] = i < 4 ? CELLS.way(i) : way4(i);
    g.fillStyle = '#1e2128'; g.fillRect(x, y, w, h);
    g.fillStyle = css(i % 2 ? VIOLET : RED); g.fillRect(x, y, h * 0.8, h);
    text(arrow, x + h * 0.4, y + h / 2 + 2, h * 0.62, '#ffffff', 'center', '900');
    if (h > 60) {
      text(jp, x + h * 0.8 + 12, y + 26, 26, '#ffffff', 'left', '900');
      text(en, x + h * 0.8 + 12, y + 58, 22, '#c9cfdb', 'left', '800');
    } else text(`${jp}  ${en}`, x + h * 0.8 + 10, y + h / 2 + 1, 19, '#ffffff', 'left', '800');
  });
  // Fascia bands: SKY LINK, ROOFTOP LOOP.
  [['SKY LINK ・ 池袋 ・ 連絡橋 ・ ROOFTOP NETWORK ・ 池袋 ・', RED], ['ROOFTOP LOOP ・ 屋上回廊 ・ BACKSTAIR ・ NETWORK HUB ・', VIOLET]].forEach(([s, col], i) => {
    const [x, y, w, h] = CELLS.fascia(i);
    g.fillStyle = '#16181d'; g.fillRect(x, y, w, h);
    g.fillStyle = css(col as number); g.fillRect(x, y, w, 4); g.fillRect(x, y + h - 4, w, 4);
    text(s as string, x + w / 2, y + h / 2 + 1, 28, '#f2f4f8', 'center', '900');
  });
  // The hub's relay cabinet front: louvres, a grid of status lights, the label.
  {
    const [x, y, w, h] = CELLS.cabinet;
    g.fillStyle = '#d9dde2'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1b1e24'; g.fillRect(x + 20, y + 20, w - 40, 120);
    for (let r = 0; r < 6; r++) for (let k = 0; k < 10; k++) {
      const v = rnd();
      g.fillStyle = v < 0.12 ? css(RED) : v < 0.4 ? css(VIOLET) : v < 0.75 ? '#e8f0ff' : '#39404c';
      g.fillRect(x + 32 + k * 19.5, y + 32 + r * 18, 10, 8);
    }
    g.fillStyle = '#a9b0b9';
    for (let r = 0; r < 6; r++) g.fillRect(x + 20, y + 156 + r * 12, w - 40, 5);
    text('NETWORK HUB', x + w / 2, y + 236, 26, '#1d2026', 'center', '900');
  }
  // Roof billboards (seen from the street; their steel backs face the roofs). Quiet: two tones.
  for (let i = 0; i < 2; i++) {
    const [x, y, w, h] = CELLS.board(i);
    const grd = g.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, i ? '#2b2f6a' : '#e9ecf1');
    grd.addColorStop(1, i ? '#4b2f7a' : '#c4cad4');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    if (i === 0) {
      g.fillStyle = css(RED); g.fillRect(x + 18, y + 22, 10, h - 44);
      text('ROOF', x + 44, y + 58, 52, '#1d2026', 'left', '900');
      text('TOP', x + 44, y + 106, 52, '#1d2026', 'left', '900');
      text('池袋 ・ 屋上をわたれ', x + 46, y + 140, 17, '#4a505c', 'left', '700');
    } else {
      for (let k = 0; k < 5; k++) { g.strokeStyle = css(k % 2 ? VIOLET : 0xeef2ff, 0.5); g.lineWidth = 3; g.beginPath(); g.arc(x + 196, y + 80, 18 + k * 14, 0, Math.PI * 2); g.stroke(); }
      text('SIGNAL', x + 22, y + 62, 40, '#ffffff', 'left', '900');
      text('24h', x + 22, y + 108, 40, css(0xc9b8ff), 'left', '900');
    }
  }
  {
    const [x, y, w, h] = CELLS.station;
    g.fillStyle = '#f2f4f7'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1e2128'; g.fillRect(x, y + h - 10, w, 10);
    text('池袋', x + 80, y + 40, 44, '#1d2026', 'center', '900');
    text('IKEBUKURO', x + 180, y + 42, 22, '#3a3f4a', 'center', '800');
  }
  {
    const [x, y, w, h] = CELLS.swatch;
    g.fillStyle = '#ffffff'; g.fillRect(x - 6, y - 6, w + 12, h + 12);
  }
  const out = document.createElement('canvas');
  out.width = PACK_W;
  out.height = PACK_H;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  for (const [k, [px, py, pw, ph]] of PACKED) {
    const [x, y, w, h] = k.split(',').map(Number);
    o.drawImage(c, x, y, w, h, px, py, pw, ph);
  }
  const tex = new THREE.CanvasTexture(out);
  tex.anisotropy = 4;
  return tex;
}

/** A flat textured quad facing (nx, 0, nz), mapped to an atlas cell. */
function quad(w: number, h: number, cell: Cell, x: number, y: number, z: number, nx: number, nz: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [cx, cy, cw, ch] = PACKED.get(cell.join())!;
  const u0 = cx / PACK_W, u1 = (cx + cw) / PACK_W, v1 = 1 - cy / PACK_H, v0 = 1 - (cy + ch) / PACK_H;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  g.rotateY(Math.atan2(nx, nz));
  return g.translate(x, y, z);
}
function tint(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color), n = ng.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  ng.deleteAttribute('uv');
  return ng;
}
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number, ang = 0) => new THREE.BoxGeometry(w, h, d).rotateY(ang).translate(x, y, z);
const flat = (w: number, d: number, x: number, y: number, z: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);

interface Face { ax: number; az: number; bx: number; bz: number; nx: number; nz: number; len: number; side: IkbSide }
type Rect = { x0: number; z0: number; x1: number; z1: number };
function faceOf(b: Rect, side: IkbSide): Face {
  switch (side) {
    case 's': return { ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, nx: 0, nz: 1, len: b.x1 - b.x0, side };
    case 'n': return { ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, nx: 0, nz: -1, len: b.x1 - b.x0, side };
    case 'e': return { ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, nx: 1, nz: 0, len: b.z1 - b.z0, side };
    default: return { ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, nx: -1, nz: 0, len: b.z1 - b.z0, side };
  }
}
const along = (f: Face, s: number, out: number): [number, number] => {
  const tx = (f.bx - f.ax) / f.len, tz = (f.bz - f.az) / f.len;
  return [f.ax + tx * s + f.nx * out, f.az + tz * s + f.nz * out];
};
const SIDES: IkbSide[] = ['n', 's', 'e', 'w'];

const TILE_U = 200, TILE_V = 4 * STOREY;
const SKIN: Record<IkbBuilding['skin'], { tex: FacadeKind; tint: number }> = {
  tile: { tex: 'tileB', tint: 0xd9dce2 },
  concrete: { tex: 'concrete', tint: 0xc9ccd0 },
  panel: { tex: 'apartment', tint: 0xc4cbd6 },
  brick: { tex: 'tileA', tint: 0xb9a69a },
  dark: { tex: 'tileB', tint: 0x7e8696 },
};
/** Lit windows: cool and neutral interiors. */
const WINDOW_LIGHTS = [0xeef2ff, 0xf6f1e6, 0xdfe6ff, 0xe9e0ff];

export interface IkebukuroStats { buildings: number; meshes: number; instanced: number; triangles: number; treads: number; fencePanels: number; parapets: number; lamps: number }

/** The ROOFTOP LOOP: roofs and decks whose fences facing the lane court carry the red line. */
const LOOP_COURT = { x0: IKB_LANE.x0 - 2, x1: IKB_LANE.x1 + 2, z0: -4565, z1: IKB_ALLEY.z0 + 2 };

/** Builds the rebuilt Ikebukuro into the scene. */
export function buildIkebukuro(scene: THREE.Scene): IkebukuroStats {
  const solid: THREE.BufferGeometry[] = [], white: THREE.BufferGeometry[] = [], lit: THREE.BufferGeometry[] = [], back: THREE.BufferGeometry[] = [];
  const win: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], red: THREE.BufferGeometry[] = [], ground: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [], mesh: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [];
  const skins: Record<string, THREE.BufferGeometry[]> = {};
  const acs: THREE.Matrix4[] = [], tanks: THREE.Matrix4[] = [], vents: THREE.Matrix4[] = [], masts: THREE.Matrix4[] = [], dishes: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [], treads: THREE.Matrix4[] = [], pipes: THREE.Matrix4[] = [], shrubs: THREE.Matrix4[] = [], beacons: THREE.Matrix4[] = [];
  const Y = new THREE.Vector3(0, 1, 0);
  const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), new THREE.Vector3(sx, sy, sz));
  const STEEL = 0x3c414b, GRATE = 0x596069, PLANT = 0xe3e7eb, NAVY = 0x27324a, FRAME = 0x2a2d33;
  const GF = GROUND_FLOOR;
  const pool = (x: number, z: number, r: number, col: number, y = 0.7) => pools.push(tint(flat(r * 2, r * 2, x, y, z), col));
  let ni = 0, bi = 0, wi = 0;

  // ------------------------------------------------------------ buildings
  const all = IKEBUKURO_BUILT.buildings;
  const hidden = (b: IkbBuilding, f: Face) => {
    const [mx, mz] = along(f, f.len / 2, 6);
    return all.some((o) => o !== b && mx > o.x0 && mx < o.x1 && mz > o.z0 && mz < o.z1);
  };
  const facade = (b: IkbBuilding, f: Face, y0: number, y1: number, tintC: THREE.Color, uOff: number) => {
    const sk = SKIN[b.skin];
    const g = new THREE.PlaneGeometry(f.len, y1 - y0);
    const uv = g.attributes.uv;
    const v0 = (y0 - GF) / TILE_V, v1 = (y1 - GF) / TILE_V;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uOff + uv.getX(i) * (f.len / TILE_U), v0 + uv.getY(i) * (v1 - v0));
    const [cx, cz] = along(f, f.len / 2, 0);
    g.rotateY(Math.atan2(f.nx, f.nz)).translate(cx, (y0 + y1) / 2, cz);
    const ng = g.toNonIndexed(), n = ng.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([tintC.r, tintC.g, tintC.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (skins[sk.tex] ??= []).push(ng);
  };
  for (const b of all) {
    const br = prng(b.id.charCodeAt(0) * 131 + (b.id.charCodeAt(1) || 0) * 17 + b.x0);
    const tintC = new THREE.Color(SKIN[b.skin].tint).multiplyScalar(0.92 + br() * 0.1);
    const uOff = Math.floor(br() * 4) * 0.5, top = b.h;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    for (const side of SIDES) {
      const f = faceOf(b, side);
      if (hidden(b, f)) continue;
      const front = b.fronts.includes(side), service = b.service === side, ang = Math.atan2(f.nx, f.nz);
      facade(b, f, front ? GF : 0, top, tintC, uOff);
      // A slab line at each floor, lit rooms in the middle storeys.
      {
        const [mx, mz] = along(f, f.len / 2, 1.2);
        for (let k = 2; k <= b.floors; k++) solid.push(tint(boxAt(f.nx ? 2.4 : f.len, 4, f.nx ? f.len : 2.4, mx, GF + (k - 2) * STOREY, mz), 0x4a4e57));
        const cols = Math.floor((f.len - 20) / 52);
        for (let k = 2; k <= b.floors; k++) for (let c = 0; c < cols; c++) {
          if (br() > 0.42) continue;
          const [wx, wz] = along(f, 10 + (c + 0.5) * ((f.len - 20) / cols), 0.9);
          win.push(tint(quad(36, 44, CELLS.swatch, wx, GF + (k - 2) * STOREY + STOREY / 2, wz, f.nx, f.nz), WINDOW_LIGHTS[Math.floor(br() * 4)]));
        }
      }
      if (front) {
        // Shop fronts in bays, a name band over each, a slim canopy, pillars.
        const bays = Math.max(1, Math.floor(f.len / 110)), bw = f.len / bays;
        for (let k = 0; k < bays; k++) {
          const s = (k + 0.5) * bw;
          const [qx, qz] = along(f, s, 1);
          lit.push(quad(bw - 14, GF - 34, CELLS.window(wi++ % 8), qx, (GF - 34) / 2 + 2, qz, f.nx, f.nz));
          back.push(quad(bw - 16, 22, CELLS.name(ni++ % 8), qx, GF - 18, qz, f.nx, f.nz));
          const [px, pz] = along(f, k * bw, 2);
          solid.push(tint(boxAt(f.nx ? 4 : 8, GF, f.nx ? 8 : 4, px, GF / 2, pz), FRAME));
          const [ax, az] = along(f, s, 14);
          solid.push(tint(boxAt(f.nx ? 26 : bw - 12, 3, f.nx ? bw - 12 : 26, ax, GF - 34, az), k % 3 === 1 ? NAVY : 0x50555f));
          pool(...along(f, s, 30), 46, 0xf2ecdc);
        }
        // One small blade sign per front, on the corner (quiet compared with Shibuya).
        if (b.floors >= 3 && br() < 0.75) {
          const [sx, sz] = along(f, 14, 20);
          back.push(quad(22, 90, CELLS.blade(bi % 8), sx, GF + 90, sz, Math.abs(f.nz), -Math.abs(f.nx) || 0));
          back.push(quad(22, 90, CELLS.blade(bi++ % 8), sx, GF + 90, sz, -Math.abs(f.nz), Math.abs(f.nx) || 0));
          solid.push(tint(boxAt(f.nx ? 30 : 3, 3, f.nx ? 3 : 30, ...([sx - f.nx * 6, GF + 136, sz - f.nz * 6] as [number, number, number])), STEEL));
        }
      } else {
        // Back and lane sides: a dark plinth, a steel door or a loading shutter, meters, pipes.
        const [px, pz] = along(f, f.len / 2, 0.8);
        solid.push(tint(boxAt(f.nx ? 1.6 : f.len, 26, f.nx ? f.len : 1.6, px, 13, pz), 0x3a3e46));
        const [dx, dz] = along(f, f.len * (0.25 + br() * 0.5), 1.2);
        const shutter = service && f.len > 120;
        solid.push(tint(boxAt(f.nx ? 2 : shutter ? 90 : 34, shutter ? 90 : 76, f.nx ? (shutter ? 90 : 34) : 2, dx, shutter ? 45 : 38, dz), shutter ? 0x8b9097 : 0x55606e));
        if (shutter) for (let r = 0; r < 9; r++) solid.push(tint(boxAt(f.nx ? 2.6 : 90, 1.2, f.nx ? 90 : 2.6, dx, 8 + r * 10, dz), 0x6e737a));
        glow.push(tint(boxAt(f.nx ? 3 : 12, 6, f.nx ? 12 : 3, dx, shutter ? 98 : 84, dz), WHITE));
        for (const s of [f.len * 0.15, f.len * 0.85]) {
          const [qx, qz] = along(f, s, 5);
          pipes.push(M4(qx, top / 2, qz, 0, 1.2, top, 1.2));
        }
        if (service) {
          for (let k = 0; k < 3; k++) {
            const [mx, mz] = along(f, 18 + k * 16, 3);
            solid.push(tint(boxAt(f.nx ? 5 : 12, 18, f.nx ? 12 : 5, mx, 60, mz), 0xb4b9bf));
          }
        }
        // Air-con units on brackets from the second storey up (out of the chase camera's path).
        for (let k = 2; k <= b.floors; k++) {
          if (br() < 0.35) continue;
          const s = 30 + br() * Math.max(1, f.len - 60), y = GF + (k - 1) * STOREY - 40;
          const [ax, az] = along(f, s, 16);
          acs.push(M4(ax, y, az, ang, 0.75, 0.75, 0.75));
          const [kx, kz] = along(f, s, 8);
          solid.push(tint(boxAt(f.nx ? 16 : 26, 3, f.nx ? 26 : 16, kx, y - 12, kz), STEEL));
        }
      }
    }
    // Roof: membrane, a coping line, and its plant.
    roofs.push(flat(w, d, cx, top + 0.5, cz));
    for (const side of SIDES) {
      const f = faceOf(b, side);
      if (hidden(b, f)) continue;
      const [mx, mz] = along(f, f.len / 2, -3);
      solid.push(tint(boxAt(f.nx ? 7 : f.len + 1, 6, f.nx ? f.len + 1 : 7, mx, top + 3, mz), 0x9aa0a8));
    }
    if (b.walk) {
      // A white safety line painted inside the fences.
      const ins = 22;
      for (const [lw, ld, lx, lz] of [[w - 2 * ins, 3, cx, b.z0 + ins], [w - 2 * ins, 3, cx, b.z1 - ins], [3, d - 2 * ins, b.x0 + ins, cz], [3, d - 2 * ins, b.x1 - ins, cz]] as const) {
        ground.push(tint(flat(lw, ld, lx, top + 0.9, lz), 0xd6dbe0));
      }
      // Pipes and small units hugging the fences (closer to the fence than anyone can stand).
      const runs: [number, number, number, number][] = [[b.x0 + 4, b.z0 + 4, b.x1 - 4, b.z0 + 4], [b.x0 + 4, b.z1 - 4, b.x1 - 4, b.z1 - 4]];
      for (const [ax, az, bx] of runs) {
        if (br() < 0.4) continue;
        const L = bx - ax;
        pipes.push(new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, top + 6, az), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), new THREE.Vector3(1.6, L * 0.8, 1.6)));
      }
    } else {
      // Backdrop roofs: clusters of air-con units, FRP tanks, vents, an antenna, a billboard back.
      const n = Math.round((w * d) / 9000);
      for (let k = 0; k < n; k++) {
        const x = b.x0 + 24 + br() * (w - 48), z = b.z0 + 24 + br() * (d - 48);
        acs.push(M4(x, top + 15, z, Math.floor(br() * 4) * Math.PI / 2));
      }
      if (w * d > 20000) tanks.push(M4(cx + (br() - 0.5) * w * 0.4, top + 44, cz + (br() - 0.5) * d * 0.4, 0, 1, 1, 1));
      for (let k = 0; k < 3; k++) vents.push(M4(b.x0 + 20 + br() * (w - 40), top + 9, b.z0 + 20 + br() * (d - 40)));
      if (br() < 0.7) {
        const mx = b.x0 + 18 + br() * (w - 36), mz = b.z0 + 18 + br() * (d - 36), mh = 90 + br() * 90;
        masts.push(M4(mx, top + mh / 2, mz, 0, 1, mh, 1));
        if (br() < 0.6) dishes.push(M4(mx + 8, top + mh * 0.7, mz, br() * 6));
        beacons.push(M4(mx, top + mh + 3, mz));
      }
      // Fences on the backdrop roofs (visual), so the roofline reads as a rooftop district.
      for (const side of SIDES) {
        const f = faceOf(b, side);
        if (hidden(b, f)) continue;
        const [mx, mz] = along(f, f.len / 2, -4);
        mesh.push(new THREE.PlaneGeometry(f.len - 8, 34).rotateY(Math.atan2(f.nx, f.nz)).translate(mx, top + 6 + 17, mz));
        solid.push(tint(boxAt(f.nx ? 3 : f.len - 8, 3, f.nx ? f.len - 8 : 3, mx, top + 6 + 34, mz), 0x6b727c));
      }
    }
  }
  // Roof billboards on the backdrop: lit faces toward the street, steel backs toward the network.
  const billboard = (x: number, z: number, top: number, facing: number, cell: Cell, wdt = 150) => {
    const nx = Math.sin(facing), nz = Math.cos(facing), h = 96, y = top + 40 + h / 2;
    back.push(quad(wdt, h, cell, x + nx * 2, y, z + nz * 2, nx, nz));
    solid.push(tint(boxAt(wdt + 6, h + 6, 3, x, y, z, facing), FRAME));
    for (const s of [-wdt / 2 + 10, -wdt / 6, wdt / 6, wdt / 2 - 10]) {
      const px = x + Math.cos(facing) * s, pz = z - Math.sin(facing) * s;
      solid.push(tint(boxAt(4, h + 40, 4, px - nx * 6, top + (h + 40) / 2, pz - nz * 6), STEEL));
      solid.push(tint(boxAt(3, 3, 40, px - nx * 22, top + 40, pz - nz * 22, facing), STEEL));
    }
    for (const yy of [y - h / 3, y + h / 3]) solid.push(tint(boxAt(wdt, 3, 3, x - nx * 6, yy, z - nz * 6, facing), STEEL));
  };
  {
    const byId = (id: string) => all.find((b) => b.id === id)!;
    const P1 = byId('P1'), Q2 = byId('Q2'), Q4 = byId('Q4'), P2 = byId('P2');
    billboard((P1.x0 + P1.x1) / 2, P1.z0 + 30, P1.h, Math.PI, CELLS.board(0), 120); // faces the square (north)
    billboard(Q2.x0 + 30, (Q2.z0 + Q2.z1) / 2, Q2.h, -Math.PI / 2, CELLS.board(1), 120); // faces west to the corridor
    billboard((Q4.x0 + Q4.x1) / 2, Q4.z1 - 30, Q4.h, 0, CELLS.board(0), 110); // faces the avenue
    billboard((P2.x0 + P2.x1) / 2, P2.z1 - 26, P2.h, 0, CELLS.board(1), 140); // faces the avenue; its back is what SKY SERVICE's roof sees
  }

  // ------------------------------------------------------------ fences (from the collision fences)
  let fencePanels = 0, parapets = 0;
  // Ordinary roof edges get a low concrete parapet instead of chain-link (drawing only: the
  // collision fence underneath is the same). Chain-link stays on bridges, the hub, landings,
  // round every stair and fire escape. Roof edges on the ROOFTOP LOOP court keep the red line on the coping.
  const gap = (p: BoxPrim, r: { x0: number; z0: number; x1: number; z1: number }) =>
    Math.max(r.x0 - (p.x + p.w / 2), p.x - p.w / 2 - r.x1, 0) + Math.max(r.z0 - (p.z + p.d / 2), p.z - p.d / 2 - r.z1, 0);
  const onRoof = (p: BoxPrim) => Math.abs(p.y0 - R3) < 1 && all.some((b) => b.walk && gap(p, { x0: b.x0 + 8, z0: b.z0 + 8, x1: b.x1 - 8, z1: b.z1 - 8 }) > 0 && gap(p, { x0: b.x0 - 4, z0: b.z0 - 4, x1: b.x1 + 4, z1: b.z1 + 4 }) === 0);
  const nearWay = (p: BoxPrim) => IKB_DECKS.some((k) => gap(p, k) < 36) || IKB_STAIRS.some((t) => gap(p, t) < 36);
  const parapetAt = (p: BoxPrim, loop: boolean) => {
    const alongX = p.w >= p.d, len = alongX ? p.w : p.d, y = p.y0;
    solid.push(tint(boxAt(alongX ? len : 6, 30, alongX ? 6 : len, p.x, y + 15, p.z), 0x868c95));
    solid.push(tint(boxAt(alongX ? len : 9, 3, alongX ? 9 : len, p.x, y + 31.5, p.z), 0xb7bdc5));
    if (loop) red.push(tint(boxAt(alongX ? len : 2, 2, alongX ? 2 : len, p.x, y + 34, p.z), RED));
    parapets++;
  };
  const fenceAt = (p: BoxPrim) => {
    const alongX = p.w >= p.d, len = alongX ? p.w : p.d, y = p.y0;
    // ROOFTOP LOOP: a red line along the fences that look into the lane court.
    const inCourt = (x: number, z: number) => x > LOOP_COURT.x0 && x < LOOP_COURT.x1 && z > LOOP_COURT.z0 && z < LOOP_COURT.z1;
    const nearCourt = alongX ? inCourt(p.x, p.z + 8) || inCourt(p.x, p.z - 8) : inCourt(p.x + 8, p.z) || inCourt(p.x - 8, p.z);
    const courtEdge = alongX ? Math.abs(p.z - LOOP_COURT.z0) < 20 || Math.abs(p.z - LOOP_COURT.z1) < 70 : Math.abs(p.x - LOOP_COURT.x0) < 12 || Math.abs(p.x - LOOP_COURT.x1) < 12;
    const loop = nearCourt && courtEdge && y > 150;
    if (onRoof(p)) {
      // Long roof edges: parapet where the edge is clear of every way up or across, chain-link near them.
      const n = Math.max(1, Math.round(len / 10)), step = len / n;
      const piece = (i: number, j: number): BoxPrim => {
        const c = -len / 2 + ((i + j) / 2) * step, l = (j - i) * step;
        return { ...p, x: alongX ? p.x + c : p.x, z: alongX ? p.z : p.z + c, w: alongX ? l : p.w, d: alongX ? p.d : l };
      };
      const par = Array.from({ length: n }, (_, i) => !nearWay(piece(i, i + 1)));
      if (par.every((v) => !v)) return drawFence(p, loop);
      for (let i = 0; i < n; ) {
        let j = i;
        while (j < n && par[j] === par[i]) j++;
        if (par[i]) parapetAt(piece(i, j), loop); else drawFence(piece(i, j), loop);
        i = j;
      }
      return;
    }
    drawFence(p, loop);
  };
  const drawFence = (p: BoxPrim, loop: boolean) => {
    const alongX = p.w >= p.d, len = alongX ? p.w : p.d, y = p.y0, ang = alongX ? 0 : Math.PI / 2;
    const H = 44;
    mesh.push(new THREE.PlaneGeometry(len, H).rotateY(ang).translate(p.x, y + H / 2 + 2, p.z));
    solid.push(tint(boxAt(alongX ? len : 3, 3, alongX ? 3 : len, p.x, y + H + 2, p.z), 0x7a818b));
    solid.push(tint(boxAt(alongX ? len : 2, 2, alongX ? 2 : len, p.x, y + 4, p.z), 0x7a818b));
    const n = Math.max(1, Math.round(len / 40));
    for (let k = 0; k <= n; k++) {
      const t = -len / 2 + (len * k) / n;
      posts.push(M4(alongX ? p.x + t : p.x, y + H / 2 + 2, alongX ? p.z : p.z + t, 0, 1, H + 4, 1));
    }
    if (loop) red.push(tint(boxAt(alongX ? len : 2, 2.5, alongX ? 2 : len, p.x, y + H + 5, p.z), RED));
    fencePanels++;
  };
  for (const p of WORLD) {
    if (p.group !== 'ikebukuro' || p.kind !== 'box' || !p.noFloor) continue;
    const b = p as BoxPrim;
    const thin = Math.min(b.w, b.d) <= 6.5;
    if (thin && b.y1 - b.y0 === 32) fenceAt(b);
  }

  // ------------------------------------------------------------ stairs, bridges, landings
  let treadCount = 0;
  const hAt = (s: IkbStair, u: number) => {
    const [a0, a1] = s.axis === 'x' ? [s.x0, s.x1] : [s.z0, s.z1];
    const t = Math.min(1, Math.max(0, s.dir === 1 ? (u - a0) / (a1 - a0) : (a1 - u) / (a1 - a0)));
    return s.low + (s.high - s.low) * t;
  };
  for (const s of IKB_STAIRS) {
    const alongX = s.axis === 'x', [a0, a1] = alongX ? [s.x0, s.x1] : [s.z0, s.z1], [c0, c1] = alongX ? [s.z0, s.z1] : [s.x0, s.x1];
    const len = a1 - a0, across = c1 - c0, mid = (c0 + c1) / 2, rise = s.high - s.low, slope = Math.atan2(rise, len);
    // Treads (instanced) and lit nosings on every third.
    const n = Math.max(2, Math.round(len / 10));
    for (let k = 0; k < n; k++) {
      const u = a0 + ((k + 0.5) / n) * len, h = hAt(s, u);
      treads.push(alongX ? M4(u, h - 1.5, mid, 0, len / n + 1, 3, across - 6) : M4(mid, h - 1.5, u, 0, across - 6, 3, len / n + 1));
      if (k % 3 === 0 && s.kind !== 'roof') glow.push(tint(alongX ? boxAt(1.5, 1, across - 10, u + (len / n / 2) * (s.dir === 1 ? -1 : 1), h + 0.2, mid) : boxAt(across - 10, 1, 1.5, mid, h + 0.2, u + (len / n / 2) * (s.dir === 1 ? -1 : 1)), WHITE));
      treadCount++;
    }
    // Stringers: two sloped steel plates; the underside for raised flights.
    const cu = (a0 + a1) / 2, ch = (s.low + s.high) / 2;
    for (const c of [c0 + 2, c1 - 2]) {
      const g = new THREE.BoxGeometry(Math.hypot(len, rise), 14, 3);
      g.rotateZ(slope * (s.dir === 1 ? 1 : -1));
      if (!alongX) g.rotateY(-Math.PI / 2);
      solid.push(tint(g.translate(alongX ? cu : c, ch - 6, alongX ? c : cu), STEEL));
    }
    // Handrails on the open sides (where the collision has rail pieces).
    for (const c of [c0, c1]) {
      const pieces = WORLD.filter((p) => p.group === 'ikebukuro' && p.kind === 'box' && p.noFloor && (alongX ? Math.abs(p.z - (c + (c === c0 ? 3 : -3))) < 0.6 && p.x > a0 && p.x < a1 : Math.abs(p.x - (c + (c === c0 ? 3 : -3))) < 0.6 && p.z > a0 && p.z < a1));
      if (!pieces.length) continue;
      const lo = Math.min(...pieces.map((p) => (alongX ? p.x - p.w / 2 : p.z - p.d / 2))), hi = Math.max(...pieces.map((p) => (alongX ? p.x + p.w / 2 : p.z + p.d / 2)));
      const h0 = hAt(s, lo), h1 = hAt(s, hi), L = hi - lo;
      const g = new THREE.BoxGeometry(Math.hypot(L, h1 - h0), 2.4, 2.4);
      g.rotateZ(Math.atan2(h1 - h0, L));
      if (!alongX) g.rotateY(-Math.PI / 2);
      const cc = c + (c === c0 ? 2 : -2);
      solid.push(tint(g.translate(alongX ? (lo + hi) / 2 : cc, (h0 + h1) / 2 + 36, alongX ? cc : (lo + hi) / 2), 0x8a919b));
      for (let u = lo; u <= hi + 0.1; u += 36) {
        const h = hAt(s, u);
        posts.push(alongX ? M4(u, h + 18, cc, 0, 1, 36, 1) : M4(cc, h + 18, u, 0, 1, 36, 1));
      }
    }
  }
  // Landings and decks: grating slabs with a steel edge; the SKY LINK and the lane bridge get fascia signs.
  for (const k of IKB_DECKS) {
    const w = k.x1 - k.x0, d = k.z1 - k.z0, cx = (k.x0 + k.x1) / 2, cz = (k.z0 + k.z1) / 2;
    solid.push(tint(boxAt(w, 10, d, cx, k.y - 6, cz), k.kind === 'hub' ? 0x4b5361 : GRATE));
    if (k.kind === 'landing') {
      // Thin posts from the landing corners to the ground (raised landings).
      for (const [px, pz] of [[k.x0 + 3, k.z0 + 3], [k.x1 - 3, k.z0 + 3], [k.x0 + 3, k.z1 - 3], [k.x1 - 3, k.z1 - 3]]) solid.push(tint(boxAt(5, k.y, 5, px, k.y / 2, pz), STEEL));
      continue;
    }
    // Girders under the deck along its length.
    const alongX = w >= d;
    for (const o of [-1, 1]) solid.push(tint(alongX ? boxAt(w, 22, 4, cx, k.y - 22, cz + o * (d / 2 - 4)) : boxAt(4, 22, d, cx + o * (w / 2 - 4), k.y - 22, cz), STEEL));
    if (k.id === 'link') {
      // A light truss on both sides (it spans the avenue with nothing standing in it), the fascia band, lit kerbs.
      const L = d, n = Math.round(L / 49);
      for (const ox of [k.x0 + 2, k.x1 - 2]) {
        for (let i = 0; i < n; i++) {
          const z0 = k.z0 + (L * i) / n, z1 = k.z0 + (L * (i + 1)) / n, zz = (z0 + z1) / 2;
          const g = new THREE.BoxGeometry(3, Math.hypot(z1 - z0, 40), 3).rotateX((i % 2 ? 1 : -1) * Math.atan2(z1 - z0, 40)).translate(ox, k.y - 32, zz);
          solid.push(tint(g, STEEL));
          solid.push(tint(boxAt(3, 40, 3, ox, k.y - 32, z0), STEEL));
        }
        solid.push(tint(boxAt(3, 4, L, ox, k.y - 52, cz), STEEL));
        red.push(tint(boxAt(1.5, 2, L - 8, ox + (ox < cx ? -2 : 2), k.y - 2, cz), RED));
      }
      for (const z of [k.z0 + 140, k.z1 - 160]) {
        lit.push(quad(220, 24, CELLS.fascia(0), k.x0 - 1.5, k.y - 30, z, -1, 0), quad(220, 24, CELLS.fascia(0), k.x1 + 1.5, k.y - 30, z, 1, 0));
      }
    }
    if (k.kind === 'hub') {
      // NETWORK HUB: cable trays to each roof it joins, violet status strips, the sign.
      for (const [tx, tz, tw, td] of [[k.x0 + 30, k.z0 + 22, 50, 8], [k.x1 - 30, k.z0 + 22, 50, 8], [k.x0 + 30, k.z1 - 22, 50, 8], [cx, cz, 8, d - 50]] as const) {
        solid.push(tint(boxAt(tw, 6, td, tx, k.y + 6, tz), 0x7c838d));
      }
      glow.push(tint(boxAt(w - 20, 2, 2, cx, k.y - 1, k.z0 + 1), VIOLET), tint(boxAt(w - 20, 2, 2, cx, k.y - 1, k.z1 - 1), VIOLET));
      // Floor paint (no glow): a dashed ring round the relay cabinet, dashed lines out to every
      // way in, a walkway border and small violet arrows pointing in, so the deck reads as the node.
      const cab = IKB_PLANT.find((q) => q.id === 'hub.cab')!;
      const hx = (cab.x0 + cab.x1) / 2, hz = (cab.z0 + cab.z1) / 2, R = 56, py = k.y + 0.4, PAINT = 0xd9dde3;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        ground.push(tint(new THREE.PlaneGeometry(8, 4).rotateX(-Math.PI / 2).rotateY(-a).translate(hx + Math.sin(a) * R, py, hz + Math.cos(a) * R), PAINT));
      }
      const dash = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 24), alongX = Math.abs(x1 - x0) > 1;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          ground.push(tint(flat(alongX ? 14 : 4, alongX ? 4 : 14, x0 + (x1 - x0) * t, py, z0 + (z1 - z0) * t), PAINT));
        }
      };
      dash(k.x0 + 6, hz, hx - R - 6, hz); dash(hx + R + 6, hz, k.x1 - 6, hz);
      dash(hx, k.z0 + 6, hx, hz - R - 6); dash(hx, hz + R + 6, hx, k.z1 - 6);
      for (const [x0, z0, x1, z1] of [[k.x0 + 4, k.z0 + 4, k.x1 - 4, k.z0 + 4], [k.x0 + 4, k.z1 - 4, k.x1 - 4, k.z1 - 4], [k.x0 + 4, k.z0 + 4, k.x0 + 4, k.z1 - 4], [k.x1 - 4, k.z0 + 4, k.x1 - 4, k.z1 - 4]]) {
        const alongX = z0 === z1;
        ground.push(tint(flat(alongX ? x1 - x0 : 3, alongX ? 3 : z1 - z0, (x0 + x1) / 2, py, (z0 + z1) / 2), 0x9aa1ab));
      }
      for (const [ax, az, ang] of [[k.x0 + 26, hz, Math.PI / 2], [k.x1 - 26, hz, -Math.PI / 2], [hx, k.z0 + 26, 0], [hx, k.z1 - 26, Math.PI]] as const) {
        const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9, 0, -6), new THREE.Vector3(0, 0, 10), new THREE.Vector3(9, 0, -6)]);
        tri.setIndex([0, 1, 2]);
        tri.computeVertexNormals();
        tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
        ground.push(tint(tri.rotateY(ang).translate(ax, py + 0.1, az), 0x7a5fc8));
      }
      pool(cx, cz, 120, VIOLET, CURB + 0.6);
    }
  }
  // The lane bridge fascia (ROOFTOP LOOP), visible from the avenue and the SKY LINK.
  {
    const s = IKB_DECKS.find((t) => t.id === 'laneBridge')!;
    const mx = (s.x0 + s.x1) / 2, h = s.y;
    lit.push(quad(170, 22, CELLS.fascia(1), mx, h - 26, s.z0 - 2, 0, -1), quad(170, 22, CELLS.fascia(1), mx, h - 26, s.z1 + 2, 0, 1));
  }

  // ------------------------------------------------------------ roof plant (the solid sight blockers)
  for (const q of IKB_PLANT) {
    const w = q.x1 - q.x0, d = q.z1 - q.z0, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, top = q.y + q.h;
    if (q.kind === 'room') {
      white.push(tint(boxAt(w, q.h, d, cx, q.y + q.h / 2, cz), PLANT));
      for (let k = 0; k < 4; k++) solid.push(tint(boxAt(w + 1.5, 2, d + 1.5, cx, q.y + 20 + k * 9, cz), 0x9aa2ac)); // louvre bands
      solid.push(tint(boxAt(w + 4, 4, d + 4, cx, top + 2, cz), 0x9aa0a8));
      for (let k = 0; k < Math.max(1, Math.floor(w / 40)); k++) vents.push(M4(q.x0 + 20 + k * 40, top + 9, cz, 0, 1.4, 1.4, 1.4));
      if (q.id === 'K.room') {
        // SKY SERVICE: the cooling tower on top, the vertical sign facing the square.
        tanks.push(M4(cx + 20, top + 50, cz, 0, 1.1, 1.2, 1.1));
        lit.push(quad(80, 26, CELLS.way(3), cx, top - 26, q.z0 - 2.5, 0, -1), quad(80, 26, CELLS.way(3), q.x0 - 2.5, top - 26, cz, -1, 0));
        glow.push(tint(boxAt(w + 6, 2, 2, cx, top + 5, q.z0 - 2), RED));
      }
    } else if (q.kind === 'tank') {
      // FRP panel water tank on a steel stand.
      white.push(tint(boxAt(w, q.h - 26, d, cx, q.y + 26 + (q.h - 26) / 2, cz), 0xdfe4ea));
      for (let k = 1; k < 3; k++) solid.push(tint(boxAt(w + 1, 1.5, d + 1, cx, q.y + 26 + k * (q.h - 26) / 3, cz), 0xb3bac3));
      solid.push(tint(boxAt(w, 26, d, cx, q.y + 13, cz), STEEL));
      solid.push(tint(boxAt(w * 0.5, 6, d * 0.5, cx, top + 3, cz), 0xc8ced6));
    } else if (q.kind === 'cabinet') {
      white.push(tint(boxAt(w, q.h, d, cx, q.y + q.h / 2, cz), 0xd3d8de));
      const faceN = q.id === 'hub.cab';
      if (faceN) {
        for (const [nx, nz] of [[0, -1], [0, 1], [1, 0], [-1, 0]] as const) {
          const fw = nx ? d : w;
          lit.push(quad(fw - 6, q.h - 10, CELLS.cabinet, cx + nx * (w / 2 + 0.8), q.y + q.h / 2, cz + nz * (d / 2 + 0.8), nx, nz));
        }
        // Antenna cluster and a red beacon on the hub cabinet.
        for (const [ox, oz, mh] of [[-18, -18, 120], [16, 12, 90], [-6, 20, 70]]) { masts.push(M4(cx + ox, top + mh / 2, cz + oz, 0, 1, mh, 1)); beacons.push(M4(cx + ox, top + mh + 3, cz + oz)); }
        dishes.push(M4(cx + 18, top + 60, cz - 12, 2.2));
        // Relay rack: a steel frame round the cabinet carrying three white sector antennas, so the
        // hub has its own outline over the roof line (no bigger than the cabinet's footprint).
        const fx = w / 2 + 5, fz = d / 2 + 5, fy = top + 34;
        for (const [ox, oz] of [[-fx, -fz], [fx, -fz], [-fx, fz], [fx, fz]]) solid.push(tint(boxAt(4, fy - q.y, 4, cx + ox, (q.y + fy) / 2, cz + oz), STEEL));
        for (const oz of [-fz, fz]) solid.push(tint(boxAt(2 * fx + 4, 4, 4, cx, fy, cz + oz), STEEL));
        for (const ox of [-fx, fx]) solid.push(tint(boxAt(4, 4, 2 * fz + 4, cx + ox, fy, cz), STEEL));
        for (const [ox, oz, nx, nz] of [[-fx - 4, 8, -1, 0], [fx + 4, -8, 1, 0], [6, -fz - 4, 0, -1]] as const) {
          white.push(tint(boxAt(nx ? 5 : 12, 30, nz ? 5 : 12, cx + ox, fy - 4, cz + oz), 0xe9ecf0));
        }
      } else {
        glow.push(tint(boxAt(Math.min(w, d) * 0.4, 3, 1.2, cx, q.y + q.h - 12, q.z0 - 0.7), VIOLET));
        vents.push(M4(cx, top + 9, cz));
      }
    } else if (q.kind === 'mast') {
      // SIGNAL GARDEN: a lattice mast with dishes and a red beacon on a concrete base.
      solid.push(tint(boxAt(w, q.h, d, cx, q.y + q.h / 2, cz), 0x8d939b));
      const mh = 260;
      for (const [ox, oz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) masts.push(M4(cx + ox, top + mh / 2, cz + oz, 0, 1, mh, 1));
      for (let k = 1; k < 7; k++) solid.push(tint(boxAt(18, 2, 18, cx, top + k * (mh / 7), cz), STEEL));
      for (let k = 0; k < 3; k++) dishes.push(M4(cx + (k - 1) * 10, top + 120 + k * 45, cz + 12, k * 2.1, 1.4, 1.4, 1.4));
      beacons.push(M4(cx, top + mh + 4, cz, 0, 1.6, 1.6, 1.6));
    } else {
      // Planters: a timber-clad box with shrubs.
      solid.push(tint(boxAt(w, q.h, d, cx, q.y + q.h / 2, cz), 0x6b5848));
      ground.push(tint(flat(w - 4, d - 4, cx, q.y + q.h + 0.4, cz), 0x3d4a33));
      for (let x = q.x0 + 10; x < q.x1; x += 18) for (let z = q.z0 + 10; z < q.z1; z += 18) shrubs.push(M4(x, q.y + q.h + 8, z, x, 1, 0.8, 1));
    }
  }
  // SIGNAL GARDEN extras (visual): timber deck pads, more antennas along the fence, small dishes.
  {
    const w3 = all.find((b) => b.role === 'signalGarden')!;
    ground.push(tint(flat(70, 50, w3.x0 + 70, w3.h + 1, w3.z0 + 85), 0x7a6450));
    for (let k = 0; k < 5; k++) {
      const x = w3.x0 + 8, z = w3.z0 + 20 + k * 32, mh = 70 + (k % 3) * 30;
      masts.push(M4(x, w3.h + mh / 2, z, 0, 1, mh, 1));
      if (k % 2) dishes.push(M4(x + 6, w3.h + mh * 0.75, z, Math.PI));
    }
    lit.push(quad(110, 34, CELLS.way(2), w3.x0 - 1.5, w3.h - 30, (w3.z0 + w3.z1) / 2, -1, 0));
  }
  // Roof air-con clusters on the network roofs, tucked against fences away from the ways in.
  const roofAC: [number, number, number, number][] = [
    [-2357, -4475, R3, Math.PI / 2], [-2357, -4448, R3, Math.PI / 2],
    [-2357, -4380, R3, Math.PI / 2], [-2357, -4352, R3, Math.PI / 2],
    [-2012, -4500, R3, -Math.PI / 2], [-2012, -4472, R3, -Math.PI / 2], [-2012, -4395, R3, -Math.PI / 2], [-2012, -4367, R3, -Math.PI / 2],
    [-2066, -4160, R3, Math.PI / 2], [-2066, -4132, R3, Math.PI / 2], [-2032, -4054, R3, 0],
    [-1836, -5070, R3, Math.PI], [-1866, -5070, R3, Math.PI], [-1896, -5070, R3, Math.PI],
  ];
  for (const [x, z, y, a] of roofAC) acs.push(M4(x, y + 15, z, a, 0.8, 0.8, 0.8));

  // ------------------------------------------------------------ signs on the street
  const wayAt = (i: number, x: number, y: number, z: number, nx: number, nz: number, w = 96) => {
    const h = i < 4 ? w * 0.31 : w * 0.19;
    const cell: Cell = i < 4 ? CELLS.way(i) : way4(i);
    lit.push(quad(w, h, cell, x + nx * 1.5, y, z + nz * 1.5, nx, nz));
    solid.push(tint(boxAt(nx ? 2 : w + 4, h + 4, nx ? w + 4 : 2, x, y, z), FRAME));
  };
  // BACKSTAIR plates at the foot of each stair from the street; STREET LOOP plates at the corners.
  wayAt(4, -2511, 70, -4536, -1, 0, 80); // avenue stair
  wayAt(4, -1891, 70, -4330, 1, 0, 80); // side-street fire escape
  wayAt(4, -2187, 70, -4320, -1, 0, 80); // lane fire escape
  wayAt(4, -2040, 70, -5367, 0, -1, 80); // the square's fire escape
  wayAt(5, -2507, 160, -4600, -1, 0, 96);
  wayAt(5, -1898, 160, -4045, 1, 0, 96);
  wayAt(6, -2080, 160, -5000, 0, -1, 96);
  wayAt(7, -2042, R3 + 60, -5052, 0, -1, 80); // SKY LINK plate over the bridge's start
  // NETWORK HUB plate and ROOFTOP LOOP plate on the network.
  wayAt(1, -2185, R3 + 120, -4165, 0, 1, 110);
  wayAt(0, -2185, R3 + 70, -4566, 0, -1, 110);
  // Station sign over the square (on SKY SERVICE's west face) and on P1.
  lit.push(quad(150, 56, CELLS.station, -2082, GF + 60, -5170, -1, 0));
  lit.push(quad(130, 48, CELLS.station, -2495, GF + 70, -5232, 0, -1));

  // ------------------------------------------------------------ ground
  // Station square: light granite paving round the point (decal; the war point draws over it).
  for (let x = -2440; x < -2080; x += 60) for (let z = -5420; z < -5200; z += 60) {
    ground.push(tint(flat(59, 59, x + 30, 0.35, z + 30), ((x + z) / 60) % 2 ? 0x8d9097 : 0x979aa1));
  }
  // The passage from the square to the avenue and the corridor along SKY SERVICE: darker asphalt with a kerb line.
  ground.push(tint(flat(160, 140, -2160, 0.3, -5120), 0x4b4e55));
  // Back lane and cross alley: worn dark paving with a drain line; the STREET LOOP's red edge line and chevrons.
  for (let z = IKB_LANE.z0 + 70; z < IKB_LANE.z1 - 20; z += 40) ground.push(tint(flat(IKB_LANE.x1 - IKB_LANE.x0 - 4, 39, (IKB_LANE.x0 + IKB_LANE.x1) / 2, CURB + 0.35, z + 20), (z / 40) % 2 ? 0x4a4c51 : 0x54565b));
  for (let x = IKB_ALLEY.x0 + 70; x < IKB_ALLEY.x1 - 70; x += 40) {
    if (x > IKB_LANE.x0 && x < IKB_LANE.x1) continue;
    ground.push(tint(flat(39, IKB_ALLEY.z1 - IKB_ALLEY.z0 - 4, x + 20, CURB + 0.35, (IKB_ALLEY.z0 + IKB_ALLEY.z1) / 2), (x / 40) % 2 ? 0x4a4c51 : 0x54565b));
  }
  ground.push(tint(flat(4, IKB_LANE.z1 - IKB_LANE.z0 - 90, (IKB_LANE.x0 + IKB_LANE.x1) / 2 + 40, CURB + 0.6, (IKB_LANE.z0 + IKB_LANE.z1) / 2 + 20), 0x2c2e33));
  {
    // STREET LOOP: a red-and-white kerb line round the network block, chevrons showing the way round.
    const L = { x0: -2525, x1: -1879, z0: -4647, z1: -4000 };
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 40);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, alongX = Math.abs(x1 - x0) > 1;
        ground.push(tint(flat(alongX ? 36 : 5, alongX ? 5 : 36, x, 0.45, z), k % 2 ? 0xf2f4f6 : RED));
      }
    };
    seg(L.x0, L.z0, L.x1, L.z0); seg(L.x1, L.z0, L.x1, L.z1); seg(L.x1, L.z1, L.x0, L.z1); seg(L.x0, L.z1, L.x0, L.z0);
    const chevron = (x: number, z: number, ang: number) => {
      for (const s of [-1, 1]) {
        const g = new THREE.PlaneGeometry(26, 6).rotateX(-Math.PI / 2).rotateY(ang + s * 0.6).translate(x + Math.sin(ang) * 0 + s * Math.cos(ang) * 8, 0.5, z - s * Math.sin(ang) * 8);
        ground.push(tint(g, 0xe6e9ee));
      }
    };
    for (const z of [-4500, -4300, -4100]) chevron(-2560, z, 0);
    for (const z of [-4500, -4300, -4100]) chevron(-1840, z, Math.PI);
    for (const x of [-2350, -2050]) chevron(x, -4690, Math.PI / 2);
  }

  // Wall lamps (the gameplay lamps on façades): a bracket and a head.
  let lamps = 0;
  for (const l of LIGHTS) {
    if (!l.wall || l.x > -1880 || l.x < -2520 || l.z < -4640 || l.z > -4000) continue;
    const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
    solid.push(tint(boxAt(Math.abs(dx) * 22 + 3, 3, Math.abs(dz) * 22 + 3, l.x + dx * 11, 160, l.z + dz * 11), STEEL));
    glow.push(tint(boxAt(14, 8, 14, l.x + dx * 22, 154, l.z + dz * 22), 0xf4f0ff));
    lamps++;
  }
  // Light pools at the stair feet (white) and the ROOFTOP LOOP court (red, faint).
  pool(-2482, -4536, 50, WHITE, CURB + 0.6);
  pool(-1920, -4330, 50, WHITE, CURB + 0.6);
  pool(-2106, -4320, 50, WHITE, CURB + 0.6);
  pool(-2037, -5338, 60, WHITE, 0.6);
  pool(-2185, -4480, 90, RED, CURB + 0.6);

  // ------------------------------------------------------------ materials and meshes
  const tex = atlas();
  const signMat = (i: number, tone = 0xffffff) => nearFade(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: tone, emissiveMap: tex, emissiveIntensity: i, roughness: 1 }), 30, 120);
  const litMat = signMat(0.6), backMat = signMat(0.32, 0xd8dbe2);
  const solidMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 }), 30, 120);
  const whiteMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }), 30, 120);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const redMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const rt = roofTexture();
  rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
  const roofMat = new THREE.MeshStandardMaterial({ map: rt, color: 0x8c939c, roughness: 0.95 });
  // Chain-link fence: a see-through diamond mesh (alpha-tested).
  const fenceTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(190,198,208,1)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(32, 32); g.moveTo(32, 0); g.lineTo(0, 32); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const meshMat = new THREE.MeshStandardMaterial({ map: fenceTex, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
  const poolMat = new THREE.MeshBasicMaterial({ map: radialGlowTexture(), vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  NIGHT_GLOW.push({
    set: (k) => {
      litMat.emissiveIntensity = 0.6 + 0.18 * k;
      backMat.emissiveIntensity = 0.32 + 0.1 * k;
      winMat.color.setScalar(0.5 + 0.42 * k);
      glowMat.color.setScalar(0.7 + 0.3 * k);
      redMat.color.setScalar(0.75 + 0.25 * k);
      poolMat.opacity = 0.1 + 0.45 * k;
    },
  });
  // World-space UVs for the roofs and the fence mesh (tile repeats by size).
  const worldUV = (g: THREE.BufferGeometry, axes: 'xz' | 'plane', s: number) => {
    const p = g.attributes.position, uv = g.attributes.uv;
    if (axes === 'xz') for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
    return g;
  };
  for (const g of roofs) worldUV(g, 'xz', 208);
  for (const g of mesh) {
    // Scale the fence UVs: one diamond per ~5 units.
    const p = g.attributes.position, uv = g.attributes.uv;
    g.computeBoundingBox();
    const bb = g.boundingBox!, horiz = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i) * (horiz / 6), uv.getY(i) * (44 / 6));
  }
  let tris = 0, meshes = 0;
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean, receive = true, order = 0) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map((x) => {
      const n = x.index ? x.toNonIndexed() : x;
      for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
      return n;
    }));
    if (!g) return;
    tris += g.attributes.position.count / 3;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.renderOrder = order;
    m.name = 'ikebukuro';
    scene.add(m);
    meshes++;
  };
  for (const [k, list] of Object.entries(skins)) {
    const kind = k as FacadeKind;
    const m = new THREE.MeshStandardMaterial({ map: sharedFacadeTexture(kind), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: sharedFacadeTexture(kind, true), emissiveIntensity: 0.4 });
    glowAtNight(m, 0.4, 0.7);
    add(list, m, true);
  }
  add(lit, litMat, false);
  add(back, backMat, false);
  add(win, winMat, false, false);
  add(solid, solidMat, true);
  add(white, whiteMat, true);
  add(glow, glowMat, false, false);
  add(red, redMat, false, false);
  add(ground, groundMat, false);
  add(roofs.map((g) => { const n = g.toNonIndexed(); return n; }), roofMat, false);
  add(mesh.map((g) => tint(g.clone(), 0xffffff)).map((g, i) => { g.setAttribute('uv', mesh[i].toNonIndexed().attributes.uv); return g; }), meshMat, false, false);
  add(pools, poolMat, false, false, 1);
  let instanced = 0;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cast = true) => {
    if (!ms.length) return;
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = cast;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.name = 'ikebukuro';
    scene.add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * ms.length;
    instanced++;
  };
  // Air-con unit: a white box with a dark fan face (one small texture).
  const acTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e4e7ea'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#3a3e45'; g.beginPath(); g.arc(24, 32, 19, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a9099'; g.lineWidth = 2;
    for (let r = 6; r < 19; r += 5) { g.beginPath(); g.arc(24, 32, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#c3c8ce'; g.fillRect(48, 8, 10, 48);
    return new THREE.CanvasTexture(c);
  })();
  inst(new THREE.BoxGeometry(36, 30, 26), new THREE.MeshStandardMaterial({ map: acTex, roughness: 0.7 }), acs);
  inst(new THREE.CylinderGeometry(26, 26, 40, 14), new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.6 }), tanks);
  inst(new THREE.CylinderGeometry(7, 9, 18, 8), new THREE.MeshStandardMaterial({ color: 0xaab1ba, roughness: 0.5, metalness: 0.4 }), vents);
  inst(new THREE.CylinderGeometry(1.4, 1.8, 1, 5), new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.5, metalness: 0.5 }), masts, false);
  inst(new THREE.CylinderGeometry(12, 4, 4, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8ebef, roughness: 0.5 }), dishes);
  inst(new THREE.BoxGeometry(2.4, 1, 2.4), new THREE.MeshStandardMaterial({ color: 0x7a818b, roughness: 0.5, metalness: 0.5 }), posts, false);
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4e555f, roughness: 0.6, metalness: 0.4 }), treads);
  inst(new THREE.CylinderGeometry(2.6, 2.6, 1, 6), new THREE.MeshStandardMaterial({ color: 0x8c8f94, roughness: 0.6, metalness: 0.3 }), pipes, false);
  inst(new THREE.IcosahedronGeometry(10, 0), new THREE.MeshStandardMaterial({ color: 0x4f6b45, roughness: 0.9, flatShading: true }), shrubs);
  const beaconMat = new THREE.MeshBasicMaterial({ color: RED });
  NIGHT_GLOW.push({ set: (k) => { beaconMat.color.setHex(RED).multiplyScalar(0.7 + 0.3 * k); } });
  inst(new THREE.SphereGeometry(3, 8, 6), beaconMat, beacons, false);
  return { buildings: all.length, meshes, instanced, triangles: Math.round(tris), treads: treadCount, fencePanels, parapets, lamps };
}

/** For tests and tools: the square stays clear of anything drawn at ground level. */
export const IKB_SQUARE_CLEAR = IKB_SQUARE;
