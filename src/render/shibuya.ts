import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxPrim, RampPrim } from '../config/map';
import { CURB, GROUND_FLOOR, LIGHTS, LOOP, SHIBUYA_BUILT, STATIONS, STOREY, VIADUCT, WORLD, insideLoop, prng } from '../config/map';
import type { ShibuyaBuilding, ShibuyaSide } from '../config/shibuya';
import { HALO_SCREEN, MAZE, MAZE_GATE, MAZE_MAP, SHIBUYA_CROSSING, SKY_DECKS, SKY_H, SUBWAY } from '../config/shibuya';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { nearFade } from './city';
import { radialGlowTexture, sharedFacadeTexture } from './textures';
import type { FacadeKind } from './textures';

/**
 * v10 MAP REFORGE — 渋谷 NEON MAZE, the Golden Sector, as drawn.
 *
 * The buildings of the rebuilt centre (config/shibuya.ts) in three layers:
 * - street level (the first 1–2 storeys, what the chase camera sees most): show windows,
 *   shop name bands, awnings and pillars on every street side; service doors, pipes, air-con
 *   units and fire escapes on the lane sides;
 * - the middle storeys: façade tiles, floor-directory light bands, projecting blade signs,
 *   big screens hung low enough to read from the street;
 * - the roof: parapets, plant, water tanks, lit billboards and crowns.
 * Then the landmarks — HALO VISION (the round screen over the station square), the SKY RING
 * over the scramble with its stairs, the NEON MAZE gate — and the ground: the scramble's
 * diagonals, the square's granite, lane paving, light pools at shop doors, stair nosings
 * and hanging lanterns. Small repeated pieces are instanced; everything else is merged per
 * material (one texture atlas for every sign and screen).
 *
 * Light colours are Shibuya's own (magenta, violet, mint, rose, white): never a faction hue.
 */

/** Shibuya's light colours (no SOL orange, LUNA blue or STAR yellow; see tests). */
export const SHIBUYA_LIGHTS = [0xff3fa4, 0xb46bff, 0x5dffc8, 0xff4a7a, 0xf4f0ff] as const;

