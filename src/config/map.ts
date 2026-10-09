import type { Point } from './nations';
import {
  HALO_SCREEN, MAZE, MAZE_BUILDINGS, MAZE_GATE, MAZE_MAP, SHIBUYA_BUILDINGS, SHIBUYA_LAMPS, SHIBUYA_ZONES, SKY_DECKS, SKY_H, SKY_LEGS, SKY_STAIRS, SUBWAY,
} from './shibuya';
import type { ShibuyaBuilding } from './shibuya';
import {
  AVENUE, DECKS, DECK_H, DECK_LEGS, HIGH_DECKS, HIGH_H, LANES, LANES_GATE, LANES_MAP, LANE_BUILDINGS, SHINJUKU_BUILDINGS, SHINJUKU_CROSS, SHINJUKU_LAMPS,
  SHINJUKU_STAIRS, SHINJUKU_ZONES,
} from './shinjuku';
import type { ShinjukuBuilding } from './shinjuku';
import {
  AKIBA_BUILDINGS, AKIBA_LAMPS, AKIBA_POLES, AKIBA_VENDING, AKIBA_WIRES, AKIBA_ZONES, ARCADE_SOUTH_DOOR, GATE_H, GRID_GATE, GRID_TOWER,
  JUNCTION_BOARDS, MAIN_STREET, POWER_NODE,
} from './akihabara';
import type { AkibaBuilding } from './akihabara';
import {
  CULTURE_GATE, GREEN_TERRACE, GROVE_WALLS, HEDGES, HEDGE_H, RAMP_LANDING, STONE_AXIS, TRELLIS, TRUNK, TRUNK_H, UENO_HALL, UENO_LAMPS, UENO_TREES,
  WALL_H, WEST_RAMP, inUenoZone,
} from './ueno';
import { IKB_BUILDINGS, IKB_DECKS, IKB_LAMPS, IKB_PLANT, IKB_STAIRS, IKB_ZONES, ikbHeight } from './ikebukuro';
import type { IkbBuilding } from './ikebukuro';
import * as SHG from './shinagawa';
import type { ShinagawaBuilding } from './shinagawa';
import * as TTW from './tokyoTower';
import type { TtwStair } from './tokyoTower';

/**
 * v7.5 battlefield: Tokyo inside the JR Yamanote loop, at human scale.
 *
 * Two scales are used on purpose:
 * - Street level is life-size relative to the characters (a character is
 *   ~45 units ≈ 1.7 m, so 1 m ≈ 26 units): storeys, road widths, sidewalks,
 *   poles, vending machines and cars all have their real proportions.
 * - Geography is compressed: stations and landmarks come from real latitude /
 *   longitude at 0.8 units per metre, so the loop keeps its true shape and
 *   everything sits in the right place, but there are fewer blocks between
 *   districts (the real loop would take an hour to cross on foot).
 * Very tall towers are compressed above 100 m (see `realHeight`).
 *
 * The world is built from two kinds of solid primitive:
 * - box:  an axis-aligned block from y0 to y1. Its top is a floor you can stand on.
 * - ramp: a block whose top rises linearly along one axis (stairs and slopes).
 * Everything that walks, sees or aims asks these primitives (sim/systems/world.ts).
 */

export interface Circle extends Point {
  r: number;
}

export type Material =
  | 'stone' | 'plaster' | 'wood' | 'roof' | 'earth' | 'water' | 'hedge'
  | 'concrete' | 'glass' | 'brick' | 'steel' | 'metal' | 'tree'
  | 'bldg' | 'sidewalk' | 'car' | 'vending' | 'pole';

interface PrimBase {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  mat: Material;
  /** Line of sight passes through (water). Default: blocks. */
  seeThrough?: boolean;
  /** The top is not a floor (water, rooftops nobody can reach, cars). Default: walkable. */
  noFloor?: boolean;
  /** Group id for rendering related parts together (e.g. one landmark). */
  group?: string;
}

export interface BoxPrim extends PrimBase {
  kind: 'box';
  y1: number;
}

export interface RampPrim extends PrimBase {
  kind: 'ramp';
  hLow: number;
  hHigh: number;
  axis: 'x' | 'z';
  dir: 1 | -1;
  style: 'stairs' | 'slope';
}

export type Prim = BoxPrim | RampPrim;

// ---------------------------------------------------------------- scales

/** Units per metre at street level (people, storeys, streets, street furniture). */
export const M = 26;
/** Ground-floor height (4.2 m: shops and lobbies) and upper storeys (3.3 m). */
export const GROUND_FLOOR = Math.round(4.2 * M);
export const STOREY = Math.round(3.3 * M);
export const floorsToHeight = (n: number) => GROUND_FLOOR + (n - 1) * STOREY;
/** A real height in metres → game units; towers are compressed above 100 m. */
export function realHeight(m: number): number {
  return Math.round((m <= 100 ? m : 100 + (m - 100) * 0.4) * M);
}
/** Floor of second storeys, roof terraces and footbridge-like decks you can reach (≈3.5 m). */
export const UPPER = 90;
const SLAB = 12;
/** Kerb height of the sidewalks. */
export const CURB = 4;

// ---------------------------------------------------------------- geography

const LAT0 = 35.68, LON0 = 139.74;
/** Geographic units per metre (distances between places are compressed). */
export const MAP_SCALE = 1.0;
const KX = 90_200 * MAP_SCALE; // units per degree of longitude at 35.7°N
const KZ = 111_000 * MAP_SCALE; // units per degree of latitude
/** v7.4 layout coordinates (0.45 units/m) → this map. */
const sc = (v: number) => Math.round((v * MAP_SCALE) / 0.45);
/** Positions laid out at 0.8 units/m → this map. */
const k8 = (v: number) => Math.round((v * MAP_SCALE) / 0.8);

/** Real-world coordinate → game position (x east, z south). */
export function geo(lat: number, lon: number): Point {
  return { x: Math.round((lon - LON0) * KX), z: Math.round(-(lat - LAT0) * KZ) };
}

/** Yamanote line stations, clockwise from Tokyo. */
export const STATIONS: readonly (Point & { name: string })[] = ([
  ['東京', 35.6812, 139.7671], ['有楽町', 35.6750, 139.7630], ['新橋', 35.6663, 139.7583], ['浜松町', 35.6555, 139.7571],
  ['田町', 35.6457, 139.7476], ['高輪ゲートウェイ', 35.6355, 139.7407], ['品川', 35.6285, 139.7388], ['大崎', 35.6197, 139.7286],
  ['五反田', 35.6262, 139.7236], ['目黒', 35.6340, 139.7157], ['恵比寿', 35.6467, 139.7101], ['渋谷', 35.6580, 139.7016],
  ['原宿', 35.6702, 139.7027], ['代々木', 35.6830, 139.7020], ['新宿', 35.6896, 139.7006], ['新大久保', 35.7013, 139.7000],
  ['高田馬場', 35.7126, 139.7038], ['目白', 35.7212, 139.7066], ['池袋', 35.7295, 139.7109], ['大塚', 35.7317, 139.7286],
  ['巣鴨', 35.7334, 139.7393], ['駒込', 35.7365, 139.7470], ['田端', 35.7381, 139.7608], ['西日暮里', 35.7320, 139.7667],
  ['日暮里', 35.7281, 139.7707], ['鶯谷', 35.7210, 139.7780], ['上野', 35.7138, 139.7773], ['御徒町', 35.7075, 139.7746],
  ['秋葉原', 35.6984, 139.7731], ['神田', 35.6918, 139.7709],
] as const).map(([name, lat, lon]) => ({ name, ...geo(lat, lon) }));

/** The track itself (polygon through the stations). Movement stays inside it. */
export const LOOP: readonly Point[] = STATIONS.map(({ x, z }) => ({ x, z }));
/** Width of the railway corridor inside the polygon (half the viaduct + fence). */
export const TRACK_MARGIN = 170;
/** The fence along the tracks: characters cannot get closer to the track line than this. */
export const WALK_EDGE = 150;
/** Viaduct deck height and width (≈7.5 m high, double track). */
export const VIADUCT = { h: 200, w: 260 };

