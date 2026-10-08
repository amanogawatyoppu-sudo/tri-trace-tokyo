import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxPrim, RampPrim } from '../config/map';
import { CURB, GROUND_FLOOR, LOOP, SHINJUKU_BUILT, STATIONS, STOREY, VIADUCT, WORLD, insideLoop, prng } from '../config/map';
import type { ShinjukuBuilding, ShinjukuSide } from '../config/shinjuku';
import { DECKS, DECK_H, DECK_LEGS, HIGH_DECKS, HIGH_H, LANES, LANES_GATE, LANES_MAP, SHINJUKU_CROSS, SHINJUKU_LIGHTS, SHINJUKU_STAIRS, VERTICAL_CORE } from '../config/shinjuku';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { nearFade } from './city';
import { radialGlowTexture, sharedFacadeTexture } from './textures';
import type { FacadeKind } from './textures';
import { along, boxAt, faceOf, flat, tint } from './shibuya';
import type { Face } from './shibuya';

/**
 * v10.1 MAP REFORGE — 新宿 VERTICAL CITY, as drawn (the Shibuya method, Shinjuku's own look).
 *
 * 渋谷 = the signs light up; 新宿 = the buildings light up. Light is white, grey, glass blue and
 * office light; advertising neon is kept low and the one crimson accent is the NIGHT LANES gate.
 * - Towers: a podium of shops (street level, and a second row of shops at DECK 2 level where the
 *   deck runs along it), then the glass shaft with office light in bands of storeys, white light
 *   lines up the corners, glass-blue fins, a lit floor line every five storeys, a lit crown and
 *   red aviation lights. The skyline reads vertical by day and by night.
 * - The VERTICAL CORE: a lit glass shaft up T1's corner from the street to above the roof.
 * - NIGHT LANES: low 雑居ビル with stacked blade signs (white and grey), paper lanterns.
 * - Decks in three weights: the main DECK 2 (deep girders), the link along the square (light),
 *   the SKY BRIDGE (a thin slab, so the sky and the towers show between the levels).
 * - Level signs at every stair (GROUND / DECK 2 / SKY BRIDGE and where the stair goes).
 * - The NIGHT LANES gate, the base square's granite, the railway arches.
 * Small repeated pieces are instanced; everything else is merged per material (one atlas for
 * every sign and screen).
 */