const ATLAS_W = 1024, ATLAS_H = 1792;
type Cell = [number, number, number, number];
const CELLS = {
  window: (i: number): Cell => [(i % 4) * 256, Math.floor(i / 4) * 192, 256, 192],
  name: (i: number): Cell => [(i % 4) * 256, 384 + Math.floor(i / 4) * 48, 256, 48],
  blade: (i: number): Cell => [i * 64, 480, 64, 256],
  way: (i: number): Cell => [512 + (i % 2) * 256, 480 + Math.floor(i / 2) * 80, 256, 80],
  swatch: (i: number): Cell => [512 + i * 64 + 8, 648, 48, 16],
  ticker: [512, 672, 512, 64] as Cell,
  screen: (i: number): Cell => [i * 512, 736, 512, 288],
  garage: (i: number): Cell => [i * 256, 1024, 256, 256],
  halo: [0, 1280, 512, 512] as Cell,
  gate: [512, 1280, 512, 128] as Cell,
  ring: [512, 1408, 512, 64] as Cell,
  vscreen: (i: number): Cell => [512 + i * 128, 1472, 128, 320],
  metro: [768, 1472, 256, 96] as Cell,
  floor: (i: number): Cell => [768, 1568 + i * 28, 256, 28],
};
const NAMES = ['KAIRO DELI', 'NEON//MART', 'TOKI COFFEE', 'PIXEL ARCADE', 'HAZE SHOES', 'ORBIT VINYL', 'MOSS BOOKS', 'YUZU NOODLE'];
const BLADES = ['古着', '珈琲', 'ゲーム', 'らーめん', '書店', '靴', 'カラオケ', '薬局'];
const FLOORS = ['2F BAR LUNETTE', '3F KARAOKE 99', '4F NAIL ROOM', '5F DANCE STUDIO', '6F MANGA CAFE', '7F CLINIC'];
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** The Shibuya atlas: shop windows, name bands, blade signs, wayfinding, screens, arch shops, landmark art. */
function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d')!;
  const rnd = prng(9201);
  const L = SHIBUYA_LIGHTS;
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = '800') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  // Show windows: a lit interior behind glass, a mullion frame and a door on one side.
  const interiors: ((x: number, y: number) => void)[] = [
    (x, y) => {
      for (let k = 0; k < 5; k++) { g.fillStyle = `hsl(${20 + rnd() * 30},45%,${55 + rnd() * 15}%)`; g.fillRect(x + 20 + k * 44, y + 120, 36, 22); }
      g.fillStyle = '#e9e4da'; g.fillRect(x + 12, y + 142, 232, 40);
    },
    (x, y) => {
      for (let r = 0; r < 4; r++) for (let k = 0; k < 22; k++) { g.fillStyle = `hsl(${rnd() * 360},${40 + rnd() * 40}%,${50 + rnd() * 25}%)`; g.fillRect(x + 14 + k * 10.4, y + 50 + r * 30, 8, 22); }
    },
    (x, y) => {
      for (let k = 0; k < 4; k++) { g.fillStyle = '#3a2c22'; g.fillRect(x + 40 + k * 56, y + 30, 2, 30); g.fillStyle = '#fff2c8'; g.beginPath(); g.arc(x + 41 + k * 56, y + 66, 9, Math.PI, 0); g.fill(); }
      g.fillStyle = '#5a3d2a'; g.fillRect(x + 12, y + 130, 232, 52);
      for (let k = 0; k < 9; k++) { g.fillStyle = '#f4efe6'; g.fillRect(x + 22 + k * 24, y + 118, 10, 12); }
    },
    (x, y) => {
      g.fillStyle = '#1c1530'; g.fillRect(x + 6, y + 6, 244, 180);
      for (let k = 0; k < 5; k++) {
        const col = L[k % 4];
        g.fillStyle = '#0d0b14'; g.fillRect(x + 16 + k * 47, y + 60, 38, 120);
        g.fillStyle = css(col); g.fillRect(x + 20 + k * 47, y + 70, 30, 34);
        g.fillStyle = css(col, 0.5); g.fillRect(x + 16 + k * 47, y + 56, 38, 6);
      }
    },
    (x, y) => {
      for (let r = 0; r < 4; r++) {
        g.fillStyle = '#d9d4ca'; g.fillRect(x + 14, y + 72 + r * 30, 228, 3);
        for (let k = 0; k < 7; k++) { g.fillStyle = `hsl(${rnd() * 360},${30 + rnd() * 50}%,${35 + rnd() * 45}%)`; g.beginPath(); g.ellipse(x + 34 + k * 31, y + 64 + r * 30, 12, 6, 0, 0, Math.PI * 2); g.fill(); }
      }
    },
    (x, y) => {
      for (let k = 0; k < 4; k++) { g.fillStyle = css(L[(k + 1) % 5], 0.8); g.fillRect(x + 20 + k * 58, y + 30, 40, 52); }
      g.fillStyle = '#4a3f38'; g.fillRect(x + 12, y + 130, 232, 52);
      for (let k = 0; k < 28; k++) { g.fillStyle = `hsl(${rnd() * 360},30%,${30 + rnd() * 40}%)`; g.fillRect(x + 16 + k * 8, y + 112, 6, 22); }
    },
    (x, y) => {
      for (let r = 0; r < 5; r++) for (let k = 0; k < 40; k++) { g.fillStyle = `hsl(${20 + rnd() * 200},${20 + rnd() * 30}%,${30 + rnd() * 45}%)`; g.fillRect(x + 12 + k * 5.8, y + 40 + r * 28, 5, 20 + rnd() * 4); }
    },
    (x, y) => {
      for (let k = 0; k < 3; k++) {
        const mx = x + 54 + k * 74;
        g.fillStyle = '#d8d2c8'; g.beginPath(); g.arc(mx, y + 52, 11, 0, Math.PI * 2); g.fill();
        g.fillStyle = ['#2b2d33', '#7a2335', '#e8e0cc'][k]; g.fillRect(mx - 20, y + 64, 40, 64);
        g.fillStyle = '#3a3d44'; g.fillRect(mx - 14, y + 128, 11, 50); g.fillRect(mx + 3, y + 128, 11, 50);
      }
    },
  ];
  for (let i = 0; i < 8; i++) {
    const [x, y, w, h] = CELLS.window(i);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, '#fff7ea');
    grd.addColorStop(1, '#cbbfae');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    interiors[i](x, y);
    g.fillStyle = 'rgba(255,255,255,.16)';
    g.beginPath(); g.moveTo(x + 30, y + h); g.lineTo(x + 110, y); g.lineTo(x + 150, y); g.lineTo(x + 70, y + h); g.fill();
    g.fillStyle = '#25272c';
    g.fillRect(x, y, w, 7); g.fillRect(x, y + h - 9, w, 9); g.fillRect(x, y, 6, h); g.fillRect(x + w - 6, y, 6, h);
    const door = i % 2 ? x + w - 70 : x + 6;
    g.fillRect(door + (i % 2 ? 0 : 58), y, 6, h);
    g.fillRect(x + w / 2 - 2, y, 4, h);
  }
  NAMES.forEach((n, i) => {
    const [x, y, w, h] = CELLS.name(i);
    const col = L[i % L.length];
    g.fillStyle = i % 3 === 2 ? '#efe9dd' : '#17181c';
    g.fillRect(x, y, w, h);
    g.fillStyle = css(col);
    g.fillRect(x, y + h - 5, w, 5);
    text(n, x + w / 2, y + h / 2 - 2, 26, i % 3 === 2 ? '#1a1b20' : css(col === 0xf4f0ff ? 0xffffff : col));
  });
  BLADES.forEach((wd, i) => {
    const [x, y, w, h] = CELLS.blade(i);
    const col = L[i % L.length];
    g.fillStyle = i % 2 ? css(col) : '#15161a';
    g.fillRect(x, y, w, h);
    g.strokeStyle = i % 2 ? 'rgba(255,255,255,.85)' : css(col);
    g.lineWidth = 4;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    const n = [...wd].length, step = Math.min(52, 220 / n);
    [...wd].forEach((ch, k) => text(ch, x + w / 2, y + h / 2 + (k - (n - 1) / 2) * step, 40, i % 2 ? '#14151a' : '#ffffff', 'center', '900'));
  });
  // Wayfinding: SKY RING (up), back alley, scramble, station.
  const way = [['空中回廊', 'SKY RING', '↑'], ['路地', 'BACK ALLEY', '→'], ['スクランブル', 'SCRAMBLE', '↔'], ['駅前広場', 'STATION SQ.', '←']];
  way.forEach(([jp, en, arrow], i) => {
    const [x, y, w, h] = CELLS.way(i);
    g.fillStyle = '#f4f2ec'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1b1c21'; g.fillRect(x, y, 66, h);
    text(arrow, x + 33, y + h / 2 + 2, 52, css(i === 0 ? 0x5dffc8 : i === 1 ? 0xff3fa4 : 0xf4f0ff), 'center', '900');
    text(jp, x + 80, y + 28, jp.length > 4 ? 24 : 30, '#16171b', 'left', '900');
    text(en, x + 80, y + 60, 20, '#3a3c44', 'left', '700');
  });
  L.forEach((col, i) => { const [x, y, w, h] = CELLS.swatch(i); g.fillStyle = css(col); g.fillRect(x - 8, y - 8, w + 16, h + 16); });
  {
    const [x, y, w, h] = CELLS.ticker;
    g.fillStyle = '#0c0b12'; g.fillRect(x, y, w, h);
    text('NEON MAZE ・ 渋谷 ・ NIGHT RUN ・ 22:00 ・ 渋谷 ・', x + w / 2, y + h / 2, 30, css(0x5dffc8), 'center', '800');
  }
  // Big screens: abstract motion graphics (invented content only).
  for (let i = 0; i < 2; i++) {
    const [x, y, w, h] = CELLS.screen(i);
    const grd = g.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, i ? '#2a0f3d' : '#160c2a');
    grd.addColorStop(1, i ? '#0d3b3a' : '#4a0f33');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = css(L[(k + i) % 3], 0.35 + rnd() * 0.4);
      g.lineWidth = 3 + rnd() * 10;
      g.beginPath();
      const yy = y + 20 + rnd() * (h - 40);
      g.moveTo(x, yy);
      g.bezierCurveTo(x + w * 0.3, yy - 80 + rnd() * 160, x + w * 0.7, yy - 80 + rnd() * 160, x + w, yy + rnd() * 40 - 20);
      g.stroke();
    }
    if (i === 0) {
      text('NEON', x + 40, y + 110, 96, '#ffffff', 'left', '900');
      text('MAZE', x + 40, y + 200, 96, css(0x5dffc8), 'left', '900');
      text('渋谷 / SHIBUYA SCRAMBLE', x + 44, y + 258, 22, 'rgba(255,255,255,.8)', 'left', '700');
    } else {
      g.fillStyle = css(0xff3fa4); g.beginPath(); g.arc(x + 380, y + 144, 90, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 380, y + 144, 56, 0, Math.PI * 2); g.fill();
      text('RUN', x + 50, y + 120, 84, '#ffffff', 'left', '900');
      text('THE CITY', x + 50, y + 196, 56, css(0xb46bff), 'left', '900');
    }
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let r = 0; r < h; r += 4) g.fillRect(x, y + r, w, 1);
  }
  // Shops in the railway arches (ガード下).
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = CELLS.garage(i);
    g.fillStyle = '#2b2925'; g.fillRect(x, y, w, h);
    if (i === 2) {
      g.fillStyle = '#8d8f92'; g.fillRect(x + 16, y + 70, w - 32, h - 70);
      g.fillStyle = 'rgba(0,0,0,.25)';
      for (let r = y + 74; r < y + h; r += 8) g.fillRect(x + 16, r, w - 32, 2);
      g.fillStyle = css(0xf4f0ff); g.fillRect(x + w / 2 - 20, y + 48, 40, 10);
      continue;
    }
    const grd = g.createLinearGradient(x, y + 60, x, y + h);
    grd.addColorStop(0, i === 1 ? '#d9e6e2' : '#ffe9c8');
    grd.addColorStop(1, i === 1 ? '#7d8a88' : '#8a6a4c');
    g.fillStyle = grd;
    g.fillRect(x + 16, y + 70, w - 32, h - 70);
    if (i === 0) {
      for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? '#1b1c22' : '#7a2335'; g.fillRect(x + 16 + k * 45, y + 70, 45, 44); }
      for (let k = 0; k < 4; k++) { g.fillStyle = css(0xff4a7a); g.beginPath(); g.ellipse(x + 50 + k * 52, y + 58, 11, 15, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#4a3527'; g.fillRect(x + 24, y + 196, w - 48, 40);
    } else if (i === 1) {
      for (let k = 0; k < 7; k++) { g.strokeStyle = '#2a2d33'; g.lineWidth = 4; g.beginPath(); g.arc(x + 40 + k * 30, y + 216, 16, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = css(0x5dffc8); g.fillRect(x + 40, y + 36, w - 80, 26);
      text('BIKE', x + w / 2, y + 50, 20, '#0d1a17', 'center', '900');
    } else {
      g.fillStyle = css(0xb46bff); g.fillRect(x + 30, y + 36, w - 60, 26);
      text('STAND', x + w / 2, y + 50, 20, '#ffffff', 'center', '900');
      g.fillStyle = '#3b2c22'; g.fillRect(x + 24, y + 186, w - 48, 50);
      for (let k = 0; k < 6; k++) { g.fillStyle = '#f2ead8'; g.fillRect(x + 40 + k * 30, y + 170, 12, 16); }
    }
  }
  // HALO VISION: concentric light, a running figure in silhouette (the game's own motif), the logo.
  {
    const [x, y, w] = CELLS.halo, cx = x + w / 2, cy = y + w / 2;
    const grd = g.createRadialGradient(cx, cy, 10, cx, cy, w / 2);
    grd.addColorStop(0, '#3a1250');
    grd.addColorStop(0.6, '#150a2a');
    grd.addColorStop(1, '#05040c');
    g.fillStyle = grd;
    g.fillRect(x, y, w, w);
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = css(L[k % 3], 0.25 + 0.06 * k);
      g.lineWidth = 6;
      g.beginPath(); g.arc(cx, cy, 40 + k * 24, 0, Math.PI * 2); g.stroke();
    }
    g.save();
    g.translate(cx - 30, cy + 10);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(36, -96, 22, 0, Math.PI * 2); g.fill();
    g.lineCap = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = 24;
    const seg = (a: [number, number], b: [number, number]) => { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
    seg([24, -62], [-2, 6]); seg([-2, 6], [52, 46]); seg([52, 46], [40, 104]); seg([-2, 6], [-40, 52]); seg([-40, 52], [-92, 46]);
    seg([18, -46], [74, -16]); seg([74, -16], [104, -48]); seg([18, -46], [-34, -36]); seg([-34, -36], [-58, 6]);
    g.restore();
    text('TRI//TRACE', cx, y + w - 92, 44, css(0x5dffc8), 'center', '900');
    text('SHIBUYA ・ HALO VISION', cx, y + w - 50, 22, 'rgba(255,255,255,.85)', 'center', '700');
    g.fillStyle = 'rgba(0,0,0,.16)';
    for (let r = 0; r < w; r += 4) g.fillRect(x, y + r, w, 1);
  }
  // Gate sign, ring fascia band, vertical screens, metro sign, floor directories.
  {
    const [x, y, w, h] = CELLS.gate;
    g.fillStyle = '#0b0a12'; g.fillRect(x, y, w, h);
    g.strokeStyle = css(0xff3fa4); g.lineWidth = 6; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    text('NEON MAZE', x + 190, y + h / 2, 62, '#ffffff', 'center', '900');
    text('迷路', x + 420, y + h / 2 + 2, 66, css(0xff3fa4), 'center', '900');
  }
  {
    const [x, y, w, h] = CELLS.ring;
    const grd = g.createLinearGradient(x, y, x + w, y);
    grd.addColorStop(0, '#2a0a3a'); grd.addColorStop(0.5, '#3d0b33'); grd.addColorStop(1, '#0b2a2a');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    text('SKY RING ・ 渋谷 ・ 空中回廊 ・', x + w / 2, y + h / 2 + 2, 34, '#ffffff', 'center', '900');
  }
  for (let i = 0; i < 2; i++) {
    const [x, y, w, h] = CELLS.vscreen(i);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, i ? '#3b0c3f' : '#06222a'); grd.addColorStop(1, i ? '#100a26' : '#2a0c36');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    for (let k = 0; k < 6; k++) { g.fillStyle = css(L[(k + i) % 3], 0.5); g.fillRect(x + 10 + (k % 2) * 56, y + 20 + k * 48, 52, 34); }
    const word = i ? '渋谷' : '走れ';
    [...word].forEach((ch, k) => text(ch, x + w / 2, y + 110 + k * 100, 92, '#ffffff', 'center', '900'));
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let r = 0; r < h; r += 4) g.fillRect(x, y + r, w, 1);
  }
  {
    const [x, y, w, h] = CELLS.metro;
    g.fillStyle = '#f4f2ec'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1b1c21'; g.fillRect(x, y, 90, h);
    text('M', x + 45, y + h / 2, 64, css(0x5dffc8), 'center', '900');
    text('地下鉄', x + 170, y + 32, 34, '#16171b', 'center', '900');
    text('METRO ↓', x + 170, y + 70, 24, '#3a3c44', 'center', '700');
  }
  FLOORS.forEach((f, i) => {
    const [x, y, w, h] = CELLS.floor(i);
    g.fillStyle = i % 2 ? '#f1ece2' : '#18171d'; g.fillRect(x, y, w, h);
    g.fillStyle = css(L[i % 5]); g.fillRect(x, y, 8, h);
    text(f, x + 16, y + h / 2, 17, i % 2 ? '#1a1b20' : '#ffffff', 'left', '800');
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** A flat textured quad facing (nx, 0, nz) (or up), mapped to an atlas cell. */
function quad(w: number, h: number, cell: Cell, x: number, y: number, z: number, nx: number, nz: number, up = false): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [cx, cy, cw, ch] = cell;
  const u0 = cx / ATLAS_W, u1 = (cx + cw) / ATLAS_W, v1 = 1 - cy / ATLAS_H, v0 = 1 - (cy + ch) / ATLAS_H;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  if (up) g.rotateX(-Math.PI / 2).rotateY(Math.atan2(nx, nz) + Math.PI);
  else g.rotateY(Math.atan2(nx, nz));
  return g.translate(x, y, z);
}

/** Geometry with a baked vertex colour (for solid, emissive-strip and ground meshes). */
function tint(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color), n = ng.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  ng.deleteAttribute('uv');
  return ng;
}