function segDist(px: number, pz: number, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

function insidePolygon(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = LOOP.length - 1; i < LOOP.length; j = i++) {
    const a = LOOP[i], b = LOOP[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance to the tracks, positive inside the loop and negative outside. */
export function loopSignedDist(x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < LOOP.length; i++) d = Math.min(d, segDist(x, z, LOOP[i], LOOP[(i + 1) % LOOP.length]));
  return insidePolygon(x, z) ? d : -d;
}

/**
 * Signed distance to the tracks sampled on a coarse grid (inside > 0), so the
 * common case (far from the edge) needs no polygon test. Cell centres are at
 * most LOOP_SLACK from any point in the cell.
 */
const LOOP_CELL = 40, LOOP_SLACK = 29; // slack ≥ half the cell diagonal (28.3)
const LX0 = Math.min(...LOOP.map((p) => p.x)) - LOOP_CELL, LZ0 = Math.min(...LOOP.map((p) => p.z)) - LOOP_CELL;
const LCOLS = Math.ceil((Math.max(...LOOP.map((p) => p.x)) - LX0) / LOOP_CELL) + 2;
const LROWS = Math.ceil((Math.max(...LOOP.map((p) => p.z)) - LZ0) / LOOP_CELL) + 2;
const loopDist = new Float32Array(LCOLS * LROWS);
for (let r = 0; r < LROWS; r++) {
  for (let c = 0; c < LCOLS; c++) loopDist[r * LCOLS + c] = loopSignedDist(LX0 + (c + 0.5) * LOOP_CELL, LZ0 + (r + 0.5) * LOOP_CELL);
}

/** Inside the Yamanote loop and at least `margin` from the tracks. */
export function insideLoop(x: number, z: number, margin = TRACK_MARGIN): boolean {
  const c = Math.floor((x - LX0) / LOOP_CELL), r = Math.floor((z - LZ0) / LOOP_CELL);
  if (c < 0 || r < 0 || c >= LCOLS || r >= LROWS) return false;
  const d = loopDist[r * LCOLS + c];
  if (d - LOOP_SLACK >= margin) return true;
  if (d + LOOP_SLACK < margin) return false;
  return loopSignedDist(x, z) >= margin;
}

const xs = LOOP.map((p) => p.x), zs = LOOP.map((p) => p.z);
/** Bounding box of the loop (the nav grid and minimap cover this). */
export const BOUNDS = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
/** Ground and city: the loop plus the city beyond the tracks (visual only). */
export const GROUND = { w: BOUNDS.maxX - BOUNDS.minX + 4000, d: BOUNDS.maxZ - BOUNDS.minZ + 4000, cx: (BOUNDS.minX + BOUNDS.maxX) / 2, cz: (BOUNDS.minZ + BOUNDS.maxZ) / 2 };

// ---------------------------------------------------------------- key places

/** 管制塔: a radio mast in 日比谷公園, the point about equally far from all three bases. */
export const TOWER: Circle = { ...geo(35.6736, 139.7564), r: 80 };
/** 日比谷公園 around the mast. */
export const PLAZA: Circle = { ...TOWER, r: 300 };
/** 皇居 (Imperial Palace) island inside its moat; the stone walls are 4 m high. */
export const PALACE = { x: sc(480), z: sc(-300), w: 600, d: 760, moat: 100, top: 110 };
/** 皇居前広場: the big open gravel plaza between the moat and Tokyo Station. */
export const PALACE_PLAZA = { x: PALACE.x + PALACE.w / 2 + PALACE.moat + 230, z: PALACE.z + 60, w: 380, d: 700 };

const prims: Prim[] = [];
const box = (x: number, z: number, w: number, d: number, y1: number, mat: Material, extra: Partial<BoxPrim> = {}) =>
  prims.push({ kind: 'box', x, z, w, d, y0: 0, y1, mat, ...extra });
const ramp = (
  x: number, z: number, w: number, d: number, axis: 'x' | 'z', dir: 1 | -1, hLow: number, hHigh: number,
  style: 'stairs' | 'slope', mat: Material = style === 'stairs' ? 'wood' : 'earth', group?: string,
) => prims.push({ kind: 'ramp', x, z, w, d, y0: 0, axis, dir, hLow, hHigh, style, mat, group });
const slab = (x: number, z: number, w: number, d: number, top: number, mat: Material, group?: string) =>
  box(x, z, w, d, top, mat, { y0: top - SLAB, group });
const water = (x: number, z: number, w: number, d: number, group: string) =>
  prims.push({ kind: 'box', x, z, w, d, y0: -20, y1: 16, mat: 'water', seeThrough: true, noFloor: true, group });
/** A tree: trunk as the solid, the crown is drawn by the renderer (height = crown top). */
const tree = (x: number, z: number, h = 240) => box(x, z, 12, 12, h, 'tree', { noFloor: true });

/** Areas the city filler must leave open (landmarks, parks, water, bases, bridges). */
interface Rect { x0: number; z0: number; x1: number; z1: number }
const keepOut: Rect[] = [];
const reserve = (x: number, z: number, w: number, d: number, pad = 40) =>
  keepOut.push({ x0: x - w / 2 - pad, z0: z - d / 2 - pad, x1: x + w / 2 + pad, z1: z + d / 2 + pad });
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const reserved = (r: Rect) => keepOut.some((k) => overlaps(k, r));

type Side = 'n' | 's' | 'e' | 'w';

/**
 * A walled building. Ground-floor walls stop under the upper slab; doors are
 * full-height gaps. `upper` adds a walkable second floor / roof terrace with
 * parapets. `hole` leaves a stairwell open. `floorY` is the upper floor height.
 */
function building(
  id: string, cx: number, cz: number, w: number, d: number,
  doors: { side: Side; at: number; width: number }[],
  upper: { hole?: { x0: number; x1: number; z0: number; z1: number } } | null,
  mat: Material = 'plaster', floorY = UPPER,
): void {
  const T = 14, H = floorY - SLAB;
  const wallSide = (side: Side, y0: number, y1: number, gaps: { at: number; width: number }[]) => {
    const horizontal = side === 'n' || side === 's';
    const len = horizontal ? w : d;
    const fixed = side === 'n' ? cz - d / 2 + T / 2 : side === 's' ? cz + d / 2 - T / 2 : side === 'w' ? cx - w / 2 + T / 2 : cx + w / 2 - T / 2;
    const start = horizontal ? cx - w / 2 : cz - d / 2;
    const cuts = gaps.map((g) => [g.at - g.width / 2, g.at + g.width / 2]).sort((a, b) => a[0] - b[0]);
    let a = start;
    for (const [g0, g1] of [...cuts.map(([p, q]) => [start + len / 2 + p, start + len / 2 + q]), [start + len, start + len]]) {
      if (g0 - a > 1) {
        const mid = (a + g0) / 2, span = g0 - a;
        if (horizontal) box(mid, fixed, span, T, y1, mat, { y0, group: id });
        else box(fixed, mid, T, span, y1, mat, { y0, group: id });
      }
      a = Math.max(a, g1);
    }
  };
  for (const side of ['n', 's', 'e', 'w'] as Side[]) wallSide(side, 0, H, doors.filter((dr) => dr.side === side));
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const h = upper?.hole;
  if (!h) slab(cx, cz, w, d, floorY, 'concrete', id);
  else {
    const rect = (ax: number, bx: number, az: number, bz: number) => {
      if (bx - ax > 1 && bz - az > 1) slab((ax + bx) / 2, (az + bz) / 2, bx - ax, bz - az, floorY, 'concrete', id);
    };
    rect(x0, x1, z0, h.z0);
    rect(x0, x1, h.z1, z1);
    rect(x0, h.x0, h.z0, h.z1);
    rect(h.x1, x1, h.z0, h.z1);
  }
  if (upper) for (const side of ['n', 's', 'e', 'w'] as Side[]) wallSide(side, floorY, floorY + 30, []);
  reserve(cx, cz, w, d, 60);
}

/**
 * Two-storey 雑居ビル with an interior staircase climbing west → east to a
 * roof terrace. Returns the stair foot, the terrace and a ground-floor spot.
 */
function walkUp(id: string, cx: number, cz: number, mat: Material = 'concrete', extraDoors: { side: Side; at: number; width: number }[] = []) {
  const w = 360, d = 260;
  building(id, cx, cz, w, d,
    [{ side: 's', at: 60, width: 110 }, { side: 'e', at: 40, width: 110 }, { side: 'w', at: 30, width: 100 }, ...extraDoors],
    { hole: { x0: cx - 180, x1: cx + 120, z0: cz - 130, z1: cz - 30 } }, mat);
  // A landing at the foot (west) and the terrace at the top (east).
  ramp(cx, cz - 80, 240, 100, 'x', 1, 0, UPPER, 'stairs', 'wood', id);
  return { stairsFoot: { x: cx - 112, z: cz - 80 }, terrace: { x: cx + 145, z: cz - 80 }, underFloor: { x: cx + 60, z: cz + 70 } };
}

// ---------------------------------------------------------------- 皇居 (Imperial Palace)
{
  const P = PALACE, m = P.moat;
  // Stone-walled island with gardens; its top is a walkable plateau.
  box(P.x, P.z, P.w, P.d, P.top, 'earth', { group: 'palace' });
  const ox0 = P.x - P.w / 2 - m, ox1 = P.x + P.w / 2 + m, oz0 = P.z - P.d / 2 - m, oz1 = P.z + P.d / 2 + m;
  water(P.x, oz0 + m / 2, P.w + 2 * m, m, 'moat');
  water(P.x, oz1 - m / 2, P.w + 2 * m, m, 'moat');
  water(ox0 + m / 2, P.z, m, P.d, 'moat');
  water(ox1 - m / 2, P.z, m, P.d, 'moat');
  // Gates: 大手門 (east), 桜田門 (south), 北桔橋門 (north) — stone ramps over the moat onto the walls.
  const L = m + 220;
  ramp(ox1 - m + L / 2, P.z - 160, L, 110, 'x', -1, 0, P.top, 'slope', 'stone', 'palace');
  ramp(P.x + 90, oz1 - m + L / 2, 110, L, 'z', -1, 0, P.top, 'slope', 'stone', 'palace');
  ramp(P.x - 120, oz0 + m - L / 2, 110, L, 'z', 1, 0, P.top, 'slope', 'stone', 'palace');
  // 宮殿 (low palace hall) and the 天守台 (keep base), reached by stone stairs.
  box(P.x - 40, P.z + 140, 360, 150, P.top + 190, 'plaster', { y0: P.top, group: 'palaceHall' });
  box(P.x - 80, P.z - 250, 200, 150, P.top + 90, 'stone', { y0: P.top, group: 'keep' });
  ramp(P.x - 80, P.z - 250 + 75 + 110, 100, 220, 'z', -1, P.top, P.top + 90, 'stairs', 'stone', 'keep');
  for (const [tx, tz] of [[140, -80], [170, 300], [-220, -30], [60, -330], [-230, 300], [200, 60]]) tree(P.x + tx, P.z + tz, P.top + 280);
  reserve(P.x, P.z, P.w + 2 * m, P.d + 2 * m, 30);
  reserve(P.x, oz0 - L / 2 + m, 110, L, 30);
  reserve(P.x + 90, oz1 + L / 2 - m, 110, L, 30);
  reserve(PALACE_PLAZA.x, PALACE_PLAZA.z, PALACE_PLAZA.w, PALACE_PLAZA.d, 0);
  // Black pines on the plaza lawns.
  for (let i = 0; i < 6; i++) tree(PALACE_PLAZA.x + (i % 2 ? 150 : -150), PALACE_PLAZA.z - 280 + i * 110, 200);
}

// ---------------------------------------------------------------- landmarks

/** 東京駅 丸の内駅舎: long red-brick station building with two domes. */
const TOKYO_ST = { x: STATIONS[0].x - 180, z: STATIONS[0].z - 60, w: 150, d: 900, h: 260 };
box(TOKYO_ST.x, TOKYO_ST.z, TOKYO_ST.w, TOKYO_ST.d, TOKYO_ST.h, 'brick', { group: 'tokyoStation' });
reserve(TOKYO_ST.x, TOKYO_ST.z, TOKYO_ST.w, TOKYO_ST.d, 40);
/** 丸の内 / 大手町 office towers (about 200 m). The northern one stands clear of 聖橋's south ramp. */
for (const [x, z, h] of [[k8(1600), k8(-1100), 200], [k8(1880), k8(-1300), 180], [k8(1480), k8(-1450), 160]] as const) {
  box(x, z, 330, 330, realHeight(h), 'glass', { group: 'tower' });
  reserve(x, z, 330, 330, 20);
}
/** 国会議事堂: wide granite building with its central stepped tower (65 m). */
const DIET = { ...geo(35.6759, 139.7449), w: 560, d: 200, h: 520 };
{
  box(DIET.x, DIET.z, DIET.w, DIET.d, DIET.h, 'stone', { group: 'diet' });
  box(DIET.x, DIET.z, 160, 160, realHeight(55), 'stone', { y0: DIET.h, group: 'dietTower' });
  reserve(DIET.x, DIET.z, 620, 560, 0);
}
/** 霞が関 ministries. */
for (const z of [k8(488), k8(693)]) {
  box(k8(770), z, 200, 180, realHeight(40), 'concrete', { group: 'office' });
  reserve(k8(770), z, 200, 180, 20);
}
/** 日比谷公園 with the radio mast (管制塔) in the middle. */
export const MAST_H = 600;
box(TOWER.x, TOWER.z, 60, 60, MAST_H, 'steel', { group: 'radioTower' });
reserve(TOWER.x, TOWER.z, PLAZA.r * 2, PLAZA.r * 2, 20);
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2 + 0.3, r = PLAZA.r - 50;
  tree(TOWER.x + Math.cos(a) * r, TOWER.z + Math.sin(a) * r, 230 + (i % 3) * 40);
}

/** 東京タワー: four legs over the FootTown building, whose roof terrace is reached by an outdoor stair. */
const TOKYO_TOWER = geo(35.6586, 139.7454);
export const TOKYO_TOWER_H = realHeight(333);
const FOOTTOWN = { w: 300, d: 260, h: 180 };
{
  const t = TOKYO_TOWER, F = FOOTTOWN;
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(t.x + ox * 200, t.z + oz * 200, 50, 50, 1100, 'steel', { group: 'tokyoTowerLeg' });
  box(t.x, t.z, F.w, F.d, F.h, 'concrete', { group: 'footTown' });
  // Terrace parapets; the south one has a gap where the stair arrives.
  box(t.x, t.z - F.d / 2 + 5, F.w, 10, F.h + 30, 'metal', { y0: F.h });
  box(t.x - F.w / 2 + 5, t.z, 10, F.d, F.h + 30, 'metal', { y0: F.h });
  box(t.x + F.w / 2 + -5, t.z, 10, F.d, F.h + 30, 'metal', { y0: F.h });
  box(t.x - 95, t.z + F.d / 2 - 5, 110, 10, F.h + 30, 'metal', { y0: F.h });
  box(t.x + 95, t.z + F.d / 2 - 5, 110, 10, F.h + 30, 'metal', { y0: F.h });
  ramp(t.x, t.z + F.d / 2 + 180, 70, 360, 'z', -1, 0, F.h, 'stairs', 'metal', 'tokyoTower');
  // The tower above the legs (unreachable; the renderer draws the lattice).
  box(t.x, t.z, 90, 90, TOKYO_TOWER_H, 'steel', { y0: 700, group: 'tokyoTowerSpire' });
  reserve(t.x, t.z + 170, 560, 820, 40);
}
/** 増上寺 (temple east of Tokyo Tower). */
box(TOKYO_TOWER.x + 520, TOKYO_TOWER.z + 60, 360, 260, 340, 'wood', { group: 'temple' });
reserve(TOKYO_TOWER.x + 520, TOKYO_TOWER.z + 60, 360, 260, 40);
/** 愛宕山: a real hill with the steep 出世の石段 on its east side and a slope on the west. */
const ATAGO = { ...geo(35.6645, 139.7493), w: 520, d: 440, top: 130 };
{
  const A = ATAGO;
  box(A.x, A.z, A.w, A.d, A.top, 'earth', { group: 'hill' });
  ramp(A.x + A.w / 2 + 110, A.z, 220, 100, 'x', -1, 0, A.top, 'stairs', 'stone', 'hill');
  ramp(A.x - A.w / 2 - 240, A.z + 60, 480, 160, 'x', 1, 0, A.top, 'slope', 'earth', 'hill');
  tree(A.x - 120, A.z - 120, A.top + 260);
  tree(A.x + 140, A.z + 130, A.top + 240);
  tree(A.x + 150, A.z - 140, A.top + 220);
  reserve(A.x - 130, A.z, A.w + 720, A.d, 40);
}
/** 六本木ヒルズ 森タワー and 東京ミッドタウン. */
for (const [lat, lon, h, sz] of [[35.6604, 139.7292, 238, 420], [35.6655, 139.7310, 248, 380]] as const) {
  const p = geo(lat, lon);
  box(p.x, p.z, sz, sz, realHeight(h), 'glass', { group: 'tower' });
  reserve(p.x, p.z, sz + 120, sz + 120, 20);
}
/** 迎賓館 (State Guest House). */
{
  const p = geo(35.6803, 139.7286);
  box(p.x, p.z, 600, 220, 420, 'stone', { group: 'palaceHall' });
  reserve(p.x, p.z + 120, 700, 480, 20);
}
/** 国立競技場: stands you can climb (stairs from the field) around the pitch. */
const STADIUM = { ...geo(35.6778, 139.7145), W: 1000, D: 850, T: 160, H: 260 };
{
  const s = { ...STADIUM, z: STADIUM.z + 60 }, { W, D, T, H } = s;
  box(s.x, s.z - D / 2 + T / 2, W, T, H, 'wood', { group: 'stadium' }); // north stand
  box(s.x - W / 2 + T / 2, s.z, T, D - 2 * T, H, 'wood', { group: 'stadium' });
  box(s.x + W / 2 - T / 2, s.z, T, D - 2 * T, H, 'wood', { group: 'stadium' });
  // South stand split by the main gate.
  box(s.x - 290, s.z + D / 2 - T / 2, W / 2 - 80, T, H, 'wood', { group: 'stadium' });
  box(s.x + 290, s.z + D / 2 - T / 2, W / 2 - 80, T, H, 'wood', { group: 'stadium' });
  ramp(s.x - 150, s.z - D / 2 + T + 260, 100, 520, 'z', -1, 0, H, 'stairs', 'concrete', 'stadium');
  reserve(s.x, s.z, W, D, 40);
}
/** 新宿御苑: lawns, a pond and trees. */
const GYOEN = { ...geo(35.6852, 139.7101), z: geo(35.6852, 139.7101).z + k8(82), w: 600, d: 360 };
{
  water(GYOEN.x + 80, GYOEN.z + 20, 260, 120, 'pond');
  for (let i = 0; i < 8; i++) tree(GYOEN.x - 250 + (i % 4) * 90 + (i > 3 ? 360 : 0), GYOEN.z - 130 + (i % 2) * 250, 220 + (i % 3) * 50);
  reserve(GYOEN.x, GYOEN.z, GYOEN.w, GYOEN.d, 20);
}
/** 渋谷ヒカリエ, 恵比寿ガーデンプレイス and 池袋サンシャイン60. */
for (const [x, z, h, sz] of [[k8(-2300), k8(1850), 183, 300], [geo(35.6425, 139.7137).x, geo(35.6425, 139.7137).z, 167, 300], [k8(-1523), k8(-4160), 240, 360]] as const) {
  box(x, z, sz, sz, realHeight(h), 'glass', { group: 'tower' });
  reserve(x, z, sz + 80, sz + 80, 20);
}
/** 東京ドーム. */
const DOME = { ...geo(35.7056, 139.7519), z: k8(-2450), r: 320 };
box(DOME.x, DOME.z, 2 * DOME.r, 2 * DOME.r, 300, 'concrete', { group: 'dome' });
reserve(DOME.x, DOME.z, 2 * DOME.r, 2 * DOME.r, 40);
/** 六義園 (garden with a pond). */
const RIKUGIEN = { ...geo(35.7321, 139.7465), z: k8(-4550) };
{
  water(RIKUGIEN.x, RIKUGIEN.z, 260, 150, 'pond');
  for (let i = 0; i < 6; i++) tree(RIKUGIEN.x - 220 + i * 90, RIKUGIEN.z + (i % 2 ? 150 : -150), 230);
  reserve(RIKUGIEN.x, RIKUGIEN.z, 520, 400, 20);
}

// ---------------------------------------------------------------- 上野 (moon base area)
/** 上野の山 (Ueno hill, park on top): plateau with a slope from the west and stone stairs from the south. */
export const UENO_HILL = { x: k8(2200), z: k8(-3271), w: 560, d: 560, top: 130 };
const UENO_SLOPE = { x: UENO_HILL.x - UENO_HILL.w / 2 - 210, z: UENO_HILL.z + 120, len: 420 };
const UENO_STAIRS = { x: UENO_HILL.x + 150, z: UENO_HILL.z + UENO_HILL.d / 2 + 110, len: 220 };
{
  const h = UENO_HILL;
  box(h.x, h.z, h.w, h.d, h.top, 'earth', { group: 'hill' });
  ramp(UENO_SLOPE.x, UENO_SLOPE.z, UENO_SLOPE.len, 200, 'x', 1, 0, h.top, 'slope', 'earth', 'hill');
  ramp(UENO_STAIRS.x, UENO_STAIRS.z, 120, UENO_STAIRS.len, 'z', -1, 0, h.top, 'stairs', 'stone', 'hill');
  box(h.x - 80, h.z - 150, 340, 150, h.top + 300, 'stone', { y0: h.top, group: 'museum' }); // 国立博物館
  for (const [tx, tz] of [[-200, 60], [-40, 120], [120, -40], [200, 180], [-160, 210]]) tree(h.x + tx, h.z + tz, h.top + 250);
  reserve(h.x, h.z, h.w, h.d, 30);
  reserve(UENO_SLOPE.x, UENO_SLOPE.z, UENO_SLOPE.len, 200, 60);
  reserve(UENO_STAIRS.x, UENO_STAIRS.z, 120, UENO_STAIRS.len, 60);
  water(k8(1700), k8(-2750), 460, 340, 'pond'); // 不忍池
  reserve(k8(1700), k8(-2750), 460, 340, 60);
}

// ---------------------------------------------------------------- 神田川 (Kanda River) and its bridges
/** River course (x, z) from 高田馬場 to 秋葉原. */
export const KANDA: readonly Point[] = [
  geo(35.7126, 139.7038), geo(35.7101, 139.7215), geo(35.7075, 139.7327), geo(35.7021, 139.7450),
  geo(35.7020, 139.7535), geo(35.6997, 139.7650), geo(35.6986, 139.7728),
];
export const RIVER_WIDTH = 150;
/** Bridges: 高田橋, 早稲田, 江戸川橋, 飯田橋, 水道橋, 聖橋 (arched), 万世橋. */
const BRIDGE_X = [-1330, -760, -300, 180, 560, 1000, 1290].map(sc);
const HIJIRI = BRIDGE_X[5];
/** Centres of the bridges actually built over the Kanda (inside the loop), for tests and tools. */
export const BRIDGES: Point[] = [];
/** Points on the south and north banks straight across the river from each other at x (just off a bridge's ends). */
export const riverBanks = (x: number): [number, number] => [riverZAt(x) + 250, riverZAt(x) - 250];
const riverZAt = (x: number) => {
  for (let i = 0; i < KANDA.length - 1; i++) {
    const a = KANDA[i], b = KANDA[i + 1];
    if (x >= a.x && x <= b.x) return a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x);
  }
  return KANDA[KANDA.length - 1].z;
};
{
  // Collision: overlapping square water tiles along the course (the renderer draws a smooth strip).
  for (let i = 0; i < KANDA.length - 1; i++) {
    const a = KANDA[i], b = KANDA[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 60);
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
      if (!insideLoop(x, z, 0)) continue;
      water(x, z, RIVER_WIDTH, RIVER_WIDTH, 'river');
      keepOut.push({ x0: x - 135, z0: z - 135, x1: x + 135, z1: z + 135 });
    }
  }
  for (const bx of BRIDGE_X) {
    const z = riverZAt(bx);
    if (!insideLoop(bx, z - 260, 60) || !insideLoop(bx, z + 260, 60)) continue;
    reserve(bx, z, 260, 520, 60); // clear approaches on both banks
    BRIDGES.push({ x: bx, z });
    if (bx === HIJIRI) {
      // 聖橋: arched stone bridge.
      ramp(bx, z - 200, 240, 200, 'z', 1, 0, 60, 'slope', 'stone', 'bridge');
      box(bx, z, 240, 200, 60, 'stone', { y0: 40, group: 'bridge' });
      ramp(bx, z + 200, 240, 200, 'z', -1, 0, 60, 'slope', 'stone', 'bridge');
    } else {
      const L = RIVER_WIDTH + 200;
      box(bx, z, 260, L, 8, 'stone', { group: 'bridge' });
      box(bx - 125, z, 10, L, 38, 'stone', { y0: 8, group: 'bridge' }); // railings
      box(bx + 125, z, 10, L, 38, 'stone', { y0: 8, group: 'bridge' });
    }
  }
}

