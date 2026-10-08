import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxPrim, RampPrim } from '../config/map';
import { AKIBA_BUILT, ARCADE, CURB, GROUND_FLOOR, LOOP, STATIONS, STOREY, VIADUCT, WORLD, insideLoop, prng } from '../config/map';
import type { AkibaBuilding, AkibaSide } from '../config/akihabara';
import {
  AKIBA_ZONES, ARCADE_SOUTH_DOOR, DATA_JUNCTION, GATE_H, GRID_CABLES, GRID_GATE, GRID_TOWER, JUNCTION_BOARDS, LOCK_YARD, MAIN_STREET, POWER_NODE, ROUTES,
} from '../config/akihabara';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { nearFade } from './city';
import { radialGlowTexture, sharedFacadeTexture } from './textures';
import type { FacadeKind } from './textures';

/**
 * v10 MAP REFORGE phase 3 — 秋葉原 ELECTRIC GRID, as drawn.
 *
 * Where Shibuya reads through a few big screens and Shinjuku through height and glass, Akihabara
 * reads through grain: many narrow shops, each with its own name band, LED ticker, blade sign,
 * posters and price cards; cables everywhere (poles, façades, lanes, the tower); air-con units,
 * fans, cable racks and meter boxes on every back wall. The landmarks are mid-size and low:
 * GRID TOWER (a lattice mast wired to the roofs), CIRCUIT ARCADE (the arcade, lit inside with
 * circuit traces), DATA JUNCTION (the point's square with LED message boards), POWER NODE
 * (switchgear on the back lane), and the GRID GATE footbridge over the street.
 *
 * Colours: white, black, an electric blue pushed towards violet (clear of LUNA's blue), green,
 * and a little red. Light pools on the ground stay white or green, so the faction colours of
 * the people in a lane always stand out. Small repeated pieces are instanced; everything else
 * is merged per material, with one texture atlas for every sign.
 */

/** Akihabara's light colours: white, electric violet-blue, green, red (never a faction hue; see tests). */
export const AKIBA_LIGHTS = [0xf2f6ff, 0x5a4bff, 0x3dff8a, 0xff2d55] as const;
const WHITE = AKIBA_LIGHTS[0], BLUE = AKIBA_LIGHTS[1], GREEN = AKIBA_LIGHTS[2], RED = AKIBA_LIGHTS[3];