const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number, ang = 0) => new THREE.BoxGeometry(w, h, d).rotateY(ang).translate(x, y, z);
const flat = (w: number, d: number, x: number, y: number, z: number, ang = 0) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(ang).translate(x, y, z);

/** A side of a footprint as seen from outside: bottom-left → bottom-right, outward normal. */
interface Face { ax: number; az: number; bx: number; bz: number; nx: number; nz: number; len: number; side: ShibuyaSide }
function faceOf(b: { x0: number; z0: number; x1: number; z1: number }, side: ShibuyaSide): Face {
  switch (side) {
    case 's': return { ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, nx: 0, nz: 1, len: b.x1 - b.x0, side };
    case 'n': return { ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, nx: 0, nz: -1, len: b.x1 - b.x0, side };
    case 'e': return { ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, nx: 1, nz: 0, len: b.z1 - b.z0, side };
    default: return { ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, nx: -1, nz: 0, len: b.z1 - b.z0, side };
  }
}
/** Point `s` along a face and `out` in front of it. */
const along = (f: Face, s: number, out: number): [number, number] => {
  const tx = (f.bx - f.ax) / f.len, tz = (f.bz - f.az) / f.len;
  return [f.ax + tx * s + f.nx * out, f.az + tz * s + f.nz * out];
};
const SIDES: ShibuyaSide[] = ['n', 's', 'e', 'w'];