// ---------------------------------------------------------------- 首都高 (elevated expressways: high routes)
/** Deck height of the Shuto expressway (≈11 m). */
export const EXPRESSWAY_H = 280;
const EXPRESSWAY_W = 300, EXPRESSWAY_RAMP = 1000;
const noFootbridge: Rect[] = [];
/** A walkable elevated deck on pillars with an on-ramp at each end and parapets. */
function expressway(axis: 'x' | 'z', fixed: number, from: number, to: number): void {
  const top = EXPRESSWAY_H, W = EXPRESSWAY_W, R = EXPRESSWAY_RAMP, len = to - from, mid = (from + to) / 2;
  const at = (along: number, across: number, a: number, b: number) => (axis === 'z' ? { x: across, z: along, w: b, d: a } : { x: along, z: across, w: a, d: b });
  const put = (along: number, across: number, a: number, b: number, y1: number, mat: Material, y0 = 0) => {
    const r = at(along, across, a, b);
    box(r.x, r.z, r.w, r.d, y1, mat, { y0, group: 'expressway' });
  };
  put(mid, fixed, len, W, top, 'concrete', top - SLAB * 2);
  put(mid, fixed - W / 2 + 6, len, 12, top + 36, 'concrete', top);
  put(mid, fixed + W / 2 - 6, len, 12, top + 36, 'concrete', top);
  for (let p = from + 60; p < to - 30; p += 700) put(p, fixed, 70, 90, top - SLAB * 2, 'concrete');
  const r1 = at(from - R / 2, fixed, R, W), r2 = at(to + R / 2, fixed, R, W);
  const all = at(mid, fixed, len + 2 * R, W + 200);
  noFootbridge.push({ x0: all.x - all.w / 2, x1: all.x + all.w / 2, z0: all.z - all.d / 2, z1: all.z + all.d / 2 });
  ramp(r1.x, r1.z, r1.w, r1.d, axis, 1, 0, top, 'slope', 'concrete', 'expressway');
  ramp(r2.x, r2.z, r2.w, r2.d, axis, -1, 0, top, 'slope', 'concrete', 'expressway');
}
const EXPRESS_C = { x: sc(-150), from: sc(-260), to: sc(640) };
expressway('z', EXPRESS_C.x, EXPRESS_C.from, EXPRESS_C.to); // 都心環状線 (赤坂〜霞が関)
const EXPRESS_5 = { z: sc(-2170), from: sc(-760), to: sc(60) };
expressway('x', EXPRESS_5.z, EXPRESS_5.from, EXPRESS_5.to); // 5号線 (池袋)

// ---------------------------------------------------------------- walk-up buildings (2F / rooftop) and the arcade
/** 歌舞伎町 雑居ビル and a 高輪 office with roof terraces. */
// (v10.1: a back door on the north side, so the Shinjuku walk-up is a way through, not a dead end.)
const WALKUP_KABUKI = walkUp('walkupK', sc(-1260), sc(-960), 'concrete', [{ side: 'n', at: 140, width: 60 }]);
walkUp('walkupT', sc(-40), sc(1960));
/** アメ横 style arcade you can walk straight through (west / east doors, 7 m roof). */
export const ARCADE = { x: k8(1600), z: k8(-2350), w: 700, d: 220 };
building('arcade', ARCADE.x, ARCADE.z, ARCADE.w, ARCADE.d, [{ side: 'w', at: 0, width: 140 }, { side: 'e', at: 0, width: 140 }], null, 'brick', 190);

// ---------------------------------------------------------------- avenues
/**
 * Width of the main avenues (4 lanes + sidewalks, ≈15 m). Avenues are the wide
 * lines of the street grid, placed near the real ones (明治通り, 外堀通り under
 * the 都心環状線, 春日通り under the 5号線, 靖国通り, 青山通り, 目黒通り).
 */
export const AVENUE_W = 380;
const AVENUES_X = [-2700, EXPRESS_C.x];
const AVENUES_Z = [EXPRESS_5.z, -1350, 1000, 3700];

// ---------------------------------------------------------------- nation bases and jails (reserved here; defined in nations.ts)
/** Base centres (must match config/nations.ts). */
export const BASE_SITES = {
  sun: geo(35.6905, 139.7050), // 新宿三丁目
  moon: geo(35.7075, 139.7710), // 上野広小路
  star: geo(35.6340, 139.7330), // 高輪
};
export const JAIL_SITES = {
  sun: { x: BASE_SITES.sun.x + 20, z: BASE_SITES.sun.z - 420 },
  moon: { x: BASE_SITES.moon.x - 250, z: BASE_SITES.moon.z + 380 },
  star: { x: BASE_SITES.star.x, z: BASE_SITES.star.z + 380 },
};
for (const k of ['sun', 'moon', 'star'] as const) {
  reserve(BASE_SITES[k].x, BASE_SITES[k].z, 500, 500, 0);
  reserve(JAIL_SITES[k].x, JAIL_SITES[k].z, 240, 60, 90);
}

// ---------------------------------------------------------------- the city
/** Deterministic PRNG so the city is the same every load. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type District = 'commercial' | 'business' | 'residential' | 'mixed';
const DISTRICTS: { p: Point; r: number; kind: District }[] = [
  { p: geo(35.6915, 139.7060), r: 1500, kind: 'commercial' }, // 新宿三丁目・歌舞伎町
  { p: geo(35.6600, 139.7075), r: 1100, kind: 'commercial' }, // 渋谷
  { p: geo(35.7285, 139.7170), r: 1300, kind: 'commercial' }, // 池袋
  { p: geo(35.6995, 139.7690), r: 900, kind: 'commercial' }, // 秋葉原
  { p: geo(35.7080, 139.7715), r: 900, kind: 'commercial' }, // 上野・御徒町
  { p: geo(35.6670, 139.7545), r: 800, kind: 'commercial' }, // 新橋
  { p: geo(35.7010, 139.7580), r: 700, kind: 'commercial' }, // 神保町・水道橋
  { p: geo(35.7095, 139.7050), r: 700, kind: 'commercial' }, // 高田馬場
  { p: geo(35.6850, 139.7630), r: 1000, kind: 'business' }, // 丸の内・大手町
  { p: geo(35.6700, 139.7480), r: 800, kind: 'business' }, // 霞が関・虎ノ門
  { p: geo(35.6625, 139.7320), r: 900, kind: 'business' }, // 六本木
  { p: geo(35.6320, 139.7380), r: 800, kind: 'business' }, // 品川・高輪ゲートウェイ
  { p: geo(35.6450, 139.7160), r: 600, kind: 'business' }, // 恵比寿
  { p: geo(35.7200, 139.7500), r: 1100, kind: 'residential' }, // 文京
  { p: geo(35.7180, 139.7200), r: 800, kind: 'residential' }, // 目白・雑司が谷
  { p: geo(35.6450, 139.7280), r: 900, kind: 'residential' }, // 白金・高輪
  { p: geo(35.6870, 139.7250), r: 600, kind: 'residential' }, // 四谷・信濃町
];
function districtAt(x: number, z: number, rnd: () => number): District {
  let best: District | null = null, bd = Infinity;
  for (const d of DISTRICTS) {
    const k = Math.hypot(x - d.p.x, z - d.p.z) / d.r;
    if (k < 1 && k < bd) { bd = k; best = d.kind; }
  }
  return best ?? (rnd() < 0.5 ? 'residential' : 'mixed');
}

export type StreetKind = 'avenue' | 'street' | 'alley';
/** A straight street running the whole city: `c` is its centre line (x for north–south, z for east–west). */
export interface StreetLine { c: number; w: number; kind: StreetKind }
/** 2-lane street with sidewalks (≈9 m) and a lane without (≈4.6 m). */
export const STREET_W = 240, ALLEY_W = 120;
const SIDEWALK: Record<StreetKind, number> = { avenue: 90, street: 70, alley: 22 };

/**
 * Street lines across [min, max]: the avenues at fixed positions, and between
 * them blocks of 16–28 m separated by 2-lane streets and narrow lanes.
 */
function streetLines(min: number, max: number, avenues: number[], rnd: () => number): StreetLine[] {
  const out: StreetLine[] = [];
  const fixed = [{ c: min, w: 0 }, ...avenues.map((c) => ({ c, w: AVENUE_W })), { c: max, w: 0 }];
  let n = 0;
  for (let k = 0; k < fixed.length - 1; k++) {
    const a = fixed[k], b = fixed[k + 1];
    if (a.w) out.push({ c: a.c, w: a.w, kind: 'avenue' });
    const start = a.c + a.w / 2, end = b.c - b.w / 2, span = end - start;
    const blocks = Math.max(1, Math.round(span / 720));
    const inner: StreetLine[] = [];
    for (let i = 1; i < blocks; i++) {
      const kind: StreetKind = n++ % 3 === 0 ? 'street' : 'alley';
      inner.push({ c: 0, w: kind === 'street' ? STREET_W : ALLEY_W, kind });
    }
    const sizes = Array.from({ length: blocks }, () => 0.8 + rnd() * 0.4);
    const total = sizes.reduce((q, v) => q + v, 0), free = span - inner.reduce((q, l) => q + l.w, 0);
    let pos = start;
    for (let i = 0; i < inner.length; i++) {
      pos += (sizes[i] / total) * free;
      inner[i].c = pos + inner[i].w / 2;
      pos += inner[i].w;
      out.push(inner[i]);
    }
  }
  return out;
}

export type BuildingType = 'house' | 'apartment' | 'mixed' | 'shop' | 'office' | 'tower';
export interface Building {
  x: number; z: number; w: number; d: number; h: number;
  type: BuildingType;
  floors: number;
  district: District;
  /** Side facing the street (shopfronts, signs, entrances). */
  front: Side;
  seed: number;
  /** Beyond the tracks: scenery only. */
  outside: boolean;
  /** Drawn by its district's own renderer (v10: the rebuilt centres of Shibuya, Shinjuku and Akihabara), not the generic city. */
  custom?: 'shibuya' | 'shinjuku' | 'akihabara' | 'shinagawa';
}
export interface StreetSeg { x: number; z: number; w: number; d: number; axis: 'x' | 'z'; kind: StreetKind }
export interface Block { x0: number; z0: number; x1: number; z1: number; sides: Record<Side, StreetKind> }

export const BUILDINGS: Building[] = [];
export const BLOCKS: Block[] = [];
/** Street pieces between intersections, and the intersections themselves (inside or outside the loop). */
export const STREET_SEGS: StreetSeg[] = [];
export const INTERSECTIONS: { x: number; z: number; w: number; d: number; streets: number }[] = [];
export const PARKINGS: { x: number; z: number; w: number; d: number; axis: 'x' | 'z' }[] = [];
/** Utility poles (電柱) and the wires between them, street lights and traffic signals. */
export const POLES: Point[] = [];
export const WIRES: [number, number][] = [];
/** Street lights; `wall` lamps hang on a façade (no pole). */
export const LIGHTS: (Point & { ang: number; wall?: boolean })[] = [];
export const SIGNALS: (Point & { ang: number })[] = [];
/** Zebra crossings: rectangles striped across `axis` (the direction people walk). */
export const CROSSWALKS: { x: number; z: number; w: number; d: number; axis: 'x' | 'z' }[] = [];
/** Pedestrian footbridges (歩道橋): deck centre and span. */
export const FOOTBRIDGES: { x: number; z: number; span: number; alongZ: boolean }[] = [];
export const FOOTBRIDGE_H = 130;

const G0 = { x: GROUND.cx - GROUND.w / 2, z: GROUND.cz - GROUND.d / 2 };
const rndCity = prng(20252);
/** North–south streets (constant x) and east–west streets (constant z). */
export const GRID = { xs: streetLines(G0.x, G0.x + GROUND.w, AVENUES_X, rndCity), zs: streetLines(G0.z, G0.z + GROUND.d, AVENUES_Z, rndCity) };

/** Pieces of street free of landmarks (and inside the city ground). */
const streetFree = (r: Rect) => !reserved(r);

/** Footprints street furniture must avoid (footbridge stairs, crossings). */
const furnitureOut: Rect[] = [];

// Pedestrian footbridges (歩道橋) over the avenues near busy places.
{
  const targets = [geo(35.6925, 139.7040), geo(35.6605, 139.7045), geo(35.7285, 139.7140), geo(35.6995, 139.7700), geo(35.6660, 139.7565), geo(35.6620, 139.7330), geo(35.7050, 139.7300)];
  const cands: { c: number; w: number; t: number; alongZ: boolean }[] = [];
  const scan = (lines: StreetLine[], cross: StreetLine[], alongZ: boolean) => {
    for (const L of lines) {
      if (L.kind !== 'avenue') continue;
      for (let j = 0; j < cross.length - 1; j++) {
        const a = cross[j].c + cross[j].w / 2, b = cross[j + 1].c - cross[j + 1].w / 2;
        if (b - a >= 420) cands.push({ c: L.c, w: L.w, t: a + 60, alongZ });
      }
    }
  };
  scan(GRID.xs, GRID.zs, true);
  scan(GRID.zs, GRID.xs, false);
  const used: Point[] = [];
  for (const tg of targets) {
    let best: (typeof cands)[number] | null = null, bd = 1200;
    for (const q of cands) {
      const p = q.alongZ ? { x: q.c, z: q.t } : { x: q.t, z: q.c };
      const r = q.alongZ ? { x0: q.c - q.w / 2 - 100, x1: q.c + q.w / 2 + 100, z0: q.t - 50, z1: q.t + 320 } : { x0: q.t - 50, x1: q.t + 320, z0: q.c - q.w / 2 - 100, z1: q.c + q.w / 2 + 100 };
      const d = Math.hypot(p.x - tg.x, p.z - tg.z);
      if (d < bd && !reserved(r) && !noFootbridge.some((k) => overlaps(k, r)) && !used.some((u) => Math.hypot(u.x - p.x, u.z - p.z) < 1500)
        && [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].every(([x, z]) => insideLoop(x, z, 60))) {
        bd = d;
        best = q;
      }
    }
    if (!best) continue;
    const { c, w, t, alongZ } = best;
    const H = FOOTBRIDGE_H, span = w + 2 * SIDEWALK.avenue, id = 'footbridge';
    // In local terms: `u` runs across the avenue, `v` along it. The deck spans u; stairs run along v on the sidewalks.
    const put = (u: number, v: number, du: number, dv: number, y1: number, y0: number) =>
      alongZ ? box(c + u, t + v, du, dv, y1, 'metal', { y0, group: id }) : box(t + v, c + u, dv, du, y1, 'metal', { y0, group: id });
    put(0, 0, span, 70, H, H - SLAB);
    put(0, -31, span, 8, H + 32, H); // railing on the far side
    put(-span / 2 + 4, 0, 8, 70, H + 32, H);
    put(span / 2 - 4, 0, 8, 70, H + 32, H);
    put(0, 31, w - 10, 8, H + 32, H); // near railing, open where the stairs arrive
    for (const s of [-1, 1]) {
      const u = s * (w / 2 + SIDEWALK.avenue / 2);
      if (alongZ) ramp(c + u, t + 35 + 130, 60, 260, 'z', -1, 0, H, 'stairs', 'metal', id);
      else ramp(t + 35 + 130, c + u, 260, 60, 'x', -1, 0, H, 'stairs', 'metal', id);
    }
    const p = alongZ ? { x: c, z: t } : { x: t, z: c };
    furnitureOut.push(alongZ ? { x0: c - span / 2 - 10, x1: c + span / 2 + 10, z0: t - 60, z1: t + 320 } : { x0: t - 60, x1: t + 320, z0: c - span / 2 - 10, z1: c + span / 2 + 10 });
    used.push(p);
    FOOTBRIDGES.push({ ...p, span, alongZ });
  }
}