const ATLAS = 1024;
type Cell = [number, number, number, number];
const CELLS = {
  window: (i: number): Cell => [(i % 4) * 256, Math.floor(i / 4) * 160, 256, 160],
  name: (i: number): Cell => [(i % 4) * 256, 320 + Math.floor(i / 4) * 48, 256, 48],
  blade: (i: number): Cell => [i * 64, 416, 64, 256],
  way: (i: number): Cell => [512 + (i % 2) * 256, 416 + Math.floor(i / 2) * 80, 256, 80],
  swatch: (i: number): Cell => [512 + i * 64 + 8, 584, 48, 16],
  ticker: [512, 608, 512, 64] as Cell,
  screen: (i: number): Cell => [i * 512, 672, 512, 160],
  level: (i: number): Cell => [0, 832 + i * 48, 128, 48],
  gate: [128, 832, 512, 96] as Cell,
  bridge: [128, 928, 512, 48] as Cell,
  deck: [128, 976, 512, 48] as Cell,
  garage: (i: number): Cell => [640 + i * 96, 832, 96, 96],
  floor: (i: number): Cell => [640, 928 + i * 16, 384, 16],
};
const NAMES = ['NIGHTOWL 24', 'SORA RAMEN', 'KUROFUNE', 'TOKEI CAFE', 'GRID GAMES', 'MIDORI DRUG', 'TOWER BOOKS', 'NEO DELI'];
const BLADES = ['居酒屋', '焼鳥', 'カラオケ', 'らーめん', 'BAR', '餃子', '喫茶', '寿司'];
const FLOORS = ['2F 居酒屋 灯', '3F KARAOKE 77', '4F 麻雀', '5F BAR LUNA-CUT', '6F 整体', '7F 漫画喫茶'];
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS;
  c.height = ATLAS;
  const g = c.getContext('2d')!;
  const rnd = prng(1101);
  const L = SHINJUKU_LIGHTS;
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = '800', maxW?: number) => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    // Squeeze rather than clip: a label never runs off its sign.
    if (maxW) g.fillText(s, x, y, maxW); else g.fillText(s, x, y);
  };
  // Show windows: lit interiors (an izakaya counter, shelves, a café, a game centre), mullions.
  for (let i = 0; i < 8; i++) {
    const [x, y, w, h] = CELLS.window(i);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, i % 3 === 1 ? '#eaf4ff' : '#fff4e2');
    grd.addColorStop(1, i % 3 === 1 ? '#a9b6c4' : '#c7b59c');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    switch (i % 4) {
      case 0: // izakaya: lanterns and a counter
        for (let k = 0; k < 4; k++) { g.fillStyle = css(0xff3b5c); g.beginPath(); g.ellipse(x + 40 + k * 58, y + 40, 12, 17, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#5a3a26'; g.fillRect(x + 10, y + 108, w - 20, 44);
        for (let k = 0; k < 9; k++) { g.fillStyle = '#f2ead8'; g.fillRect(x + 20 + k * 25, y + 94, 12, 14); }
        break;
      case 1: // shelves
        for (let r = 0; r < 4; r++) for (let k = 0; k < 22; k++) { g.fillStyle = `hsl(${rnd() * 360},${30 + rnd() * 40}%,${45 + rnd() * 30}%)`; g.fillRect(x + 14 + k * 10.4, y + 30 + r * 28, 8, 20); }
        break;
      case 2: // café: warm lamps, tables
        for (let k = 0; k < 4; k++) { g.fillStyle = '#3a2c22'; g.fillRect(x + 40 + k * 56, y + 14, 2, 26); g.fillStyle = '#fff2c8'; g.beginPath(); g.arc(x + 41 + k * 56, y + 46, 9, Math.PI, 0); g.fill(); }
        for (let k = 0; k < 3; k++) { g.fillStyle = '#4a3527'; g.fillRect(x + 30 + k * 76, y + 112, 46, 8); }
        break;
      default: // game centre: dark with lit cabinets
        g.fillStyle = '#141428'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
        for (let k = 0; k < 5; k++) { g.fillStyle = '#0b0b16'; g.fillRect(x + 16 + k * 47, y + 50, 38, 100); g.fillStyle = css(L[(k + 1) % 4]); g.fillRect(x + 20 + k * 47, y + 58, 30, 30); }
    }
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath(); g.moveTo(x + 30, y + h); g.lineTo(x + 110, y); g.lineTo(x + 150, y); g.lineTo(x + 70, y + h); g.fill();
    g.fillStyle = '#23252b';
    g.fillRect(x, y, w, 6); g.fillRect(x, y + h - 8, w, 8); g.fillRect(x, y, 6, h); g.fillRect(x + w - 6, y, 6, h); g.fillRect(x + w / 2 - 2, y, 4, h);
  }
  NAMES.forEach((n, i) => {
    const [x, y, w, h] = CELLS.name(i);
    const col = L[i % L.length];
    g.fillStyle = i % 3 === 2 ? '#eef1f6' : '#14161b';
    g.fillRect(x, y, w, h);
    g.fillStyle = css(col);
    g.fillRect(x, y + h - 5, w, 5);
    text(n, x + w / 2, y + h / 2 - 2, 25, i % 3 === 2 ? '#15171c' : css(col === 0xf2f6ff ? 0xffffff : col));
  });
  // Blade signs (縦看板): white, crimson, cyan grounds; the lanes' main motif.
  BLADES.forEach((wd, i) => {
    const [x, y, w, h] = CELLS.blade(i);
    // White, grey, black and glass-blue grounds: lit boxes, not neon.
    const ground = [0xf2f6ff, 0xd6dbe3, 0x14161b, 0xb8d4e6][i % 4];
    g.fillStyle = css(ground);
    g.fillRect(x, y, w, h);
    g.strokeStyle = i % 4 === 2 ? 'rgba(242,246,255,.8)' : 'rgba(20,22,27,.8)';
    g.lineWidth = 4;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    const ink = i % 4 === 2 ? '#ffffff' : '#14161b';
    const chars = wd === 'BAR' ? ['B', 'A', 'R'] : [...wd];
    const n = chars.length, step = Math.min(56, 224 / n);
    chars.forEach((ch, k) => text(ch, x + w / 2, y + h / 2 + (k - (n - 1) / 2) * step, 42, ink, 'center', '900'));
  });
  const way = [['2F デッキ', 'DECK 2', '↑'], ['夜の横丁', 'NIGHT LANES', '→'], ['新宿御苑', 'GYOEN', '↓'], ['靖国通り', 'VERTICAL CROSS', '↔']];
  way.forEach(([jp, en, arrow], i) => {
    const [x, y, w, h] = CELLS.way(i);
    g.fillStyle = '#f2f4f7'; g.fillRect(x, y, w, h);
    g.fillStyle = '#16181d'; g.fillRect(x, y, 66, h);
    text(arrow, x + 33, y + h / 2 + 2, 50, '#f2f6ff', 'center', '900');
    text(jp, x + 80, y + 28, 28, '#15171c', 'left', '900');
    text(en, x + 80, y + 60, 19, '#3a3d45', 'left', '700');
  });
  L.forEach((col, i) => { const [x, y, w, h] = CELLS.swatch(i); g.fillStyle = css(col); g.fillRect(x - 8, y - 8, w + 16, h + 16); });
  {
    const [x, y, w, h] = CELLS.ticker;
    // The VERTICAL CORE's name plate.
    g.fillStyle = '#10131a'; g.fillRect(x, y, w, h);
    g.fillStyle = css(0xb8d4e6); g.fillRect(x, y + h - 6, w, 6);
    text('VERTICAL CORE', x + w / 2, y + h / 2 - 2, 40, '#ffffff', 'center', '900', w - 40);
  }
  // Big screens: invented motion graphics (vertical light, skyline).
  for (let i = 0; i < 2; i++) {
    const [x, y, w, h] = CELLS.screen(i);
    const grd = g.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, i ? '#1b1f28' : '#101824');
    grd.addColorStop(1, i ? '#2b303a' : '#1a222e');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    for (let k = 0; k < 22; k++) {
      const bx = x + 10 + k * 23, bh = 30 + rnd() * (h - 50);
      g.fillStyle = css(L[(k + i) % 3], 0.35 + rnd() * 0.4);
      g.fillRect(bx, y + h - bh, 16, bh);
    }
    if (i === 0) {
      text('VERTICAL', x + 30, y + 60, 64, '#ffffff', 'left', '900');
      text('CITY  新宿', x + 34, y + 120, 40, css(0xb8d4e6), 'left', '900');
    } else {
      text('UP', x + 40, y + 74, 84, '#ffffff', 'left', '900');
      text('RUN THE TOWERS', x + 44, y + 130, 30, css(0xd6dbe3), 'left', '900');
    }
    g.fillStyle = 'rgba(0,0,0,.1)';
    for (let r = 0; r < h; r += 4) g.fillRect(x, y + r, w, 1);
  }
  // Level signs: where you are (top line) and where this stair goes (bottom line).
  const LEVELS: [string, string, number][] = [
    ['GROUND 地上', '▲ DECK 2', 0xf2f6ff], ['DECK 2 2F', '▲ SKY BRIDGE', 0xb8d4e6],
    ['DECK 2 2F', '▼ GROUND', 0xb8d4e6], ['SKY BRIDGE 高所', '▼ DECK 2', 0xf2f6ff],
  ];
  LEVELS.forEach(([here, to, col], i) => {
    const [x, y, w, h] = CELLS.level(i);
    g.fillStyle = '#12151b'; g.fillRect(x, y, w, h);
    g.fillStyle = css(col); g.fillRect(x, y, 6, h);
    text(here, x + 12, y + 13, 14, '#aab2bd', 'left', '800', w - 18);
    text(to, x + 12, y + 33, 19, css(col), 'left', '900', w - 18);
  });
  {
    const [x, y, w, h] = CELLS.gate;
    g.fillStyle = '#0c0b10'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#e8ecf2'; g.lineWidth = 4; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    text('NIGHT LANES', x + 200, y + h / 2, 52, '#ffffff', 'center', '900');
    text('夜の横丁', x + 420, y + h / 2 + 2, 44, css(0xff3b5c), 'center', '900');
  }
  for (const [cell, label, col] of [[CELLS.bridge, 'VERTICAL GATE ・ SKY BRIDGE', 0xf2f6ff], [CELLS.deck, 'DECK 2 ・ 2F デッキ', 0xb8d4e6]] as const) {
    const [x, y, w, h] = cell;
    const grd = g.createLinearGradient(x, y, x + w, y);
    grd.addColorStop(0, '#141820'); grd.addColorStop(0.5, '#1c212a'); grd.addColorStop(1, '#141820');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    text(label, x + w / 2, y + h / 2 + 2, 30, css(col), 'center', '900', w - 24);
  }
  // Railway arch shops (ガード下): yakitori, a bike park, a shutter.
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = CELLS.garage(i);
    g.fillStyle = '#26241f'; g.fillRect(x, y, w, h);
    if (i === 2) { g.fillStyle = '#85888c'; g.fillRect(x + 6, y + 26, w - 12, h - 26); continue; }
    const grd = g.createLinearGradient(x, y + 24, x, y + h);
    grd.addColorStop(0, i === 1 ? '#dde8ef' : '#ffe4c0'); grd.addColorStop(1, i === 1 ? '#7a868c' : '#8a6448');
    g.fillStyle = grd; g.fillRect(x + 6, y + 26, w - 12, h - 26);
    g.fillStyle = css(i === 1 ? 0xb8d4e6 : 0xfff1dc); g.fillRect(x + 10, y + 8, w - 20, 12);
  }
  FLOORS.forEach((f, i) => {
    const [x, y, w, h] = CELLS.floor(i);
    g.fillStyle = i % 2 ? '#eef0f4' : '#16171c'; g.fillRect(x, y, w, h);
    g.fillStyle = css(L[i % 4]); g.fillRect(x, y, 6, h);
    text(f, x + 12, y + h / 2, 12, i % 2 ? '#16171c' : '#ffffff', 'left', '800');
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** A flat textured quad facing (nx, 0, nz), mapped to an atlas cell. */
function quad(w: number, h: number, cell: Cell, x: number, y: number, z: number, nx: number, nz: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [cx, cy, cw, ch] = cell;
  const u0 = cx / ATLAS, u1 = (cx + cw) / ATLAS, v1 = 1 - cy / ATLAS, v0 = 1 - (cy + ch) / ATLAS;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  g.rotateY(Math.atan2(nx, nz));
  return g.translate(x, y, z);
}

const SIDES: ShinjukuSide[] = ['n', 's', 'e', 'w'];
const TILE_U = 200, TILE_V = 4 * STOREY;
const SKIN: Record<ShinjukuBuilding['skin'], { tex: FacadeKind; tint: number }> = {
  tileA: { tex: 'tileA', tint: 0xe9e4dc },
  tileB: { tex: 'tileB', tint: 0xdcdde4 },
  concrete: { tex: 'concrete', tint: 0xd2d0cb },
  glass: { tex: 'glass', tint: 0xd6e2ee },
};
/** Office light: cool and warm whites (no faction hue). */
const OFFICE = [0xeaf3ff, 0xdfeaff, 0xfff4e4, 0xf4f8ff];
/** Shop-front light pools: warm and cool white (no colour on the ground). */
const SHOP_LIGHT = [0xfff1dc, 0xf2f6ff];
/** Signs are lit in three levels (as Shibuya): hero (the VERTICAL CORE, the gate fascia, the lanes gate), support, background. */

export interface ShinjukuStats { buildings: number; bays: number; meshes: number; instanced: number; triangles: number }

export function buildShinjuku(scene: THREE.Scene): ShinjukuStats {
  const L = SHINJUKU_LIGHTS;
  const hero: THREE.BufferGeometry[] = [], lit: THREE.BufferGeometry[] = [], back: THREE.BufferGeometry[] = [], win: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [], solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], ground: THREE.BufferGeometry[] = [];
  const pools: THREE.BufferGeometry[] = [], arches: THREE.BufferGeometry[] = [], core: THREE.BufferGeometry[] = [], coreLight: THREE.BufferGeometry[] = [];
  const skins: Record<string, THREE.BufferGeometry[]> = {};
  const acs: THREE.Matrix4[] = [], tanks: THREE.Matrix4[] = [], pipes: THREE.Matrix4[] = [], lanterns: THREE.Matrix4[] = [], bollards: THREE.Matrix4[] = [], planters: THREE.Matrix4[] = [];
  const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
  const FRAME = 0x24262b, STEEL = 0x3b3f47, AWNING = [0x23364a, 0x7a2335, 0x2a2d33, 0xe8e6e0, 0x3b2f5c];
  const GF = GROUND_FLOOR;
  const pool = (x: number, z: number, r: number, col: number, y = 0.7) => pools.push(tint(flat(r * 2, r * 2, x, y, z), col));
  let bays = 0, wi = 0, ni = 0, bi = 0, fi = 0;

  const others = SHINJUKU_BUILT.buildings;
  const hidden = (b: ShinjukuBuilding, f: Face) => {
    const [mx, mz] = along(f, f.len / 2, 6);
    return others.some((o) => o !== b && mx > o.x0 && mx < o.x1 && mz > o.z0 && mz < o.z1);
  };
  const facade = (kind: FacadeKind, f: Face, y0: number, y1: number, col: THREE.Color, uOff: number, s0 = 0, s1 = f.len) => {
    const len = s1 - s0;
    const g = new THREE.PlaneGeometry(len, y1 - y0);
    const uv = g.attributes.uv;
    const v0 = (y0 - GF) / TILE_V, v1 = (y1 - GF) / TILE_V;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uOff + s0 / TILE_U + uv.getX(i) * (len / TILE_U), v0 + uv.getY(i) * (v1 - v0));
    const [cx, cz] = along(f, (s0 + s1) / 2, 0);
    g.rotateY(Math.atan2(f.nx, f.nz)).translate(cx, (y0 + y1) / 2, cz);
    (skins[kind] ??= []).push(tint(g, col));
  };
  /** Shop bays along a face at floor `y` (street level or DECK 2): window, name band, pillars, cornice, a light pool. */
  const shopRow = (f: Face, y: number, br: () => number, s0 = 0, s1 = f.len, awnings = true) => {
    const ang = Math.atan2(f.nx, f.nz), len = s1 - s0;
    const n = Math.max(1, Math.round((len - 16) / 150)), bw = (len - 16) / n, H = GF - 26;
    for (let k = 0; k < n; k++) {
      const s = s0 + 8 + bw * (k + 0.5);
      const [wx, wz] = along(f, s, 1.6);
      lit.push(quad(bw - 12, H, CELLS.window(wi++ % 8), wx, y + H / 2 + 2, wz, f.nx, f.nz));
      const [bx, bz] = along(f, s, 1.2);
      solid.push(tint(boxAt(bw - 4, 24, 3, bx, y + GF - 12, bz, ang), FRAME));
      const [lx, lz] = along(f, s, 2.9);
      lit.push(quad(bw - 10, 19, CELLS.name(ni++ % 8), lx, y + GF - 12, lz, f.nx, f.nz));
      if (awnings && br() < 0.45) {
        const [ax, az] = along(f, s, 13);
        solid.push(tint(new THREE.BoxGeometry(bw - 12, 1.6, 26).rotateX(0.38).rotateY(ang).translate(ax, y + GF - 30, az), AWNING[Math.floor(br() * AWNING.length)]));
      }
      const [px, pz] = along(f, s, 40);
      pool(px, pz, 44, SHOP_LIGHT[Math.floor(br() * 2)], y + (y > 0 ? 0.9 : CURB + 0.6));
      bays++;
    }
    for (let k = 0; k <= n; k++) {
      const [px, pz] = along(f, s0 + 8 + bw * k, 2);
      solid.push(tint(boxAt(7, GF, 5, px, y + GF / 2, pz, ang), FRAME));
    }
    const [cx, cz] = along(f, (s0 + s1) / 2, 4);
    solid.push(tint(boxAt(len + 6, 7, 9, cx, y + GF + 3, cz, ang), 0x2f3036));
  };
  /** Does DECK 2 run along this face (within a few units, at the deck floor)? Returns the span along the face. */
  const deckSpan = (f: Face): [number, number] | null => {
    let a = Infinity, b = -Infinity;
    for (let s = 10; s < f.len - 10; s += 10) {
      const [px, pz] = along(f, s, 30);
      if (DECKS.some((k) => px > k.x0 && px < k.x1 && pz > k.z0 && pz < k.z1)) { a = Math.min(a, s); b = Math.max(b, s); }
    }
    return b > a ? [Math.max(0, a - 10), Math.min(f.len, b + 10)] : null;
  };

  // ------------------------------------------------------------ buildings
  for (const b of SHINJUKU_BUILT.buildings) {
    const br = prng(b.id.charCodeAt(0) * 977 + b.x0);
    const sk = SKIN[b.skin];
    const col = new THREE.Color(sk.tint).multiplyScalar(0.92 + br() * 0.1);
    const uOff = Math.floor(br() * 4) * 0.5;
    const T = b.tower;
    const podTop = T ? T.podium : b.h;
    for (const side of SIDES) {
      const f = faceOf(b, side);
      if (hidden(b, f)) continue;
      const front = b.fronts.includes(side);
      const ang = Math.atan2(f.nx, f.nz);
      if (T) {
        // Podium: stone-grey cladding above the shops, a deck-level shop row where DECK 2 runs along it.
        const podCol = new THREE.Color(0xc9c6c0).multiplyScalar(0.95 + br() * 0.05);
        facade('concrete', f, front ? GF : 0, podTop, podCol, uOff);
        if (front) shopRow(f, 0, br);
        const ds = deckSpan(f);
        if (ds) shopRow(f, DECK_H, br, ds[0], ds[1], false);
        else if (front) {
          // A lit band of tenant signs round the podium (one per bay) between the shops and the roof.
          const [cx, cz] = along(f, f.len / 2, 1.4);
          back.push(quad(Math.min(f.len - 30, 220), 16, CELLS.floor(fi++ % FLOORS.length), cx, GF + 60, cz, f.nx, f.nz));
        }
        // Podium top: a lit edge (the high level reads as its own layer).
        const [ex, ez] = along(f, f.len / 2, 2);
        solid.push(tint(boxAt(f.len + 4, 10, 6, ex, podTop - 5, ez, ang), 0x2b2d33));
        glow.push(tint(boxAt(f.len + 2, 2, 2, ...along(f, f.len / 2, 5.2).flatMap((v, i) => (i === 0 ? [v, podTop - 12] : [v])) as [number, number, number], ang), L[1]));
        bays += 0;
        continue;
      }
      // Low buildings (the lanes and T1b): the Shibuya three layers, Shinjuku dressing.
      facade(sk.tex, f, front ? GF : 0, b.h, col, uOff);
      {
        const [cx, cz] = along(f, f.len / 2, 1.2);
        for (let k = 2; k <= b.floors; k++) solid.push(tint(boxAt(f.nx ? 2.4 : f.len, 4, f.nx ? f.len : 2.4, cx, GF + (k - 2) * STOREY, cz), 0x4a4b52));
        const cols = Math.floor((f.len - 20) / 50);
        for (let k = 2; k <= b.floors; k++) for (let c = 0; c < cols; c++) {
          if (br() > (front ? 0.42 : 0.3)) continue;
          const [wx, wz] = along(f, 10 + (c + 0.5) * ((f.len - 20) / cols), 0.9);
          win.push(tint(quad(36, 46, CELLS.swatch(0), wx, GF + (k - 2) * STOREY + STOREY / 2, wz, f.nx, f.nz), OFFICE[Math.floor(br() * 4)]));
        }
      }
      if (front) {
        shopRow(f, 0, br);
        // Floor directories and stacked blade signs (the lanes' density: two per front where it is wide enough).
        if (b.floors >= 3 && f.len >= 100) {
          for (let k = 2; k <= Math.min(b.floors, 7); k++) {
            const [qx, qz] = along(f, f.len * 0.32, 1.4);
            back.push(quad(Math.min(110, f.len - 30), 12, CELLS.floor(fi++ % FLOORS.length), qx, GF + (k - 2) * STOREY + STOREY - 14, qz, f.nx, f.nz));
          }
        }
        if (b.floors >= 2) {
          const tx = (f.bx - f.ax) / f.len, tz = (f.bz - f.az) / f.len;
          for (const s of f.len > 150 ? [22, f.len - 22] : [f.len - 20]) {
            const t2 = Math.min(b.h - 20, GF + Math.min(b.floors - 1, 4) * STOREY), b0 = GF + 14, hh = t2 - b0;
            if (hh < 70) continue;
            const [sx, sz] = along(f, s, 28);
            const cell = CELLS.blade(bi++ % 8);
            back.push(quad(36, hh, cell, sx + tx * 0.6, b0 + hh / 2, sz + tz * 0.6, tx, tz));
            back.push(quad(36, hh, cell, sx - tx * 0.6, b0 + hh / 2, sz - tz * 0.6, -tx, -tz));
            const [mx, mz] = along(f, s, 6);
            solid.push(tint(boxAt(3, 3, 12, mx, t2 - 6, mz, ang), FRAME), tint(boxAt(3, 3, 12, mx, b0 + 6, mz, ang), FRAME));
          }
        }
      } else {
        const [dx, dz] = along(f, Math.min(40, f.len / 2), 1.2);
        solid.push(tint(boxAt(30, 70, 2, dx, 35, dz, ang), 0x55585e));
        for (const s of [f.len * 0.25, f.len * 0.75]) {
          const [px, pz] = along(f, s, 5);
          pipes.push(M4(px, b.h / 2, pz, 0, 1.3, b.h, 1.3));
        }
        for (let k = 2; k <= b.floors; k++) {
          if (br() < 0.45) continue;
          const [ax, az] = along(f, 30 + br() * Math.max(1, f.len - 60), 17);
          acs.push(M4(ax, GF + (k - 1) * STOREY - 46, az, ang, 0.7, 0.7, 0.7));
        }
      }
      if (side === b.service && b.floors >= 3) {
        // Fire escape.
        const s0 = Math.min(f.len - 50, Math.max(50, f.len * 0.6));
        for (let k = 2; k <= b.floors; k++) {
          const y = GF + (k - 2) * STOREY;
          const [px, pz] = along(f, s0, 14);
          solid.push(tint(boxAt(72, 3, 26, px, y, pz, ang), STEEL));
          const [rx, rz] = along(f, s0, 27);
          solid.push(tint(boxAt(72, 22, 1.5, rx, y + 12, rz, ang), STEEL));
        }
      }
    }
    // Roofs of low buildings: parapet, plant, a billboard.
    if (!T) {
      const R = 7, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0, top = b.h;
      ground.push(tint(flat(w, d, cx, top - 14, cz), 0x5f5d5a));
      for (const [px, pz, pw, pd] of [[cx, b.z0 + R / 2, w, R], [cx, b.z1 - R / 2, w, R], [b.x0 + R / 2, cz, R, d], [b.x1 - R / 2, cz, R, d]]) solid.push(tint(boxAt(pw, 18, pd, px, top - 5, pz), 0x7d7a76));
      for (let k = 0; k < Math.max(1, Math.floor((w * d) / 18000)); k++) acs.push(M4(b.x0 + 30 + br() * (w - 60), top + 1, b.z0 + 30 + br() * (d - 60), br() * 3));
      if (w > 110 && d > 110) tanks.push(M4(b.x0 + 40 + br() * (w - 80), top + 36, b.z0 + 40 + br() * (d - 80)));
      if (b.roof === 'billboard') {
        const f = faceOf(b, b.fronts[0]), bw = Math.min(f.len * 0.85, 200), bh = 64;
        const [sx, sz] = along(f, f.len / 2, -16);
        back.push(quad(bw, bh, CELLS.screen(b.id.charCodeAt(0) & 1), sx + f.nx * 3, top + 30 + bh / 2, sz + f.nz * 3, f.nx, f.nz));
        for (const s of [f.len / 2 - bw / 2 + 10, f.len / 2 + bw / 2 - 10]) {
          const [px, pz] = along(f, s, -18);
          solid.push(tint(boxAt(5, 30 + bh, 5, px, top + (30 + bh) / 2 - 10, pz), STEEL));
        }
      }
      continue;
    }
    // ---- the tower shaft
    const S = T.shaft, sw = S.x1 - S.x0, sd = S.z1 - S.z0, scx = (S.x0 + S.x1) / 2, scz = (S.z0 + S.z1) / 2, top = b.h;
    const shaftCol = new THREE.Color(SKIN.glass.tint).multiplyScalar(0.9 + br() * 0.1);
    for (const side of SIDES) {
      const f = faceOf(S, side);
      const ang = Math.atan2(f.nx, f.nz);
      facade('glass', f, podTop, top, shaftCol, uOff);
      // Office light in bands: on each storey a few runs of lit bays (the grid of a working tower at night).
      const bays2 = Math.max(2, Math.round(f.len / 50)), bw = f.len / bays2;
      for (let k = 0, y = podTop + STOREY / 2; y < top - STOREY; k++, y += STOREY) {
        let s = 0;
        while (s < bays2) {
          const run = 1 + Math.floor(br() * 3);
          if (br() < 0.5) {
            const n = Math.min(run, bays2 - s);
            const [wx, wz] = along(f, (s + n / 2) * bw, 0.9);
            win.push(tint(quad(n * bw - 8, STOREY - 30, CELLS.swatch(0), wx, y, wz, f.nx, f.nz), OFFICE[Math.floor(br() * 4)]));
          }
          s += run;
        }
      }
      // Mullion fins: vertical light lines up the shaft (white at the corners, cyan on the fins).
      for (const sEdge of [1.5, f.len - 1.5]) {
        const [qx, qz] = along(f, sEdge, 1.6);
        glow.push(tint(boxAt(f.nx ? 1.5 : 3, top - podTop - 30, f.nx ? 3 : 1.5, qx, (top + podTop) / 2 - 15, qz), 0xf2f6ff));
      }
      for (const s of [f.len / 3, (2 * f.len) / 3]) {
        const [qx, qz] = along(f, s, 3);
        solid.push(tint(boxAt(f.nx ? 6 : 5, top - podTop, f.nx ? 5 : 6, qx, (top + podTop) / 2, qz), 0x8c97a3));
        const [gx, gz] = along(f, s, 6.2);
        glow.push(tint(boxAt(f.nx ? 1 : 2, top - podTop - 60, f.nx ? 2 : 1, gx, (top + podTop) / 2, gz), L[1]));
      }
      // Crown: a lit band near the top, and a setback ring.
      const [mx, mz] = along(f, f.len / 2, 1.5);
      glow.push(tint(quad(f.len, 12, CELLS.swatch(0), mx, top - 40, mz, f.nx, f.nz), b.id === 'T2' ? L[1] : 0xf2f6ff));
      // The building lights up, not its signs: a lit floor line every five storeys.
      for (let y = podTop + 5 * STOREY; y < top - 2 * STOREY; y += 5 * STOREY) {
        const [lx, lz] = along(f, f.len / 2, 2.2);
        glow.push(tint(quad(f.len - 4, 2.5, CELLS.swatch(0), lx, y, lz, f.nx, f.nz), 0xdfe8f2));
      }
      solid.push(tint(boxAt(f.len + 8, 8, 8, ...along(f, f.len / 2, 2).flatMap((v, i) => (i === 0 ? [v, top - 70] : [v])) as [number, number, number], ang), 0x5c6470));
    }
    // Roof: parapet, a helipad square on the tallest, aviation lights at the corners (red).
    ground.push(tint(flat(sw, sd, scx, top + 0.5, scz), 0x4e5054));
    for (const [px, pz] of [[S.x0 + 6, S.z0 + 6], [S.x1 - 6, S.z0 + 6], [S.x0 + 6, S.z1 - 6], [S.x1 - 6, S.z1 - 6]]) {
      solid.push(tint(boxAt(5, 50, 5, px, top + 25, pz), STEEL));
      glow.push(tint(boxAt(10, 10, 10, px, top + 54, pz), 0xff2a1e));
    }
    if (b.id === 'T1') {
      ground.push(tint(new THREE.RingGeometry(46, 52, 32).rotateX(-Math.PI / 2).translate(scx, top + 1, scz), 0xe8e8e2));
      solid.push(tint(boxAt(8, 220, 8, scx + sw / 2 - 30, top + 110, scz - sd / 2 + 30), STEEL));
      glow.push(tint(boxAt(12, 12, 12, scx + sw / 2 - 30, top + 224, scz - sd / 2 + 30), 0xff2a1e));
    }
    // A walkable podium roof (the high level): paving, a lit edge, planters and deck lamps.
    if (T.walkRoof) {
      for (const p of WORLD) {
        if (p.group !== 'shinjuku' || p.kind !== 'box' || (p as BoxPrim).y1 !== T.podium) continue;
        if (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) continue;
        ground.push(tint(flat(p.w - 2, p.d - 2, p.x, T.podium + 0.4, p.z), 0x8a857e));
        for (let t = 40; t < Math.max(p.w, p.d) - 20; t += 40) {
          const alongX = p.w > p.d;
          ground.push(tint(alongX ? flat(1.6, p.d - 6, p.x - p.w / 2 + t, T.podium + 0.6, p.z) : flat(p.w - 6, 1.6, p.x, T.podium + 0.6, p.z - p.d / 2 + t), 0x6c6862));
        }
      }
      const cx = (b.x0 + b.x1) / 2;
      for (const [px, pz] of [[cx - 60, b.z1 - 40], [cx + 60, b.z1 - 40]]) planters.push(M4(px, T.podium + 12, pz));
      for (const [px, pz] of [[b.x0 + 30, b.z1 - 30], [b.x1 - 30, b.z1 - 30]]) {
        solid.push(tint(boxAt(4, 58, 4, px, T.podium + 29, pz), STEEL), tint(boxAt(14, 4, 14, px, T.podium + 60, pz), STEEL));
        glow.push(tint(boxAt(11, 3, 11, px, T.podium + 57, pz), 0xf2f6ff));
        pool(px, pz, 60, 0xf2f6ff, T.podium + 0.9);
      }
    }
  }

  // ------------------------------------------------------------ DECK 2, the high level, the SKY BRIDGE
  // Three weights, so not every walkway reads the same: the main deck (along the towers and over
  // the avenue) is deep, with girders and a lit soffit; the link down the square is light; the
  // high level and the SKY BRIDGE are a thin slab, so the sky and the towers show between levels.
  type DeckKind = 'main' | 'link' | 'bridge';
  const deckSlab = (k: { x0: number; z0: number; x1: number; z1: number }, H: number, kind: DeckKind) => {
    const w = k.x1 - k.x0, d = k.z1 - k.z0, cx = (k.x0 + k.x1) / 2, cz = (k.z0 + k.z1) / 2;
    const alongX = w > d, len = alongX ? w : d, wid = alongX ? d : w;
    const slabT = kind === 'main' ? 16 : kind === 'link' ? 9 : 7;
    solid.push(tint(boxAt(w, slabT, d, cx, H - slabT / 2, cz), kind === 'bridge' ? 0xa7abb0 : 0x8d8a86));
    const strip = (s: number, sw: number, t0: number, t1: number, y: number, c: number) => ground.push(alongX
      ? tint(flat(t1 - t0, sw, k.x0 + (t0 + t1) / 2, y, cz + s), c)
      : tint(flat(sw, t1 - t0, cx + s, y, k.z0 + (t0 + t1) / 2), c));
    ground.push(tint(flat(w - 4, d - 4, cx, H + 0.4, cz), kind === 'bridge' ? 0x8f8c88 : 0x8a857e));
    for (const sg of [-1, 1]) strip(sg * (wid / 2 - 7), 8, 2, len - 2, H + 0.6, 0x45433f);
    strip(0, 10, 4, len - 4, H + 0.7, 0xb8973e);
    for (let t = 26; t < len - 4; t += 26) strip(0, wid - 22, t - 0.8, t + 0.8, H + 0.65, 0x6c6862);
    const gd = kind === 'main' ? 34 : 0;
    for (const sg of [-1, 1]) {
      const [ex, ez] = alongX ? [cx, cz + sg * (wid / 2 - 3)] : [cx + sg * (wid / 2 - 3), cz];
      if (gd) solid.push(tint(boxAt(alongX ? len : 6, gd, alongX ? 6 : len, ex, H - slabT - gd / 2, ez), kind === 'main' ? 0x4f555e : 0x5f6670));
      // Light line under the edge (the deck reads at night from the street; glass blue on the high level).
      glow.push(tint(boxAt(alongX ? len : 1.5, 1.5, alongX ? 1.5 : len, ex, H - slabT - gd - 1, ez), kind === 'bridge' ? L[1] : 0xf2f6ff));
    }
    if (kind === 'main') {
      // Cross girders and a lit soffit between them: the main deck is the street's ceiling.
      for (let t = 45; t < len - 20; t += 90) solid.push(tint(alongX ? boxAt(10, 24, wid - 10, k.x0 + t, H - slabT - 12, cz) : boxAt(wid - 10, 24, 10, cx, H - slabT - 12, k.z0 + t), 0x4a5058));
      for (let t = 90; t < len - 20; t += 90) {
        const [sx, sz] = alongX ? [k.x0 + t, cz] : [cx, k.z0 + t];
        // Facing down (seen from the street below).
        glow.push(tint(new THREE.PlaneGeometry(alongX ? 4 : wid - 24, alongX ? wid - 24 : 4).rotateX(Math.PI / 2).translate(sx, H - slabT - 0.5, sz), 0xeef3f8));
      }
    } else if (kind === 'link') {
      for (let t = 90; t < len - 20; t += 180) solid.push(tint(alongX ? boxAt(5, 6, wid - 10, k.x0 + t, H - slabT - 3, cz) : boxAt(wid - 10, 6, 5, cx, H - slabT - 3, k.z0 + t), 0x5d6168));
    }
    for (let t = 70, i = 0; t < len - 30; t += 170, i++) {
      const sg = i % 2 ? 1 : -1;
      const [lx, lz] = alongX ? [k.x0 + t, cz + sg * (wid / 2 - 14)] : [cx + sg * (wid / 2 - 14), k.z0 + t];
      solid.push(tint(boxAt(4, 58, 4, lx, H + 29, lz), STEEL), tint(boxAt(14, 4, 14, lx, H + 60, lz), STEEL));
      glow.push(tint(boxAt(11, 3, 11, lx, H + 57, lz), 0xf2f6ff));
      pool(lx - (alongX ? 0 : sg * 16), lz - (alongX ? sg * 16 : 0), 54, 0xf2f6ff, H + 0.9);
    }
    if (kind !== 'bridge') for (let t = 60; t < len; t += 150) pool(alongX ? k.x0 + t : cx, alongX ? cz : k.z0 + t, kind === 'main' ? 70 : 54, 0xeef3f8, 0.8);
  };
  for (const k of DECKS) deckSlab(k, DECK_H, k.id === 'galW' ? 'link' : 'main');
  for (const k of HIGH_DECKS) deckSlab(k, HIGH_H, 'bridge');
  // Fascias: VERTICAL GATE on both faces of the bridge (hero, on a slim band), DECK 2 on the main deck's girder over the avenue.
  const X = SHINJUKU_CROSS, bridge = HIGH_DECKS.find((k) => k.id === 'bridge')!;
  for (const [z, nz] of [[bridge.z0, -1], [bridge.z1, 1]] as const) {
    solid.push(tint(boxAt(196, 18, 3, X.x, HIGH_H - 14, z + nz * 0.8), 0x1a1d24));
    hero.push(quad(186, 17, CELLS.bridge, X.x, HIGH_H - 14, z + nz * 2.4, 0, nz));
  }
  // Set a little east of the avenue's centre line, toward the VERTICAL CROSS corner where people look up.
  for (const [z, nz] of [[-1780, -1], [-1710, 1]] as const) lit.push(quad(210, 20, CELLS.deck, X.x + 70, DECK_H - 16 - 17, z + nz * 1.2, 0, nz));
  // Bridge piers: slender columns against the towers' faces, so the gate reads as carried by them.
  for (const [x, z] of [[-2905, -735], [-2905, -795], [-2425, -735], [-2425, -795]]) {
    solid.push(tint(new THREE.CylinderGeometry(4, 5, HIGH_H - 8, 8).translate(x, (HIGH_H - 8) / 2, z), 0x8a929b));
  }
  for (const p of WORLD) {
    if (p.group !== 'sjdeck' && p.group !== 'shinjuku') continue;
    if (p.kind === 'ramp') continue;
    const b = p as BoxPrim;
    const railTop = b.y0 === DECK_H || b.y0 === HIGH_H || (b.y0 > 200 && b.y1 - b.y0 < 40);
    if (railTop && b.y1 - b.y0 < 40) {
      const lx = b.w > b.d, n2 = lx ? b.w : b.d, h = b.y1 - b.y0;
      solid.push(tint(boxAt(b.w + 1, 7, b.d + 1, b.x, b.y0 + 3.5, b.z), 0x3a3d44));
      glass.push(boxAt(lx ? b.w : 1.2, h - 13, lx ? 1.2 : b.d, b.x, b.y0 + 7 + (h - 13) / 2, b.z));
      solid.push(tint(boxAt(b.w + 2, 4, b.d + 2, b.x, b.y1 - 2, b.z), 0xb8bcc2));
      for (let t = 0; t <= n2 + 0.1; t += n2 / Math.max(1, Math.round(n2 / 36))) {
        solid.push(tint(boxAt(3.4, h, 3.4, lx ? b.x - b.w / 2 + t : b.x, b.y0 + h / 2, lx ? b.z : b.z - b.d / 2 + t), 0x8b9098));
      }
      glow.push(tint(boxAt(lx ? b.w : 1.5, 1.2, lx ? 1.5 : b.d, b.x, b.y1 - 5, b.z), b.y0 >= HIGH_H ? L[1] : 0xf2f6ff));
    } else if (p.group === 'sjdeck' && b.y0 === 0 && b.y1 <= DECK_H - 12 + 0.1 && b.w <= 30) {
      solid.push(tint(new THREE.CylinderGeometry(10, 12, b.y1, 10).translate(b.x, b.y1 / 2, b.z), 0x5a5e66));
      solid.push(tint(boxAt(30, 10, 30, b.x, 5, b.z), 0x77787a));
      solid.push(tint(boxAt(34, 14, 34, b.x, b.y1 - 7, b.z), 0x6c7079));
      glow.push(tint(new THREE.CylinderGeometry(10.5, 10.5, 3, 10).translate(b.x, 30, b.z), L[1]));
    }
  }
  // The floor under a point (pavement top, or the ground).
  const floorAt = (x: number, z: number) => WORLD.reduce((y, w) => (w.kind === 'box' && (w as BoxPrim).y1 < 20 && Math.abs(x - w.x) < w.w / 2 && Math.abs(z - w.z) < w.d / 2 ? Math.max(y, (w as BoxPrim).y1) : y), 0);
  for (const [x, z, i] of DECK_LEGS.map(([x, z], i) => [x, z, i] as const)) {
    ground.push(tint(flat(48, 48, x, DECK_H + 0.8, z), 0x9e998f));
    glow.push(tint(new THREE.RingGeometry(16, 18.5, 24).rotateX(-Math.PI / 2).translate(x, DECK_H + 0.9, z), L[1]));
    // At the foot: a painted keep-clear square, a small up-light, and on every other leg a utility cabinet.
    const y = floorAt(x, z) + 0.5;
    for (const [w, d, ox, oz] of [[46, 2, 0, -22], [46, 2, 0, 22], [2, 46, -22, 0], [2, 46, 22, 0]]) ground.push(tint(flat(w, d, x + ox, y, z + oz), 0xb8973e));
    glow.push(tint(boxAt(5, 2.5, 5, x - 13, y + 11, z - 13), 0xeef3f8));
    pool(x, z, 46, 0xeef3f8, y + 0.4);
    if (i % 2 === 0) {
      solid.push(tint(boxAt(14, 26, 9, x, y + 13, z + 17), 0x8a8f96));
      solid.push(tint(boxAt(10, 3, 1, x, y + 20, z + 21.6), 0x2a2e36));
      glow.push(tint(boxAt(2, 2, 1, x + 4, y + 20, z + 21.8), 0x9fe0b0));
    }
  }
  // Under the SKY BRIDGE: plinths and up-lights at the piers, and a cool pool on the road so the
  // gap under it reads as a space, not a shadow.
  for (const [x, z] of [[-2905, -735], [-2905, -795], [-2425, -735], [-2425, -795]]) {
    const y = floorAt(x, z);
    solid.push(tint(boxAt(18, 10, 18, x, y + 5, z), 0x6c7079));
    glow.push(tint(boxAt(4, 2, 4, x + (x < -2700 ? 9 : -9), y + 11, z), 0xd8ebff));
  }
  pool(X.x, -765, 150, 0xd8ebff, 1.1);
  for (let t = -150; t <= 150; t += 60) glow.push(tint(boxAt(8, 1, 3, X.x + t, HIGH_H - 7.6, -765), 0xeef3f8));
  // Stairs: treads with a light nosing, stringers with a handrail light, a portal at the top.
  for (const p of WORLD) {
    if (p.group !== 'sjdeck' || p.kind !== 'ramp') continue;
    const r = p as RampPrim;
    const len = r.axis === 'x' ? r.w : r.d, wid = r.axis === 'x' ? r.d : r.w;
    const n = Math.max(3, Math.round((r.hHigh - r.hLow) / 4.5));
    for (let i = 0; i < n; i++) {
      const t1 = (i + 1) / n, h = r.hLow + (r.hHigh - r.hLow) * t1, sl = len / n, u = (i + 0.5) / n;
      const off = (r.dir === 1 ? u - 0.5 : 0.5 - u) * len;
      const x = r.axis === 'x' ? r.x + off : r.x, z = r.axis === 'z' ? r.z + off : r.z;
      solid.push(tint(boxAt(r.axis === 'x' ? sl : r.w, 6, r.axis === 'z' ? sl : r.d, x, h - 3, z), i % 2 ? 0x9b978f : 0x938f88));
      const nose = (r.dir === 1 ? -0.5 : 0.5) * sl;
      glow.push(tint(boxAt(r.axis === 'x' ? 1.4 : wid - 6, 1, r.axis === 'z' ? 1.4 : wid - 6, r.axis === 'x' ? x + nose : x, h + 0.3, r.axis === 'z' ? z + nose : z), 0xe6fbff));
    }
    for (const sgn of [-1, 1]) {
      const sx = r.axis === 'z' ? r.x + sgn * (r.w / 2 + 2) : r.x, sz = r.axis === 'x' ? r.z + sgn * (r.d / 2 + 2) : r.z;
      const g = new THREE.BoxGeometry(r.axis === 'z' ? 4 : len, 1, r.axis === 'x' ? 4 : len, 1, 1, 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i) + sx, lz = pos.getZ(i) + sz;
        const t = r.axis === 'x' ? (lx - (r.x - len / 2)) / len : (lz - (r.z - len / 2)) / len;
        const hh = r.hLow + (r.hHigh - r.hLow) * (r.dir === 1 ? t : 1 - t);
        pos.setY(i, pos.getY(i) > 0 ? hh + 34 : Math.max(0, hh - 30));
      }
      g.translate(sx, 0, sz);
      g.computeVertexNormals();
      solid.push(tint(g, 0x3a3e46));
    }
    // Inside a podium (the stair up to T2's roof) the stringer reads as a glass-walled stair hall.
    const e = r.dir === 1 ? len / 2 : -len / 2;
    const tx = r.axis === 'x' ? r.x + e : r.x, tz = r.axis === 'z' ? r.z + e : r.z;
    for (const sg of [-1, 1]) {
      const px = r.axis === 'z' ? tx + sg * (wid / 2 + 3) : tx, pz = r.axis === 'x' ? tz + sg * (wid / 2 + 3) : tz;
      solid.push(tint(boxAt(7, 84, 7, px, r.hHigh + 42, pz), 0x8b9098));
    }
    solid.push(tint(boxAt(r.axis === 'z' ? wid + 14 : 8, 12, r.axis === 'x' ? wid + 14 : 8, tx, r.hHigh + 86, tz), 0x2a2c31));
    glow.push(tint(boxAt(r.axis === 'z' ? wid + 4 : 9, 2, r.axis === 'x' ? wid + 4 : 9, tx, r.hHigh + 79.5, tz), r.hHigh >= HIGH_H ? L[1] : 0xf2f6ff));
    if (r.hLow === 0) {
      const footX = r.axis === 'x' ? r.x - r.dir * (len / 2 + 30) : r.x, footZ = r.axis === 'z' ? r.z - r.dir * (len / 2 + 30) : r.z;
      pool(footX, footZ, 66, L[1], CURB + 0.6);
    }
  }
  // Wayfinding posts.
  const signPost = (x: number, z: number, nx: number, nz: number, cell: Cell) => {
    solid.push(tint(boxAt(4, 190, 4, x, 95, z), 0x5a5e66));
    solid.push(tint(boxAt(nx ? 3 : 104, 38, nx ? 104 : 3, x - nx * 3, 172, z - nz * 3), 0x2a2c31));
    lit.push(quad(100, 31, cell, x + nx * 0.5, 172, z + nz * 0.5, nx, nz));
  };
  signPost(-2455, -2300, 0, -1, CELLS.way(0));
  signPost(-2455, -390, 0, 1, CELLS.way(0));
  signPost(-3290, -1700, -1, 0, CELLS.way(0));
  signPost(-3200, -1820, 0, 1, CELLS.way(1));
  signPost(-2870, -1200, 1, 0, CELLS.way(3));
  signPost(-2870, -640, 0, 1, CELLS.way(2));

  // ------------------------------------------------------------ level signs (GROUND / DECK 2 / SKY BRIDGE at every stair)
  // Small, lit, at the foot and the top of each stair: where you are and where the stair goes.
  const inBuilding = (x: number, z: number) => SHINJUKU_BUILT.buildings.some((o) => x > o.x0 - 4 && x < o.x1 + 4 && z > o.z0 - 4 && z < o.z1 + 4);
  const levelSign = (x: number, y: number, z: number, nx: number, nz: number, i: number) => {
    solid.push(tint(boxAt(2.5, 66, 2.5, x, y + 33, z), 0x5a5e66));
    solid.push(tint(boxAt(nx ? 2 : 66, 26, nx ? 66 : 2, x, y + 60, z), 0x12151b));
    for (const sg of [-1, 1]) lit.push(quad(62, 23, CELLS.level(i), x + sg * nx * 1.2, y + 60, z + sg * nz * 1.2, sg * nx, sg * nz));
    glow.push(tint(boxAt(nx ? 2.4 : 66, 1.5, nx ? 66 : 2.4, x, y + 73.5, z), i % 3 === 0 ? 0xf2f6ff : L[1]));
  };
  for (const st of SHINJUKU_STAIRS) {
    const ax = st.axis === 'x', c = ax ? (st.z0 + st.z1) / 2 : (st.x0 + st.x1) / 2, wid = ax ? st.z1 - st.z0 : st.x1 - st.x0;
    const lo = st.dir === 1 ? (ax ? st.x0 : st.z0) : ax ? st.x1 : st.z1, hi = st.dir === 1 ? (ax ? st.x1 : st.z1) : ax ? st.x0 : st.z0;
    const ground0 = st.hLow === 0;
    // Foot: just before the first step, beside the stair (on the side clear of buildings).
    // A foot on the street stands beside the stair; on a deck it stands on the deck, on the side away from the avenue.
    for (const [t, lat, y, cell] of [[lo - st.dir * 22, ground0 ? wid / 2 + 9 : wid / 2 - 8, st.hLow, ground0 ? 0 : 1], [hi + st.dir * 22, wid / 2 - 8, st.hHigh, ground0 ? 2 : 3]] as const) {
      const sides = !ax && Math.abs(c + 1 - X.x) < Math.abs(c - 1 - X.x) ? [-1, 1] : [1, -1];
      const side = sides.find((sg) => {
        const px = ax ? t : c + sg * lat, pz = ax ? c + sg * lat : t;
        return !inBuilding(px, pz);
      }) ?? 1;
      const px = ax ? t : c + side * lat, pz = ax ? c + side * lat : t;
      levelSign(px, y, pz, ax ? -st.dir : 0, ax ? 0 : -st.dir, cell);
    }
  }

  // ------------------------------------------------------------ the VERTICAL CORE (up T1's south-west corner)
  {
    const C = VERTICAL_CORE, t1 = SHINJUKU_BUILT.buildings.find((o) => o.id === 'T1')!;
    const w = C.x1 - C.x0, d = C.z1 - C.z0, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2, top = t1.h + C.spire;
    // Unlike the towers' glass (vertical fins), the core is banded across: a glass body with a
    // white light band every half storey, a ladder of light the eye climbs. Two mullions a face.
    core.push(tint(boxAt(w - 4, top, d - 4, cx, top / 2, cz), 0xffffff));
    for (const t of [w / 3, (2 * w) / 3]) solid.push(tint(boxAt(3, top, 3, C.x0 + t, top / 2, C.z1 - 1), 0x2a2e36));
    for (const t of [d / 3, (2 * d) / 3]) solid.push(tint(boxAt(3, top, 3, C.x0 + 1, top / 2, C.z0 + t), 0x2a2e36));
    for (const [x, z] of [[C.x0, C.z0], [C.x0, C.z1], [C.x1, C.z1]]) coreLight.push(tint(boxAt(5, top, 5, x, top / 2, z), 0xffffff));
    // One unbroken seam of blue-white light up the middle of the two faces toward the crossing,
    // from the pavement to the needle: the line the eye follows up.
    coreLight.push(tint(boxAt(7, top + 180, 2, cx, (top + 180) / 2, C.z1 + 2.2), 0xd8ebff), tint(boxAt(2, top + 180, 7, C.x0 - 2.2, (top + 180) / 2, cz), 0xd8ebff));
    const ring = (y: number, t: number, col: number) => {
      coreLight.push(tint(boxAt(w + 3, t, 3, cx, y, C.z1 + 0.5), col), tint(boxAt(3, t, d + 3, C.x0 - 0.5, y, cz), col));
      coreLight.push(tint(boxAt(w + 3, t, 3, cx, y, C.z0 - 0.5), col), tint(boxAt(3, t, d + 3, C.x1 + 0.5, y, cz), col));
    };
    for (let y = 30; y < top - 10; y += STOREY / 2) if (Math.abs(y - DECK_H) > 20 && Math.abs(y - HIGH_H) > 20 && Math.abs(y - 238) > 18) ring(y, 4.5, 0xffffff);
    // Level marks where DECK 2 and the high level meet it (glass blue, heavier).
    ring(DECK_H + 4, 9, L[1]);
    ring(HIGH_H + 4, 9, L[1]);
    // The top: a cap, a needle with a beacon (seen over the roofs from the square and the avenue).
    solid.push(tint(boxAt(w + 10, 8, d + 10, cx, top + 4, cz), 0x2a2e36));
    coreLight.push(tint(boxAt(6, 180, 6, cx, top + 98, cz), 0xffffff));
    glow.push(tint(boxAt(12, 12, 12, cx, top + 194, cz), 0xff2a1e));
    // The name plate above the deck (west and south, toward the crossing).
    for (const [x, z, nx, nz] of [[C.x0 - 2.5, cz, -1, 0], [cx, C.z1 + 2.5, 0, 1]] as const) {
      solid.push(tint(boxAt(nx ? 3 : w + 2, 22, nx ? d + 2 : 3, x - nx * 0.6, 238, z - nz * 0.6), 0x10131a));
      hero.push(quad((nx ? d : w) - 4, 17, CELLS.ticker, x + nx * 1.2, 238, z + nz * 1.2, nx, nz));
    }
    pool(cx - 60, cz + 60, 160, L[1], 1.1);
    pool(cx - 20, cz + 20, 70, 0xf2f6ff, 1.2);
    pool(cx - 30, cz + 30, 36, 0xd8ebff, 1.3);
  }

  // ------------------------------------------------------------ NIGHT LANES gate (at the lanes' south mouth)
  {
    const G = LANES_GATE, xc = (G.x0 + G.x1) / 2, span = G.x1 - G.x0, [s0, s1] = G.sign;
    for (const x of [G.x0, G.x1]) {
      solid.push(tint(boxAt(16, G.top, 16, x, G.top / 2, G.z), 0x1b1c22));
      for (const dx of [-5, 5]) glow.push(tint(boxAt(2, G.top - 16, 2, x + dx, G.top / 2, G.z + 8.6), 0xf2f6ff));
      glow.push(tint(boxAt(2, G.top - 16, 2, x, G.top / 2, G.z - 8.6), 0xf2f6ff));
    }
    solid.push(tint(boxAt(span + 30, s1 - s0 + 8, 10, xc, (s0 + s1) / 2, G.z), 0x101015));
    for (const nz of [-1, 1]) hero.push(quad(span + 20, s1 - s0, CELLS.gate, xc, (s0 + s1) / 2, G.z + nz * 5.6, 0, nz));
    glow.push(tint(boxAt(span + 24, 2.5, 12, xc, s0 - 3, G.z), L[3]));
    pool(xc, G.z + 70, 110, 0xfff1dc, 0.6);
  }

  // ------------------------------------------------------------ ground: the base square, the lanes, the crossing
  // Base square: granite slabs in two tones (mid-tone: the base's and shops' light must not wash it out).
  const GRANITE = [0x7a7772, 0x85827c, 0x72706b];
  for (let x = -3420; x < -2890; x += 50) {
    for (let z = -1700; z < -680; z += 50) {
      if (!insideLoop(x + 25, z + 25, 150)) continue;
      if (x + 25 > -3230 && x + 25 < -2985 && z + 25 > -900) continue; // T3
      ground.push(tint(flat(49, 49, x + 25, 0.35, z + 25), GRANITE[(((Math.floor(x / 50) + Math.floor(z / 50) * 2) % 3) + 3) % 3]));
    }
  }
  // Kerb-side bollards on the square's avenue edge (people, not cars).
  for (let z = -1680; z < -1180; z += 60) bollards.push(M4(-2898, 14, z));
  // Lanes: darker worn paving with a drain line, lanterns strung across.
  {
    const { x0, z0, cell } = LANES;
    LANES_MAP.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== '.') return;
      ground.push(tint(flat(cell, cell, x0 + (c + 0.5) * cell, 0.4, z0 + (r + 0.5) * cell), (r + c) % 2 ? 0x4b4947 : 0x53504d));
    }));
    // The lane along the walk-up.
    for (let z = -2250; z < -1800; z += 50) ground.push(tint(flat(96, 49, -3029, 0.4, z + 25), (z / 50) % 2 ? 0x4b4947 : 0x53504d));
    const strings: [number, number, number, number][] = [
      [x0 + 3 * cell, z0 + 1.5 * cell, x0 + 6 * cell, z0 + 1.5 * cell],
      [x0, z0 + 4 * cell, x0 + 9 * cell, z0 + 4 * cell],
      [x0 + 0 * cell, z0 + 8 * cell, x0 + 3 * cell, z0 + 8 * cell],
      [x0 + 6 * cell, z0 + 9 * cell, x0 + 9 * cell + 98, z0 + 9 * cell],
      [-3078, -2150, -2980, -2150],
    ];
    const wire: number[] = [];
    for (const [ax, az, bx, bz] of strings) {
      const n = Math.max(3, Math.round(Math.hypot(bx - ax, bz - az) / 32));
      for (let k = 0; k <= n; k++) {
        const t = k / n, y = 200 - 20 * 4 * t * (1 - t);
        if (k > 0 && k < n) lanterns.push(M4(ax + (bx - ax) * t, y - 9, az + (bz - az) * t));
        if (k < n) {
          const t2 = (k + 1) / n;
          wire.push(ax + (bx - ax) * t, y, az + (bz - az) * t, ax + (bx - ax) * t2, 200 - 20 * 4 * t2 * (1 - t2), az + (bz - az) * t2);
        }
      }
      pool((ax + bx) / 2, (az + bz) / 2, 80, 0xffe6c8, 0.6);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x18181c })));
  }
  // The VERTICAL CROSS: a cool light pool in the middle, and white light along the avenue's kerbs.
  pool(X.x, X.z, 220, 0xeef3f8, 1.0);
  for (const z of [-1900, -1700, -1000, -800]) pool(X.x, z, 120, 0xf2f6ff, 1.0);
  // RAIL LANE (between T3 and the tracks): lanterns on a wire and air-con units.
  for (let k = 0; k < 5; k++) lanterns.push(M4(-3275, 190, -890 + k * 50));
  pool(-3275, -790, 90, 0xffe6c8, 0.6);
  for (const [x, z] of [[-3238, -860], [-3238, -760]] as const) acs.push(M4(x, 20, z, -Math.PI / 2));

  // Railway arches by Shinjuku station: lit shops under the tracks (the dark wall west of the square).
  {
    const si = STATIONS.findIndex((s) => s.name === '新宿');
    const rnd = prng(1102);
    for (const i of [si - 1, si]) {
      const a = LOOP[(i + LOOP.length) % LOOP.length], b2 = LOOP[(i + 1) % LOOP.length];
      const len = Math.hypot(b2.x - a.x, b2.z - a.z), ang = Math.atan2(b2.x - a.x, b2.z - a.z), L2 = len + VIADUCT.w * 0.6;
      const F = new THREE.Matrix4().compose(new THREE.Vector3((a.x + b2.x) / 2, 0, (a.z + b2.z) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(1, 1, 1));
      const nx = Math.cos(ang), nz = -Math.sin(ang), mx = (a.x + b2.x) / 2, mz = (a.z + b2.z) / 2;
      const side = insideLoop(mx + nx * 400, mz + nz * 400, 0) ? 1 : -1;
      for (let k = 0; ; k++) {
        const zl = L2 / 2 - 260 * (k + 0.5);
        if (zl < -L2 / 2) break;
        if (Math.abs(zl) > len / 2 - 320) continue;
        arches.push(quad(200, 152, CELLS.garage(Math.floor(rnd() * 4)), side * (VIADUCT.w / 2 + 1.5), 76, zl, side, 0).applyMatrix4(F));
      }
    }
  }

  // ------------------------------------------------------------ materials and meshes
  const tex = atlas();
  const signMat = (i: number, tone = 0xffffff) => nearFade(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: tone, emissiveMap: tex, emissiveIntensity: i, roughness: 1 }), 30, 120);
  const heroMat = signMat(0.85), litMat = signMat(0.6), backMat = signMat(0.34, 0xd6d4dc);
  const archMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8, roughness: 1 });
  const solidMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }), 30, 120);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb6c4, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.4, depthWrite: false });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const poolMat = new THREE.MeshBasicMaterial({ map: radialGlowTexture(), vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  NIGHT_GLOW.push({
    set: (k) => {
      heroMat.emissiveIntensity = 0.85 + 0.2 * k;
      litMat.emissiveIntensity = 0.6 + 0.16 * k;
      backMat.emissiveIntensity = 0.34 + 0.1 * k;
      // Office light: dim by day (the glass reads as glass), the whole grid by night.
      winMat.color.setScalar(0.45 + 0.5 * k);
      archMat.emissiveIntensity = 0.8 + 0.15 * k;
      glowMat.color.setScalar(0.7 + 0.3 * k);
      poolMat.opacity = 0.1 + 0.45 * k;
    },
  });
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
    m.name = 'shinjuku';
    scene.add(m);
    meshes++;
  };
  for (const [k, list] of Object.entries(skins)) {
    const kind = k as FacadeKind;
    const m = new THREE.MeshStandardMaterial({ map: sharedFacadeTexture(kind), vertexColors: true, roughness: kind === 'glass' ? 0.3 : 0.85, metalness: kind === 'glass' ? 0.3 : 0, emissive: 0xffffff, emissiveMap: sharedFacadeTexture(kind, true), emissiveIntensity: 0.45 });
    glowAtNight(m, 0.45, 0.8);
    add(list, m, true);
  }
  add(hero, heroMat, false);
  add(lit, litMat, false);
  add(back, backMat, false);
  add(win, winMat, false, false);
  add(glass, glassMat, false, false, 1);
  add(solid, solidMat, true);
  add(glow, glowMat, false, false);
  add(ground, groundMat, false);
  add(arches, archMat, false);
  add(pools, poolMat, false, false, 1);
  // The VERTICAL CORE's glass: pale by day (it reads against the darker tower glass), lit through at night.
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x8fa9bf });
  NIGHT_GLOW.push({ set: (k) => { coreMat.color.setHex(0x8fa9bf).lerp(new THREE.Color(0xa9cbe6), k); } });
  add(core, coreMat, false, false);
  // Its light bands stay full white by day and night (the brightest lines in the district).
  add(coreLight, new THREE.MeshBasicMaterial({ vertexColors: true }), false, false);
  let instanced = 0;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cast = true) => {
    if (!ms.length) return;
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = cast;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.name = 'shinjuku';
    scene.add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * ms.length;
    instanced++;
  };
  inst(new THREE.BoxGeometry(36, 30, 26), new THREE.MeshStandardMaterial({ color: 0xcfcdc6, roughness: 0.8 }), acs);
  inst(new THREE.CylinderGeometry(28, 28, 46, 12), new THREE.MeshStandardMaterial({ color: 0x9fb2bd, roughness: 0.6 }), tanks);
  inst(new THREE.CylinderGeometry(2.4, 2.4, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.6, metalness: 0.3 }), pipes, false);
  // Paper lanterns (warm white, not neon pink).
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffe6c8 });
  NIGHT_GLOW.push({ set: (k) => { lanternMat.color.setHex(0xffe6c8).multiplyScalar(0.7 + 0.3 * k); } });
  inst(new THREE.CylinderGeometry(6, 6, 16, 8), lanternMat, lanterns, false);
  inst(new THREE.CylinderGeometry(4, 5, 28, 8), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.4 }), bollards, false);
  inst(new THREE.BoxGeometry(70, 24, 30), new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.9 }), planters);
  return { buildings: SHINJUKU_BUILT.buildings.length, bays, meshes, instanced, triangles: Math.round(tris) };
}