/** Façade tile size (as the generic city): 2 bays wide, 4 storeys tall. */
const TILE_U = 200, TILE_V = 4 * STOREY;
const SKIN: Record<ShibuyaBuilding['skin'], { tex: FacadeKind; tint: number }> = {
  tileA: { tex: 'tileA', tint: 0xf1e6d8 },
  tileB: { tex: 'tileB', tint: 0xe3e0e6 },
  concrete: { tex: 'concrete', tint: 0xd8d4cc },
  glass: { tex: 'glass', tint: 0xdfe6ee },
  dark: { tex: 'glass', tint: 0x6a6878 },
};

export interface ShibuyaStats { buildings: number; bays: number; screens: number; meshes: number; instanced: number; triangles: number; lamps: number }

/** Builds the rebuilt centre of Shibuya into the scene. */
export function buildShibuya(scene: THREE.Scene): ShibuyaStats {
  const rnd = prng(1010);
  const L = SHIBUYA_LIGHTS;
  // Merge buckets.
  const lit: THREE.BufferGeometry[] = [], solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], ground: THREE.BufferGeometry[] = [];
  const pools: THREE.BufferGeometry[] = [], holo: THREE.BufferGeometry[] = [];
  const skins: Record<string, THREE.BufferGeometry[]> = {};
  // Instanced pieces.
  const acs: THREE.Matrix4[] = [], tanks: THREE.Matrix4[] = [], pipes: THREE.Matrix4[] = [], lanterns: THREE.Matrix4[] = [], bollards: THREE.Matrix4[] = [];
  const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
  const FRAME = 0x24262b, STEEL = 0x3b3f47, AWNING = [0x1f6f6a, 0x7a2335, 0x2a2d33, 0xe8e0cc, 0x5c2a6b, 0x2f4a3a];
  const GF = GROUND_FLOOR;
  let bays = 0, screens = 0, wi = 0, ni = 0, bi = 0, fi = 0;
  const pool = (x: number, z: number, r: number, col: number, y = 0.7) => pools.push(tint(flat(r * 2, r * 2, x, y, z), col));

  // ------------------------------------------------------------ buildings
  const isFront = (b: ShibuyaBuilding, s: ShibuyaSide) => b.fronts.includes(s);
  /** Faces that are hidden by a neighbour (two buildings back to back) are skipped. */
  const others = SHIBUYA_BUILT.buildings;
  const hidden = (b: ShibuyaBuilding, f: Face) => {
    const [mx, mz] = along(f, f.len / 2, 6);
    return others.some((o) => o !== b && mx > o.x0 && mx < o.x1 && mz > o.z0 && mz < o.z1);
  };
  const facade = (b: ShibuyaBuilding & { h: number }, f: Face, y0: number, y1: number, tintC: THREE.Color, uOff: number) => {
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
  for (const b of SHIBUYA_BUILT.buildings) {
    const br = prng(b.id.charCodeAt(0) * 131 + b.x0);
    const tintC = new THREE.Color(SKIN[b.skin].tint).multiplyScalar(0.92 + br() * 0.12);
    const uOff = Math.floor(br() * 4) * 0.5;
    const top = b.h;
    for (const side of SIDES) {
      const f = faceOf(b, side);
      if (hidden(b, f)) continue;
      const front = isFront(b, side);
      const ang = Math.atan2(f.nx, f.nz);
      // Middle storeys (and the whole wall on the blind sides).
      facade(b, f, front ? GF : 0, top, tintC, uOff);
      if (front) {
        // Street level: bays of ≈ 6 m — show window, name band, sometimes an awning; pillars between.
        const n = Math.max(1, Math.round((f.len - 16) / 150)), bw = (f.len - 16) / n;
        for (let k = 0; k < n; k++) {
          const s = 8 + bw * (k + 0.5);
          const [wx, wz] = along(f, s, 1.6);
          lit.push(quad(bw - 12, GF - 26, CELLS.window(wi++ % 8), wx, (GF - 26) / 2 + 2, wz, f.nx, f.nz));
          const [bx2, bz2] = along(f, s, 1.2);
          solid.push(tint(boxAt(bw - 4, 24, 3, bx2, GF - 12, bz2, ang), FRAME));
          const [lx, lz] = along(f, s, 2.9);
          lit.push(quad(bw - 10, 19, CELLS.name(ni++ % 8), lx, GF - 12, lz, f.nx, f.nz));
          if (br() < 0.55 && b.floors > 1) {
            const [ax, az] = along(f, s, 13);
            solid.push(tint(new THREE.BoxGeometry(bw - 12, 1.6, 26).rotateX(0.38).rotateY(ang).translate(ax, GF - 30, az), AWNING[Math.floor(br() * AWNING.length)]));
          }
          // Light spilling from the door onto the pavement.
          const [px, pz] = along(f, s, 40);
          pool(px, pz, 46, L[Math.floor(br() * 5)], CURB + 0.6);
          bays++;
        }
        for (let k = 0; k <= n; k++) {
          const [px, pz] = along(f, 8 + bw * k, 2);
          solid.push(tint(boxAt(7, GF, 5, px, GF / 2, pz, ang), FRAME));
        }
        // A thin cornice over the shops: the street storey reads as its own layer.
        const [cx, cz] = along(f, f.len / 2, 4);
        solid.push(tint(boxAt(f.len + 6, 7, 9, cx, GF + 3, cz, ang), 0x2f3036));
        // Floor-directory light bands up the front (雑居ビル): one tenant sign per storey.
        if (b.floors >= 3 && f.len >= 110 && br() < 0.8) {
          const s = f.len > 200 ? f.len * 0.3 : f.len / 2;
          for (let k = 2; k <= Math.min(b.floors, 6); k++) {
            const [qx, qz] = along(f, s, 1.4);
            lit.push(quad(Math.min(96, f.len - 30), 12, CELLS.floor(fi++ % FLOORS.length), qx, GF + (k - 2) * STOREY + STOREY - 14, qz, f.nx, f.nz));
          }
        }
        // Projecting blade signs, readable from both directions along the street.
        if (b.floors >= 3 && side !== b.screen) {
          const tx = (f.bx - f.ax) / f.len, tz = (f.bz - f.az) / f.len;
          for (const s of f.len > 170 ? [26, f.len - 26] : [f.len - 22]) {
            const t2 = Math.min(top - 26, GF + 3 * STOREY), b0 = GF + 18, hh = t2 - b0;
            if (hh < 80) continue;
            const [sx, sz] = along(f, s, 30);
            const cell = CELLS.blade(bi++ % 8);
            lit.push(quad(38, hh, cell, sx + tx * 0.6, b0 + hh / 2, sz + tz * 0.6, tx, tz));
            lit.push(quad(38, hh, cell, sx - tx * 0.6, b0 + hh / 2, sz - tz * 0.6, -tx, -tz));
            const [mx, mz] = along(f, s, 6);
            solid.push(tint(boxAt(3, 3, 12, mx, t2 - 6, mz, ang), FRAME), tint(boxAt(3, 3, 12, mx, b0 + 6, mz, ang), FRAME));
          }
        }
      } else {
        // Blind / service side: a steel door and a shutter at street level.
        const [dx, dz] = along(f, Math.min(40, f.len / 2), 1.2);
        solid.push(tint(boxAt(30, 70, 2, dx, 35, dz, ang), 0x55585e));
        if (f.len > 140) {
          const [gx, gz] = along(f, f.len - 60, 1.2);
          lit.push(quad(80, 70, CELLS.garage(2), gx, 39, gz, f.nx, f.nz));
        }
      }
      // Service side: fire escape, pipes and air-con units.
      if (side === b.service && b.floors >= 2) {
        const s0 = Math.min(f.len - 50, Math.max(50, f.len * 0.65));
        for (let k = 2; k <= b.floors; k++) {
          const y = GF + (k - 2) * STOREY;
          const [px, pz] = along(f, s0, 14);
          solid.push(tint(boxAt(72, 3, 26, px, y, pz, ang), STEEL));
          const [rx, rz] = along(f, s0, 27);
          solid.push(tint(boxAt(72, 22, 1.5, rx, y + 12, rz, ang), STEEL));
          if (k < b.floors) {
            const g = new THREE.BoxGeometry(70, 3, 18).rotateZ(Math.atan2(STOREY, 70) * (k % 2 ? 1 : -1)).rotateY(ang);
            const [qx, qz] = along(f, s0, 14);
            solid.push(tint(g.translate(qx, y + STOREY / 2, qz), STEEL));
          }
        }
        for (const s of [18, 30]) {
          const [px, pz] = along(f, s, 6);
          pipes.push(M4(px, top / 2, pz, 0, 1, top, 1));
        }
        for (let k = 1; k <= Math.min(b.floors, 5); k++) {
          const [ax, az] = along(f, 70 + ((k * 37) % Math.max(1, f.len - 140)), 16);
          acs.push(M4(ax, GF + (k - 1) * STOREY - 30, az, ang, 0.7, 0.7, 0.7));
        }
      }
      // Big screen, low enough to read from the street under the chase camera.
      if (side === b.screen) {
        const vertical = f.len < 150;
        const w = vertical ? f.len - 24 : Math.min(260, f.len - 50), h = vertical ? Math.min(top - GF - 80, 300) : w * 0.5625;
        const y = GF + 30 + h / 2;
        const [sx, sz] = along(f, f.len / 2, 4);
        lit.push(quad(w, h, vertical ? CELLS.vscreen(b.id.charCodeAt(0) & 1) : CELLS.screen(b.id.charCodeAt(0) & 1), sx, y, sz, f.nx, f.nz));
        const [kx, kz] = along(f, f.len / 2, 1);
        solid.push(tint(boxAt(f.nx ? 6 : w + 10, h + 10, f.nx ? w + 10 : 6, kx, y, kz), 0x121318));
        const [tx2, tz2] = along(f, f.len / 2, 4);
        if (!vertical) lit.push(quad(w, 24, CELLS.ticker, tx2, y - h / 2 - 20, tz2, f.nx, f.nz));
        const [gx, gz] = along(f, f.len / 2, 90);
        pool(gx, gz, 120, L[(b.id.charCodeAt(0) + 1) % 3], CURB + 0.5);
        screens++;
      }
    }
    // Roof: parapet and slab, then plant / billboard / crown.
    const R = 7, x0 = b.x0, x1 = b.x1, z0 = b.z0, z1 = b.z1, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const roofC = 0x7d7a76;
    ground.push(tint(flat(w, d, cx, top - 14, cz), 0x5f5d5a));
    for (const [px, pz, pw, pd] of [[cx, z0 + R / 2, w, R], [cx, z1 - R / 2, w, R], [x0 + R / 2, cz, R, d], [x1 - R / 2, cz, R, d]]) solid.push(tint(boxAt(pw, 18, pd, px, top - 5, pz), roofC));
    if (b.roof === 'plant' || b.roof === 'billboard') {
      for (let k = 0; k < Math.max(1, Math.floor((w * d) / 16000)); k++) acs.push(M4(x0 + 30 + br() * (w - 60), top - 14 + 15, z0 + 30 + br() * (d - 60), br() * 3));
      if (w > 120 && d > 120) tanks.push(M4(x0 + 40 + br() * (w - 80), top + 36, z0 + 40 + br() * (d - 80)));
    }
    if (b.roof === 'billboard') {
      const f = faceOf(b, b.fronts[0]), bw = Math.min(f.len * 0.85, 220), bh = 80;
      const [sx, sz] = along(f, f.len / 2, -16);
      lit.push(quad(bw, bh, CELLS.screen((b.id.charCodeAt(0) + 1) & 1), sx + f.nx * 3, top + 30 + bh / 2, sz + f.nz * 3, f.nx, f.nz));
      for (const s of [f.len / 2 - bw / 2 + 10, f.len / 2 + bw / 2 - 10]) {
        const [px, pz] = along(f, s, -18);
        solid.push(tint(boxAt(5, 30 + bh, 5, px, top + (30 + bh) / 2 - 10, pz), STEEL));
      }
    }
    if (b.roof === 'crown') {
      // A lit band round the top and a mast: the tall ones read from across the district.
      const col = new THREE.Color(b.id === 'HALO' ? 0xff3fa4 : 0x5dffc8);
      for (const side of SIDES) {
        const f = faceOf(b, side), [mx, mz] = along(f, f.len / 2, 1.5);
        glow.push(tint(quad(f.len, 10, CELLS.swatch(0), mx, top - 30, mz, f.nx, f.nz), col));
        if (b.id === 'HALO') for (const s of [3, f.len - 3]) {
          const [qx, qz] = along(f, s, 1.5);
          glow.push(tint(quad(4, top - GF - 40, CELLS.swatch(0), qx, (top + GF) / 2, qz, f.nx, f.nz), 0xb46bff));
        }
      }
      solid.push(tint(boxAt(6, 160, 6, cx, top + 80, cz), STEEL));
      glow.push(tint(boxAt(10, 10, 10, cx, top + 164, cz), 0xff2a1e));
    }
  }

  // ------------------------------------------------------------ SKY RING: decks, fascia, railings, legs, stairs
  const skyway = WORLD.filter((p) => p.group === 'skyway');
  for (const k of SKY_DECKS) {
    const w = k.x1 - k.x0, d = k.z1 - k.z0, cx = (k.x0 + k.x1) / 2, cz = (k.z0 + k.z1) / 2;
    solid.push(tint(boxAt(w, 12, d, cx, SKY_H - 6, cz), 0x8d8a86));
    ground.push(tint(flat(w - 4, d - 4, cx, SKY_H + 0.4, cz), 0x6e6c6a));
    // Paving joints across the deck (every ≈ 2 m).
    const alongX = w > d;
    for (let t = 40; t < (alongX ? w : d) - 10; t += 52) {
      ground.push(alongX ? tint(flat(2, d - 6, k.x0 + t, SKY_H + 0.6, cz), 0x55534f) : tint(flat(w - 6, 2, cx, SKY_H + 0.6, k.z0 + t), 0x55534f));
    }
    // Light lines under the deck edges (the ring reads at night from the street).
    for (const [ex, ez, ew, ed] of [[cx, k.z0 + 1, w, 2], [cx, k.z1 - 1, w, 2], [k.x0 + 1, cz, 2, d], [k.x1 - 1, cz, 2, d]]) glow.push(tint(boxAt(ew, 2, ed, ex, SKY_H - 13, ez), 0x5dffc8));
    // Light pools on the street under the decks (where the ring crosses the road).
    for (let t = 60; t < (alongX ? w : d); t += 140) pool(alongX ? k.x0 + t : cx, alongX ? cz : k.z0 + t, 70, 0xb46bff, 0.8);
  }
  // Fascia bands over the avenue: SKY RING, lit, on both ring decks' outer faces.
  for (const [x, z, nz] of [[-2700, 1680, -1], [-2700, 1760, 1], [-2700, 2040, -1], [-2700, 2120, 1]] as const) {
    lit.push(quad(360, 22, CELLS.ring, x, SKY_H - 11, z + nz * 0.8, 0, nz));
  }
  for (const p of skyway) {
    if (p.kind === 'ramp') continue;
    const b = p as BoxPrim;
    if (b.y0 >= SKY_H) {
      // Railing: a glass-like dark panel, a steel top rail and a mint light on it.
      solid.push(tint(boxAt(b.w, b.y1 - b.y0 - 4, b.d, b.x, (b.y0 + b.y1) / 2 - 2, b.z), 0x2a3038));
      solid.push(tint(boxAt(b.w + 1, 4, b.d + 1, b.x, b.y1 - 2, b.z), 0xb8bcc2));
      glow.push(tint(boxAt(b.w > b.d ? b.w : 1.5, 1.2, b.d > b.w ? b.d : 1.5, b.x, b.y1 - 6, b.z), 0x5dffc8));
    } else if (b.y1 <= SKY_H - 12 + 0.1) {
      solid.push(tint(new THREE.CylinderGeometry(10, 12, b.y1, 10).translate(b.x, b.y1 / 2, b.z), 0x5a5e66));
      glow.push(tint(new THREE.CylinderGeometry(10.5, 10.5, 3, 10).translate(b.x, 30, b.z), 0xb46bff));
    }
  }
  for (const p of skyway) {
    if (p.kind !== 'ramp') continue;
    const r = p as RampPrim;
    const len = r.axis === 'x' ? r.w : r.d, wid = r.axis === 'x' ? r.d : r.w;
    const n = Math.max(3, Math.round((r.hHigh - r.hLow) / 4.5));
    for (let i = 0; i < n; i++) {
      const t1 = (i + 1) / n, h = r.hLow + (r.hHigh - r.hLow) * t1, sl = len / n, u = (i + 0.5) / n;
      const off = (r.dir === 1 ? u - 0.5 : 0.5 - u) * len;
      const x = r.axis === 'x' ? r.x + off : r.x, z = r.axis === 'z' ? r.z + off : r.z;
      solid.push(tint(boxAt(r.axis === 'x' ? sl : r.w, 6, r.axis === 'z' ? sl : r.d, x, h - 3, z), i % 2 ? 0x9b978f : 0x938f88));
      // Step nosing: a light line at the front edge of every tread (the stair reads in the dark).
      const nose = (r.dir === 1 ? -0.5 : 0.5) * sl;
      glow.push(tint(boxAt(r.axis === 'x' ? 1.4 : wid - 6, 1, r.axis === 'z' ? 1.4 : wid - 6, r.axis === 'x' ? x + nose : x, h + 0.3, r.axis === 'z' ? z + nose : z), 0xd8fff0));
    }
    // Side walls (stringers) hiding the stepped underside, with a handrail light.
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
    // A mint pool and a SKY RING sign at the foot.
    const footX = r.axis === 'x' ? r.x - r.dir * (len / 2 + 30) : r.x, footZ = r.axis === 'z' ? r.z - r.dir * (len / 2 + 30) : r.z;
    pool(footX, footZ, 70, 0x5dffc8, CURB + 0.6);
  }
  // Wayfinding: SKY RING at the stair feet, BACK ALLEY at the gate, STATION SQ. by the ring.
  const signPost = (x: number, z: number, nx: number, nz: number, cell: Cell) => {
    solid.push(tint(boxAt(4, 190, 4, x, 95, z), 0x5a5e66));
    solid.push(tint(boxAt(nx ? 3 : 104, 38, nx ? 104 : 3, x - nx * 3, 172, z - nz * 3), 0x2a2c31));
    lit.push(quad(100, 31, cell, x + nx * 0.5, 172, z + nz * 0.5, nx, nz));
  };
  signPost(-3110, 2060, 0, 1, CELLS.way(0));
  signPost(-2400, 2690, 0, 1, CELLS.way(0));
  signPost(-2140, 1388, 0, -1, CELLS.way(0));
  signPost(-2520, 2160, -1, 0, CELLS.way(1));
  signPost(-2880, 2190, 1, 0, CELLS.way(3));
  signPost(-2880, 1640, 1, 0, CELLS.way(2));

  // ------------------------------------------------------------ NEON MAZE gate (under the skywalk, at the lane mouth)
  {
    const G = MAZE_GATE, zc = (G.z0 + G.z1) / 2, span = G.z1 - G.z0, [s0, s1] = G.sign;
    for (const z of [G.z0, G.z1]) {
      solid.push(tint(boxAt(18, G.top, 18, G.x, G.top / 2, z), 0x1d1e24));
      for (const dz of [-6, 6]) glow.push(tint(boxAt(2, G.top - 16, 2, G.x - 9.6, G.top / 2, z + dz), 0xff3fa4));
      glow.push(tint(boxAt(2, G.top - 16, 2, G.x + 9.6, G.top / 2, z), 0xb46bff));
    }
    solid.push(tint(boxAt(10, s1 - s0 + 8, span - 18, G.x, (s0 + s1) / 2, zc), 0x111117));
    for (const nx of [-1, 1]) lit.push(quad(span - 24, s1 - s0, CELLS.gate, G.x + nx * 5.6, (s0 + s1) / 2, zc, nx, 0));
    glow.push(tint(boxAt(12, 2.5, span - 14, G.x, s0 - 3, zc), 0x5dffc8));
    // Lanterns hung under the skywalk, inside the mouth.
    for (let k = 0; k < 5; k++) lanterns.push(M4(G.x + 50, 112, G.z0 + 14 + k * (span - 28) / 4));
    pool(G.x + 70, zc, 110, 0xff3fa4, CURB + 0.6);
  }

  // ------------------------------------------------------------ HALO VISION (a round screen standing at the square's south end)
  {
    const H = HALO_SCREEN;
    const disc = new THREE.CircleGeometry(H.r - 12, 48);
    const [cx0, cy0, cw] = CELLS.halo;
    const uv = disc.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx0 + uv.getX(i) * cw) / ATLAS_W, 1 - (cy0 + (1 - uv.getY(i)) * cw) / ATLAS_H);
    lit.push(disc.rotateY(Math.PI).translate(H.x, H.y, H.z - 5));
    solid.push(tint(new THREE.CylinderGeometry(H.r + 6, H.r + 6, 10, 48).rotateX(Math.PI / 2).translate(H.x, H.y, H.z), 0x101016));
    glow.push(tint(new THREE.TorusGeometry(H.r, 6, 8, 64).translate(H.x, H.y, H.z - 6), 0xff3fa4));
    glow.push(tint(new THREE.TorusGeometry(H.r + 20, 2.5, 6, 64).translate(H.x, H.y, H.z - 6), 0x5dffc8));
    for (const dx of [-105, 105]) {
      solid.push(tint(boxAt(16, H.y, 16, H.x + dx, H.y / 2, H.z + 4), STEEL));
      glow.push(tint(boxAt(17, 3, 17, H.x + dx, 24, H.z + 4), 0xb46bff));
    }
    pool(H.x, H.z - 140, 190, 0xff3fa4, 0.6);
  }

  // ------------------------------------------------------------ 地下入口 (subway entrance)
  {
    const S = SUBWAY, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2, w = S.x1 - S.x0, d = S.z1 - S.z0;
    solid.push(tint(boxAt(w, S.h - 10, d, cx, (S.h - 10) / 2, cz), 0xc9c6bf));
    solid.push(tint(boxAt(w + 16, 10, d + 16, cx, S.h - 5, cz), 0x2c2e34));
    glow.push(tint(boxAt(w + 18, 2, d + 18, cx, S.h - 11, cz), 0x5dffc8));
    // The open east side: a dark stairwell going down.
    lit.push(quad(w - 14, S.h - 24, CELLS.garage(2), S.x1 + 0.8, (S.h - 24) / 2 + 2, cz, 1, 0));
    for (const nz of [-1, 1]) lit.push(quad(64, 24, CELLS.metro, cx, S.h + 16, cz + nz * (d / 2 - 4), 0, nz));
    solid.push(tint(boxAt(70, 26, 4, cx, S.h + 16, cz), 0x1d1e24));
    pool(S.x1 + 50, cz, 70, 0xf4f0ff, 0.6);
  }

  // ------------------------------------------------------------ ground: scramble, square, lanes
  {
    const X = SHIBUYA_CROSSING, iw = 380, id = 240;
    for (const sg of [1, -1]) {
      const ax = X.x - iw / 2 + 40, bx = X.x + iw / 2 - 40, az = X.z - sg * (id / 2 - 36), bz = X.z + sg * (id / 2 - 36);
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, ang = Math.atan2(dx, dz);
      for (let t = 14; t < len - 10; t += 28) ground.push(tint(flat(76, 14, ax + dx * t, 0.95, az + dz * t, ang), 0xe9e8e2));
    }
    pool(X.x, X.z, 230, 0xb46bff, 1.0);
  }
  // Station square: granite slabs in two tones inside the walkable edge, a ring of light studs round the point.
  const GRANITE = [0x8f8b84, 0x9d9890, 0x85827c];
  for (let x = -3290; x < -2890; x += 50) {
    for (let z = 1790; z < 2440; z += 50) {
      if (!insideLoop(x + 25, z + 25, 150)) continue;
      ground.push(tint(flat(49, 49, x + 25, 0.35, z + 25), GRANITE[(Math.floor(x / 50) + Math.floor(z / 50) * 2 + 9) % 3]));
    }
  }
  for (let z = 2040; z < 2440; z += 60) bollards.push(M4(-2898, 14, z));
  for (let z = 2460; z < 2690; z += 60) bollards.push(M4(-2898, 14, z));
  // Benches round the square.
  for (const [x, z, ang] of [[-3240, 2320, Math.PI / 2], [-3240, 2140, Math.PI / 2], [-2960, 2400, 0]] as const) {
    solid.push(tint(boxAt(90, 4, 22, x, 22, z, ang), 0x6a4a32), tint(boxAt(80, 20, 14, x, 10, z, ang), 0x55585e));
  }
  // Lanes of the maze: darker worn paving with a drain line down the middle, manholes, lanterns overhead.
  {
    const { x0, z0, cell } = MAZE;
    MAZE_MAP.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== '.') return;
      ground.push(tint(flat(cell, cell, x0 + (c + 0.5) * cell, CURB + 0.3, z0 + (r + 0.5) * cell), (r + c) % 2 ? 0x4d4b49 : 0x55524f));
    }));
    // Strings of lanterns across the lanes (N–S lane, the pocket, the east lane).
    const strings: [number, number, number, number][] = [
      [x0 + 3 * cell, z0 + 1.5 * cell, x0 + 6 * cell, z0 + 1.5 * cell],
      [x0 + 0 * cell, z0 + 4 * cell, x0 + 6 * cell, z0 + 4 * cell],
      [x0 + 5 * cell, z0 + 8 * cell, x0 + 12 * cell, z0 + 8 * cell],
      [x0 + 6 * cell, z0 + 13 * cell, x0 + 9 * cell, z0 + 13 * cell],
    ];
    const wire: number[] = [];
    for (const [ax, az, bx, bz] of strings) {
      const n = Math.max(3, Math.round(Math.hypot(bx - ax, bz - az) / 34));
      for (let k = 0; k <= n; k++) {
        const t = k / n, y = 205 - 22 * 4 * t * (1 - t);
        if (k > 0 && k < n) lanterns.push(M4(ax + (bx - ax) * t, y - 9, az + (bz - az) * t));
        if (k < n) {
          const t2 = (k + 1) / n;
          wire.push(ax + (bx - ax) * t, y, az + (bz - az) * t, ax + (bx - ax) * t2, 205 - 22 * 4 * t2 * (1 - t2), az + (bz - az) * t2);
        }
      }
      pool((ax + bx) / 2, (az + bz) / 2, 80, 0xff4a7a, CURB + 0.5);
    }
    if (wire.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
      scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x18181c })));
    }
    // Air-con units and pipes at lane level.
    for (const [x, z, ang] of [[-2312, 2440, -Math.PI / 2], [-2312, 2380, -Math.PI / 2], [-2160, 2296, 0], [-2085, 2296, 0], [-2072, 2520, Math.PI / 2], [-2236, 2600, -Math.PI / 2]] as const) {
      acs.push(M4(x, CURB + 15, z, ang));
    }
  }
  // North-east lane: paving and a lantern string.
  for (let z = 1290; z < 1700; z += 50) ground.push(tint(flat(150, 49, -2165, CURB + 0.3, z + 25), z % 100 ? 0x4d4b49 : 0x55524f));
  for (let k = 0; k < 6; k++) lanterns.push(M4(-2120, 196, 1300 + k * 70));
  pool(-2120, 1480, 120, 0xb46bff, CURB + 0.5);

  // Holo ads: small floating panels (additive) over the lanes and the square.
  const holoAd = (x: number, y: number, z: number, nx: number, nz: number, cell: Cell, w: number, h: number) => {
    holo.push(quad(w, h, cell, x, y, z, nx, nz), quad(w, h, cell, x, y, z, -nx, -nz));
  };
  holoAd(-2250, 240, 2262, 1, 0, CELLS.blade(1), 30, 120);
  holoAd(-2130, 250, 2414, 0, 1, CELLS.name(3), 120, 24);
  holoAd(-2135, 230, 2600, 1, 0, CELLS.blade(3), 30, 110);
  holoAd(-3010, 300, 2230, 1, 0, CELLS.vscreen(1), 60, 150);
  holoAd(-2165, 250, 1480, 0, 1, CELLS.name(5), 110, 22);

  // Wall lamps (the gameplay lamps on façades): a bracket and a head.
  let lamps = 0;
  for (const l of LIGHTS) {
    if (!l.wall) continue;
    const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
    solid.push(tint(boxAt(Math.abs(dx) * 22 + 3, 3, Math.abs(dz) * 22 + 3, l.x + dx * 11, 190, l.z + dz * 11), STEEL));
    glow.push(tint(boxAt(14, 8, 14, l.x + dx * 22, 184, l.z + dz * 22), 0xfff0d0));
    lamps++;
  }

  // Railway arches near the station: lit shops and bicycle parking under the tracks (the old "dark wall").
  const arches: THREE.BufferGeometry[] = [];
  {
    const si = STATIONS.findIndex((s) => s.name === '渋谷');
    for (const i of [si - 1, si]) {
      const a = LOOP[(i + LOOP.length) % LOOP.length], b = LOOP[(i + 1) % LOOP.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z), ang = Math.atan2(b.x - a.x, b.z - a.z), L2 = len + VIADUCT.w * 0.6;
      const F = new THREE.Matrix4().compose(new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(1, 1, 1));
      const nx = Math.cos(ang), nz = -Math.sin(ang), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
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
  const litMat = nearFade(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8, roughness: 1 }), 30, 120);
  const archMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 1 });
  const solidMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }), 30, 120);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glowTex = radialGlowTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const holoMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  NIGHT_GLOW.push({
    set: (k) => {
      litMat.emissiveIntensity = 0.8 + 0.25 * k;
      archMat.emissiveIntensity = 0.85 + 0.15 * k;
      glowMat.color.setScalar(0.75 + 0.25 * k);
      // Pools of shop and sign light: faint by day, carrying the street at night (never a wash).
      poolMat.opacity = 0.12 + 0.5 * k;
      holoMat.opacity = 0.35 + 0.35 * k;
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
    m.name = 'shibuya';
    scene.add(m);
    meshes++;
  };
  // Façades: one mesh per façade texture (shared with the generic city: no new texture memory).
  for (const [k, list] of Object.entries(skins)) {
    const kind = k as FacadeKind;
    const m = new THREE.MeshStandardMaterial({ map: sharedFacadeTexture(kind), vertexColors: true, roughness: kind === 'glass' ? 0.35 : 0.85, metalness: kind === 'glass' ? 0.25 : 0, emissive: 0xffffff, emissiveMap: sharedFacadeTexture(kind, true), emissiveIntensity: 0.45 });
    glowAtNight(m, 0.45, 0.8);
    add(list, m, true);
  }
  add(lit, litMat, false);
  add(solid, solidMat, true);
  add(glow, glowMat, false, false);
  add(ground, groundMat, false);
  add(arches, archMat, false);
  add(pools, poolMat, false, false, 1);
  add(holo, holoMat, false, false, 2);
  // Instanced small pieces.
  let instanced = 0;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cast = true) => {
    if (!ms.length) return;
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = cast;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.name = 'shibuya';
    scene.add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * ms.length;
    instanced++;
  };
  inst(new THREE.BoxGeometry(36, 30, 26), new THREE.MeshStandardMaterial({ color: 0xcfcdc6, roughness: 0.8 }), acs);
  inst(new THREE.CylinderGeometry(28, 28, 46, 12), new THREE.MeshStandardMaterial({ color: 0x9fb2bd, roughness: 0.6 }), tanks);
  inst(new THREE.CylinderGeometry(2.4, 2.4, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.6, metalness: 0.3 }), pipes, false);
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xff7a9c });
  NIGHT_GLOW.push({ set: (k) => { lanternMat.color.setHex(0xff7a9c).multiplyScalar(0.7 + 0.3 * k); } });
  inst(new THREE.CylinderGeometry(6, 6, 16, 8), lanternMat, lanterns, false);
  inst(new THREE.CylinderGeometry(4, 5, 28, 8), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.4 }), bollards, false);
  return { buildings: SHIBUYA_BUILT.buildings.length, bays, screens, meshes, instanced, triangles: Math.round(tris), lamps };
}