{
  const rnd = rndCity;
  const { xs: X, zs: Z } = GRID;
  // Streets and intersections (drawn even beyond the tracks, where the city continues).
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < Z.length; j++) {
      const ix = { x0: X[i].c - X[i].w / 2, x1: X[i].c + X[i].w / 2, z0: Z[j].c - Z[j].w / 2, z1: Z[j].c + Z[j].w / 2 };
      if (streetFree(ix)) INTERSECTIONS.push({ x: X[i].c, z: Z[j].c, w: X[i].w, d: Z[j].w, streets: +(X[i].kind !== 'alley') + +(Z[j].kind !== 'alley') });
      if (j < Z.length - 1) {
        const r = { x0: ix.x0, x1: ix.x1, z0: ix.z1, z1: Z[j + 1].c - Z[j + 1].w / 2 };
        if (streetFree(r)) STREET_SEGS.push({ x: X[i].c, z: (r.z0 + r.z1) / 2, w: X[i].w, d: r.z1 - r.z0, axis: 'z', kind: X[i].kind });
      }
      if (i < X.length - 1) {
        const r = { x0: ix.x1, x1: X[i + 1].c - X[i + 1].w / 2, z0: ix.z0, z1: ix.z1 };
        if (streetFree(r)) STREET_SEGS.push({ x: (r.x0 + r.x1) / 2, z: Z[j].c, w: r.x1 - r.x0, d: Z[j].w, axis: 'x', kind: Z[j].kind });
      }
    }
  }

  const TYPES: Record<BuildingType | 'parking', { front: [number, number]; floors: [number, number]; gap: number; depth: number }> = {
    house: { front: [150, 220], floors: [2, 3], gap: 18, depth: 260 },
    apartment: { front: [240, 380], floors: [4, 9], gap: 12, depth: 360 },
    mixed: { front: [150, 260], floors: [4, 9], gap: 0, depth: 360 },
    shop: { front: [170, 280], floors: [2, 3], gap: 0, depth: 300 },
    office: { front: [260, 520], floors: [7, 14], gap: 20, depth: 700 },
    tower: { front: [360, 600], floors: [20, 34], gap: 30, depth: 700 },
    parking: { front: [230, 360], floors: [0, 0], gap: 10, depth: 400 },
  };
  const MIX: Record<District, [BuildingType | 'parking', number][]> = {
    commercial: [['mixed', 0.62], ['shop', 0.18], ['apartment', 0.1], ['parking', 0.05], ['office', 0.05]],
    business: [['office', 0.7], ['tower', 0.12], ['mixed', 0.18]],
    residential: [['house', 0.58], ['apartment', 0.28], ['parking', 0.08], ['shop', 0.06]],
    mixed: [['mixed', 0.34], ['apartment', 0.36], ['house', 0.17], ['shop', 0.08], ['parking', 0.05]],
  };
  const pick = (d: District): BuildingType | 'parking' => {
    let u = rnd();
    for (const [t, p] of MIX[d]) if ((u -= p) < 0) return t;
    return MIX[d][0][0];
  };
  const within = (lo: number, hi: number) => lo + rnd() * (hi - lo);

  const addBuilding = (x: number, z: number, w: number, d: number, type: BuildingType, district: District, front: Side, outside: boolean, streetFront: boolean) => {
    const [f0, f1] = TYPES[type].floors;
    const floors = Math.round(within(f0, f1));
    const h = type === 'tower' ? realHeight(floors * 3.4) : floorsToHeight(floors);
    BUILDINGS.push({ x, z, w, d, h, type, floors, district, front, seed: Math.floor(rnd() * 1e9), outside });
    if (outside) return;
    box(x, z, w, d, h, 'bldg', { noFloor: true });
    // Vending machines in front of houses, apartments and small buildings.
    if (streetFront && (type === 'house' || type === 'apartment' || type === 'mixed' || type === 'shop') && rnd() < 0.22) {
      const n = front === 'n' || front === 's' ? 1 : 0;
      const off = (rnd() - 0.5) * ((n ? w : d) - 80);
      const vx = n ? x + off : x + (front === 'e' ? w / 2 + 11 : -w / 2 - 11);
      const vz = n ? z + (front === 's' ? d / 2 + 11 : -d / 2 - 11) : z + off;
      const r = { x0: vx - 30, x1: vx + 30, z0: vz - 30, z1: vz + 30 };
      if (!furnitureOut.some((k) => overlaps(k, r))) box(vx, vz, n ? 54 : 20, n ? 20 : 54, 48, 'vending', { noFloor: true, group: front });
    }
  };

  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Z.length - 1; j++) {
      const sides: Record<Side, StreetKind> = { w: X[i].kind, e: X[i + 1].kind, n: Z[j].kind, s: Z[j + 1].kind };
      const b = { x0: X[i].c + X[i].w / 2, x1: X[i + 1].c - X[i + 1].w / 2, z0: Z[j].c + Z[j].w / 2, z1: Z[j + 1].c - Z[j + 1].w / 2 };
      const corners = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]];
      const inside = corners.every(([x, z]) => insideLoop(x, z, TRACK_MARGIN + 20));
      const outside = corners.every(([x, z]) => loopSignedDist(x, z) < -TRACK_MARGIN - 60);
      if (!inside && !outside && corners.every(([x, z]) => !insideLoop(x, z, WALK_EDGE + 10))) continue; // along the tracks
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const district = districtAt(cx, cz, rnd);
      const clean = inside && !reserved(b);
      if (clean) {
        box(cx, cz, b.x1 - b.x0, b.z1 - b.z0, CURB, 'sidewalk');
        BLOCKS.push({ ...b, sides });
      }
      // Lot area inside the sidewalks.
      const L = { x0: b.x0 + SIDEWALK[sides.w], x1: b.x1 - SIDEWALK[sides.e], z0: b.z0 + SIDEWALK[sides.n], z1: b.z1 - SIDEWALK[sides.s] };
      const lotOk = (r: Rect) => outside
        ? !reserved(r)
          : !reserved(r) && [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].every(([x, z]) => insideLoop(x, z, WALK_EDGE + 10));
      const W = L.x1 - L.x0, D = L.z1 - L.z0;
      if (district === 'business' && !outside && lotOk({ x0: L.x0 + 40, x1: L.x1 - 40, z0: L.z0 + 40, z1: L.z1 - 40 })) {
        // One or two big office buildings set back behind a small plaza.
        const n = W > 900 ? 2 : 1, g = 40;
        for (let k = 0; k < n; k++) {
          const x0 = L.x0 + (W / n) * k + g, x1 = L.x0 + (W / n) * (k + 1) - g;
          const r = { x0, x1, z0: L.z0 + g, z1: L.z1 - g };
          const type = rnd() < 0.2 ? 'tower' : 'office';
          addBuilding((x0 + x1) / 2, (r.z0 + r.z1) / 2, x1 - x0, r.z1 - r.z0, type, district, sides.s !== 'alley' ? 's' : 'n', false, sides.s !== 'alley');
        }
        continue;
      }
      // Rows of lots along the longer side, one or two rows deep.
      const alongX = W >= D;
      const long = alongX ? W : D, short = alongX ? D : W;
      const rows = short >= 400 ? 2 : 1;
      for (let row = 0; row < rows; row++) {
        const front: Side = alongX ? (rows === 2 ? (row === 0 ? 'n' : 's') : sides.s === 'street' ? 's' : 'n') : (rows === 2 ? (row === 0 ? 'w' : 'e') : sides.e === 'street' ? 'e' : 'w');
        const rowDepth = short / rows;
        let pos = 0;
        while (pos < long - 120) {
          const type = outside && rnd() < 0.15 ? 'mixed' : pick(district);
          const T = TYPES[type];
          let fw = within(T.front[0], T.front[1]);
          if (long - pos - fw < 130) fw = long - pos;
          const depth = Math.min(rowDepth, T.depth);
          // Lot rectangle: flush with the row's front edge.
          const a0 = pos, a1 = pos + fw;
          const frontEdge = row === 0 && rows === 2 ? 0 : rows === 2 ? short : (front === 's' || front === 'e') ? short : 0;
          const b0 = frontEdge === 0 ? 0 : short - depth, b1 = b0 + depth;
          const r = alongX
            ? { x0: L.x0 + a0, x1: L.x0 + a1 - T.gap, z0: L.z0 + b0, z1: L.z0 + b1 }
            : { x0: L.x0 + b0, x1: L.x0 + b1, z0: L.z0 + a0, z1: L.z0 + a1 - T.gap };
          pos += fw;
          if (r.x1 - r.x0 < 120 || r.z1 - r.z0 < 120 || !lotOk(r)) continue;
          const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
          if (type === 'parking') {
            if (outside) continue;
            PARKINGS.push({ x, z, w, d, axis: alongX ? 'z' : 'x' });
            // A few parked cars, nose to the street.
            const n = Math.floor((alongX ? w : d) / 90);
            for (let k = 0; k < n; k++) {
              if (rnd() < 0.45) continue;
              const t = (alongX ? r.x0 : r.z0) + 45 + k * 90;
              if (alongX) box(t, z, 46, Math.min(116, d - 20), 40, 'car', { noFloor: true, group: 'z' });
              else box(x, t, Math.min(116, w - 20), 46, 40, 'car', { noFloor: true, group: 'x' });
            }
            continue;
          }
          addBuilding(x, z, w, d, type, district, front, outside, sides[front] === 'street');
        }
      }
    }
  }

  // Street furniture along streets inside the loop.
  const freeSpot = (x: number, z: number, r = 30) => {
    const q = { x0: x - r, x1: x + r, z0: z - r, z1: z + r };
    return insideLoop(x, z, TRACK_MARGIN + 30) && !reserved(q) && !furnitureOut.some((k) => overlaps(k, q));
  };
  for (const s of STREET_SEGS) {
    if (!insideLoop(s.x, s.z, TRACK_MARGIN + 30)) continue;
    const alongZ = s.axis === 'z', len = alongZ ? s.d : s.w, half = (alongZ ? s.w : s.d) / 2;
    const at = (t: number, off: number) => (alongZ ? { x: s.x + off, z: s.z - len / 2 + t } : { x: s.x - len / 2 + t, z: s.z + off });
    if (s.kind === 'avenue') {
      // Ginkgo trees and tall street lights on both sidewalks.
      for (let t = 140; t < len - 100; t += 280) {
        for (const side of [-1, 1]) {
          const p = at(t, side * (half + 45));
          if (freeSpot(p.x, p.z, 20)) tree(p.x, p.z, 250 + (Math.floor(t / 280) % 3) * 30);
        }
      }
      for (let t = 280; t < len - 100; t += 560) {
        for (const side of [-1, 1]) {
          const p = at(t, side * (half + 14));
          if (freeSpot(p.x, p.z, 20)) LIGHTS.push({ ...p, ang: alongZ ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2) });
        }
      }
      continue;
    }
    // 電柱 on one side, wired together; street lights on the other side of 2-lane streets.
    let prev = -1;
    for (let t = 70; t < len - 50; t += 330) {
      const p = at(t, half + 12);
      if (!freeSpot(p.x, p.z)) { prev = -1; continue; }
      box(p.x, p.z, 10, 10, 260, 'pole', { noFloor: true });
      POLES.push(p);
      if (prev >= 0) WIRES.push([prev, POLES.length - 1]);
      prev = POLES.length - 1;
    }
    if (s.kind === 'street') {
      for (let t = 200; t < len - 100; t += 480) {
        const p = at(t, -half - 16);
        if (freeSpot(p.x, p.z)) LIGHTS.push({ ...p, ang: alongZ ? 0 : Math.PI / 2 });
      }
      // Parked cars at the kerb, mid-block.
      if (len > 400 && rnd() < 0.35) {
        const p = at(len / 2 + (rnd() - 0.5) * (len - 400), half - 34);
        if (freeSpot(p.x, p.z, 60)) box(p.x, p.z, alongZ ? 46 : 116, alongZ ? 116 : 46, 40, 'car', { noFloor: true, group: s.axis });
      }
    }
  }
  // Zebra crossings where streets meet (not across lanes), and signals where an avenue is involved.
  for (const ix of INTERSECTIONS) {
    if (ix.streets < 2 || !insideLoop(ix.x, ix.z, TRACK_MARGIN + 60)) continue;
    const g = 16, depth = 90;
    CROSSWALKS.push({ x: ix.x, z: ix.z - ix.d / 2 - g - depth / 2, w: ix.w, d: depth, axis: 'x' });
    CROSSWALKS.push({ x: ix.x, z: ix.z + ix.d / 2 + g + depth / 2, w: ix.w, d: depth, axis: 'x' });
    CROSSWALKS.push({ x: ix.x - ix.w / 2 - g - depth / 2, z: ix.z, w: depth, d: ix.d, axis: 'z' });
    CROSSWALKS.push({ x: ix.x + ix.w / 2 + g + depth / 2, z: ix.z, w: depth, d: ix.d, axis: 'z' });
    // (Not where a footbridge's stairs come down.)
    for (const [x, z, ang] of [[ix.x - ix.w / 2 - 30, ix.z - ix.d / 2 - 30, 0], [ix.x + ix.w / 2 + 30, ix.z + ix.d / 2 + 30, Math.PI]] as const) {
      const r = { x0: x - 8, x1: x + 8, z0: z - 8, z1: z + 8 };
      if (!furnitureOut.some((k) => overlaps(k, r))) SIGNALS.push({ x, z, ang });
    }
  }
}

/**
 * Railings round walkable decks at `top`: each edge is walked in short steps and a step whose
 * outside is `open` gets a railing piece (merged into runs). Used by Shinjuku's decks and roofs.
 */