const ATLAS_W = 1024, ATLAS_H = 2048;
type Cell = [number, number, number, number];
const CELLS = {
  window: (i: number): Cell => [(i % 4) * 256, Math.floor(i / 4) * 192, 256, 192],
  name: (i: number): Cell => [(i % 4) * 256, 384 + Math.floor(i / 4) * 48, 256, 48],
  blade: (i: number): Cell => [(i % 16) * 64, 528, 64, 256],
  ticker: (i: number): Cell => [(i % 2) * 512, 784 + Math.floor(i / 2) * 40, 512, 40],
  card: (i: number): Cell => [(i % 8) * 128, 864 + Math.floor(i / 8) * 128, 128, 128],
  shutter: [0, 1120, 256, 192] as Cell,
  garage: (i: number): Cell => [256 + i * 256, 1120, 256, 192],
  arcadeSign: [0, 1312, 512, 128] as Cell,
  junctionSign: [512, 1312, 512, 128] as Cell,
  gateBand: [0, 1440, 1024, 56] as Cell,
  board: (i: number): Cell => [i * 341, 1496, 341, 160],
  way: (i: number): Cell => [(i % 4) * 256, 1656 + Math.floor(i / 4) * 80, 256, 80],
  warn: (i: number): Cell => [i * 128, 1816, 128, 96],
  circuit: [512, 1816, 256, 232] as Cell,
  floor: (i: number): Cell => [768, 1816 + i * 26, 256, 26],
  swatch: [1000, 1912, 16, 16] as Cell,
};
const NAMES = ['回路堂', 'PARTS 99', 'GRIDBOX', 'ジャンク通信', '8bit堂', 'ラジオ横丁', 'LED工房', '基板屋', 'CABLE LAB', '中古PC', 'TRACE GAMES', '電脳館'];
const BLADES = ['電子部品', 'パーツ', 'ゲーム', '中古', '買取', '修理', '無線', 'ケーブル', 'LED', '基板', 'PC', 'ジャンク', '工具', '電源', '同人', '模型'];
const FLOORS = ['2F 中古PC', '3F パーツ', '4F ゲーム', '5F 無線機', '6F 工具', '7F 修理受付', 'B1 ジャンク'];
const TICKERS = ['ELECTRIC GRID ・ 秋葉原 ・ 電子部品 ・ 基板 ・ LED ・ 本日特価 ・', '買取強化中 ・ 中古PC ・ 修理受付 ・ ジャンク 100円〜 ・', 'GRID TOWER ↑ ・ CIRCUIT ARCADE ・ DATA JUNCTION ・', 'NEW ARRIVAL ・ RETRO GAMES ・ 8bit ・ パーツ ・'];
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** The Akihabara atlas: shop windows, names, blades, tickers, price cards, landmark art, wayfinding. */
function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d')!;
  const rnd = prng(3141);
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = '800') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  const lines = (x: number, y: number, w: number, h: number, n: number, color: string) => {
    for (let k = 0; k < n; k++) { g.fillStyle = color; g.fillRect(x, y + (k * h) / n, w * (0.5 + rnd() * 0.5), Math.max(1, h / n / 3)); }
  };
  // Shop windows: electronics interiors behind glass (drawers, monitors, game boxes, cable coils, lights, radios…).
  const interiors: ((x: number, y: number) => void)[] = [
    (x, y) => { // parts drawers with labels
      for (let r = 0; r < 6; r++) for (let k = 0; k < 10; k++) {
        g.fillStyle = '#e8ebef'; g.fillRect(x + 12 + k * 23, y + 30 + r * 25, 20, 21);
        g.fillStyle = ['#3dff8a', '#5a4bff', '#ff2d55', '#1b1d22'][Math.floor(rnd() * 4)]; g.fillRect(x + 14 + k * 23, y + 33 + r * 25, 16, 4);
      }
    },
    (x, y) => { // monitors on shelves
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
        g.fillStyle = '#16181d'; g.fillRect(x + 14 + k * 58, y + 24 + r * 52, 52, 40);
        g.fillStyle = `hsl(${[140, 245, 200, 0][(r + k) % 4]},70%,${50 + rnd() * 20}%)`; g.fillRect(x + 18 + k * 58, y + 28 + r * 52, 44, 30);
      }
    },
    (x, y) => { // game boxes
      for (let r = 0; r < 4; r++) for (let k = 0; k < 16; k++) { g.fillStyle = `hsl(${rnd() * 360},${50 + rnd() * 40}%,${40 + rnd() * 30}%)`; g.fillRect(x + 10 + k * 14.6, y + 26 + r * 38, 12, 32); }
    },
    (x, y) => { // junk: cable coils and crates
      g.fillStyle = '#6d6f73'; g.fillRect(x + 12, y + 120, 232, 60);
      for (let k = 0; k < 7; k++) { g.strokeStyle = ['#1b1d22', '#e8ebef', '#3dff8a', '#ff2d55'][k % 4]; g.lineWidth = 5; g.beginPath(); g.arc(x + 30 + k * 32, y + 90, 14, 0, Math.PI * 2); g.stroke(); }
      for (let k = 0; k < 5; k++) { g.fillStyle = '#a99a7c'; g.fillRect(x + 16 + k * 46, y + 132, 40, 44); }
    },
    (x, y) => { // LED and lighting: a wall of small lights
      g.fillStyle = '#0d0e12'; g.fillRect(x + 6, y + 6, 244, 180);
      for (let r = 0; r < 8; r++) for (let k = 0; k < 14; k++) { g.fillStyle = css([WHITE, BLUE, GREEN, RED][Math.floor(rnd() * 4)], 0.5 + rnd() * 0.5); g.beginPath(); g.arc(x + 20 + k * 16.5, y + 22 + r * 20, 4, 0, Math.PI * 2); g.fill(); }
    },
    (x, y) => { // radio parts: knobs and meters
      for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) {
        g.fillStyle = '#2a2c31'; g.fillRect(x + 14 + k * 46, y + 28 + r * 50, 40, 42);
        g.fillStyle = '#d6d9dd'; g.beginPath(); g.arc(x + 34 + k * 46, y + 49 + r * 50, 11, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ff2d55'; g.fillRect(x + 33 + k * 46, y + 38 + r * 50, 2, 10);
      }
    },
    (x, y) => { // repair counter with phones
      g.fillStyle = '#f2f4f7'; g.fillRect(x + 12, y + 128, 232, 52);
      for (let k = 0; k < 9; k++) { g.fillStyle = '#16181d'; g.fillRect(x + 20 + k * 25, y + 60, 18, 34); g.fillStyle = css(k % 2 ? GREEN : BLUE, 0.8); g.fillRect(x + 22 + k * 25, y + 63, 14, 26); }
      text('修理 REPAIR', x + 128, y + 154, 24, '#16181d');
    },
    (x, y) => { // figures and models on glass shelves (invented silhouettes)
      for (let r = 0; r < 3; r++) {
        g.fillStyle = '#cfd6dd'; g.fillRect(x + 12, y + 72 + r * 50, 232, 3);
        for (let k = 0; k < 7; k++) { g.fillStyle = `hsl(${rnd() * 360},45%,${45 + rnd() * 30}%)`; g.fillRect(x + 22 + k * 32, y + 40 + r * 50, 14, 32); g.beginPath(); g.arc(x + 29 + k * 32, y + 36 + r * 50, 7, 0, Math.PI * 2); g.fill(); }
      }
    },
  ];
  for (let i = 0; i < 8; i++) {
    const [x, y, w, h] = CELLS.window(i);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#d8dde4');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    interiors[i](x, y);
    // Posters and price cards stuck on the glass (the "small information" that fills Akihabara).
    for (let k = 0; k < 4; k++) {
      const px = x + 12 + rnd() * (w - 60), py = y + 10 + rnd() * 50;
      g.fillStyle = k % 2 ? '#ffffff' : '#ffef3a00'; g.fillRect(px, py, 40, 30);
      g.fillStyle = k % 3 ? '#ff2d55' : '#16181d'; g.fillRect(px + 3, py + 3, 34, 8);
      lines(px + 4, py + 14, 32, 14, 3, '#16181d');
    }
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.moveTo(x + 40, y + h); g.lineTo(x + 120, y); g.lineTo(x + 150, y); g.lineTo(x + 70, y + h); g.fill();
    g.fillStyle = '#1b1d22';
    g.fillRect(x, y, w, 6); g.fillRect(x, y + h - 8, w, 8); g.fillRect(x, y, 5, h); g.fillRect(x + w - 5, y, 5, h); g.fillRect(x + w / 2 - 2, y, 4, h);
  }
  // Name bands: white with a coloured edge, or black with white or green letters; a small red tag.
  NAMES.forEach((n, i) => {
    const [x, y, w, h] = CELLS.name(i);
    const dark = i % 3 !== 0, col = [BLUE, GREEN, RED, WHITE][i % 4];
    g.fillStyle = dark ? '#121317' : '#f6f7f9'; g.fillRect(x, y, w, h);
    g.fillStyle = css(col === WHITE ? BLUE : col); g.fillRect(x, y + h - 5, w, 5);
    g.fillStyle = css(RED); g.fillRect(x + w - 34, y + 6, 26, 14);
    text('SALE', x + w - 21, y + 13, 10, '#ffffff', 'center', '900');
    text(n, x + w / 2 - 12, y + h / 2 - 2, 26, dark ? (i % 2 ? '#ffffff' : css(GREEN)) : '#121317', 'center', '900');
  });
  // Blade signs: narrow and tall, many of them.
  BLADES.forEach((wd, i) => {
    const [x, y, w, h] = CELLS.blade(i);
    const mode = i % 4;
    g.fillStyle = mode === 0 ? '#f6f7f9' : mode === 1 ? '#121317' : mode === 2 ? css(BLUE) : '#121317';
    g.fillRect(x, y, w, h);
    g.strokeStyle = mode === 3 ? css(GREEN) : mode === 0 ? '#121317' : 'rgba(255,255,255,.85)';
    g.lineWidth = 3;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    const n = [...wd].length, step = Math.min(50, 230 / n);
    [...wd].forEach((ch, k) => text(ch, x + w / 2, y + h / 2 + (k - (n - 1) / 2) * step, n > 4 ? 30 : 38, mode === 0 ? '#121317' : mode === 3 ? css(GREEN) : '#ffffff', 'center', '900'));
    if (i % 5 === 0) { g.fillStyle = css(RED); g.fillRect(x + 8, y + h - 26, w - 16, 16); }
  });
  // LED tickers: dot-matrix text strips.
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = CELLS.ticker(i);
    g.fillStyle = '#07080a'; g.fillRect(x, y, w, h);
    text(TICKERS[i], x + 8, y + h / 2 + 1, 24, css(i % 2 ? RED : GREEN), 'left', '800');
    g.fillStyle = 'rgba(0,0,0,.45)';
    for (let k = 0; k < w; k += 3) g.fillRect(x + k, y, 1, h);
    for (let k = 0; k < h; k += 3) g.fillRect(x, y + k, w, 1);
  }
  // Price cards and spec sheets (posters on walls, pillars and shutters).
  for (let i = 0; i < 16; i++) {
    const [x, y, w, h] = CELLS.card(i);
    const dark = i % 4 === 3;
    g.fillStyle = dark ? '#121317' : i % 4 === 1 ? '#eef2f6' : '#ffffff'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = css([RED, BLUE, GREEN, RED][i % 4]); g.fillRect(x + 4, y + 4, w - 8, 26);
    text(['特価', 'NEW', '中古', '¥980', '限定', 'ICs', '在庫', '¥100'][i % 8], x + w / 2, y + 18, 20, '#ffffff', 'center', '900');
    lines(x + 12, y + 40, w - 24, 50, 7, dark ? '#d6d9dd' : '#2a2c31');
    text(`¥${(rnd() * 9000 + 100) | 0}`, x + w / 2, y + 106, 22, dark ? css(GREEN) : '#ff2d55', 'center', '900');
  }
  // Shutter (half down on closed shops and loading bays).
  {
    const [x, y, w, h] = CELLS.shutter;
    g.fillStyle = '#9ea2a8'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.28)';
    for (let r = 0; r < h; r += 7) g.fillRect(x, y + r, w, 2);
    g.fillStyle = '#121317'; g.fillRect(x + 20, y + 20, 120, 22);
    text('搬入口', x + 80, y + 31, 16, '#ffffff', 'center', '900');
  }
  // Railway arches (ガード下): parts stalls, a junk shop, a bicycle park.
  for (let i = 0; i < 3; i++) {
    const [x, y, w, h] = CELLS.garage(i);
    g.fillStyle = '#26272b'; g.fillRect(x, y, w, h);
    const grd = g.createLinearGradient(x, y + 50, x, y + h);
    grd.addColorStop(0, i === 2 ? '#d6dade' : '#fbfcff'); grd.addColorStop(1, i === 2 ? '#7c8287' : '#a9b0b8');
    g.fillStyle = grd; g.fillRect(x + 14, y + 54, w - 28, h - 54);
    if (i < 2) {
      for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) { g.fillStyle = `hsl(${[140, 245, 0, 210][(r + k + i) % 4]},${30 + rnd() * 40}%,${30 + rnd() * 40}%)`; g.fillRect(x + 22 + k * 18, y + 70 + r * 28, 14, 20); }
      g.fillStyle = i ? css(GREEN) : '#f6f7f9'; g.fillRect(x + 24, y + 18, w - 48, 26);
      text(i ? 'ガード下 PARTS' : 'ジャンク市場', x + w / 2, y + 31, 18, '#121317', 'center', '900');
    } else {
      for (let k = 0; k < 7; k++) { g.strokeStyle = '#2a2d33'; g.lineWidth = 4; g.beginPath(); g.arc(x + 40 + k * 30, y + 150, 15, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = css(BLUE); g.fillRect(x + 40, y + 18, w - 80, 26);
      text('BIKE', x + w / 2, y + 31, 18, '#ffffff', 'center', '900');
    }
  }
  // CIRCUIT ARCADE gate sign and DATA JUNCTION sign.
  {
    const [x, y, w, h] = CELLS.arcadeSign;
    g.fillStyle = '#0b0c10'; g.fillRect(x, y, w, h);
    g.strokeStyle = css(GREEN); g.lineWidth = 4; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    for (let k = 0; k < 9; k++) { g.fillStyle = css(GREEN, 0.7); g.fillRect(x + 14, y + 16 + k * 11, 30, 2); g.fillRect(x + w - 44, y + 16 + k * 11, 30, 2); }
    text('CIRCUIT ARCADE', x + w / 2, y + 50, 50, '#ffffff', 'center', '900');
    text('回路横丁 ・ 電子部品 ・ 中古 ・ 修理', x + w / 2, y + 96, 24, css(GREEN), 'center', '800');
  }
  {
    const [x, y, w, h] = CELLS.junctionSign;
    g.fillStyle = '#f6f7f9'; g.fillRect(x, y, w, h);
    g.fillStyle = '#121317'; g.fillRect(x, y, 116, h);
    g.strokeStyle = css(BLUE); g.lineWidth = 5;
    g.beginPath(); g.moveTo(x + 20, y + 64); g.lineTo(x + 58, y + 64); g.lineTo(x + 58, y + 26); g.moveTo(x + 58, y + 64); g.lineTo(x + 96, y + 64); g.moveTo(x + 58, y + 64); g.lineTo(x + 58, y + 102); g.stroke();
    g.fillStyle = css(GREEN); g.beginPath(); g.arc(x + 58, y + 64, 9, 0, Math.PI * 2); g.fill();
    text('DATA JUNCTION', x + 316, y + 50, 46, '#121317', 'center', '900');
    text('電気街 ・ 戦略拠点', x + 316, y + 96, 26, css(BLUE), 'center', '900');
  }
  // GRID GATE fascia band (over the street, both faces).
  {
    const [x, y, w, h] = CELLS.gateBand;
    g.fillStyle = '#0b0c10'; g.fillRect(x, y, w, h);
    g.fillStyle = css(BLUE); g.fillRect(x, y, w, 4); g.fillRect(x, y + h - 4, w, 4);
    text('ELECTRIC GRID ・ 秋葉原 電気街 ・ GRID GATE ・ ELECTRIC GRID ・ 秋葉原 電気街', x + w / 2, y + h / 2 + 1, 32, '#ffffff', 'center', '900');
  }
  // LED message boards (DATA JUNCTION): dot-matrix lines of information.
  for (let i = 0; i < 3; i++) {
    const [x, y, w, h] = CELLS.board(i);
    g.fillStyle = '#05060a'; g.fillRect(x, y, w, h);
    const rows = [['DATA JUNCTION', '電気街 ↔ 路地 ↔ 裏通路', 'PARTS 99 ・ 2F →', '基板 在庫あり'], ['本日の特価', 'LED 10本 ¥300', 'SSD ・ メモリ ・ 電源', '修理受付 19:00 まで'], ['ELECTRIC GRID', 'GRID TOWER 北', 'CIRCUIT ARCADE 西', 'SERVICE CUT 東']][i];
    rows.forEach((r, k) => text(r, x + 12, y + 22 + k * 38, k === 0 ? 30 : 24, css(k === 0 ? (i === 1 ? RED : GREEN) : WHITE, 0.95), 'left', '900'));
    g.fillStyle = 'rgba(0,0,0,.5)';
    for (let k = 0; k < w; k += 3) g.fillRect(x + k, y, 1, h);
    for (let k = 0; k < h; k += 3) g.fillRect(x, y + k, w, 1);
  }
  // Wayfinding: the three ways and the landmarks.
  const way = [['路地', 'COMPONENT ALLEY', '←', GREEN], ['裏通路', 'SERVICE CUT', '↓', RED], ['電気街', 'DATA JUNCTION', '↓', BLUE], ['歩道橋', 'GRID GATE', '↑', BLUE], ['アーケード', 'CIRCUIT ARCADE', '←', GREEN], ['電波塔', 'GRID TOWER', '↑', WHITE], ['大通り', 'MAIN STREET', '→', BLUE], ['川沿い', 'RIVERSIDE', '↓', GREEN]] as const;
  way.forEach(([jp, en, arrow, col], i) => {
    const [x, y, w, h] = CELLS.way(i);
    g.fillStyle = '#f6f7f9'; g.fillRect(x, y, w, h);
    g.fillStyle = '#121317'; g.fillRect(x, y, 66, h);
    text(arrow, x + 33, y + h / 2 + 2, 50, css(col === WHITE ? GREEN : col), 'center', '900');
    text(jp, x + 78, y + 27, jp.length > 4 ? 22 : 28, '#121317', 'left', '900');
    text(en, x + 78, y + 60, en.length > 12 ? 15 : 19, '#3a3c44', 'left', '800');
  });
  // Warning plates on POWER NODE.
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = CELLS.warn(i);
    g.fillStyle = i % 2 ? '#f6f7f9' : '#121317'; g.fillRect(x, y, w, h);
    g.fillStyle = css(RED); g.fillRect(x, y, w, 26);
    text(['高圧危険', '受電設備', 'HIGH VOLT', '関係者以外'][i], x + w / 2, y + 14, 18, '#ffffff', 'center', '900');
    text(['DANGER', 'POWER NODE', '6600V', '立入禁止'][i], x + w / 2, y + 52, 18, i % 2 ? '#121317' : '#ffffff', 'center', '900');
    lines(x + 14, y + 70, w - 28, 18, 3, i % 2 ? '#2a2c31' : '#9da1a8');
  }
  // Circuit traces (arcade ceiling, the square's ground inlay).
  {
    const [x, y, w, h] = CELLS.circuit;
    g.fillStyle = '#000000'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineCap = 'round';
    for (let k = 0; k < 18; k++) {
      let px = x + 10 + rnd() * (w - 20), py = y + 10 + rnd() * (h - 20);
      g.beginPath(); g.moveTo(px, py);
      for (let s = 0; s < 4; s++) {
        if (s % 2) px = Math.min(x + w - 8, Math.max(x + 8, px + (rnd() - 0.5) * 120)); else py = Math.min(y + h - 8, Math.max(y + 8, py + (rnd() - 0.5) * 120));
        g.lineTo(px, py);
      }
      g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
    }
  }
  FLOORS.forEach((f, i) => {
    const [x, y, w, h] = CELLS.floor(i);
    g.fillStyle = i % 2 ? '#f6f7f9' : '#121317'; g.fillRect(x, y, w, h);
    g.fillStyle = css([BLUE, GREEN, RED][i % 3]); g.fillRect(x, y, 8, h);
    text(f, x + 16, y + h / 2, 16, i % 2 ? '#121317' : '#ffffff', 'left', '800');
  });
  { const [x, y, w, h] = CELLS.swatch; g.fillStyle = '#ffffff'; g.fillRect(x - 4, y - 4, w + 8, h + 8); }
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
/** nearFade for unlit materials (MeshBasicMaterial has no vViewPosition): same screen-door dither. */
function basicNearFade<T extends THREE.Material>(m: T, near: number, far: number): T {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFadeD;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFadeD = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFadeD;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        float keep = clamp((vFadeD - ${near.toFixed(1)}) / ${(far - near).toFixed(1)}, 0.0, 1.0);
        vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
        float th = (mod(cell.x * 2.0 + cell.y * 3.0, 4.0) + mod(cell.y, 2.0) * 0.5 + 0.25) / 4.5;
        if (keep < th) discard;
      }`);
  };
  m.customProgramCacheKey = () => 'akiba-basic-fade';
  return m;
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
const flat = (w: number, d: number, x: number, y: number, z: number, ang = 0) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(ang).translate(x, y, z);
/** A thin bar between two points (bracing, rails, trays). */
function bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number): THREE.BufferGeometry {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}

/** A side of a footprint as seen from outside: bottom-left → bottom-right, outward normal. */
interface Face { ax: number; az: number; bx: number; bz: number; nx: number; nz: number; len: number; side: AkibaSide }
function faceOf(b: { x0: number; z0: number; x1: number; z1: number }, side: AkibaSide): Face {
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
const SIDES: AkibaSide[] = ['n', 's', 'e', 'w'];

/** Lit windows on the upper storeys: cool and warm whites, a few green-lit rooms (no faction hue). */
const WINDOW_LIGHTS = [0xf2f6ff, 0xfff1dc, 0xdfe6ff, 0xd8ffe8];
const TILE_U = 200, TILE_V = 4 * STOREY;
const SKIN: Record<AkibaBuilding['skin'], { tex: FacadeKind; tint: number }> = {
  white: { tex: 'tileA', tint: 0xf7f7f5 },
  grey: { tex: 'tileB', tint: 0xd2d4d8 },
  concrete: { tex: 'concrete', tint: 0xcfcdc8 },
  dark: { tex: 'tileB', tint: 0x6a6c74 }, // a dark panel front, not black glass (a black slab reads as a blank wall)
};

export interface AkibaStats { buildings: number; bays: number; blades: number; meshes: number; instanced: number; triangles: number; cables: number }

/** Builds the rebuilt centre of Akihabara into the scene. */
export function buildAkihabara(scene: THREE.Scene): AkibaStats {
  const rnd = prng(2718);
  const GF = GROUND_FLOOR;
  // Merge buckets.
  const hero: THREE.BufferGeometry[] = [], lit: THREE.BufferGeometry[] = [], back: THREE.BufferGeometry[] = [], win: THREE.BufferGeometry[] = [];
  const solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], ground: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [], traces: THREE.BufferGeometry[] = [];
  const skins: Record<string, THREE.BufferGeometry[]> = {};
  // Instanced pieces.
  const acs: THREE.Matrix4[] = [], fans: THREE.Matrix4[] = [], tanks: THREE.Matrix4[] = [], pipes: THREE.Matrix4[] = [], racks: THREE.Matrix4[] = [], meters: THREE.Matrix4[] = [];
  const crates: THREE.Matrix4[] = [], crateCol: number[] = [], gacha: THREE.Matrix4[] = [], leds: THREE.Matrix4[] = [], ledCol: number[] = [], bollards: THREE.Matrix4[] = [], transformers: THREE.Matrix4[] = [];
  const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
  const FRAME = 0x1d1f24, STEEL = 0x50545c, CABLE = 0x141518;
  const wire: number[] = [];
  /** A sagging cable between two points (drawn only; `sag` at the middle). */
  const cable = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, n = 8) => {
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const y0 = ay + (by - ay) * t0 - sag * 4 * t0 * (1 - t0), y1 = ay + (by - ay) * t1 - sag * 4 * t1 * (1 - t1);
      wire.push(ax + (bx - ax) * t0, y0, az + (bz - az) * t0, ax + (bx - ax) * t1, y1, az + (bz - az) * t1);
    }
  };
  const pool = (x: number, z: number, r: number, col: number, y = 0.7) => pools.push(tint(flat(r * 2, r * 2, x, y, z), col));
  const led = (x: number, y: number, z: number, col: number, s = 1) => { leds.push(M4(x, y, z, 0, s, s, s)); ledCol.push(col); };
  let bays = 0, blades = 0, wi = 0, ni = 0, bi = 0, ci = 0, fi = 0, ti = 0;

  // ------------------------------------------------------------ buildings (narrow 雑居ビル)
  const others = AKIBA_BUILT.buildings;
  const hidden = (b: AkibaBuilding, f: Face) => {
    const [mx, mz] = along(f, f.len / 2, 6);
    return others.some((o) => o !== b && mx > o.x0 && mx < o.x1 && mz > o.z0 && mz < o.z1);
  };
  const facade = (b: AkibaBuilding, f: Face, y0: number, y1: number, tintC: THREE.Color, uOff: number) => {
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
  for (const b of AKIBA_BUILT.buildings) {
    const br = prng(b.id.charCodeAt(0) * 131 + b.id.charCodeAt(1) * 17 + b.x0);
    const tintC = new THREE.Color(SKIN[b.skin].tint).multiplyScalar(0.94 + br() * 0.08);
    const uOff = Math.floor(br() * 4) * 0.5;
    const top = b.h, base = b.under ? GF : 0;
    for (const side of SIDES) {
      const f = faceOf(b, side);
      if (hidden(b, f)) continue;
      const front = b.fronts.includes(side);
      const ang = Math.atan2(f.nx, f.nz);
      const passageFace = b.under && ((b.under === 'x' && (side === 'e' || side === 'w')) || (b.under === 'z' && (side === 'n' || side === 's')));
      facade(b, f, front || passageFace ? GF : base, top, tintC, uOff);
      // A slab line at every floor, and lit rooms.
      {
        const [cx, cz] = along(f, f.len / 2, 1.2);
        for (let k = 2; k <= b.floors; k++) solid.push(tint(boxAt(f.nx ? 2.4 : f.len, 4, f.nx ? f.len : 2.4, cx, GF + (k - 2) * STOREY, cz), 0x3e4046));
        const cols = Math.max(1, Math.floor((f.len - 16) / 40));
        for (let k = 2; k <= b.floors; k++) for (let c = 0; c < cols; c++) {
          if (br() > (front ? 0.5 : 0.35)) continue;
          const [wx, wz] = along(f, 8 + (c + 0.5) * ((f.len - 16) / cols), 0.9);
          win.push(tint(quad(28, 40, CELLS.swatch, wx, GF + (k - 2) * STOREY + STOREY / 2, wz, f.nx, f.nz), WINDOW_LIGHTS[Math.floor(br() * 4)]));
        }
      }
      if (passageFace) {
        // 搬入口: the dark mouth of the covered passage, a half-raised shutter, a cable tray and a small green guide light.
        const [mx, mz] = along(f, f.len / 2, 1.5);
        back.push(quad(f.len - 10, 34, CELLS.shutter, mx, GF - 17, mz, f.nx, f.nz));
        solid.push(tint(boxAt(f.nx ? 8 : f.len, 10, f.nx ? f.len : 8, mx, GF - 39, mz), 0x2a2c31));
        for (const s of [6, f.len - 6]) { const [px, pz] = along(f, s, 3); solid.push(tint(boxAt(8, GF, 8, px, GF / 2, pz), FRAME)); }
        const [gx, gz] = along(f, f.len / 2, 2.4);
        glow.push(tint(boxAt(f.nx ? 1 : 26, 8, f.nx ? 26 : 1, gx, GF - 52, gz), GREEN));
        glow.push(tint(boxAt(f.nx ? 1 : f.len - 20, 1.5, f.nx ? f.len - 20 : 1, gx, GF - 46, gz), WHITE));
        const [qx, qz] = along(f, f.len / 2, 60);
        pool(qx, qz, 70, GREEN, CURB + 0.7);
      } else if (front) {
        // Street level: narrow bays (≈ 3.5 m) — show window or half-shutter, name band, an LED ticker over some.
        const n = Math.max(1, Math.round((f.len - 10) / 92)), bw = (f.len - 10) / n;
        for (let k = 0; k < n; k++) {
          const s = 5 + bw * (k + 0.5);
          const [wx, wz] = along(f, s, 1.6);
          const shut = br() < 0.15;
          lit.push(quad(bw - 8, GF - 30, shut ? CELLS.shutter : CELLS.window(wi++ % 8), wx, (GF - 30) / 2 + 2, wz, f.nx, f.nz));
          const [lx, lz] = along(f, s, 2.9);
          lit.push(quad(bw - 6, 20, CELLS.name(ni++ % NAMES.length), lx, GF - 14, lz, f.nx, f.nz));
          const [bx2, bz2] = along(f, s, 1.2);
          solid.push(tint(boxAt(bw - 2, 26, 3, bx2, GF - 14, bz2, ang), FRAME));
          if (br() < 0.55) {
            const [tx2, tz2] = along(f, s, 3.4);
            back.push(quad(bw - 14, 10, CELLS.ticker(ti++ % 4), tx2, GF + 8, tz2, f.nx, f.nz));
          }
          // Goods spilling onto the pavement: crates of parts, a capsule-toy row, a price card on a stand.
          const r = br();
          if (r < 0.35) {
            for (let q = 0; q < 3; q++) {
              const [cx2, cz2] = along(f, s - bw / 3 + q * (bw / 3), 13);
              crates.push(M4(cx2, CURB + 9 + (q % 2) * 4, cz2, ang, 1, 1 + (q % 2) * 0.4, 1)); crateCol.push([0xd8dde4, 0x2a2c31, 0x3dff8a, 0xf6f7f9][(q + k) % 4]);
            }
          } else if (r < 0.5) {
            for (let q = 0; q < 4; q++) { const [gx, gz] = along(f, s - 30 + q * 20, 11); gacha.push(M4(gx, CURB, gz, ang)); }
          } else if (r < 0.7) {
            const [px, pz] = along(f, s, 18);
            solid.push(tint(boxAt(3, 46, 3, px, CURB + 23, pz), FRAME));
            lit.push(quad(30, 30, CELLS.card(ci++ % 16), px + f.nx * 2, CURB + 58, pz + f.nz * 2, f.nx, f.nz));
          }
          // Shop light on the pavement: white or green, never a wash.
          const [px, pz] = along(f, s, 36);
          pool(px, pz, 40, br() < 0.75 ? 0xf2f6ff : GREEN, CURB + 0.6);
          bays++;
        }
        for (let k = 0; k <= n; k++) {
          const [px, pz] = along(f, 5 + bw * k, 2);
          solid.push(tint(boxAt(6, GF, 5, px, GF / 2, pz, ang), FRAME));
          // Posters on the pillars.
          if (k > 0 && k < n && br() < 0.6) { const [qx, qz] = along(f, 5 + bw * k, 4.8); back.push(quad(16, 22, CELLS.card(ci++ % 16), qx, 60, qz, f.nx, f.nz)); }
        }
        const [cx, cz] = along(f, f.len / 2, 4);
        solid.push(tint(boxAt(f.len + 4, 6, 8, cx, GF + 2, cz, ang), 0x26282d));
        // A tenant sign on every storey (細かい文字情報), and posters in some windows.
        if (b.floors >= 2) {
          for (let k = 2; k <= b.floors; k++) {
            const s = f.len > 100 ? f.len * (0.28 + 0.44 * (k % 2)) : f.len / 2;
            const [qx, qz] = along(f, s, 1.4);
            back.push(quad(Math.min(84, f.len - 24), 11, CELLS.floor(fi++ % FLOORS.length), qx, GF + (k - 2) * STOREY + STOREY - 13, qz, f.nx, f.nz));
            if (br() < 0.5) {
              const [px, pz] = along(f, 14 + br() * (f.len - 28), 1.6);
              back.push(quad(26, 26, CELLS.card(ci++ % 16), px, GF + (k - 2) * STOREY + STOREY / 2 + 6, pz, f.nx, f.nz));
            }
          }
        }
        // Narrow blade signs, two per front on the taller ones, readable from both ways along the street.
        if (b.floors >= 3) {
          const tx = (f.bx - f.ax) / f.len, tz = (f.bz - f.az) / f.len;
          for (const s of f.len > 90 ? [14, f.len - 14] : [f.len - 12]) {
            const t2 = Math.min(top - 20, GF + 4 * STOREY), b0 = GF + 14, hh = t2 - b0;
            if (hh < 70) continue;
            const [sx, sz] = along(f, s, 18);
            const cell = CELLS.blade(bi++ % 16);
            back.push(quad(24, hh, cell, sx + tx * 0.6, b0 + hh / 2, sz + tz * 0.6, tx, tz));
            back.push(quad(24, hh, cell, sx - tx * 0.6, b0 + hh / 2, sz - tz * 0.6, -tx, -tz));
            // A thin light line on the sign's outer edge (blue or green).
            glow.push(tint(boxAt(1.2, hh, 1.2, sx + f.nx * 12, b0 + hh / 2, sz + f.nz * 12), (bi % 2) ? BLUE : GREEN));
            const [mx, mz] = along(f, s, 5);
            solid.push(tint(boxAt(2.5, 2.5, 10, mx, t2 - 4, mz, ang), FRAME), tint(boxAt(2.5, 2.5, 10, mx, b0 + 4, mz, ang), FRAME));
            blades++;
          }
        }
        // Air-con units and fans on the front too (Akihabara's fronts are not tidy).
        for (let k = 2; k <= b.floors; k++) {
          if (br() < 0.55) continue;
          const s = 26 + br() * Math.max(1, f.len - 52), y = GF + (k - 1) * STOREY - 40;
          const [ax, az] = along(f, s, 14);
          acs.push(M4(ax, y, az, ang, 0.6, 0.6, 0.6));
          const [fx, fz] = along(f, f.len - s, 1.5);
          fans.push(M4(fx, y + 18, fz, ang));
        }
      } else {
        // Blind sides: a steel door and pipes; meter boxes.
        const [dx, dz] = along(f, Math.min(34, f.len / 2), 1.2);
        if (!b.under) solid.push(tint(boxAt(28, 68, 2, dx, CURB + 34, dz, ang), 0x5a5e66));
        for (const s of [f.len * 0.25, f.len * 0.75]) { const [px, pz] = along(f, s, 4); pipes.push(M4(px, top / 2, pz, 0, 1.2, top, 1.2)); }
        if (f.len > 60) { const [mx, mz] = along(f, f.len - 30, 4); meters.push(M4(mx, 70, mz, ang)); }
      }
      // Service side (a lane wall): cable racks along every storey, air-con units, fans, meters.
      if (side === b.service) {
        const [rx, rz] = along(f, f.len / 2, 8);
        for (let k = 1; k <= Math.min(b.floors, 4); k++) racks.push(M4(rx, GF + (k - 1) * STOREY - 6, rz, ang, f.len - 10, 1, 1));
        for (let k = 1; k <= b.floors; k++) {
          for (let q = 0; q < 2; q++) {
            if (br() < 0.35) continue;
            const s = 20 + br() * Math.max(1, f.len - 40);
            const [ax, az] = along(f, s, 14);
            acs.push(M4(ax, Math.max(GF + 20, GF + (k - 1) * STOREY - 30), az, ang, 0.7, 0.7, 0.7));
          }
          const [fx, fz] = along(f, f.len * 0.3, 1.5);
          fans.push(M4(fx, GF + (k - 1) * STOREY + 40, fz, ang));
        }
        for (const s of [10, 22, f.len - 16]) { const [px, pz] = along(f, s, 5); pipes.push(M4(px, top / 2, pz, 0, 1, top, 1)); }
        const [mx, mz] = along(f, f.len * 0.7, 4);
        meters.push(M4(mx, 80, mz, ang), M4(mx, 120, mz, ang));
        const [gx, gz] = along(f, f.len * 0.5, 2.5);
        led(gx, 150, gz, GREEN, 0.6);
      }
    }
    // Roof: parapet, plant, a tank and a small antenna on some.
    const R = 6, x0 = b.x0, x1 = b.x1, z0 = b.z0, z1 = b.z1, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    ground.push(tint(flat(w, d, cx, top - 12, cz), 0x5c5b59));
    for (const [px, pz, pw, pd] of [[cx, z0 + R / 2, w, R], [cx, z1 - R / 2, w, R], [x0 + R / 2, cz, R, d], [x1 - R / 2, cz, R, d]]) solid.push(tint(boxAt(pw, 16, pd, px, top - 4, pz), 0x8a8884));
    for (let k = 0; k < Math.max(1, Math.floor((w * d) / 9000)); k++) acs.push(M4(x0 + 20 + br() * (w - 40), top - 12 + 15, z0 + 20 + br() * (d - 40), br() * 3));
    if (w > 70 && d > 70 && br() < 0.6) tanks.push(M4(x0 + 30 + br() * (w - 60), top + 24, z0 + 30 + br() * (d - 60), 0, 0.7, 0.7, 0.7));
    if (br() < 0.5) {
      const ax = x0 + 15 + br() * (w - 30), az = z0 + 15 + br() * (d - 30);
      solid.push(tint(boxAt(3, 90, 3, ax, top + 45, az), STEEL), tint(boxAt(30, 2, 2, ax, top + 80, az), STEEL), tint(boxAt(2, 2, 22, ax, top + 70, az), STEEL));
      led(ax, top + 92, az, RED, 0.7);
    }
    // A thin light line along the roof edge of the street-facing side.
    const ff = faceOf(b, b.fronts[0]), [ex, ez] = along(ff, ff.len / 2, 1.6);
    glow.push(tint(boxAt(ff.nx ? 1 : ff.len, 2, ff.nx ? ff.len : 1, ex, top - 22, ez), br() < 0.5 ? BLUE : WHITE));
  }

  // ------------------------------------------------------------ MAIN ELECTRIC STREET: pavements dressed for density
  {
    const M = MAIN_STREET;
    // Bollards along both kerbs (every ≈ 3 m), gaps at the lane mouths.
    for (let z = M.z0 + 30; z < M.z1 - 10; z += 80) {
      if (!(z > -2760 && z < -2600)) bollards.push(M4(M.road0 - 6, CURB + 14, z));
      bollards.push(M4(M.road1 + 6, CURB + 14, z));
    }
    // Hanging banners on the poles (white / green / violet-blue), both sides of the street.
    for (const [x, z, nx] of [[2134, -2808, 1], [2310, -2808, -1], [2310, -2690, -1], [2310, -2575, -1], [2134, -2505, 1], [2310, -2510, -1]] as const) {
      const cell = CELLS.blade(bi++ % 16);
      back.push(quad(22, 90, cell, x + nx * 14, 190, z + 0.6, 0, 1), quad(22, 90, cell, x + nx * 14, 190, z - 0.6, 0, -1));
      solid.push(tint(boxAt(26, 2, 2, x + nx * 13, 236, z), FRAME), tint(boxAt(26, 2, 2, x + nx * 13, 144, z), FRAME));
    }
    // Small LED nodes along the carriageway kerb (light lines on the road edge at night).
    for (let z = M.z0 + 20; z < M.z1; z += 40) { led(M.road0 + 1, 1.2, z, BLUE, 0.5); led(M.road1 - 1, 1.2, z, BLUE, 0.5); }
    // The street's end wall (the arcade's south wall) carries the CIRCUIT ARCADE sign, lit: the vista up the street.
    hero.push(quad(220, 55, CELLS.arcadeSign, 2222, 150, ARCADE.z + ARCADE.d / 2 + 1.5, 0, 1));
    glow.push(tint(boxAt(230, 2, 2, 2222, 121, ARCADE.z + ARCADE.d / 2 + 2), GREEN));
    pool(2222, -2790, 70, 0xf2f6ff, 0.8);
  }

  // ------------------------------------------------------------ CIRCUIT ARCADE (the arcade's walls, inside and out)
  {
    const A = ARCADE, x0 = A.x - A.w / 2, x1 = A.x + A.w / 2, z0 = A.z - A.d / 2, z1 = A.z + A.d / 2, H = 178, T = 14;
    for (const p of WORLD) {
      if (p.group !== 'arcade' || p.kind !== 'box') continue;
      const b = p as BoxPrim;
      if (b.y0 > 0) {
        // The roof slab: dark top, a ceiling of circuit traces underneath (lit).
        solid.push(tint(boxAt(b.w, b.y1 - b.y0, b.d, b.x, (b.y0 + b.y1) / 2, b.z), 0x2a2c31));
        continue;
      }
      solid.push(tint(boxAt(b.w, b.y1, b.d, b.x, b.y1 / 2, b.z), 0xe9eaec));
    }
    // Ceiling traces, floor tiles, stalls along both inner walls.
    for (let x = x0 + 40; x < x1 - 30; x += 116) traces.push(quad(116, A.d - 2 * T - 4, CELLS.circuit, x + 58, H - 1, A.z, 0, 0, true).rotateX(0) as THREE.BufferGeometry);
    for (let x = x0 + T; x < x1 - T; x += 40) ground.push(tint(flat(39, A.d - 2 * T, x + 20, 0.5, A.z), (x / 40) % 2 ? 0x3a3c42 : 0x44464c));
    ground.push(tint(flat(A.w - 2 * T, 10, A.x, 0.6, A.z), 0x1d1f24));
    for (let x = x0 + 50; x < x1 - 40; x += 52) glow.push(tint(boxAt(2, 1, A.d - 60, x, 0.8, A.z), GREEN));
    for (const [nz, z] of [[1, z0 + T + 1], [-1, z1 - T - 1]] as const) {
      for (let x = x0 + 40; x < x1 - 40; x += 70) {
        if (nz === -1 && Math.abs(x + 32 - ARCADE_SOUTH_DOOR.x) < ARCADE_SOUTH_DOOR.width / 2 + 30) continue;
        lit.push(quad(64, 90, CELLS.window(wi++ % 8), x + 32, 50, z, 0, nz));
        lit.push(quad(64, 14, CELLS.name(ni++ % NAMES.length), x + 32, 104, z + nz * 0.6, 0, nz));
        crates.push(M4(x + 32, 9, z + nz * 18, 0, 1.4, 1, 1)); crateCol.push(0xd8dde4);
      }
      // Hanging blade signs inside (across the walkway), low enough for the camera.
      for (let x = x0 + 80; x < x1 - 60; x += 140) {
        const cell = CELLS.blade(bi++ % 16);
        back.push(quad(20, 60, cell, x, 140, A.z + nz * 40 + 0.5, 0, 1), quad(20, 60, cell, x, 140, A.z + nz * 40 - 0.5, 0, -1));
      }
    }
    for (let x = x0 + 60; x < x1 - 40; x += 120) pool(x, A.z, 70, (x / 120) % 2 ? 0xf2f6ff : GREEN, 0.9);
    // Outside: a black fascia band all round with a green line, the door gates with the sign over them.
    for (const side of SIDES) {
      const f = faceOf({ x0, z0, x1, z1 }, side), [mx, mz] = along(f, f.len / 2, 1.5);
      solid.push(tint(boxAt(f.nx ? 3 : f.len, 28, f.nx ? f.len : 3, mx, H - 4, mz), 0x101115));
      glow.push(tint(boxAt(f.nx ? 1 : f.len, 2, f.nx ? f.len : 1, mx + f.nx * 1.5, H - 20, mz + f.nz * 1.5), GREEN));
      glow.push(tint(boxAt(f.nx ? 1 : f.len, 1.5, f.nx ? f.len : 1, mx + f.nx * 1.5, H + 8, mz + f.nz * 1.5), BLUE));
      // Shop windows on the long outside walls (the lanes look at the south wall).
      if (side === 's' || side === 'n') {
        for (let s = 40; s < f.len - 40; s += 88) {
          const [wx, wz] = along(f, s, 1.6);
          if (side === 's' && Math.abs(wx - ARCADE_SOUTH_DOOR.x) < ARCADE_SOUTH_DOOR.width / 2 + 40) continue;
          if (side === 's' && wx > MAIN_STREET.x0 - 30 && wx < MAIN_STREET.x1 + 30) continue;
          lit.push(quad(74, 80, CELLS.window(wi++ % 8), wx, 44, wz, f.nx, f.nz));
          back.push(quad(74, 12, CELLS.ticker(ti++ % 4), wx, 96, wz + f.nz * 0.5, f.nx, f.nz));
        }
      }
    }
    const gate = (x: number, z: number, nx: number, nz: number, span: number) => {
      const tx = -nz, tz = nx;
      for (const s of [-1, 1]) {
        solid.push(tint(boxAt(10, 140, 10, x + tx * s * (span / 2 + 6) + nx * 4, 70, z + tz * s * (span / 2 + 6) + nz * 4), FRAME));
        glow.push(tint(boxAt(nx ? 2 : 1.4, 120, nx ? 1.4 : 2, x + tx * s * (span / 2 + 6) + nx * 9.6, 70, z + tz * s * (span / 2 + 6) + nz * 9.6), GREEN));
      }
      hero.push(quad(span + 30, 34, CELLS.arcadeSign, x + nx * 3, 160, z + nz * 3, nx, nz));
      pool(x + nx * 60, z + nz * 60, 80, GREEN, CURB + 0.6);
    };
    gate(x0, A.z, -1, 0, 140);
    gate(x1, A.z, 1, 0, 140);
    gate(ARCADE_SOUTH_DOOR.x, z1, 0, 1, ARCADE_SOUTH_DOOR.width);
    // The mast on the arcade's east end (a GRID TOWER cable lands on it).
    solid.push(tint(boxAt(5, 120, 5, 2350, 190 + 60, -2880), STEEL));
    led(2350, 312, -2880, RED, 0.7);
  }

  // ------------------------------------------------------------ GRID TOWER: a lattice mast wired to the roofs
  let cables = 0;
  {
    const T = GRID_TOWER, h = T.h, r0 = T.half, r1 = 9;
    const rAt = (y: number) => r0 + (r1 - r0) * (y / h);
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    // Plinth with switch cabinets.
    solid.push(tint(boxAt(r0 * 2 + 30, 20, r0 * 2 + 30, T.x, 10, T.z), 0x8d8f92));
    for (const [sx, sz] of legs) solid.push(tint(boxAt(14, 40, 14, T.x + sx * (r0 + 4), 40, T.z + sz * (r0 + 4)), 0x3a3c42));
    // Legs, rings and X-bracing in alternating white and black sections.
    const SEG = 65;
    for (let y = 0; y < h; y += SEG) {
      const y1 = Math.min(h, y + SEG), ra = rAt(y), rb = rAt(y1), col = Math.floor(y / SEG) % 2 ? 0x15161a : 0xf2f3f5;
      for (const [sx, sz] of legs) solid.push(tint(bar(T.x + sx * ra, y, T.z + sz * ra, T.x + sx * rb, y1, T.z + sz * rb, 4), col));
      for (let k = 0; k < 4; k++) {
        const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
        solid.push(tint(bar(T.x + ax * rb, y1, T.z + az * rb, T.x + bx * rb, y1, T.z + bz * rb, 2.5), col));
        solid.push(tint(bar(T.x + ax * ra, y, T.z + az * ra, T.x + bx * rb, y1, T.z + bz * rb, 1.6), col));
        solid.push(tint(bar(T.x + bx * ra, y, T.z + bz * ra, T.x + ax * rb, y1, T.z + az * rb, 1.6), col));
      }
    }
    // Light lines up the legs (violet-blue) and a green ring at the cable ring.
    for (const [sx, sz] of legs) glow.push(tint(bar(T.x + sx * (r0 + 1), 30, T.z + sz * (r0 + 1), T.x + sx * (r1 + 1), h - 10, T.z + sz * (r1 + 1), 1.4), BLUE));
    const rr = rAt(T.ring);
    solid.push(tint(boxAt(rr * 2 + 26, 6, rr * 2 + 26, T.x, T.ring, T.z), 0x2a2c31));
    for (const [x, z, w, d] of [[T.x, T.z - rr - 13, rr * 2 + 26, 2], [T.x, T.z + rr + 13, rr * 2 + 26, 2], [T.x - rr - 13, T.z, 2, rr * 2 + 26], [T.x + rr + 13, T.z, 2, rr * 2 + 26]]) glow.push(tint(boxAt(w, 3, d, x, T.ring + 4, z), GREEN));
    // Antennas, dishes and the red light on top.
    solid.push(tint(boxAt(3, 120, 3, T.x, h + 60, T.z), STEEL));
    for (const [dx, dz, y] of [[10, 0, h - 60], [-10, 4, h - 110], [0, -10, h - 160]] as const) solid.push(tint(new THREE.CylinderGeometry(12, 3, 6, 10).rotateZ(Math.PI / 2).translate(T.x + dx, y, T.z + dz), 0xe9eaec));
    led(T.x, h + 122, T.z, RED, 1.2);
    led(T.x, T.ring + 60, T.z, RED, 0.8);
    // A low lit sign on the plinth (in the chase camera's view).
    for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0]] as const) lit.push(quad(64, 20, CELLS.way(5), T.x + nx * (r0 + 15.6), 30, T.z + nz * (r0 + 15.6), nx, nz));
    pool(T.x, T.z, 120, BLUE, 0.7);
    // The square round the mast: dark paving, and circuit traces from the plinth to the arcade's east door,
    // the street and the footbridge stair, so the tower reads as the node the town is wired to.
    const Z = AKIBA_ZONES[1];
    for (let x = Z.x0; x < Z.x1 - 1; x += 46) for (let z = Z.z0; z < Z.z1 - 1; z += 46) {
      const w = Math.min(45, Z.x1 - x - 1), d = Math.min(45, Z.z1 - z - 1);
      ground.push(tint(flat(w, d, x + w / 2, 0.35, z + d / 2), [0x4c4e53, 0x535559, 0x47484d][(Math.round((x - Z.x0) / 46) + 2 * Math.round((z - Z.z0) / 46)) % 3]));
    }
    for (const [ex, ez] of [[ARCADE.x + ARCADE.w / 2 + 4, ARCADE.z], [2380, -2835], [2530, -2835]] as const) {
      glow.push(tint(boxAt(Math.abs(ex - T.x), 0.6, 2, (ex + T.x) / 2, 0.5, ez), GREEN));
      glow.push(tint(boxAt(2, 0.6, Math.abs(ez - T.z), T.x, 0.5, (ez + T.z) / 2), GREEN));
      glow.push(tint(boxAt(8, 0.7, 8, ex, 0.5, ez), WHITE));
    }
    glow.push(tint(new THREE.RingGeometry(70, 72, 40).rotateX(-Math.PI / 2).translate(T.x, 0.55, T.z), WHITE));
    // Cables from the ring to the roofs and poles round it, sagging but always well overhead, with LED beads.
    for (const [bx, by, bz] of GRID_CABLES) {
      for (const off of [-6, 6]) {
        const ax = T.x + (bx > T.x ? rr : -rr), az = T.z + off;
        const sag = Math.min(60, (Math.min(T.ring, by) - 260) * 0.8);
        cable(ax, T.ring - 4, az, bx, by, bz + off * 0.5, Math.max(10, sag), 10);
        cables++;
      }
      for (let k = 1; k < 5; k++) {
        const t = k / 5, ax = T.x + (bx > T.x ? rr : -rr);
        const sag = Math.max(10, Math.min(60, (Math.min(T.ring, by) - 260) * 0.8));
        led(ax + (bx - ax) * t, T.ring - 4 + (by - T.ring + 4) * t - sag * 4 * t * (1 - t) - 3, T.z + (bz - T.z) * t, k % 2 ? GREEN : WHITE, 0.45);
      }
    }
  }

  // ------------------------------------------------------------ GRID GATE (footbridge over the street)
  {
    const D = GRID_GATE.deck, w = D.x1 - D.x0, d = D.z1 - D.z0, cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2;
    solid.push(tint(boxAt(w, 14, d, cx, GATE_H - 7, cz), 0x2b2d33));
    ground.push(tint(flat(w - 4, d - 4, cx, GATE_H + 0.4, cz), 0x77797e));
    ground.push(tint(flat(w - 8, 6, cx, GATE_H + 0.6, cz), 0x9da1a8));
    // Fascia bands on both faces, over the street: the gate sign of the electric town.
    for (const [z, nz] of [[D.z0 - 1, -1], [D.z1 + 1, 1]] as const) {
      hero.push(quad(MAIN_STREET.x1 - MAIN_STREET.x0, 18, CELLS.gateBand, (MAIN_STREET.x0 + MAIN_STREET.x1) / 2, GATE_H - 9, z, 0, nz));
      glow.push(tint(boxAt(w, 1.5, 1.5, cx, GATE_H - 19, z), BLUE));
    }
    for (const p of WORLD) {
      if (p.group !== 'akibaGate') continue;
      if (p.kind === 'ramp') {
        const r = p as RampPrim, len = r.axis === 'x' ? r.w : r.d, wid = r.axis === 'x' ? r.d : r.w;
        const n = Math.max(3, Math.round((r.hHigh - r.hLow) / 5));
        for (let i = 0; i < n; i++) {
          const hh = r.hLow + (r.hHigh - r.hLow) * ((i + 1) / n), sl = len / n, u = (i + 0.5) / n;
          const off = (r.dir === 1 ? u - 0.5 : 0.5 - u) * len;
          const x = r.axis === 'x' ? r.x + off : r.x, z = r.axis === 'z' ? r.z + off : r.z;
          solid.push(tint(boxAt(r.axis === 'x' ? sl : r.w, 5, r.axis === 'z' ? sl : r.d, x, hh - 2.5, z), i % 2 ? 0x8d9096 : 0x878a90));
          const nose = (r.dir === 1 ? -0.5 : 0.5) * sl;
          glow.push(tint(boxAt(r.axis === 'x' ? 1.2 : wid - 6, 1, r.axis === 'z' ? 1.2 : wid - 6, r.axis === 'x' ? x + nose : x, hh + 0.3, r.axis === 'z' ? z + nose : z), 0xe8fff2));
        }
        // Stringers with a handrail light, and the space under the high end (階段下) stays dark and open-looking.
        for (const sgn of [-1, 1]) {
          const sx = r.axis === 'z' ? r.x + sgn * (r.w / 2 + 2) : r.x, sz = r.axis === 'x' ? r.z + sgn * (r.d / 2 + 2) : r.z;
          const g = new THREE.BoxGeometry(r.axis === 'z' ? 3 : len, 1, r.axis === 'x' ? 3 : len, 1, 1, 1);
          const pos = g.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const lx = pos.getX(i) + sx, lz = pos.getZ(i) + sz;
            const t = r.axis === 'x' ? (lx - (r.x - len / 2)) / len : (lz - (r.z - len / 2)) / len;
            const hh = r.hLow + (r.hHigh - r.hLow) * (r.dir === 1 ? t : 1 - t);
            pos.setY(i, pos.getY(i) > 0 ? hh + 32 : Math.max(0, hh - 24));
          }
          g.translate(sx, 0, sz);
          g.computeVertexNormals();
          solid.push(tint(g, 0x2a2c31));
        }
        const footX = r.axis === 'x' ? r.x - r.dir * (len / 2 + 30) : r.x, footZ = r.axis === 'z' ? r.z - r.dir * (len / 2 + 30) : r.z;
        pool(footX, footZ, 60, 0xf2f6ff, CURB + 0.6);
        continue;
      }
      const b = p as BoxPrim;
      if (b.y0 >= GATE_H) {
        const lx = b.w > b.d, h = b.y1 - b.y0;
        solid.push(tint(boxAt(b.w + 1, 6, b.d + 1, b.x, b.y0 + 3, b.z), 0x2a2c31));
        solid.push(tint(boxAt(b.w + 2, 3, b.d + 2, b.x, b.y1 - 1.5, b.z), 0xb8bcc2));
        const n2 = lx ? b.w : b.d;
        for (let t = 0; t <= n2 + 0.1; t += n2 / Math.max(1, Math.round(n2 / 14))) solid.push(tint(boxAt(1.6, h, 1.6, lx ? b.x - b.w / 2 + t : b.x, b.y0 + h / 2, lx ? b.z : b.z - b.d / 2 + t), 0x6c7079));
        glow.push(tint(boxAt(lx ? b.w : 1.2, 1, lx ? 1.2 : b.d, b.x, b.y1 - 4, b.z), GREEN));
      } else if (b.y0 === 0 && b.y1 < GATE_H) {
        solid.push(tint(new THREE.CylinderGeometry(6, 7, b.y1, 8).translate(b.x, b.y1 / 2, b.z), 0x3a3d44));
        glow.push(tint(new THREE.CylinderGeometry(6.5, 6.5, 2, 8).translate(b.x, 40, b.z), BLUE));
      }
    }
    // Lights under the deck (the street under the bridge is lit), and cable bundles hung along its side.
    for (let x = D.x0 + 60; x < D.x1 - 30; x += 110) pool(x, cz, 38, 0xf2f6ff, 0.8);
    cable(D.x0, GATE_H - 16, D.z0 - 4, D.x1, GATE_H - 16, D.z0 - 4, 8, 14);
  }

  // ------------------------------------------------------------ DATA JUNCTION (the point's square)
  {
    const J = DATA_JUNCTION;
    // Paving: dark granite with circuit traces converging on the point from the lane mouths.
    for (let x = J.x0; x < J.x1; x += 50) for (let z = J.z0; z < J.z1; z += 50) {
      if (!insideLoop(x + 25, z + 25, 150)) continue;
      ground.push(tint(flat(49, 49, x + 25, 0.35, z + 25), [0x4c4e53, 0x535559, 0x47484d][(((Math.floor(x / 50) + Math.floor(z / 50) * 2) % 3) + 3) % 3]));
    }
    const P = { x: 2642, z: -2265 };
    const mouths: [number, number][] = [[2416, -2470], [2620, -2430], [2815, -2430], [2700, -2430]];
    for (const [mx, mz] of mouths) {
      // An L-shaped trace: across, then along, with a pad at the end.
      glow.push(tint(boxAt(2, 0.6, Math.abs(P.z - mz), mx, 0.5, (mz + P.z) / 2), GREEN));
      glow.push(tint(boxAt(Math.abs(P.x - mx), 0.6, 2, (mx + P.x) / 2, 0.5, P.z), GREEN));
      glow.push(tint(boxAt(8, 0.7, 8, mx, 0.5, mz), WHITE));
    }
    glow.push(tint(new THREE.RingGeometry(150, 153, 48).rotateX(-Math.PI / 2).translate(P.x, 0.55, P.z + 16), BLUE));
    // The free-standing LED boards (both faces), on black frames.
    JUNCTION_BOARDS.forEach((k, i) => {
      const lx = k.w > k.d, len = lx ? k.w : k.d;
      solid.push(tint(boxAt(k.w, k.h, k.d, k.x, k.h / 2, k.z), 0x16171b));
      for (const s of [-1, 1]) {
        const nx = lx ? 0 : s, nz = lx ? s : 0;
        hero.push(quad(len - 8, 64, CELLS.board(i % 3), k.x + nx * (k.d / 2 + 0.6), k.h - 40, k.z + nz * (k.w / 2 + 0.6) * (lx ? 0 : 0) + (lx ? s * (k.d / 2 + 0.6) : 0), nx, nz));
        back.push(quad(len - 8, 12, CELLS.ticker(i + s + 1), k.x + nx * (k.d / 2 + 0.6), 40, k.z + (lx ? s * (k.d / 2 + 0.6) : 0), nx, nz));
      }
      glow.push(tint(boxAt(lx ? k.w : k.d + 1, 2, lx ? k.d + 1 : k.w, k.x, k.h + 1, k.z), GREEN));
      pool(k.x, k.z, 50, 0xf2f6ff, 0.6);
    });
    // The square's sign on the stalls' south walls, facing the point.
    hero.push(quad(150, 38, CELLS.junctionSign, 2520, 180, -2430 + 1.5, 0, 1));
    hero.push(quad(110, 28, CELLS.junctionSign, 2715, 150, -2430 + 1.5, 0, 1));
    // A web of cables over the square with LED nodes (hung from the stalls and the poles, high).
    const anchors: [number, number, number][] = [[2470, 270, -2430], [2570, 270, -2430], [2670, 200, -2430], [2760, 200, -2430], [2862, 250, -2445]];
    for (let k = 0; k < anchors.length - 1; k++) {
      const [ax, ay, az] = anchors[k], [bx, by, bz] = anchors[k + 1];
      cable(ax, ay, az, (bx + 2642) / 2, (by + 250) / 2, -2330, 12);
      cable((bx + 2642) / 2, (by + 250) / 2, -2330, bx, by, bz, 10);
      led((bx + 2642) / 2, (by + 250) / 2 - 4, -2330, k % 2 ? GREEN : WHITE, 0.6);
    }
    for (const [x, z, ang] of [[2400, -2300, Math.PI / 2], [2840, -2280, Math.PI / 2]] as const) {
      solid.push(tint(boxAt(80, 4, 20, x, 20, z, ang), 0x2a2c31), tint(boxAt(70, 18, 12, x, 9, z, ang), 0x55585e));
    }
    pool(2642, -2330, 160, 0xf2f6ff, 0.5);
  }

  // ------------------------------------------------------------ the lanes: paving, cables overhead, small lights
  {
    const lane = (r: { x0: number; z0: number; x1: number; z1: number }, y: number) => {
      for (let x = r.x0; x < r.x1 - 1; x += 38) for (let z = r.z0; z < r.z1 - 1; z += 38) {
        const w = Math.min(38, r.x1 - x), d = Math.min(38, r.z1 - z);
        ground.push(tint(flat(w, d, x + w / 2, y, z + d / 2), (Math.round((x - r.x0) / 38) + Math.round((z - r.z0) / 38)) % 2 ? 0x45464a : 0x4c4d51));
      }
    };
    const R = ROUTES;
    for (const k of ['spine', 'westLane', 'southWestLane'] as const) lane(R[k], CURB + 0.3);
    lane({ ...R.southEastLane, z1: -2447 }, CURB + 0.3); // (the paved part; south of it is the riverside walk)
    for (const k of ['partsLane', 'serviceNorth', 'serviceSouth'] as const) lane(R[k], 0.3);
    // Passages under P1 and R2: dark paving and a strip light overhead.
    for (const b of AKIBA_BUILT.buildings.filter((q) => q.under)) {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0, y = b.x1 < MAIN_STREET.x0 ? CURB + 0.4 : 0.4;
      ground.push(tint(flat(w, d - 20, cx, y, cz), 0x34353a));
      solid.push(tint(boxAt(w, 2, d, cx, GROUND_FLOOR - 1, cz), 0x1f2025));
      glow.push(tint(boxAt(w - 20, 2, 3, cx, GROUND_FLOOR - 4, cz), WHITE));
      racks.push(M4(cx, GROUND_FLOOR - 16, b.z0 + 8, 0, w - 10, 1, 1), M4(cx, GROUND_FLOOR - 16, b.z1 - 8, 0, w - 10, 1, 1));
      for (let x = b.x0 + 20; x < b.x1 - 10; x += 30) led(x, GROUND_FLOOR - 10, cz, x % 60 < 30 ? GREEN : WHITE, 0.4);
      pool(cx, cz, 50, 0xf2f6ff, y + 0.3);
    }
    // Cable bundles strung across the lanes (high: over everyone's head), with small LED signs hung on them.
    const spans: [number, number, number, number, number][] = [
      [1860, -2760, 1966, -2760, 230], [1860, -2650, 1966, -2650, 220], [1702, -2648, 1860, -2648, 210], [1806, -2540, 1702, -2540, 200],
      [1966, -2480, 2082, -2480, 210], [2570, -2520, 2670, -2520, 200], [2790, -2700, 2885, -2700, 240], [2760, -2520, 2870, -2520, 230],
      [2470, -2480, 2362, -2480, 200],
    ];
    for (const [ax, az, bx, bz, y] of spans) {
      for (const dy of [0, 6, 11]) cable(ax, y + dy, az, bx, y + dy - 2, bz, 14 - dy, 6);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const cell = CELLS.blade(bi++ % 16);
      back.push(quad(16, 56, cell, mx + (alongX ? 0 : 0.6), y - 50, mz + (alongX ? 0.6 : 0), alongX ? 0 : 1, alongX ? 1 : 0), quad(16, 56, cell, mx - (alongX ? 0 : 0.6), y - 50, mz - (alongX ? 0.6 : 0), alongX ? 0 : -1, alongX ? -1 : 0));
      led(mx, y - 18, mz, GREEN, 0.5);
    }
    // Lane-level light: small white and green pools (the lanes stay dark in the rules, but read on screen).
    for (const [x, z, c] of [[1913, -2700, WHITE], [1780, -2648, GREEN], [1754, -2520, WHITE], [2024, -2484, GREEN], [2620, -2515, WHITE], [2838, -2700, GREEN], [2815, -2520, WHITE]] as const) pool(x, z, 70, c, CURB + 0.6);
    // SERVICE CUT mouths: white and green guide lights at knee height, so the way in never sinks into the dark.
    for (const [x, z] of [[2795, -2805], [2880, -2805], [2765, -2440], [2865, -2440], [2716, -2700], [2716, -2625], [2088, -2612], [2088, -2528]] as const) {
      solid.push(tint(boxAt(6, 30, 6, x, 15, z), 0x2a2c31));
      led(x, 32, z, GREEN, 0.7);
    }
    for (const [x, z, nx, nz, i] of [[2838, -2812, 0, -1, 1], [2815, -2425, 0, 1, 1], [2150, -2790, 1, 0, 4], [1913, -2600, 0, 1, 0], [2365, -2470, -1, 0, 2], [2180, -2510, 1, 0, 3]] as const) {
      solid.push(tint(boxAt(4, 150, 4, x, 75, z), 0x5a5e66));
      solid.push(tint(boxAt(nx ? 3 : 84, 30, nx ? 84 : 3, x - nx * 3, 140, z - nz * 3), 0x1d1f24));
      lit.push(quad(80, 25, CELLS.way(i), x + nx * 0.5, 140, z + nz * 0.5, nx, nz));
    }
  }

  // ------------------------------------------------------------ POWER NODE (switchgear on the back lane)
  {
    const P = POWER_NODE, cz = (P.z0 + P.z1) / 2, d = P.z1 - P.z0, fx = P.x0 - 0.8;
    solid.push(tint(boxAt(P.x1 - P.x0, P.h, d, (P.x0 + P.x1) / 2, P.h / 2, cz), 0x8e9298));
    // Cabinets with meters and green status lights; warning plates; cable trays above; transformers.
    for (let z = P.z0 + 14; z < P.z1 - 10; z += 34) {
      solid.push(tint(boxAt(4, 120, 30, fx - 2, 62, z + 13), 0xb9bdc3));
      glow.push(tint(boxAt(1, 3, 3, fx - 4.5, 104, z + 6), GREEN), tint(boxAt(1, 3, 3, fx - 4.5, 104, z + 13), z % 68 < 34 ? GREEN : RED));
      solid.push(tint(boxAt(1, 14, 14, fx - 4.4, 82, z + 13), 0x1d1f24));
    }
    for (let i = 0; i < 4; i++) lit.push(quad(30, 22, CELLS.warn(i), fx - 4.8, 150, P.z0 + 22 + i * 38, -1, 0));
    for (let k = 0; k < 3; k++) racks.push(M4(fx - 10, 170 + k * 12, cz, Math.PI / 2, d, 1, 1));
    for (const z of [P.z0 - 24, P.z1 + 22]) transformers.push(M4(P.x0 + 12, 0, z));
    glow.push(tint(boxAt(1, 1.6, d, fx - 5, 196, cz), BLUE), tint(boxAt(1, 1.6, d, fx - 5, 10, cz), BLUE));
    hero.push(quad(70, 22, CELLS.way(1), fx - 5, 214, cz, -1, 0));
    pool(P.x0 - 40, cz, 80, GREEN, 0.6);
    // Thick cables from the switchgear up the viaduct and across to the R row.
    for (const z of [P.z0 + 30, cz, P.z1 - 30]) cable(P.x0, 190, z, 2790, 300, z - 20, 18, 6);
  }

  // ------------------------------------------------------------ LOCK YARD ground (around the LOCK POINT, kept open)
  {
    const Y = LOCK_YARD;
    for (let x = Y.x0; x < Y.x1; x += 60) for (let z = Y.z0; z < Y.z1; z += 60) ground.push(tint(flat(59, 59, x + 30, 0.3, z + 30), (Math.round((x - Y.x0) / 60) + Math.round((z - Y.z0) / 60)) % 2 ? 0x55565a : 0x5c5d61));
    // A ring of LED studs round the yard's edge (it reads as one place at night).
    for (let x = Y.x0 + 20; x < Y.x1; x += 50) { led(x, 1, Y.z0 + 4, WHITE, 0.5); led(x, 1, Y.z1 - 4, WHITE, 0.5); }
  }

  // ------------------------------------------------------------ railway arches near the station (ガード下 parts stalls)
  const arches: THREE.BufferGeometry[] = [];
  {
    const si = STATIONS.findIndex((s) => s.name === '秋葉原');
    for (const i of [si - 1, si]) {
      const a = LOOP[(i + LOOP.length) % LOOP.length], b = LOOP[(i + 1) % LOOP.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z), ang = Math.atan2(b.x - a.x, b.z - a.z), L2 = len + VIADUCT.w * 0.6;
      const F = new THREE.Matrix4().compose(new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(1, 1, 1));
      const nx = Math.cos(ang), nz = -Math.sin(ang), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const side = insideLoop(mx + nx * 400, mz + nz * 400, 0) ? 1 : -1;
      for (let k = 0; ; k++) {
        const zl = L2 / 2 - 230 * (k + 0.5);
        if (zl < -L2 / 2) break;
        if (Math.abs(zl) > len / 2 - 200) continue;
        arches.push(quad(190, 140, CELLS.garage(Math.floor(rnd() * 3)), side * (VIADUCT.w / 2 + 1.5), 70, zl, side, 0).applyMatrix4(F));
      }
    }
  }

  // ------------------------------------------------------------ materials and meshes
  const tex = atlas();
  const signMat = (i: number, tone = 0xffffff) => nearFade(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: tone, emissiveMap: tex, emissiveIntensity: i, roughness: 1 }), 30, 120);
  // Three levels of sign light: hero (the landmarks' signs), support (shopfronts, names, wayfinding), background (blades, tickers, cards).
  const heroMat = signMat(0.85), litMat = signMat(0.6), backMat = signMat(0.36, 0xdfe3ea);
  const archMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8, roughness: 1 });
  const solidMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }), 30, 120);
  // Light lines dissolve near the camera like the signs (a line beside the lens would fill the view).
  const glowMat = basicNearFade(new THREE.MeshBasicMaterial({ vertexColors: true }), 30, 120);
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glowTex = radialGlowTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const traceMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x3dff8a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const wireMat = new THREE.LineBasicMaterial({ color: CABLE });
  NIGHT_GLOW.push({
    set: (k) => {
      heroMat.emissiveIntensity = 0.85 + 0.2 * k;
      litMat.emissiveIntensity = 0.6 + 0.16 * k;
      backMat.emissiveIntensity = 0.36 + 0.12 * k;
      winMat.color.setScalar(0.55 + 0.4 * k);
      archMat.emissiveIntensity = 0.8 + 0.15 * k;
      glowMat.color.setScalar(0.75 + 0.25 * k);
      poolMat.opacity = 0.1 + 0.42 * k;
      traceMat.opacity = 0.35 + 0.35 * k;
      // Cables read against the night sky as faintly lit lines.
      wireMat.color.setHex(CABLE).lerp(new THREE.Color(0x3a3f55), k);
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
    m.name = 'akihabara';
    scene.add(m);
    meshes++;
  };
  for (const [k, list] of Object.entries(skins)) {
    const kind = k as FacadeKind;
    const m = new THREE.MeshStandardMaterial({ map: sharedFacadeTexture(kind), vertexColors: true, roughness: 0.85, metalness: 0, emissive: 0xffffff, emissiveMap: sharedFacadeTexture(kind, true), emissiveIntensity: 0.45 });
    glowAtNight(m, 0.45, 0.8);
    add(list, m, true);
  }
  add(hero, heroMat, false);
  add(lit, litMat, false);
  add(back, backMat, false);
  add(win, winMat, false, false);
  add(solid, solidMat, true);
  add(glow, glowMat, false, false);
  add(ground, groundMat, false);
  add(arches, archMat, false);
  add(pools, poolMat, false, false, 1);
  add(traces, traceMat, false, false, 1);
  if (wire.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const ls = new THREE.LineSegments(wg, wireMat);
    ls.name = 'akihabara';
    scene.add(ls);
  }
  // Instanced small pieces (one draw each).
  let instanced = 0;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cast = true, colors?: number[]) => {
    if (!ms.length) return;
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((x, i) => m.setMatrixAt(i, x));
    if (colors) { const c = new THREE.Color(); colors.forEach((v, i) => m.setColorAt(i, c.setHex(v))); }
    m.castShadow = cast;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.name = 'akihabara';
    scene.add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * ms.length;
    instanced++;
  };
  inst(new THREE.BoxGeometry(36, 30, 26), new THREE.MeshStandardMaterial({ color: 0xd6d6d0, roughness: 0.8 }), acs);
  inst(new THREE.CylinderGeometry(10, 10, 3, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.6, metalness: 0.3 }), fans, false);
  inst(new THREE.CylinderGeometry(28, 28, 46, 12), new THREE.MeshStandardMaterial({ color: 0xbfc6cc, roughness: 0.6 }), tanks);
  inst(new THREE.CylinderGeometry(2.2, 2.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.6, metalness: 0.3 }), pipes, false);
  inst(new THREE.BoxGeometry(1, 5, 10), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.6, metalness: 0.4 }), racks, false);
  inst(new THREE.BoxGeometry(18, 26, 8), new THREE.MeshStandardMaterial({ color: 0x9da1a8, roughness: 0.6 }), meters, false);
  inst(new THREE.BoxGeometry(22, 18, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), crates, false, crateCol);
  inst(new THREE.BoxGeometry(16, 40, 14).translate(0, 20, 0), new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.5, emissive: 0x3dff8a, emissiveIntensity: 0.12 }), gacha, false);
  inst(new THREE.CylinderGeometry(3.5, 4.5, 28, 8), new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.5, metalness: 0.4 }), bollards, false);
  inst(new THREE.CylinderGeometry(16, 16, 70, 12).translate(0, 35, 0), new THREE.MeshStandardMaterial({ color: 0x8e9298, roughness: 0.6, metalness: 0.3 }), transformers);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  NIGHT_GLOW.push({ set: (k) => { ledMat.color.setScalar(0.7 + 0.3 * k); } });
  inst(new THREE.BoxGeometry(5, 5, 5), ledMat, leds, false, ledCol);
  return { buildings: AKIBA_BUILT.buildings.length, bays, blades, meshes, instanced, triangles: Math.round(tris), cables };
}