function railings(decks: readonly { x0: number; z0: number; x1: number; z1: number }[], open: (x: number, z: number) => boolean, top: number, group: string): void {
  const RAIL = 6, RAIL_H = 32, STEP = 10;
  for (const k of decks) {
    const edges: [number, number, number, number, number, number][] = [
      [k.x0, k.z0, k.x1, k.z0, 0, -1], [k.x0, k.z1, k.x1, k.z1, 0, 1], [k.x0, k.z0, k.x0, k.z1, -1, 0], [k.x1, k.z0, k.x1, k.z1, 1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      let run0 = -1;
      for (let t = 0; t <= len; t += STEP) {
        const px = ax + ((bx - ax) * Math.min(t + STEP / 2, len)) / len, pz = az + ((bz - az) * Math.min(t + STEP / 2, len)) / len;
        const isOpen = t < len && open(px + nx * 4, pz + nz * 4);
        if (isOpen && run0 < 0) run0 = t;
        if ((!isOpen || t + STEP > len) && run0 >= 0) {
          const t1 = isOpen ? len : t, L = t1 - run0;
          if (L > 2) {
            const cx = ax + ((bx - ax) * (run0 + L / 2)) / len - nx * (RAIL / 2), cz = az + ((bz - az) * (run0 + L / 2)) / len - nz * (RAIL / 2);
            box(cx, cz, nx ? RAIL : L, nx ? L : RAIL, top + RAIL_H, 'metal', { y0: top, group });
          }
          run0 = -1;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 渋谷 NEON MAZE (v10 MAP REFORGE, the Golden Sector)
/**
 * The centre of Shibuya is rebuilt by hand (config/shibuya.ts) after the generated city, so
 * the rest of Tokyo is untouched: the generated buildings, poles, cars, vending machines,
 * trees, lamps and parking in the rebuilt area are taken out and the new streets, buildings,
 * lanes, decks and stairs put in. The sidewalk blocks, the scramble's crossings, the
 * footbridge and the avenue grid stay; the avenue now runs on south through the crossing.
 */
export const SHIBUYA_BUILT: { buildings: (ShibuyaBuilding & { h: number })[] } = { buildings: [] };
{
  const inZone = (x: number, z: number) => SHIBUYA_ZONES.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const GENERATED = new Set<Material>(['bldg', 'pole', 'car', 'vending', 'tree']);
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i];
    if (!inZone(p.x, p.z)) continue;
    // The generated city, and the old stand-in tower that blocked the avenue south of the crossing.
    if ((GENERATED.has(p.mat) && (p.group === undefined || p.mat === 'vending' || p.mat === 'car')) || p.group === 'tower') prims.splice(i, 1);
  }
  const keep = <T extends Point>(arr: T[], ok: (v: T) => boolean) => {
    const out = arr.filter(ok);
    arr.length = 0;
    arr.push(...out);
  };
  keep(BUILDINGS, (b) => b.outside || !inZone(b.x, b.z));
  keep(PARKINGS, (k) => !inZone(k.x, k.z));
  keep(LIGHTS, (l) => !inZone(l.x, l.z));
  keep(SIGNALS, (l) => !inZone(l.x, l.z));
  // Poles: drop those in the area and re-link the wires between the ones that stay.
  {
    const remap = new Map<number, number>();
    const old = POLES.slice();
    POLES.length = 0;
    old.forEach((p, i) => { if (!inZone(p.x, p.z)) { remap.set(i, POLES.length); POLES.push(p); } });
    const wires = WIRES.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
    WIRES.length = 0;
    WIRES.push(...wires);
  }
  // The side street west of the crossing becomes the station square (pedestrians only).
  keep(STREET_SEGS, (g) => !(g.kind !== 'avenue' && g.axis === 'x' && g.x < -2890 && Math.abs(g.z - 1899) < 10));
  // The avenue, unbroken through the crossing (the old tower stood on it).
  STREET_SEGS.push({ x: -2700, z: (2019 + 2692) / 2, w: AVENUE_W, d: 2692 - 2019, axis: 'z', kind: 'avenue' });

  // Buildings: hand-placed ones and the back-alley maze (one building per letter of the map).
  const all: ShibuyaBuilding[] = [...SHIBUYA_BUILDINGS];
  for (const id of Object.keys(MAZE_BUILDINGS)) {
    let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1;
    MAZE_MAP.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== id) return;
      c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    }));
    const { cell, x0, z0 } = MAZE;
    all.push({ id, x0: x0 + c0 * cell, x1: x0 + (c1 + 1) * cell, z0: z0 + r0 * cell, z1: z0 + (r1 + 1) * cell, ...MAZE_BUILDINGS[id] });
  }
  const rnd = prng(1010);
  for (const b of all) {
    const h = floorsToHeight(b.floors), x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    box(x, z, w, d, h, 'bldg', { noFloor: true });
    BUILDINGS.push({ x, z, w, d, h, type: b.floors >= 12 ? 'tower' : b.floors <= 3 ? 'shop' : 'mixed', floors: b.floors, district: 'commercial', front: b.fronts[0], seed: Math.floor(rnd() * 1e9), outside: false, custom: 'shibuya' });
    SHIBUYA_BUILT.buildings.push({ ...b, h });
  }

  // SKY RING: decks with railings, columns, and stairs. Railings stop where a stair or deck joins.
  const RAIL = 6, RAIL_H = 32, id = 'skyway';
  for (const k of SKY_DECKS) slab((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2, k.x1 - k.x0, k.z1 - k.z0, SKY_H, 'metal', id);
  const covered = (x: number, z: number) => SKY_DECKS.some((k) => x > k.x0 - 1 && x < k.x1 + 1 && z > k.z0 - 1 && z < k.z1 + 1)
    || SKY_STAIRS.some((s) => x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1)
    || SHIBUYA_BUILT.buildings.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1);
  // Walk each deck edge in short steps; a step whose outside is open gets a railing piece (merged into runs).
  for (const k of SKY_DECKS) {
    const edges: [number, number, number, number, number, number][] = [
      [k.x0, k.z0, k.x1, k.z0, 0, -1], [k.x0, k.z1, k.x1, k.z1, 0, 1], [k.x0, k.z0, k.x0, k.z1, -1, 0], [k.x1, k.z0, k.x1, k.z1, 1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const len = Math.hypot(bx - ax, bz - az), STEP = 10;
      let run0 = -1;
      for (let t = 0; t <= len; t += STEP) {
        const px = ax + ((bx - ax) * Math.min(t + STEP / 2, len)) / len, pz = az + ((bz - az) * Math.min(t + STEP / 2, len)) / len;
        const open = t < len && !covered(px + nx * 4, pz + nz * 4);
        if (open && run0 < 0) run0 = t;
        if ((!open || t + STEP > len) && run0 >= 0) {
          const t1 = open ? len : t;
          const a = run0, L = t1 - a;
          if (L > 2) {
            const cx = ax + ((bx - ax) * (a + L / 2)) / len - nx * (RAIL / 2), cz = az + ((bz - az) * (a + L / 2)) / len - nz * (RAIL / 2);
            box(cx, cz, nx ? RAIL : L, nx ? L : RAIL, SKY_H + RAIL_H, 'metal', { y0: SKY_H, group: id });
          }
          run0 = -1;
        }
      }
    }
  }
  for (const [x, z] of SKY_LEGS) box(x, z, 24, 24, SKY_H - 12, 'metal', { group: id });
  for (const s of SKY_STAIRS) ramp((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.z1 - s.z0, s.axis, s.dir, 0, SKY_H, 'stairs', 'metal', id);

  // The NEON MAZE gate posts, and the subway entrance in the square.
  for (const z of [MAZE_GATE.z0, MAZE_GATE.z1]) box(MAZE_GATE.x, z, 18, 18, MAZE_GATE.top, 'metal', { group: 'shibuya', noFloor: true });
  // HALO VISION's two legs.
  for (const dx of [-105, 105]) box(HALO_SCREEN.x + dx, HALO_SCREEN.z + 4, 16, 16, HALO_SCREEN.y, 'metal', { group: 'shibuya', noFloor: true });
  box((SUBWAY.x0 + SUBWAY.x1) / 2, (SUBWAY.z0 + SUBWAY.z1) / 2, SUBWAY.x1 - SUBWAY.x0, SUBWAY.z1 - SUBWAY.z0, SUBWAY.h, 'concrete', { group: 'shibuya', noFloor: true });

  // Street trees on the avenue's west pavement and round the square; vending machines in the lanes.
  for (const [x, z] of [[-2945, 2500], [-2945, 2620], [-3250, 2300], [-2930, 2300]]) tree(x, z, 250);
  for (const [x, z, side] of [[-2380, 2216, 's'], [-2050, 2368, 's'], [-2091, 1330, 'w']] as const) {
    box(x, z, side === 's' ? 54 : 20, side === 's' ? 20 : 54, 48, 'vending', { noFloor: true, group: side });
  }
  for (const l of SHIBUYA_LAMPS) LIGHTS.push({ x: l.x, z: l.z, ang: l.ang, wall: l.wall });
}

// ---------------------------------------------------------------- 新宿 VERTICAL CITY (v10.1 MAP REFORGE)
/**
 * The centre of Shinjuku is rebuilt by hand (config/shinjuku.ts) the same way as Shibuya: after
 * the generated city, so the rest of Tokyo is untouched. The generated buildings, poles, cars,
 * vending machines, trees, lamps and parking in the area and the 靖国通り footbridge (DECK 2
 * crosses the avenue in its place) are taken out; the avenue is joined up, and the towers, the
 * lanes, the decks, the bridge and the stairs put in.
 */
export const SHINJUKU_BUILT: { buildings: (ShinjukuBuilding & { h: number })[] } = { buildings: [] };
{
  const inZone = (x: number, z: number) => SHINJUKU_ZONES.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const GENERATED = new Set<Material>(['bldg', 'pole', 'car', 'vending', 'tree']);
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i];
    if (!inZone(p.x, p.z)) continue;
    if ((GENERATED.has(p.mat) && (p.group === undefined || p.mat === 'vending' || p.mat === 'car')) || p.group === 'footbridge') prims.splice(i, 1);
  }
  const keep = <T extends Point>(arr: T[], ok: (v: T) => boolean) => {
    const out = arr.filter(ok);
    arr.length = 0;
    arr.push(...out);
  };
  keep(BUILDINGS, (b) => b.outside || !inZone(b.x, b.z));
  keep(PARKINGS, (k) => !inZone(k.x, k.z));
  keep(LIGHTS, (l) => !inZone(l.x, l.z));
  keep(SIGNALS, (l) => !inZone(l.x, l.z));
  keep(FOOTBRIDGES, (f) => !inZone(f.x, f.z));
  keep(CROSSWALKS, (c) => !inZone(c.x, c.z));
  {
    const remap = new Map<number, number>();
    const old = POLES.slice();
    POLES.length = 0;
    old.forEach((p, i) => { if (!inZone(p.x, p.z)) { remap.set(i, POLES.length); POLES.push(p); } });
    const wires = WIRES.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
    WIRES.length = 0;
    WIRES.push(...wires);
  }
  // 靖国通り's stub west of the avenue becomes part of the base square.
  keep(STREET_SEGS, (g) => !(g.axis === 'x' && Math.abs(g.z - SHINJUKU_CROSS.z) < 10 && g.x < AVENUE.x - AVENUE.w / 2));
  keep(INTERSECTIONS, (ix) => !(Math.abs(ix.z - SHINJUKU_CROSS.z) < 10 && ix.x < AVENUE.x - AVENUE.w / 2 && inZone(ix.x, ix.z)));
  // VERTICAL AVENUE, joined up through the VERTICAL CROSS.
  const X = SHINJUKU_CROSS, YW = AVENUE_W;
  for (const [z0, z1] of [[AVENUE.z0, X.z - YW / 2], [X.z + YW / 2, AVENUE.z1]]) {
    STREET_SEGS.push({ x: AVENUE.x, z: (z0 + z1) / 2, w: AVENUE.w, d: z1 - z0, axis: 'z', kind: 'avenue' });
  }
  if (!INTERSECTIONS.some((ix) => ix.x === X.x && ix.z === X.z)) INTERSECTIONS.push({ x: X.x, z: X.z, w: AVENUE.w, d: YW, streets: 2 });
  {
    const g = 16, depth = 90, iw = AVENUE.w, id = YW;
    CROSSWALKS.push({ x: X.x, z: X.z - id / 2 - g - depth / 2, w: iw, d: depth, axis: 'x' });
    CROSSWALKS.push({ x: X.x, z: X.z + id / 2 + g + depth / 2, w: iw, d: depth, axis: 'x' });
    CROSSWALKS.push({ x: X.x + iw / 2 + g + depth / 2, z: X.z, w: depth, d: id, axis: 'z' });
    SIGNALS.push({ x: X.x + iw / 2 + 30, z: X.z + id / 2 + 30, ang: Math.PI });
    SIGNALS.push({ x: X.x - iw / 2 - 30, z: X.z - id / 2 - 30, ang: 0 });
  }
  // Pavements (kerbs) along the east towers.
  box(-2335, -910, 350, 500, CURB, 'sidewalk');

  // Buildings: the towers and the lanes block (one building per letter of the map).
  const all: ShinjukuBuilding[] = [...SHINJUKU_BUILDINGS];
  for (const id of Object.keys(LANE_BUILDINGS)) {
    let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1;
    LANES_MAP.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== id) return;
      c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    }));
    const { cell, x0, z0 } = LANES;
    all.push({ id, x0: x0 + c0 * cell, x1: x0 + (c1 + 1) * cell, z0: z0 + r0 * cell, z1: z0 + (r1 + 1) * cell, ...LANE_BUILDINGS[id] });
  }
  /** A rectangle minus another (up to four pieces). */
  type R4 = { x0: number; z0: number; x1: number; z1: number };
  const minus = (a: R4, b: R4): R4[] => {
    if (b.x0 >= a.x1 || b.x1 <= a.x0 || b.z0 >= a.z1 || b.z1 <= a.z0) return [a];
    const out: R4[] = [];
    if (b.z0 > a.z0) out.push({ x0: a.x0, x1: a.x1, z0: a.z0, z1: b.z0 });
    if (b.z1 < a.z1) out.push({ x0: a.x0, x1: a.x1, z0: b.z1, z1: a.z1 });
    const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
    if (b.x0 > a.x0) out.push({ x0: a.x0, x1: b.x0, z0, z1 });
    if (b.x1 < a.x1) out.push({ x0: b.x1, x1: a.x1, z0, z1 });
    return out;
  };
  const rnd = prng(1101);
  for (const b of all) {
    const h = floorsToHeight(b.floors), x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    if (b.tower) {
      // Podium (walkable roof where asked, less any stair that climbs inside the footprint), shaft on top.
      const T = b.tower, S = T.shaft;
      let parts: R4[] = [b];
      for (const s of SHINJUKU_STAIRS) parts = parts.flatMap((r) => minus(r, s));
      for (const r of parts) box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, T.podium, T.walkRoof ? 'concrete' : 'bldg', { noFloor: !T.walkRoof, group: T.walkRoof ? 'shinjuku' : undefined });
      box((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, S.x1 - S.x0, S.z1 - S.z0, h, 'bldg', { noFloor: true, y0: T.podium });
      if (T.walkRoof) {
        // Parapets round the roof where it is open (not on the bridge, the stair or the shaft).
        const open = (px: number, pz: number) => !HIGH_DECKS.some((k) => px > k.x0 - 1 && px < k.x1 + 1 && pz > k.z0 - 1 && pz < k.z1 + 1)
          && !SHINJUKU_STAIRS.some((s) => px > s.x0 - 1 && px < s.x1 + 1 && pz > s.z0 - 1 && pz < s.z1 + 1);
        const roof = parts.flatMap((r) => minus(r, S));
        const inR = (r: R4, px: number, pz: number) => px > r.x0 - 1 && px < r.x1 + 1 && pz > r.z0 - 1 && pz < r.z1 + 1;
        railings(roof, (px, pz) => open(px, pz) && !inR(S, px, pz) && !roof.some((r) => inR(r, px, pz)), T.podium, 'shinjuku');
      }
    } else box(x, z, w, d, h, 'bldg', { noFloor: true });
    BUILDINGS.push({ x, z, w, d, h, type: b.floors >= 12 ? 'tower' : b.floors <= 3 ? 'shop' : 'mixed', floors: b.floors, district: 'commercial', front: b.fronts[0], seed: Math.floor(rnd() * 1e9), outside: false, custom: 'shinjuku' });
    SHINJUKU_BUILT.buildings.push({ ...b, h });
  }

  // DECK 2, the high level, railings, columns and stairs.
  const id = 'sjdeck';
  for (const k of DECKS) slab((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2, k.x1 - k.x0, k.z1 - k.z0, DECK_H, 'metal', id);
  for (const k of HIGH_DECKS) slab((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2, k.x1 - k.x0, k.z1 - k.z0, HIGH_H, 'metal', id);
  const stairAt = (x: number, z: number) => SHINJUKU_STAIRS.some((s) => x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1);
  const bldgAt = (x: number, z: number) => SHINJUKU_BUILT.buildings.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1);
  const deckAt = (list: typeof DECKS) => (x: number, z: number) => list.some((k) => x > k.x0 - 1 && x < k.x1 + 1 && z > k.z0 - 1 && z < k.z1 + 1);
  railings(DECKS, (x, z) => !deckAt(DECKS)(x, z) && !stairAt(x, z) && !bldgAt(x, z), DECK_H, id);
  railings(HIGH_DECKS, (x, z) => !deckAt(HIGH_DECKS)(x, z) && !stairAt(x, z) && !bldgAt(x, z), HIGH_H, id);
  for (const [x, z] of DECK_LEGS) box(x, z, 24, 24, DECK_H - 12, 'metal', { group: id });
  for (const s of SHINJUKU_STAIRS) ramp((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.z1 - s.z0, s.axis, s.dir, s.hLow, s.hHigh, 'stairs', 'metal', id);

  // NIGHT LANES gate posts (the sign is drawn by render/shinjuku.ts).
  for (const x of [LANES_GATE.x0, LANES_GATE.x1]) box(x, LANES_GATE.z, 16, 16, LANES_GATE.top, 'metal', { group: 'shinjuku', noFloor: true });
  // Street trees on the avenue's west pavement and round the square.
  for (const [x, z] of [[-3360, -1300], [-3360, -1100]]) tree(x, z, 250);
  for (const l of SHINJUKU_LAMPS) LIGHTS.push({ x: l.x, z: l.z, ang: l.ang, wall: l.wall });
}

// ---------------------------------------------------------------- 秋葉原 ELECTRIC GRID (v10 MAP REFORGE phase 3)
/**
 * The north bank of the Kanda at Akihabara is rebuilt by hand (config/akihabara.ts) after the
 * generated city, the same way as Shibuya: the generated pieces in the area are taken out and
 * the electric town put in — MAIN ELECTRIC STREET on 聖橋's axis, the COMPONENT ALLEY lanes,
 * the SERVICE CUT back lane and passages, GRID GATE, GRID TOWER, DATA JUNCTION and POWER NODE.
 * The existing arcade (CIRCUIT ARCADE) keeps its place and its east and west doors and gets a
 * south door into the lanes.
 */
export const AKIBA_BUILT: { buildings: (AkibaBuilding & { h: number })[] } = { buildings: [] };
{
  const inZone = (x: number, z: number) => AKIBA_ZONES.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const GENERATED = new Set<Material>(['bldg', 'pole', 'car', 'vending', 'tree']);
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i];
    if (inZone(p.x, p.z) && GENERATED.has(p.mat) && (p.group === undefined || p.mat === 'vending' || p.mat === 'car')) prims.splice(i, 1);
  }
  const keep = <T extends Point>(arr: T[], ok: (v: T) => boolean) => {
    const out = arr.filter(ok);
    arr.length = 0;
    arr.push(...out);
  };
  keep(BUILDINGS, (b) => b.outside || !inZone(b.x, b.z));
  keep(PARKINGS, (k) => !inZone(k.x, k.z));
  keep(LIGHTS, (l) => !inZone(l.x, l.z));
  keep(SIGNALS, (l) => !inZone(l.x, l.z));
  {
    const remap = new Map<number, number>();
    const old = POLES.slice();
    POLES.length = 0;
    old.forEach((p, i) => { if (!inZone(p.x, p.z)) { remap.set(i, POLES.length); POLES.push(p); } });
    const wires = WIRES.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
    WIRES.length = 0;
    WIRES.push(...wires);
  }

  // CIRCUIT ARCADE: a south door in the arcade's south wall, onto the lanes.
  {
    const i = prims.findIndex((p) => p.group === 'arcade' && p.kind === 'box' && p.y0 === 0 && p.d === 14 && p.z > ARCADE.z);
    const w = prims[i] as BoxPrim;
    const a0 = w.x - w.w / 2, a1 = w.x + w.w / 2, g0 = ARCADE_SOUTH_DOOR.x - ARCADE_SOUTH_DOOR.width / 2, g1 = ARCADE_SOUTH_DOOR.x + ARCADE_SOUTH_DOOR.width / 2;
    prims.splice(i, 1, { ...w, x: (a0 + g0) / 2, w: g0 - a0 }, { ...w, x: (g1 + a1) / 2, w: a1 - g1 });
  }

  // MAIN ELECTRIC STREET: a two-lane carriageway between raised pavements.
  const M = MAIN_STREET;
  STREET_SEGS.push({ x: (M.road0 + M.road1) / 2, z: (M.z0 + M.z1) / 2, w: M.road1 - M.road0, d: M.z1 - M.z0, axis: 'z', kind: 'street' });
  const pave = (x0: number, z0: number, x1: number, z1: number, sides: Block['sides']) => {
    box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, CURB, 'sidewalk');
    BLOCKS.push({ x0, z0, x1, z1, sides });
  };
  // The west pavement runs into the lane block (one raised block); the east pavement stops at the bridge.
  pave(1702, M.z0, M.road0, -2447, { n: 'alley', s: 'alley', w: 'alley', e: 'street' });
  pave(M.road1, M.z0, M.x1, M.z1, { n: 'alley', s: 'alley', w: 'street', e: 'alley' });

  // Buildings (one collision box each; a passage building stands on its upper storeys).
  const rnd = prng(1515);
  for (const b of AKIBA_BUILDINGS) {
    const h = floorsToHeight(b.floors), x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    box(x, z, w, d, h, 'bldg', { noFloor: true, y0: b.under ? GROUND_FLOOR : 0 });
    BUILDINGS.push({ x, z, w, d, h, type: b.floors <= 3 ? 'shop' : 'mixed', floors: b.floors, district: 'commercial', front: b.fronts[0], seed: Math.floor(rnd() * 1e9), outside: false, custom: 'akihabara' });
    AKIBA_BUILT.buildings.push({ ...b, h });
  }

  // GRID GATE: deck, railings, legs and the two stairs.
  {
    const G = GRID_GATE, D = G.deck, id = 'akibaGate', RAIL = 6, RAIL_H = 32;
    slab((D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2, D.x1 - D.x0, D.z1 - D.z0, GATE_H, 'metal', id);
    box((D.x0 + D.x1) / 2, D.z0 + RAIL / 2, D.x1 - D.x0, RAIL, GATE_H + RAIL_H, 'metal', { y0: GATE_H, group: id });
    box((2140 + D.x1) / 2, D.z1 - RAIL / 2, D.x1 - 2140, RAIL, GATE_H + RAIL_H, 'metal', { y0: GATE_H, group: id });
    box(D.x0 + RAIL / 2, (D.z0 + D.z1) / 2, RAIL, D.z1 - D.z0, GATE_H + RAIL_H, 'metal', { y0: GATE_H, group: id });
    for (const [x, z] of G.legs) box(x, z, 12, 12, GATE_H - SLAB, 'metal', { group: id });
    for (const s of G.stairs) {
      ramp((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.z1 - s.z0, s.axis, s.dir, s.id === 'gateW' ? CURB : 0, GATE_H, 'stairs', 'metal', id);
    }
  }
  // GRID TOWER, the DATA JUNCTION boards and POWER NODE (drawn by render/akihabara.ts).
  box(GRID_TOWER.x, GRID_TOWER.z, GRID_TOWER.half * 2, GRID_TOWER.half * 2, GRID_TOWER.h, 'steel', { group: 'akibaTower', noFloor: true });
  for (const k of JUNCTION_BOARDS) box(k.x, k.z, k.w, k.d, k.h, 'metal', { group: 'akibaBoard', noFloor: true });
  {
    const P = POWER_NODE;
    box((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, P.x1 - P.x0, P.z1 - P.z0, P.h, 'metal', { group: 'akibaPower', noFloor: true });
  }

  // Street furniture: poles and wires, vending machines, lamps.
  const p0 = POLES.length;
  for (const [x, z] of AKIBA_POLES) {
    box(x, z, 10, 10, 260, 'pole', { noFloor: true });
    POLES.push({ x, z });
  }
  for (const [a, b] of AKIBA_WIRES) WIRES.push([p0 + a, p0 + b]);
  for (const [x, z, side] of AKIBA_VENDING) {
    const n = side === 'n' || side === 's';
    box(x, z, n ? 54 : 20, n ? 20 : 54, 48, 'vending', { noFloor: true, group: side });
  }
  for (const l of AKIBA_LAMPS) LIGHTS.push({ x: l.x, z: l.z, ang: l.ang, wall: l.wall });
}

// ---------------------------------------------------------------- 上野 GREEN HEIGHTS (MAP REFORGE parallel A)
/**
 * The park round 上野の山 is rebuilt by hand (config/ueno.ts) after the generated city, the same
 * way as the other rebuilt districts: the generated pieces in the area, the hill's old slope,
 * stairs, museum block and trees are taken out, and GREEN HEIGHTS put in — the GRAND PROMENADE
 * and its WEST RAMP, the GROVE PATH (trees, hedges, low stone walls, a trellis), the STONE AXIS
 * up to GREEN TERRACE, CULTURE GATE, UENO HALL and the CANOPY WALK trees. The hill itself, the
 * pond, LUNA's base and the LOCK POINT stay where they are.
 */
export const UENO_BUILT = { trees: UENO_TREES.length };
{
  const GENERATED = new Set<Material>(['bldg', 'pole', 'car', 'vending', 'tree']);
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i];
    if (!inUenoZone(p.x, p.z)) continue;
    const generated = GENERATED.has(p.mat) && (p.group === undefined || p.mat === 'vending' || p.mat === 'car');
    // The hill's old west slope and south stairs, and the old museum block (UENO HALL replaces it).
    const old = (p.kind === 'ramp' && p.group === 'hill') || p.group === 'museum';
    if (generated || old) prims.splice(i, 1);
  }
  const keep = <T extends Point>(arr: T[], ok: (v: T) => boolean) => {
    const out = arr.filter(ok);
    arr.length = 0;
    arr.push(...out);
  };
  keep(BUILDINGS, (b) => b.outside || !inUenoZone(b.x, b.z));
  keep(PARKINGS, (k) => !inUenoZone(k.x, k.z));
  keep(LIGHTS, (l) => !inUenoZone(l.x, l.z));
  keep(SIGNALS, (l) => !inUenoZone(l.x, l.z));
  {
    const remap = new Map<number, number>();
    const old = POLES.slice();
    POLES.length = 0;
    old.forEach((p, i) => { if (!inUenoZone(p.x, p.z)) { remap.set(i, POLES.length); POLES.push(p); } });
    const wires = WIRES.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
    WIRES.length = 0;
    WIRES.push(...wires);
  }
  const rect = (r: { x0: number; z0: number; x1: number; z1: number }) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0 });

  // C. STONE AXIS: two stone flights and a landing (group 'hill': the stair lights light them like the old stairs).
  {
    const A = STONE_AXIS, w = A.x1 - A.x0, x = (A.x0 + A.x1) / 2;
    for (const f of [A.lower, A.upper]) ramp(x, (f.z0 + f.z1) / 2, w, f.z1 - f.z0, 'z', -1, f.h0, f.h1, 'stairs', 'stone', 'hill');
    box(x, (A.landing.z0 + A.landing.z1) / 2, w, A.landing.z1 - A.landing.z0, A.landing.h, 'stone', { group: 'uenoAxis' });
  }
  // GREEN TERRACE and its balustrade (open where the axis arrives).
  {
    const T = GREEN_TERRACE, r = rect(T), RAIL = 8, top = T.top, id = 'uenoRail';
    box(r.x, r.z, r.w, r.d, top, 'stone', { group: 'uenoTerrace' });
    const s0 = STONE_AXIS.x0, s1 = STONE_AXIS.x1;
    box((T.x0 + s0) / 2, T.z1 - RAIL / 2, s0 - T.x0, RAIL, top + 24, 'stone', { y0: top, group: id, noFloor: true });
    box((s1 + T.x1) / 2, T.z1 - RAIL / 2, T.x1 - s1, RAIL, top + 24, 'stone', { y0: top, group: id, noFloor: true });
    box(T.x0 + RAIL / 2, r.z, RAIL, r.d, top + 24, 'stone', { y0: top, group: id, noFloor: true });
    box(T.x1 - RAIL / 2, r.z, RAIL, r.d, top + 24, 'stone', { y0: top, group: id, noFloor: true });
  }
  // A. WEST RAMP onto the plateau, and the landing at its top.
  {
    const R = rect(WEST_RAMP), L = rect(RAMP_LANDING);
    ramp(R.x, R.z, R.w, R.d, 'z', -1, 0, UENO_HILL.top, 'slope', 'stone', 'uenoRamp');
    box(L.x, L.z, L.w, L.d, UENO_HILL.top, 'stone', { group: 'uenoRamp' });
  }
  // CULTURE GATE: pillars and a lintel overhead.
  {
    const G = CULTURE_GATE;
    for (const s of [-1, 1]) box(G.x + s * G.half, G.z, 28, 28, G.h, 'stone', { group: 'uenoGate', noFloor: true });
    box(G.x, G.z, G.half * 2 + 40, 26, G.h, 'stone', { y0: G.lintel, group: 'uenoGate', noFloor: true });
  }
  // UENO HALL on the plateau.
  {
    const H = rect(UENO_HALL);
    box(H.x, H.z, H.w, H.d, UENO_HILL.top + UENO_HALL.h, 'stone', { y0: UENO_HILL.top, group: 'uenoHall', noFloor: true });
  }
  // B. GROVE PATH: hedges, low stone walls and the trellis.
  for (const h of HEDGES) { const r = rect(h); box(r.x, r.z, r.w, r.d, HEDGE_H, 'hedge', { group: 'uenoHedge', noFloor: true }); }
  for (const g of GROVE_WALLS) { const r = rect(g); box(r.x, r.z, r.w, r.d, WALL_H, 'stone', { group: 'uenoWall', noFloor: true }); }
  {
    const T = TRELLIS, P = 14;
    for (const [x, z] of [[T.x0 + P / 2, T.z0 + P / 2], [T.x1 - P / 2, T.z0 + P / 2], [T.x0 + P / 2, T.z1 - P / 2], [T.x1 - P / 2, T.z1 - P / 2]]) {
      box(x, z, P, P, T.h, 'wood', { group: 'uenoTrellis', noFloor: true });
    }
    const r = rect(T);
    box(r.x, r.z, r.w, r.d, T.h + 8, 'wood', { y0: T.h, group: 'uenoTrellis', noFloor: true });
  }
  // Big trees: the trunk is solid (sight and movement); the crown is drawn high above the path.
  for (const t of UENO_TREES) {
    const y0 = t.high ? UENO_HILL.top : 0;
    box(t.x, t.z, TRUNK, TRUNK, y0 + TRUNK_H, 'wood', { y0, group: 'uenoTree', noFloor: true });
  }
  // Park lamps (their posts are drawn by render/ueno.ts; the lamp is in the night rules like any street lamp).
  for (const l of UENO_LAMPS) LIGHTS.push({ x: l.x, z: l.z, ang: l.ang, wall: true });
}

// ---------------------------------------------------------------- 池袋 ROOFTOP NETWORK (MAP REFORGE)
/**
 * Ikebukuro is rebuilt by hand (config/ikebukuro.ts) after the generated city, the same way as
 * Shibuya: the generated buildings, poles, cars, vending machines, trees, lamps and parking in
 * the rebuilt areas are taken out and the new buildings, roofs, bridges and stairs put in. The
 * streets, sidewalk blocks and the 5号線 ramp stay. The 60-storey tower that stood in the middle
 * of the district moves beyond the tracks (skyline only), so the low roofs read as the district.
 * Its buildings are not added to BUILDINGS (the generic city renderer leaves them alone):
 * render/ikebukuro.ts draws everything in group 'ikebukuro'.
 */
export const IKEBUKURO_BUILT: { buildings: (IkbBuilding & { h: number })[] } = { buildings: [] };
{
  const zone = (id: string) => IKB_ZONES.find((r) => r.id === id)!;
  const inRect = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const cleared = [zone('station'), zone('network')];
  const inZone = (x: number, z: number) => cleared.some((r) => inRect(r, x, z));
  const GENERATED = new Set<Material>(['bldg', 'pole', 'car', 'vending', 'tree']);
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i];
    if (!inZone(p.x, p.z)) continue;
    if ((GENERATED.has(p.mat) && (p.group === undefined || p.mat === 'vending' || p.mat === 'car')) || p.group === 'tower') prims.splice(i, 1);
  }
  const keep = <T extends Point>(arr: T[], ok: (v: T) => boolean) => {
    const out = arr.filter(ok);
    arr.length = 0;
    arr.push(...out);
  };
  const sky = zone('skyline');
  const onSkyline = (b: Building) => b.x + b.w / 2 > sky.x0 && b.x - b.w / 2 < sky.x1 && b.z + b.d / 2 > sky.z0 && b.z - b.d / 2 < sky.z1;
  keep(BUILDINGS, (b) => (b.outside ? !onSkyline(b) : !inZone(b.x, b.z)));
  keep(PARKINGS, (k) => !inZone(k.x, k.z));
  keep(LIGHTS, (l) => !inZone(l.x, l.z));
  keep(SIGNALS, (l) => !inZone(l.x, l.z));
  {
    const remap = new Map<number, number>();
    const old = POLES.slice();
    POLES.length = 0;
    old.forEach((p, i) => { if (!inZone(p.x, p.z)) { remap.set(i, POLES.length); POLES.push(p); } });
    const wires = WIRES.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
    WIRES.length = 0;
    WIRES.push(...wires);
  }
  // サンシャイン60 stands on beyond the tracks, where it is skyline, not the district's centre.
  box((sky.x0 + sky.x1) / 2, (sky.z0 + sky.z1) / 2, 360, 360, realHeight(240), 'glass', { group: 'tower' });

  const id = 'ikebukuro';
  const put = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, extra: Partial<BoxPrim> = {}) =>
    box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1, 'bldg', { y0, group: id, ...extra });
  // Buildings: walkable roofs for the network, plain blocks for the backdrop.
  for (const b of IKB_BUILDINGS) {
    const h = ikbHeight(b.floors);
    put(b.x0, b.z0, b.x1, b.z1, 0, h, { noFloor: !b.walk });
    IKEBUKURO_BUILT.buildings.push({ ...b, h });
  }
  // Decks (bridges, the hub, stair landings), stairs and roof plant. The SKY LINK rests on its two roofs
  // (no columns: nothing stands in the avenue or on the ramp).
  // The SKY LINK's walking surface is a thin plate: it passes over the expressway ramp, whose
  // highest end (280, further east) must stay below it; the girders under it are only drawn.
  for (const k of IKB_DECKS) put(k.x0, k.z0, k.x1, k.z1, k.id === 'link' ? k.y - 1 : k.y - SLAB, k.y);
  for (const s of IKB_STAIRS) {
    prims.push({
      kind: 'ramp', x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, w: s.x1 - s.x0, d: s.z1 - s.z0, y0: s.low > 0 ? s.low - SLAB : 0,
      axis: s.axis, dir: s.dir, hLow: s.low, hHigh: s.high, style: 'stairs', mat: 'bldg', group: id,
    });
  }
  for (const q of IKB_PLANT) put(q.x0, q.z0, q.x1, q.z1, q.y, q.y + q.h, { noFloor: true });

  // Fences: every edge of a walkable roof or deck whose outside is neither another walkable
  // surface at the same height nor a wall rising above it. Walked in short steps, merged into runs.
  // Chain-link: they stop bodies but not eyes (a roof sees the street, the street sees the roof).
  const FENCE = 6, FENCE_H = 32, STEP = 10, STEP_UP_FENCE = 12;
  const walkTops: { r: Rect; y: (x: number, z: number) => number }[] = [
    ...IKB_BUILDINGS.filter((b) => b.walk).map((b) => ({ r: b as Rect, y: () => ikbHeight(b.floors) })),
    ...IKB_DECKS.map((k) => ({ r: k as Rect, y: () => k.y })),
    ...IKB_STAIRS.map((s) => ({
      r: s as Rect,
      y: (x: number, z: number) => {
        const len = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0;
        const u = (s.axis === 'x' ? x - s.x0 : z - s.z0) / len;
        const t = Math.min(1, Math.max(0, s.dir === 1 ? u : 1 - u));
        return s.low + (s.high - s.low) * t;
      },
    })),
  ];
  const walls: { r: Rect; top: number }[] = IKB_BUILDINGS.map((b) => ({ r: b as Rect, top: ikbHeight(b.floors) }));
  // (Edges count as inside: where two surfaces meet at a corner, the walker crosses there too.)
  const onRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const openAt = (x: number, z: number, y: number) =>
    walkTops.some((w) => onRect(w.r, x, z) && Math.abs(w.y(x, z) - y) <= STEP_UP_FENCE) || walls.some((w) => onRect(w.r, x, z) && w.top > y + STEP_UP_FENCE);
  const fence = (r: Rect, y: number) => {
    const edges: [number, number, number, number, number, number][] = [
      [r.x0, r.z0, r.x1, r.z0, 0, -1], [r.x0, r.z1, r.x1, r.z1, 0, 1], [r.x0, r.z0, r.x0, r.z1, -1, 0], [r.x1, r.z0, r.x1, r.z1, 1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      let run0 = -1;
      for (let t = 0; t <= len; t += STEP) {
        const m = Math.min(t + STEP / 2, len);
        const px = ax + ((bx - ax) * m) / len, pz = az + ((bz - az) * m) / len;
        const open = t < len && !openAt(px + nx * 4, pz + nz * 4, y);
        if (open && run0 < 0) run0 = t;
        if ((!open || t + STEP > len) && run0 >= 0) {
          const t1 = open ? len : t, L = t1 - run0;
          if (L > 2) {
            const cx = ax + ((bx - ax) * (run0 + L / 2)) / len - nx * (FENCE / 2), cz = az + ((bz - az) * (run0 + L / 2)) / len - nz * (FENCE / 2);
            box(cx, cz, nx ? FENCE : L, nx ? L : FENCE, y + FENCE_H, 'bldg', { y0: y, group: id, noFloor: true, seeThrough: true });
          }
          run0 = -1;
        }
      }
    }
  };
  for (const b of IKB_BUILDINGS) if (b.walk) fence(b, ikbHeight(b.floors));
  for (const k of IKB_DECKS) fence(k, k.y);
  // Stair and bridge sides: rails in short rising pieces wherever the side is open.
  for (const s of IKB_STAIRS) {
    const along = s.axis === 'x' ? [s.x0, s.x1] : [s.z0, s.z1];
    const sides = s.axis === 'x' ? [[s.z0, -1], [s.z1, 1]] : [[s.x0, -1], [s.x1, 1]];
    const hAt = (u: number) => s.low + (s.high - s.low) * Math.min(1, Math.max(0, s.dir === 1 ? (u - along[0]) / (along[1] - along[0]) : (along[1] - u) / (along[1] - along[0])));
    for (const [edge, n] of sides) {
      for (let u = along[0]; u < along[1] - 1; u += 20) {
        const u1 = Math.min(u + 20, along[1]), um = (u + u1) / 2, h = hAt(um);
        const ox = s.axis === 'x' ? um : edge + n * 4, oz = s.axis === 'x' ? edge + n * 4 : um;
        if (openAt(ox, oz, h)) continue;
        // Leave the first and last stretch of a flight open where people turn onto a landing
        // (a short drop onto the flight beside is harmless; a rail end there catches the turn).
        if (um - along[0] < 30 || along[1] - um < 30) continue;
        const lo = Math.min(hAt(u), hAt(u1)), hi = Math.max(hAt(u), hAt(u1));
        if (hi < 20) continue; // the foot of a stair needs no rail
        const fx = s.axis === 'x' ? (u + u1) / 2 : edge - n * (FENCE / 2), fz = s.axis === 'x' ? edge - n * (FENCE / 2) : (u + u1) / 2;
        box(fx, fz, s.axis === 'x' ? u1 - u : FENCE, s.axis === 'x' ? FENCE : u1 - u, hi + FENCE_H, 'bldg', { y0: Math.max(0, lo - 10), group: id, noFloor: true, seeThrough: true });
      }
    }
  }

  for (const l of IKB_LAMPS) LIGHTS.push({ x: l.x, z: l.z, ang: l.ang, wall: l.wall });
}

// ---------------------------------------------------------------- 品川 FUTURE GATEWAY (MAP REFORGE parallel C)
/**
 * The west side of the tracks between 高輪ゲートウェイ and 品川 is rebuilt by hand
 * (config/shinagawa.ts) after the generated city, the same way as the other reforged districts:
 * the generated pieces in the area (and the old walk-up that crowded the strategic point) are
 * taken out and the gateway put in — GATEWAY BOULEVARD, the TRANSIT DECK and its three stairs,
 * GATEWAY ARCH, GLASS FORUM, the SERVICE CORRIDOR and the LIGHT PLATFORM. The STAR base, its
 * LOCK POINT and the strategic point stay where they were, on open ground.
 */
export const SHINAGAWA_BUILT: { buildings: (ShinagawaBuilding & { h: number })[] } = { buildings: [] };
{
  const Z = SHG.SHINAGAWA_ZONE;
  const inZone = (x: number, z: number) => x > Z.x0 && x < Z.x1 && z > Z.z0 && z < Z.z1;
  const GENERATED = new Set<Material>(['bldg', 'pole', 'car', 'vending', 'tree', 'sidewalk']);
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i];
    if (!inZone(p.x, p.z)) continue;
    if ((GENERATED.has(p.mat) && (p.group === undefined || p.mat === 'vending' || p.mat === 'car')) || p.group === 'walkupT') prims.splice(i, 1);
  }
  const keep = <T,>(arr: T[], ok: (v: T) => boolean) => {
    const out = arr.filter(ok);
    arr.length = 0;
    arr.push(...out);
  };
  const out = (p: Point) => !inZone(p.x, p.z);
  keep(BUILDINGS, (b) => b.outside || out(b));
  keep(PARKINGS, out);
  keep(LIGHTS, out);
  keep(SIGNALS, out);
  keep(STREET_SEGS, out);
  keep(INTERSECTIONS, out);
  keep(CROSSWALKS, out);
  keep(BLOCKS, (b) => out({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }));
  {
    const remap = new Map<number, number>();
    const old = POLES.slice();
    POLES.length = 0;
    old.forEach((p, i) => { if (out(p)) { remap.set(i, POLES.length); POLES.push(p); } });
    const wires = WIRES.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
    WIRES.length = 0;
    WIRES.push(...wires);
  }

  // GATEWAY BOULEVARD: the carriageway between raised walks. The LIGHT PLATFORM and the STAR
  // base stay at street level (the strategic point is a ground spot).
  const B = SHG.BOULEVARD, BASE_Z0 = BASE_SITES.star.z - 250, BASE_X0 = BASE_SITES.star.x - 250;
  STREET_SEGS.push({ x: (-1654 + B.x1) / 2, z: (B.road0 + B.road1) / 2, w: B.x1 + 1654, d: B.road1 - B.road0, axis: 'x', kind: 'avenue' });
  const pave = (x0: number, z0: number, x1: number, z1: number, sides: Block['sides']) => {
    box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, CURB, 'sidewalk');
    BLOCKS.push({ x0, z0, x1, z1, sides });
  };
  pave(-1654, 3890, B.x1, B.road0, { n: 'avenue', s: 'avenue', w: 'street', e: 'alley' });
  pave(-1654, B.road1, BASE_X0, 5061, { n: 'avenue', s: 'street', w: 'street', e: 'alley' });
  pave(BASE_X0, B.road1, B.x1, BASE_Z0, { n: 'avenue', s: 'alley', w: 'alley', e: 'alley' });

  // Buildings: a podium and (towers) a set-back shaft.
  const rnd = prng(2828);
  for (const b of SHG.SHINAGAWA_BUILDINGS) {
    const h = b.skin === 'service' ? b.floors * STOREY + 30 : floorsToHeight(b.floors), x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    if (b.setback && b.podium) {
      const ph = floorsToHeight(b.podium), s = b.setback;
      box(x, z, w, d, ph, 'bldg', { noFloor: true });
      box(x, z, w - 2 * s, d - 2 * s, h, 'bldg', { noFloor: true, y0: ph });
    } else box(x, z, w, d, h, 'bldg', { noFloor: true });
    BUILDINGS.push({ x, z, w, d, h, type: b.floors >= 12 ? 'tower' : b.floors <= 3 ? 'shop' : 'office', floors: b.floors, district: 'business', front: b.fronts[0], seed: Math.floor(rnd() * 1e9), outside: false, custom: 'shinagawa' });
    SHINAGAWA_BUILT.buildings.push({ ...b, h });
  }

  // GLASS FORUM: glass walls (you see through them) with doors, a light roof.
  {
    const F = SHG.FORUM, T = 14, id = 'shgForum';
    const wall = (side: 'n' | 's' | 'e' | 'w', gaps: { at: number; w: number }[]) => {
      const horiz = side === 'n' || side === 's';
      const a0 = horiz ? F.x0 : F.z0, a1 = horiz ? F.x1 : F.z1;
      const fixed = side === 'n' ? F.z0 + T / 2 : side === 's' ? F.z1 - T / 2 : side === 'w' ? F.x0 + T / 2 : F.x1 - T / 2;
      let a: number = a0;
      for (const [g0, g1] of [...gaps.map((g) => [g.at - g.w / 2, g.at + g.w / 2]), [a1, a1]]) {
        if (g0 - a > 1) {
          if (horiz) box((a + g0) / 2, fixed, g0 - a, T, F.h, 'glass', { group: id, seeThrough: true, noFloor: true });
          else box(fixed, (a + g0) / 2, T, g0 - a, F.h, 'glass', { group: id, seeThrough: true, noFloor: true });
        }
        a = g1;
      }
    };
    wall('n', [SHG.FORUM.doorN]);
    wall('s', [SHG.FORUM.doorS]);
    wall('w', [SHG.FORUM.doorW]);
    wall('e', []);
    box((F.x0 + F.x1) / 2, (F.z0 + F.z1) / 2, F.x1 - F.x0, F.z1 - F.z0, F.h, 'glass', { y0: F.h - SLAB, group: id, noFloor: true });
  }

  // TRANSIT DECK: slab, glass balustrades where the edge is open (deck and street see each other), colonnade, the three stairs.
  {
    const D = SHG.TRANSIT_DECK, H = SHG.DECK_H, id = 'shgDeck', RAIL = 6, RAIL_H = 34;
    slab((D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2, D.x1 - D.x0, D.z1 - D.z0, H, 'metal', id);
    const solidHere = (x: number, z: number) => SHG.DECK_STAIRS.some((s) => x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1)
      || SHINAGAWA_BUILT.buildings.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)
      || (x > SHG.FORUM.x0 - 1 && x < SHG.FORUM.x1 + 1 && z > SHG.FORUM.z0 - 1 && z < SHG.FORUM.z1 + 1);
    const edges: [number, number, number, number, number, number][] = [
      [D.x0, D.z0, D.x1, D.z0, 0, -1], [D.x0, D.z1, D.x1, D.z1, 0, 1], [D.x0, D.z0, D.x0, D.z1, -1, 0], [D.x1, D.z0, D.x1, D.z1, 1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const len = Math.hypot(bx - ax, bz - az), STEP = 10;
      let run0 = -1;
      for (let t = 0; t <= len; t += STEP) {
        const px = ax + ((bx - ax) * Math.min(t + STEP / 2, len)) / len, pz = az + ((bz - az) * Math.min(t + STEP / 2, len)) / len;
        const open = t < len && !solidHere(px + nx * 4, pz + nz * 4);
        if (open && run0 < 0) run0 = t;
        if ((!open || t + STEP > len) && run0 >= 0) {
          const t1 = open ? len : t, L = t1 - run0;
          if (L > 2) {
            const cx = ax + ((bx - ax) * (run0 + L / 2)) / len - nx * (RAIL / 2), cz = az + ((bz - az) * (run0 + L / 2)) / len - nz * (RAIL / 2);
            box(cx, cz, nx ? RAIL : L, nx ? L : RAIL, H + RAIL_H, 'glass', { y0: H, group: id, seeThrough: true });
          }
          run0 = -1;
        }
      }
    }
    for (const [x, z] of SHG.DECK_LEGS) box(x, z, 24, 24, H - SLAB, 'metal', { group: id });
    for (const s of SHG.DECK_STAIRS) ramp((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.z1 - s.z0, s.axis, s.dir, s.low, H, 'stairs', 'metal', id);
  }

  // GATEWAY ARCH: two piers and the lintel over the deck and the boulevard.
  {
    const A = SHG.ARCH, x = (A.x0 + A.x1) / 2, w = A.x1 - A.x0, id = 'shgArch';
    for (const p of [A.pierN, A.pierS]) box(x, (p.z0 + p.z1) / 2, w, p.z1 - p.z0, A.top, 'concrete', { group: id, noFloor: true });
    box(x, (A.pierN.z0 + A.pierS.z1) / 2, w, A.pierS.z1 - A.pierN.z0, A.top, 'concrete', { y0: A.lintel0, group: id, noFloor: true });
  }
  // The station canopy (roof out of reach) and its columns.
  {
    const C = SHG.CANOPY, id = 'shgCanopy';
    box((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, C.x1 - C.x0, C.z1 - C.z0, C.y, 'metal', { y0: C.y - 10, group: id, noFloor: true });
    for (const [x, z] of C.cols) box(x, z, 16, 16, C.y - 10, 'metal', { group: id, noFloor: true });
  }

  // Street furniture: props, trees, lamps.
  for (const p of SHG.SHINAGAWA_PROPS) {
    const s = SHG.PROP_SIZE[p.kind], turn = Math.abs(Math.sin(p.ang ?? 0)) > 0.5, onWalk = p.x < B.x1 && p.z > 3890 && p.z < 5061 && !(p.z > B.road0 && p.z < B.road1);
    box(p.x, p.z, turn ? s.d : s.w, turn ? s.w : s.d, s.h + (onWalk ? CURB : 0), 'metal', { group: 'shgProp', noFloor: true });
  }
  for (const [x, z] of SHG.SHINAGAWA_TREES) tree(x, z, 260);
  for (const l of SHG.SHINAGAWA_LAMPS) LIGHTS.push({ x: l.x, z: l.z, ang: l.ang, wall: l.wall });
}

// ---------------------------------------------------------------- 東京タワー RED HEIGHT (MAP REFORGE parallel E)
/**
 * The ground round Tokyo Tower is rebuilt by hand (config/tokyoTower.ts) after the generated
 * city, the same way as the other reforged districts: the generated pieces in the area, the old
 * FootTown block and its stair, and the 増上寺 hall are taken out, and RED HEIGHT put in — the
 * RED AXIS through TOWER GATE, SKY PLAZA under the tower, the TERRACE RING and RED TERRACE, and
 * the SERVICE SLOPE behind SERVICE WALL. The legs keep their place; the tower itself is drawn
 * by render/tokyoTower.ts. Everything new is in groups 'ttw*'.
 */
{
  const inZone = (x: number, z: number) => TTW.inTokyoTowerZone(x, z);
  const GENERATED = new Set<Material>(['bldg', 'pole', 'car', 'vending', 'tree', 'sidewalk']);
  const OLD = new Set(['tokyoTowerLeg', 'tokyoTowerSpire', 'tokyoTower', 'footTown', 'temple']);
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i];
    if (!inZone(p.x, p.z)) continue;
    // (FootTown's roof parapets are plain metal boxes without a group.)
    if ((GENERATED.has(p.mat) && (p.group === undefined || p.mat === 'vending' || p.mat === 'car')) || OLD.has(p.group ?? '') || (p.mat === 'metal' && p.group === undefined)) prims.splice(i, 1);
  }
  const keep = <T,>(arr: T[], ok: (v: T) => boolean) => {
    const out = arr.filter(ok);
    arr.length = 0;
    arr.push(...out);
  };
  const out = (p: Point) => !inZone(p.x, p.z);
  keep(BUILDINGS, (b) => b.outside || out(b));
  keep(PARKINGS, out);
  keep(LIGHTS, out);
  keep(SIGNALS, out);
  keep(CROSSWALKS, out);
  keep(BLOCKS, (b) => out({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }));
  {
    const remap = new Map<number, number>();
    const old = POLES.slice();
    POLES.length = 0;
    old.forEach((p, i) => { if (out(p)) { remap.set(i, POLES.length); POLES.push(p); } });
    const wires = WIRES.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!] as [number, number]);
    WIRES.length = 0;
    WIRES.push(...wires);
  }

  const rect = (r: { x0: number; z0: number; x1: number; z1: number }, y1: number, mat: Material, extra: Partial<BoxPrim> = {}) =>
    box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, y1, mat, extra);
  const { RING_H, RED_H } = TTW;

  // The tower: the legs on their concrete footings (solid to sight and the camera up to 420, where the lattice
  // leans in), and the body above them (out of reach).
  for (const [x, z] of TTW.LEGS) {
    box(x, z, TTW.FOOTING, TTW.FOOTING, TTW.FOOTING_H, 'concrete', { group: 'ttwLeg', noFloor: true });
    box(x, z, TTW.LEG, TTW.LEG, 420, 'steel', { group: 'ttwLeg', noFloor: true });
  }
  box(TTW.TT.x, TTW.TT.z, 90, 90, TOKYO_TOWER_H, 'steel', { y0: 700, group: 'ttwSpire', noFloor: true });

  // B. TERRACE RING: solid terraces, the bridge over the service tunnel, RED TERRACE over the axis.
  for (const t of TTW.TERRACES) rect(t, RING_H, 'stone', { group: 'ttwTerrace' });
  rect(TTW.TUNNEL, RING_H, 'stone', { y0: RING_H - SLAB, group: 'ttwTerrace' });
  rect(TTW.RED_TERRACE, RED_H, 'steel', { y0: RED_H - SLAB, group: 'ttwRed' });
  for (const s of TTW.STAIRS) {
    prims.push({
      kind: 'ramp', x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, w: s.x1 - s.x0, d: s.z1 - s.z0, y0: 0,
      axis: s.axis, dir: s.dir, hLow: s.low, hHigh: s.high, style: s.style, mat: s.style === 'slope' ? 'concrete' : 'stone', group: 'ttwStair',
    });
  }

  // Railings: every edge of a walkable top whose outside is neither another walkable top at the
  // same height nor a wall rising above it. Steel mesh: it stops bodies, not eyes (the ring sees the plaza).
  const RAIL = 6, RAIL_H = 34, STEP = 10, STEP_UP_RAIL = 12;
  type Top = { r: { x0: number; z0: number; x1: number; z1: number }; y: (x: number, z: number) => number };
  const stairY = (s: TtwStair) => (x: number, z: number) => {
    const len = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0;
    const u = (s.axis === 'x' ? x - s.x0 : z - s.z0) / len;
    return s.low + (s.high - s.low) * Math.min(1, Math.max(0, s.dir === 1 ? u : 1 - u));
  };
  const tops: Top[] = [
    ...TTW.TERRACES.map((t) => ({ r: t, y: () => RING_H })),
    { r: TTW.TUNNEL, y: () => RING_H },
    { r: TTW.RED_TERRACE, y: () => RED_H },
    ...TTW.STAIRS.map((s) => ({ r: s as Top['r'], y: stairY(s) })),
  ];
  const walls: { r: Top['r']; top: number }[] = [...TTW.SERVICE_WALL.map((w) => ({ r: w, top: w.h }))];
  const onRect = (r: Top['r'], x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const openAt = (x: number, z: number, y: number) =>
    tops.some((w) => onRect(w.r, x, z) && Math.abs(w.y(x, z) - y) <= STEP_UP_RAIL) || walls.some((w) => onRect(w.r, x, z) && w.top > y + STEP_UP_RAIL);
  const railRuns = (r: Top['r'], y: number) => {
    const edges: [number, number, number, number, number, number][] = [
      [r.x0, r.z0, r.x1, r.z0, 0, -1], [r.x0, r.z1, r.x1, r.z1, 0, 1], [r.x0, r.z0, r.x0, r.z1, -1, 0], [r.x1, r.z0, r.x1, r.z1, 1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      let run0 = -1;
      for (let t = 0; t <= len; t += STEP) {
        const m = Math.min(t + STEP / 2, len);
        const px = ax + ((bx - ax) * m) / len, pz = az + ((bz - az) * m) / len;
        const open = t < len && !openAt(px + nx * 4, pz + nz * 4, y);
        if (open && run0 < 0) run0 = t;
        if ((!open || t + STEP > len) && run0 >= 0) {
          const t1 = open ? len : t, L = t1 - run0;
          if (L > 2) {
            const cx = ax + ((bx - ax) * (run0 + L / 2)) / len - nx * (RAIL / 2), cz = az + ((bz - az) * (run0 + L / 2)) / len - nz * (RAIL / 2);
            box(cx, cz, nx ? RAIL : L, nx ? L : RAIL, y + RAIL_H, 'metal', { y0: y, group: 'ttwRail', noFloor: true, seeThrough: true });
          }
          run0 = -1;
        }
      }
    }
  };
  for (const t of [...TTW.TERRACES, TTW.TUNNEL]) railRuns(t, RING_H);
  railRuns(TTW.RED_TERRACE, RED_H);
  // Stair and slope sides: rails in short rising pieces where the side is open and the drop is real
  // (the bottom of a flight stays open: stepping off there is a short hop, never a trap).
  for (const s of TTW.STAIRS) {
    const along = s.axis === 'x' ? [s.x0, s.x1] : [s.z0, s.z1];
    const sides = s.axis === 'x' ? [[s.z0, -1], [s.z1, 1]] : [[s.x0, -1], [s.x1, 1]];
    const hAt = (u: number) => (s.axis === 'x' ? stairY(s)(u, s.z0) : stairY(s)(s.x0, u));
    for (const [edge, n] of sides) {
      for (let u = along[0]; u < along[1] - 1; u += 20) {
        const u1 = Math.min(u + 20, along[1]), um = (u + u1) / 2, h = hAt(um);
        const ox = s.axis === 'x' ? um : edge + n * 4, oz = s.axis === 'x' ? edge + n * 4 : um;
        if (openAt(ox, oz, h)) continue;
        const lo = Math.min(hAt(u), hAt(u1)), hi = Math.max(hAt(u), hAt(u1));
        if (lo - s.low < 40 && s.low === 0) continue;
        const fx = s.axis === 'x' ? um : edge - n * (RAIL / 2), fz = s.axis === 'x' ? edge - n * (RAIL / 2) : um;
        box(fx, fz, s.axis === 'x' ? u1 - u : RAIL, s.axis === 'x' ? RAIL : u1 - u, hi + RAIL_H, 'metal', { y0: Math.max(0, lo - 10), group: 'ttwRail', noFloor: true, seeThrough: true });
      }
    }
    // A side stair (along a wall) ends in the open at its top: a rail across its high end.
    const hiEnd = s.axis === 'x' ? (s.dir === 1 ? s.x1 : s.x0) : (s.dir === 1 ? s.z1 : s.z0);
    const cross = s.axis === 'x' ? [s.z0, s.z1] : [s.x0, s.x1], n = s.dir;
    let run0 = -1;
    for (let v = cross[0]; v <= cross[1]; v += STEP) {
      const vm = Math.min(v + STEP / 2, cross[1]);
      const ox = s.axis === 'x' ? hiEnd + n * 4 : vm, oz = s.axis === 'x' ? vm : hiEnd + n * 4;
      const open = v < cross[1] && !openAt(ox, oz, s.high);
      if (open && run0 < 0) run0 = v;
      if ((!open || v + STEP > cross[1]) && run0 >= 0) {
        const v1 = open ? cross[1] : v, L = v1 - run0, c = run0 + L / 2;
        if (L > 2) {
          if (s.axis === 'x') box(hiEnd - n * (RAIL / 2), c, RAIL, L, s.high + RAIL_H, 'metal', { y0: s.high, group: 'ttwRail', noFloor: true, seeThrough: true });
          else box(c, hiEnd - n * (RAIL / 2), L, RAIL, s.high + RAIL_H, 'metal', { y0: s.high, group: 'ttwRail', noFloor: true, seeThrough: true });
        }
        run0 = -1;
      }
    }
  }

  // C. SERVICE WALL (equipment, no roof to stand on) and the kiosk at the lane's mouth.
  for (const w of TTW.SERVICE_WALL) rect(w, w.h, 'bldg', { group: 'ttwService', noFloor: true });
  rect(TTW.SERVICE_KIOSK, TTW.SERVICE_KIOSK.h, 'bldg', { group: 'ttwService', noFloor: true });
  // TOWER GATE: piers and the lintel over the axis; low planters along the plaza's south edge.
  {
    const G = TTW.GATE;
    for (const p of [G.pierW, G.pierE]) rect({ x0: p.x0, x1: p.x1, z0: G.z0, z1: G.z1 }, G.top, 'concrete', { group: 'ttwGate', noFloor: true });
    rect({ x0: G.pierW.x1, x1: G.pierE.x0, z0: G.z0 + 6, z1: G.z1 - 6 }, G.top, 'steel', { y0: G.lintel0, group: 'ttwGate', noFloor: true });
    for (const r of TTW.GATE_PLANTERS) rect(r, TTW.PLANTER_H, 'stone', { group: 'ttwPlanter', noFloor: true });
  }
  // The blocks beside the south approach (backdrop).
  for (const b of TTW.SOUTH_BLOCKS) rect(b, b.h, 'bldg', { group: 'ttwBlock', noFloor: true });

  // Street furniture, trees, lamps.
  for (const p of TTW.TTW_PROPS) {
    const s = TTW.PROP_SIZE[p.kind], turn = Math.abs(Math.sin(p.ang ?? 0)) > 0.5, y0 = p.y ?? 0;
    box(p.x, p.z, turn ? s.d : s.w, turn ? s.w : s.d, y0 + s.h, 'metal', { y0, group: 'ttwProp', noFloor: true });
  }
  for (const [x, z, h] of TTW.TTW_TREES) tree(x, z, h);
  for (const l of TTW.TTW_LAMPS) LIGHTS.push({ x: l.x, z: l.z, ang: l.ang, wall: l.wall });
}

export const WORLD: readonly Prim[] = prims;

/** Green and gravel areas painted on the ground (decoration). */
export const PARKS: readonly { x: number; z: number; w: number; d: number; kind: 'park' | 'gravel' }[] = [
  { x: PALACE_PLAZA.x, z: PALACE_PLAZA.z, w: PALACE_PLAZA.w + 40, d: PALACE_PLAZA.d + 40, kind: 'gravel' },
  { x: TOWER.x, z: TOWER.z, w: PLAZA.r * 2, d: PLAZA.r * 2, kind: 'park' },
  { x: GYOEN.x, z: GYOEN.z, w: GYOEN.w, d: GYOEN.d, kind: 'park' },
  { x: STADIUM.x, z: STADIUM.z + 60, w: STADIUM.W - 2 * STADIUM.T, d: STADIUM.D - 2 * STADIUM.T, kind: 'park' },
  { x: UENO_HILL.x, z: UENO_HILL.z, w: UENO_HILL.w + 200, d: UENO_HILL.d + 200, kind: 'park' },
  { x: RIKUGIEN.x, z: RIKUGIEN.z, w: 520, d: 400, kind: 'park' },
  { x: ATAGO.x, z: ATAGO.z, w: ATAGO.w + 100, d: ATAGO.d + 100, kind: 'park' },
  { x: TOKYO_TOWER.x, z: TOKYO_TOWER.z + 170, w: 560, d: 820, kind: 'gravel' },
];

/** Landmarks the renderer decorates (spires, domes, roofs) — positions only. */
export const LANDMARKS = {
  tokyoTower: TOKYO_TOWER,
  footTown: FOOTTOWN,
  tokyoStation: TOKYO_ST,
  diet: DIET,
  dome: DOME,
};

// ---------------------------------------------------------------- AI hints

/** Places patrols and searches gravitate to, so encounters happen across the city. */
export const HOTSPOTS: readonly (Point & { name: string; weight: number })[] = [
  { name: '日比谷公園（管制塔）', x: TOWER.x, z: TOWER.z + 150, weight: 4 },
  { name: '皇居前広場', x: PALACE_PLAZA.x, z: PALACE_PLAZA.z, weight: 3 },
  { name: '国会議事堂', x: DIET.x, z: DIET.z + 220, weight: 2 },
  { name: '東京タワー', x: TOKYO_TOWER.x, z: TOKYO_TOWER.z + 450, weight: 3 },
  { name: '六本木', ...geo(35.6628, 139.7330), weight: 2 },
  { name: '国立競技場', x: STADIUM.x, z: STADIUM.z + 60, weight: 2 },
  { name: '新宿御苑', x: GYOEN.x - 150, z: GYOEN.z, weight: 2 },
  { name: '東京ドーム', x: DOME.x, z: DOME.z + DOME.r + 150, weight: 2 },
  { name: '聖橋', x: HIJIRI, z: riverZAt(HIJIRI) - 400, weight: 2 },
  { name: '飯田橋', x: BRIDGE_X[3], z: riverZAt(BRIDGE_X[3]) + 330, weight: 2 },
  { name: '江戸川橋', x: BRIDGE_X[2], z: riverZAt(BRIDGE_X[2]) + 330, weight: 1 },
  { name: '秋葉原', ...geo(35.6993, 139.7695), weight: 2 },
  { name: '池袋', ...geo(35.7280, 139.7150), weight: 1 },
  { name: '渋谷', ...geo(35.6600, 139.7060), weight: 2 },
  { name: '愛宕山', x: ATAGO.x - ATAGO.w / 2 - 540, z: ATAGO.z + 60, weight: 1 },
  { name: '恵比寿', ...geo(35.6440, 139.7160), weight: 1 },
];

/** High places snipers hold (stand points on the walkable tops). */
export const PERCHES: readonly (Point & { y: number })[] = [
  { x: (TTW.RED_TERRACE.x0 + TTW.RED_TERRACE.x1) / 2, y: TTW.RED_H, z: (TTW.RED_TERRACE.z0 + TTW.RED_TERRACE.z1) / 2 }, // 東京タワー RED TERRACE
  { x: ATAGO.x, y: ATAGO.top, z: ATAGO.z },
  { x: UENO_HILL.x + 60, y: UENO_HILL.top, z: UENO_HILL.z + 80 },
  { x: PALACE.x - 80, y: PALACE.top + 90, z: PALACE.z - 250 },
  { x: EXPRESS_C.x, y: EXPRESSWAY_H, z: sc(250) + 300 },
  { x: sc(-400), y: EXPRESSWAY_H, z: EXPRESS_5.z },
  { x: STADIUM.x, y: STADIUM.H, z: STADIUM.z + 60 - STADIUM.D / 2 + STADIUM.T / 2 },
  { x: WALKUP_KABUKI.terrace.x, y: UPPER, z: WALKUP_KABUKI.terrace.z },
  ...FOOTBRIDGES.map((f) => ({ x: f.x, y: FOOTBRIDGE_H, z: f.z })),
  { x: -2700, y: SKY_H, z: 1720 }, // 渋谷 SKY RING over the scramble
  { x: -2700, y: HIGH_H, z: -765 }, // 新宿 SKY BRIDGE over the avenue
];

/**
 * Named reference points (used by tests and debugging), all derived from the
 * geometry above so they stay valid if the layout changes.
 */
export const SITES = {
  /** Open, flat ground with nothing solid within ~180 units (皇居前広場). */
  open: { x: PALACE_PLAZA.x, z: PALACE_PLAZA.z },
  /** 2F building: stair foot (on the first step), 2F terrace, and a ground-floor spot under the 2F slab. */
  walkup: WALKUP_KABUKI,
  /** Tokyo Tower (RED HEIGHT): half way up the gate stair to the west terrace (it rises northward), and the terrace. */
  towerStairsMid: { x: 105, z: 2900, y: 28 },
  towerDeck: { x: 105, y: TTW.RING_H, z: 2600 },
  /** 上野の山: foot of the WEST RAMP (walk north to climb), the top, and a cliff foot to the north. */
  hillSlopeFoot: { x: (WEST_RAMP.x0 + WEST_RAMP.x1) / 2, z: WEST_RAMP.z1 + 50 },
  hillSlopeDir: { x: 0, z: -1 },
  hillTop: { x: UENO_HILL.x + 200, y: UENO_HILL.top, z: UENO_HILL.z + 60 },
  hillCliffFoot: { x: UENO_HILL.x + 60, z: UENO_HILL.z - UENO_HILL.d / 2 - 40 },
  /** 愛宕山 stone stairs (rise westward): a point half way up. */
  atagoStairsMid: { x: ATAGO.x + ATAGO.w / 2 + 110, z: ATAGO.z, y: ATAGO.top / 2 },
  /** Expressway: a street point west of the deck (walk east to pass under it) and a deck point. */
  underExpressway: { x: EXPRESS_C.x - EXPRESSWAY_W / 2 - 120, z: sc(250), passX: EXPRESS_C.x + EXPRESSWAY_W / 2 + 20 },
  expresswayDeck: { x: EXPRESS_C.x, y: EXPRESSWAY_H, z: sc(250) + 300 },
  /** Arcade: just outside the west door (walk east through it) and the far end. */
  arcadeWest: { x: ARCADE.x - ARCADE.w / 2 - 40, z: ARCADE.z },
  arcadeEastEnd: ARCADE.x + ARCADE.w / 2,
  /** 聖橋 (arched): south approach (walk north to cross); and a river bank point away from bridges. */
  bridgeSouth: { x: HIJIRI, z: riverZAt(HIJIRI) + 360 },
  riverBank: { x: sc(800), z: riverZAt(sc(800)) + RIVER_WIDTH / 2 + 60 },
  riverZ: riverZAt,
  /** Palace: a point on the island top. */
  palaceTop: { x: PALACE.x + 150, y: PALACE.top, z: PALACE.z + 330 },
  /** 国会議事堂: points north and south of it, off the tower's line, and a height that sees over it. */
  dietNorth: { x: DIET.x + 180, z: DIET.z - DIET.d / 2 - 90 },
  dietSouth: { x: DIET.x + 180, z: DIET.z + DIET.d / 2 + 90 },
  dietOverY: DIET.h * 4 + 200,
  /** 上野 STONE AXIS (rises northward): half way up the lower flight. */
  uenoStairsMid: { x: (STONE_AXIS.x0 + STONE_AXIS.x1) / 2, z: (STONE_AXIS.lower.z0 + STONE_AXIS.lower.z1) / 2, y: (STONE_AXIS.lower.h0 + STONE_AXIS.lower.h1) / 2 },
  /** 聖橋 south slope, half way up. */
  bridgeSlopeMid: { x: HIJIRI, z: riverZAt(HIJIRI) + 200, y: 30 },
  /** A footbridge deck (歩道橋), if any was placed. */
  footbridge: FOOTBRIDGES[0] ? { x: FOOTBRIDGES[0].x, y: FOOTBRIDGE_H, z: FOOTBRIDGES[0].z } : null,
};
