import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND_FLOOR, STOREY, floorsToHeight, insideLoop, WALK_EDGE } from '../config/map';
import type { ChuoAnnex, ChuoRect } from '../config/chuo';
import {
  ANNEXES, AXIS, CHUO_LAMPS, CHUO_LIGHTS, CONSOLES, CONSOLE_H, CONTROL_POINT, CORE, CORE_BACK, CORE_COURT, CORE_FRAME, CORE_UNIT, CORE_ZONE_R, DATA_CAP, DATA_WALL,
  GATES, GATE_LINTEL, HALLS, HALL_LANES, HALL_ROOF, PILLAR, PLAZA, PYLON, PYLONS, RACK_H, RING, RING_BLOCKS, RING_H, RING_LANES, TERRACES, TERRACE_STEP,
} from '../config/chuo';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { nearFade } from './city';
import { radialGlowTexture, sharedFacadeTexture } from './textures';

/**
 * MAP REFORGE parallel F — 中央 CONTROL CORE, as drawn.
 *
 * A controlled place, not a neon street: charcoal, white and light grey, straight lines and a
 * floor grid, with a little cold blue-white and a touch of green. What lights up is the
 * architecture and the plant — floor lines, pylon strips, the edges of the frames, DATA WALL's
 * panels — never advertising. Each route has its own reading: the CORE AXIS is a pale strip
 * between two white lines and the pylon colonnade, the RING ROUTE a darker lane edged in green,
 * the CONTROL PASSAGE a covered hall with blue-white ceiling strips and a guide line on the
 * floor. The CONTROL CORE is a mid-rise control unit under a square frame, with the owner's flag.
 *
 * Night: thin lines only (floor, pylons, frame and core edges), bright enough to read the plan
 * from the street and never a lit-up SF set.
 *
 * Performance: the district is made of repeated parts, so they are instanced (pylons, hall
 * pillars, frame columns, roof plant, lamp heads) or merged by material; the street-level detail
 * (consoles, rack lights, small plates) sits in two LOD clusters dropped beyond 1,600 units.
 */

const [WHITE, BLUEWHITE, GREEN, COOLGREY] = CHUO_LIGHTS;
const CHARCOAL = 0x2c3037, DARK = 0x3b4048, MIDGREY = 0x7d858f, LIGHTGREY = 0xc6ccd3, FRAME = 0xe9ecf0, PAVE = 0x6b7078;

const ATLAS_W = 1024, ATLAS_H = 512;
type Cell = [number, number, number, number];
const CELLS = {
  data: (i: number): Cell => [(i % 4) * 256, 0, 256, 128],
  way: (i: number): Cell => [(i % 4) * 256, 128, 256, 64],
  band: (i: number): Cell => [(i % 2) * 512, 192 + Math.floor(i / 2) * 64, 512, 64],
  rack: [0, 384, 128, 128] as Cell,
  console: [128, 384, 128, 64] as Cell,
  plate: [256, 384, 128, 64] as Cell,
};
const WAYS: [string, string, string, string][] = [
  ['A', 'CORE AXIS', 'コアへ直進', '→'], ['B', 'RING ROUTE', '外周', '↻'], ['C', 'CONTROL PASSAGE', '制御通路', '↓'], ['◎', 'CONTROL CORE', '管制コア', '●'],
];
const BANDS = ['CHUO  CONTROL CORE', 'CONTROL RING  中央', 'WEST GATE  CORE AXIS', 'NORTH GATE', 'SOUTH GATE', 'C  CONTROL PASSAGE'];
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d')!;
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = '700') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  // DATA WALL panels: charcoal, a fine grid, rows of figures, bar graphs and a plan trace.
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = CELLS.data(i);
    g.fillStyle = '#16191e'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(220,232,255,.10)'; g.lineWidth = 1;
    for (let gx = 0; gx <= w; gx += 16) { g.beginPath(); g.moveTo(x + gx + 0.5, y); g.lineTo(x + gx + 0.5, y + h); g.stroke(); }
    for (let gy = 0; gy <= h; gy += 16) { g.beginPath(); g.moveTo(x, y + gy + 0.5); g.lineTo(x + w, y + gy + 0.5); g.stroke(); }
    let seed = i * 977 + 13;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (i % 2 === 0) {
      for (let row = 0; row < 7; row++) {
        g.fillStyle = row === 0 ? css(GREEN, 0.9) : css(WHITE, 0.55 + r() * 0.3);
        for (let k = 0; k < 6; k++) g.fillRect(x + 10 + k * 40, y + 10 + row * 16, 10 + r() * 22, 5);
      }
    } else {
      for (let k = 0; k < 14; k++) {
        const bh = 12 + r() * 70;
        g.fillStyle = k % 5 === 0 ? css(GREEN, 0.85) : css(BLUEWHITE, 0.75);
        g.fillRect(x + 12 + k * 17, y + h - 12 - bh, 9, bh);
      }
      g.strokeStyle = css(WHITE, 0.8); g.lineWidth = 2; g.beginPath();
      for (let k = 0; k <= 12; k++) { const px = x + 12 + k * 19, py = y + 30 + r() * 30; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
    }
    g.fillStyle = css(WHITE, 0.9); g.fillRect(x, y, w, 3); g.fillRect(x, y + h - 3, w, 3);
  }
  // Route plates: charcoal, the route letter in a white square, the name, a light rule in the route's colour.
  WAYS.forEach(([code, en, jp, arrow], i) => {
    const [x, y, w, h] = CELLS.way(i);
    const col = i === 1 ? GREEN : i === 2 ? BLUEWHITE : WHITE;
    g.fillStyle = '#23272d'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f2f4f7'; g.fillRect(x + 6, y + 6, 52, 52);
    text(code, x + 32, y + 33, 36, '#23272d', 'center', '900');
    text(en, x + 68, y + 22, 20, '#ffffff', 'left', '800');
    text(jp, x + 68, y + 46, 16, 'rgba(255,255,255,.72)', 'left', '700');
    text(arrow, x + w - 24, y + h / 2, 30, css(col), 'center', '900');
    g.fillStyle = css(col); g.fillRect(x, y + h - 4, w, 4);
  });
  // Name bands on the architecture: white letters on charcoal, a fine light rule.
  BANDS.forEach((s, i) => {
    const [x, y, w, h] = CELLS.band(i);
    g.fillStyle = '#25292f'; g.fillRect(x, y, w, h);
    text(s, x + w / 2, y + h / 2 + 1, 30, '#eef2f7', 'center', '800');
    g.fillStyle = css(i === 1 ? GREEN : BLUEWHITE, 0.9); g.fillRect(x + 24, y + h - 7, w - 48, 2);
  });
  {
    // Equipment rack front: dark doors, rows of small status lights.
    const [x, y, w, h] = CELLS.rack;
    g.fillStyle = '#1b1e23'; g.fillRect(x, y, w, h);
    g.fillStyle = '#2e333a'; for (let k = 0; k < 4; k++) g.fillRect(x + 4 + k * 31, y + 4, 28, h - 8);
    for (let k = 0; k < 4; k++) for (let row = 0; row < 9; row++) {
      g.fillStyle = (k + row) % 7 === 0 ? css(GREEN) : (k * 3 + row) % 5 === 0 ? css(BLUEWHITE) : 'rgba(255,255,255,.28)';
      g.fillRect(x + 10 + k * 31, y + 12 + row * 12, 6, 3);
    }
  }
  {
    // Console screen: cold blue-white schematic.
    const [x, y, w, h] = CELLS.console;
    g.fillStyle = '#121519'; g.fillRect(x, y, w, h);
    g.strokeStyle = css(BLUEWHITE, 0.85); g.lineWidth = 2; g.strokeRect(x + 10, y + 10, 46, 44);
    g.beginPath(); g.arc(x + 33, y + 32, 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = css(GREEN, 0.9); g.fillRect(x + 66, y + 14, 50, 4);
    g.fillStyle = css(WHITE, 0.6); for (let k = 0; k < 4; k++) g.fillRect(x + 66, y + 26 + k * 8, 30 + ((k * 13) % 22), 3);
  }
  {
    // A small numbered plate (frame columns, gate posts).
    const [x, y, w, h] = CELLS.plate;
    g.fillStyle = '#eef1f5'; g.fillRect(x, y, w, h);
    text('CTRL', x + w / 2, y + 22, 22, '#25292f', 'center', '900');
    g.fillStyle = css(GREEN); g.fillRect(x + 20, y + 44, w - 40, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** The paving: dark-grey slabs on a 100-unit grid with fine seams (the grid the whole facility is laid out on). */
function pavingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  // Slight variation per slab (four 128 slabs = 2 × 2 grid cells of 50 at 100 units per 256 px… kept simple).
  const tones = ['#f4f4f4', '#ebebeb', '#f0f0f0', '#e6e6e6'];
  for (let i = 0; i < 4; i++) { g.fillStyle = tones[i]; g.fillRect((i % 2) * 128, Math.floor(i / 2) * 128, 128, 128); }
  g.fillStyle = 'rgba(0,0,0,.28)';
  for (const p of [0, 128]) { g.fillRect(p, 0, 3, 256); g.fillRect(0, p, 256, 3); }
  g.fillStyle = 'rgba(0,0,0,.08)';
  for (const p of [64, 192]) { g.fillRect(p, 0, 1, 256); g.fillRect(0, p, 256, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** A flat textured quad facing (nx, 0, nz), mapped to an atlas cell. */
function quad(w: number, h: number, cell: Cell, x: number, y: number, z: number, nx: number, nz: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [cx, cy, cw, ch] = cell;
  const u0 = cx / ATLAS_W, u1 = (cx + cw) / ATLAS_W, v1 = 1 - cy / ATLAS_H, v0 = 1 - (cy + ch) / ATLAS_H;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  g.rotateY(Math.atan2(nx, nz));
  return g.translate(x, y, z);
}
/** Geometry with a baked vertex colour (no UVs). */
function tint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = ng.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  ng.deleteAttribute('uv');
  return ng;
}
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const flat = (w: number, d: number, x: number, y: number, z: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
/** A thin strip on the ground from (ax, az) to (bx, bz). */
const line = (ax: number, az: number, bx: number, bz: number, w: number, y: number) => {
  const len = Math.hypot(bx - ax, bz - az);
  return new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2).rotateY(Math.atan2(bx - ax, bz - az)).translate((ax + bx) / 2, y, (az + bz) / 2);
};
/** The outline of a rectangle on the ground. */
const outline = (r: ChuoRect, w: number, y: number, out: THREE.BufferGeometry[], color: number) => {
  out.push(tint(line(r.x0, r.z0, r.x1, r.z0, w, y), color), tint(line(r.x0, r.z1, r.x1, r.z1, w, y), color));
  out.push(tint(line(r.x0, r.z0, r.x0, r.z1, w, y), color), tint(line(r.x1, r.z0, r.x1, r.z1, w, y), color));
};
const cx = (r: ChuoRect) => (r.x0 + r.x1) / 2, cz = (r: ChuoRect) => (r.z0 + r.z1) / 2;
const rw = (r: ChuoRect) => r.x1 - r.x0, rd = (r: ChuoRect) => r.z1 - r.z0;

/** The walkable east edge at z (the track fence), for the paving outline. */
function edgeX(z: number): number {
  let lo = 1300, hi = 2400;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (insideLoop(m, z, WALK_EDGE)) lo = m; else hi = m; }
  return lo;
}

/** Near-detail clusters (LOD): small street-level detail is dropped beyond this distance from a cluster's centre. */
const CLUSTERS = [{ x: 1080, z: 710 }, { x: 1520, z: 710 }];
const DETAIL_FAR = 1600;

export interface ChuoStats { annexes: number; meshes: number; instanced: number; lods: number; triangles: number; lamps: number; flag: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> }

/** Builds 中央 CONTROL CORE into the scene; returns the core's flag (coloured by the tower's owner). */
export function buildChuo(scene: THREE.Scene): ChuoStats {
  const facades: THREE.BufferGeometry[] = [];
  const solid: THREE.BufferGeometry[] = [], white: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [], ground: THREE.BufferGeometry[] = [], floorLines: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [];
  const near = CLUSTERS.map(() => ({ geo: [] as THREE.BufferGeometry[], signs: [] as THREE.BufferGeometry[] }));
  const clusterOf = (x: number) => near[x < 1300 ? 0 : 1];
  const pylons: THREE.Matrix4[] = [], pillars: THREE.Matrix4[] = [], roofPlant: THREE.Matrix4[] = [], lampHeads: THREE.Matrix4[] = [];
  const M4 = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  const pool = (x: number, z: number, r: number, col: number, y = 0.7) => pools.push(tint(flat(r * 2, r * 2, x, y, z), col));

  // ------------------------------------------------------------ ground: paving, the three routes, the core court
  {
    // Facility paving: from the west annexes to the track fence (a polygon that follows the fence).
    const shape = new THREE.Shape();
    const pts: [number, number][] = [[735, 180], [1460, 180], [1460, RING.z0], [DATA_WALL.x0, RING.z0], [DATA_WALL.x0, DATA_WALL.z1]];
    for (let z = DATA_WALL.z1; z <= 1240; z += 20) pts.push([Math.min(DATA_WALL.x0, edgeX(z)), z]);
    pts.push([735, 1240]);
    // (Shape is in x, -z so that rotating it flat puts it the right way up.)
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, 0.35, 0);
    // World UVs: one texture tile = 200 × 200 units (two grid cells).
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 200, pos.getZ(i) / 200);
    const pave = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: PAVE, map: pavingTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    pave.receiveShadow = true;
    pave.name = 'chuo';
    scene.add(pave);
  }
  // B. RING ROUTE: a darker lane edged by thin green lines (inner edge continuous, outer edge dashed).
  for (const l of RING_LANES) ground.push(tint(flat(rw(l), rd(l), cx(l), 0.5, cz(l)), 0x4c535a));
  {
    // The SE turn (from the east lane round the halls' cut corner into the south lane, along the fence).
    const sh = new THREE.Shape();
    ([[1560, 940], [edgeX(940), 940], [edgeX(RING.z1), RING.z1], [1600, RING.z1], [1600, 1000], [1560, 1000]] as [number, number][])
      .forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
    ground.push(tint(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, 0.5, 0), 0x4c535a));
  }
  // The lane's inner edge: a continuous green line along the CONTROL RING (broken at the gates and the halls' mouths).
  for (const [ax, az, bx, bz] of [
    [926, 406, 1080, 406], [1240, 406, 1360, 406], [926, 1014, 1080, 1014], [1240, 1014, 1360, 1014],
    [926, 406, 926, AXIS.z0], [926, AXIS.z1, 926, 1014], [1644, 480, 1644, 940],
  ] as [number, number, number, number][]) floorLines.push(tint(line(ax, az, bx, bz, 4, 0.9), GREEN));
  const dash = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 60);
    for (let k = 0; k < n; k++) {
      const t0 = (k * 60) / len, t1 = (k * 60 + 30) / len;
      floorLines.push(tint(line(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, 3, 0.9), GREEN));
    }
  };
  dash(RING.x0 + 14, RING.z0 + 14, 1740, RING.z0 + 14);
  dash(RING.x0 + 14, RING.z0 + 14, RING.x0 + 14, RING.z1 - 14);
  dash(RING.x0 + 14, RING.z1 - 14, 1560, RING.z1 - 14);
  dash(DATA_WALL.x0 - 14, RING.z0 + 14, DATA_WALL.x0 - 14, DATA_WALL.z1);
  // Ring chevrons (clockwise) at the corners: you can tell the ring from the axis at a glance.
  for (const [x, z, ang] of [[880, 360, 0], [1690, 360, Math.PI / 2], [1700, 880, Math.PI], [880, 1060, -Math.PI / 2], [1300, 360, 0], [1300, 1060, Math.PI]] as [number, number, number][]) {
    for (const s of [-1, 1]) {
      const dx = Math.cos(ang), dz = Math.sin(ang), px = -dz, pz = dx;
      floorLines.push(tint(line(x - dx * 14 + px * s * 18, z - dz * 14 + pz * s * 18, x + dx * 6, z + dz * 6, 5, 0.95), GREEN));
    }
  }
  // A. CORE AXIS: a paler strip between two white lines from the west edge to the core, chevrons pointing at it.
  {
    const A = AXIS, z0 = A.z0 + 6, z1 = A.z1 - 6;
    ground.push(tint(flat(A.x1 - A.x0, A.z1 - A.z0, (A.x0 + A.x1) / 2, 0.55, (A.z0 + A.z1) / 2), 0x8e959e));
    for (const z of [z0, z1]) floorLines.push(tint(line(A.x0, z, A.x1, z, 5, 0.95), WHITE));
    floorLines.push(tint(line(A.x0, CORE.z, A.x1, CORE.z, 2, 0.95), COOLGREY));
    for (let x = A.x0 + 80; x < A.x1 - 40; x += 120) {
      for (const s of [-1, 1]) floorLines.push(tint(line(x - 16, CORE.z + s * 30, x + 10, CORE.z + s * 6, 5, 1), WHITE));
    }
  }
  // CORE PLAZA: lighter slabs on the grid inside the ring, the court's concentric squares and the tower zone ring.
  {
    ground.push(tint(flat(CORE_COURT.x0 - PLAZA.x0, rd(PLAZA), (PLAZA.x0 + CORE_COURT.x0) / 2, 0.45, cz(PLAZA)), 0x7a8189));
    ground.push(tint(flat(rw(CORE_COURT), rd(CORE_COURT), cx(CORE_COURT), 0.45, cz(CORE_COURT)), 0x828a93));
    for (let x = PLAZA.x0 + 100; x < CORE_COURT.x0; x += 100) floorLines.push(tint(line(x, PLAZA.z0 + 4, x, PLAZA.z1 - 4, 1.5, 0.8), LIGHTGREY));
    for (let z = PLAZA.z0 + 100; z < PLAZA.z1; z += 100) floorLines.push(tint(line(PLAZA.x0 + 4, z, CORE_COURT.x0, z, 1.5, 0.8), LIGHTGREY));
    const zone = { x0: CORE.x - CORE_ZONE_R, z0: CORE.z - CORE_ZONE_R, x1: CORE.x + CORE_ZONE_R, z1: CORE.z + CORE_ZONE_R };
    outline(zone, 3, 1, floorLines, BLUEWHITE);
    outline({ x0: CORE.x - 118, z0: CORE.z - 118, x1: CORE.x + 118, z1: CORE.z + 118 }, 2, 1, floorLines, COOLGREY);
    const ring = new THREE.RingGeometry(CORE_ZONE_R - 2, CORE_ZONE_R + 2, 64).rotateX(-Math.PI / 2).translate(CORE.x, 1.05, CORE.z);
    floorLines.push(tint(ring, WHITE));
    // Four lines from the zone to the frame columns (the core reads as the centre of a cross).
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      floorLines.push(tint(line(CORE.x + sx * 57, CORE.z + sz * 57, CORE.x + sx * (CORE_FRAME.half - 14), CORE.z + sz * (CORE_FRAME.half - 14), 2, 1), BLUEWHITE));
    }
    // The strategic point's mark: a square of corner ticks (nothing solid).
    const P = CONTROL_POINT, h = 110, t = 36;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      floorLines.push(tint(line(P.x + sx * h, P.z + sz * h, P.x + sx * (h - t), P.z + sz * h, 4, 1), WHITE));
      floorLines.push(tint(line(P.x + sx * h, P.z + sz * h, P.x + sx * h, P.z + sz * (h - t), 4, 1), WHITE));
    }
  }

  // ------------------------------------------------------------ CONTROL RING blocks, gates
  const sideFaces = (r: ChuoRect, y0: number, y1: number, color: number, out: THREE.BufferGeometry[]) => out.push(tint(boxAt(rw(r), y1 - y0, rd(r), cx(r), (y0 + y1) / 2, cz(r)), color));
  for (const b of RING_BLOCKS) {
    // Charcoal body, white cornice, a light line under it and at the foot; white fins every 40 on the long faces.
    sideFaces(b, 0, RING_H - 14, 0x41464e, solid);
    white.push(tint(boxAt(rw(b) + 6, 14, rd(b) + 6, cx(b), RING_H - 7, cz(b)), FRAME));
    white.push(tint(flat(rw(b) - 4, rd(b) - 4, cx(b), RING_H + 0.4, cz(b)), LIGHTGREY));
    glow.push(tint(boxAt(rw(b) + 2, 2, rd(b) + 2, cx(b), RING_H - 19, cz(b)), BLUEWHITE));
    glow.push(tint(boxAt(rw(b) + 1.4, 1.5, rd(b) + 1.4, cx(b), 6, cz(b)), GREEN));
    const longX = rw(b) >= rd(b);
    const len = longX ? rw(b) : rd(b);
    for (let t = 20; t < len - 10; t += 40) {
      const x = longX ? b.x0 + t : b.x0, z = longX ? b.z0 : b.z0 + t;
      for (const s of [0, 1]) {
        const fx = longX ? x : s ? b.x1 + 2 : b.x0 - 2, fz = longX ? (s ? b.z1 + 2 : b.z0 - 2) : z;
        white.push(tint(boxAt(longX ? 5 : 4, RING_H - 28, longX ? 4 : 5, fx, (RING_H - 28) / 2 + 8, fz), 0xd3d8de));
      }
    }
  }
  // Route plates on the ring blocks' outer faces (ring side) and over the gates.
  signs.push(quad(76, 19, CELLS.way(1), 1300, 70, 418.6, 0, -1), quad(76, 19, CELLS.way(1), 1300, 70, 1001.4, 0, 1));
  signs.push(quad(76, 19, CELLS.way(1), 938.6, 70, 520, -1, 0), quad(76, 19, CELLS.way(1), 938.6, 70, 900, -1, 0));
  signs.push(quad(150, 18, CELLS.band(1), 1040, 88, 418.6, 0, -1), quad(150, 18, CELLS.band(1), 1040, 88, 1001.4, 0, 1));
  for (const g of GATES) {
    const westGate = g.id === 'west';
    const y = GATE_LINTEL + 12;
    if (westGate) {
      white.push(tint(boxAt(40, 24, rd(g) + 4, cx(g), y, cz(g)), FRAME));
      glow.push(tint(boxAt(30, 1, rd(g) - 10, cx(g), GATE_LINTEL - 0.6, cz(g)), WHITE));
      for (const nx of [-1, 1]) signs.push(quad(rd(g) - 20, 20, CELLS.band(2), cx(g) + nx * 20.6, y, cz(g), nx, 0));
      // Posts: tall white frames on the ring blocks' ends carry the lintel.
      for (const z of [g.z0 + 8, g.z1 - 8]) white.push(tint(boxAt(40, GATE_LINTEL - RING_H, 16, cx(g), (GATE_LINTEL + RING_H) / 2, z), FRAME));
    } else {
      white.push(tint(boxAt(rw(g) + 4, 24, rd(g) - 40, cx(g), y, cz(g)), FRAME));
      glow.push(tint(boxAt(rw(g) - 10, 1, rd(g) - 50, cx(g), GATE_LINTEL - 0.6, cz(g)), WHITE));
      const nz = g.id === 'north' ? -1 : 1;
      signs.push(quad(rw(g) - 10, 20, CELLS.band(g.id === 'north' ? 3 : 4), cx(g), y, g.id === 'north' ? g.z0 + 19.4 : g.z1 - 19.4, 0, nz));
      for (const x of [g.x0 + 8, g.x1 - 8]) white.push(tint(boxAt(16, GATE_LINTEL - RING_H, rd(g) - 40, x, (GATE_LINTEL + RING_H) / 2, cz(g)), FRAME));
    }
    // A threshold line across the gate.
    if (westGate) floorLines.push(tint(line(cx(g), g.z0 + 6, cx(g), g.z1 - 6, 6, 1), WHITE));
    else floorLines.push(tint(line(g.x0 + 6, cz(g), g.x1 - 6, cz(g), 6, 1), WHITE));
  }
  signs.push(quad(130, 32, CELLS.way(0), 726, 200, AXIS.z0 - 0.6, 0, -1));

  // ------------------------------------------------------------ C. CONTROL PASSAGE halls
  for (const h of HALLS) {
    const outerZ = h.outer === 'n' ? h.z0 : h.z1, innerZ = h.outer === 'n' ? h.z1 : h.z0, sgn = h.outer === 'n' ? -1 : 1;
    for (const w of h.walls) {
      sideFaces(w, 0, HALL_ROOF, DARK, solid);
      // Vertical white frame lines on the walls every 40.
      const inside = w.x0 < 1500 ? w.x1 + 1.2 : w.x0 - 1.2;
      for (let z = w.z0 + 20; z < w.z1; z += 40) white.push(tint(boxAt(2.4, HALL_ROOF - 10, 5, inside, (HALL_ROOF - 10) / 2, z), 0xa9b1ba));
    }
    // Roof: a white slab with a fascia, ceiling light strips under it (blue-white), the roof top.
    white.push(tint(boxAt(rw(h) + 8, 14, rd(h) + 8, cx(h), HALL_ROOF + 7, cz(h)), FRAME));
    white.push(tint(flat(rw(h) + 4, rd(h) + 4, cx(h), HALL_ROOF + 14.4, cz(h)), LIGHTGREY));
    white.push(tint(boxAt(rw(h), 2, rd(h), cx(h), HALL_ROOF - 1, cz(h)), 0xd8dde3));
    for (let x = 1380; x <= 1580; x += 40) glow.push(tint(boxAt(6, 1, rd(h) - 30, x, HALL_ROOF - 2.6, cz(h)), BLUEWHITE));
    glow.push(tint(boxAt(rw(h) + 9, 2, 1, cx(h), HALL_ROOF + 2, outerZ + sgn * 4.6), BLUEWHITE));
    glow.push(tint(boxAt(rw(h) + 9, 2, 1, cx(h), HALL_ROOF + 2, innerZ - sgn * 4.6), BLUEWHITE));
    signs.push(quad(220, 22, CELLS.band(5), cx(h) - 10, HALL_ROOF + 7, outerZ + sgn * 4.7, 0, sgn));
    signs.push(quad(110, 28, CELLS.way(2), 1510, HALL_ROOF - 24, outerZ + sgn * 1.5, 0, sgn));
    white.push(tint(boxAt(4, 10, 4, 1470, HALL_ROOF - 5, outerZ + sgn * 1.5), MIDGREY), tint(boxAt(4, 10, 4, 1550, HALL_ROOF - 5, outerZ + sgn * 1.5), MIDGREY));
    for (const [x, z] of h.pillars) pillars.push(M4(x, HALL_ROOF / 2, z, 1, HALL_ROOF / 100, 1));
    for (const r of h.racks) {
      sideFaces(r, 0, RACK_H, CHARCOAL, solid);
      white.push(tint(boxAt(rw(r) + 2, 4, rd(r) + 2, cx(r), RACK_H + 2, cz(r)), MIDGREY));
      // Rack fronts (the faces along the passage) carry the status lights.
      for (const s of [-1, 1]) clusterOf(cx(r)).signs.push(quad(rw(r) - 6, RACK_H - 14, CELLS.rack, cx(r), RACK_H / 2, cz(r) + s * (rd(r) / 2 + 0.6), 0, s));
    }
    // The guide line on the floor: in from the ring, round the racks, out to the core.
    const r0 = h.racks[0], r1 = h.racks[1];
    const L = HALL_LANES, aisle = (cz(r0) + cz(r1)) / 2;
    const path: [number, number][] = [[L.in, outerZ + sgn * 40], [L.in, aisle], [L.out, aisle], [L.out, innerZ - sgn * 34]];
    for (let i = 0; i < path.length - 1; i++) floorLines.push(tint(line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], 5, 1), BLUEWHITE));
    pool(cx(h) - 15, cz(h), 100, BLUEWHITE, 0.8);
  }

  // ------------------------------------------------------------ the core's glass back, DATA WALL
  {
    const B = CORE_BACK;
    glass.push(tint(boxAt(rw(B) * 0.4, B.h - 12, rd(B), cx(B), (B.h - 12) / 2, cz(B)), 0xb8cfe0));
    white.push(tint(boxAt(rw(B) + 4, 12, rd(B), cx(B), B.h - 6, cz(B)), FRAME));
    for (let z = B.z0 + 10; z < B.z1; z += 40) white.push(tint(boxAt(rw(B), B.h - 12, 6, cx(B), (B.h - 12) / 2, z), 0xd6dbe1));
    glow.push(tint(boxAt(rw(B) + 5, 1.5, rd(B), cx(B), B.h - 13, cz(B)), BLUEWHITE));
  }
  {
    const W = DATA_WALL;
    sideFaces(W, 0, W.h, CHARCOAL, solid);
    sideFaces(DATA_CAP, 0, DATA_CAP.h, DARK, solid);
    white.push(tint(boxAt(rw(W) + 6, 12, rd(W) + 6, cx(W), W.h + 6, cz(W)), FRAME));
    glow.push(tint(boxAt(1, 3, rd(W), W.x0 - 0.7, W.h - 6, cz(W)), WHITE));
    glow.push(tint(boxAt(1, 2, rd(W), W.x0 - 0.7, 8, cz(W)), GREEN));
    // Two rows of data panels on the ring side, white mullions between.
    let k = 0;
    for (let z = W.z0 + 40; z + 120 <= W.z1 - 20; z += 140) {
      for (const [y, row] of [[100, 0], [190, 1]] as const) {
        signs.push(quad(124, 70, CELLS.data((k + row * 2) % 4), W.x0 - 0.6, y, z + 62, -1, 0));
      }
      white.push(tint(boxAt(3, W.h - 40, 5, W.x0 - 1.5, W.h / 2, z - 8), 0xb9c0c8));
      k++;
    }
    signs.push(quad(300, 30, CELLS.band(0), W.x0 - 0.7, 252, cz(W), -1, 0));
  }

  // ------------------------------------------------------------ annexes
  const TILE_U = 200, TILE_V = 4 * STOREY, GF = GROUND_FLOOR;
  const facade = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, y0: number, y1: number, color: number) => {
    const len = nx ? z1 - z0 : x1 - x0, g = new THREE.PlaneGeometry(len, y1 - y0);
    const uv = g.attributes.uv, v0 = (y0 - GF) / TILE_V, v1 = (y1 - GF) / TILE_V;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / TILE_U), v0 + uv.getY(i) * (v1 - v0));
    const px = nx > 0 ? x1 : nx < 0 ? x0 : (x0 + x1) / 2, pz = nz > 0 ? z1 : nz < 0 ? z0 : (z0 + z1) / 2;
    g.rotateY(Math.atan2(nx, nz)).translate(px, (y0 + y1) / 2, pz);
    const ng = g.toNonIndexed(), c = new THREE.Color(color), n = ng.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
    facades.push(ng);
  };
  const SIDE: Record<ChuoAnnex['front'], [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  for (const a of ANNEXES) {
    const h = floorsToHeight(a.floors);
    for (const [nx, nz] of Object.values(SIDE)) {
      const front = SIDE[a.front][0] === nx && SIDE[a.front][1] === nz;
      // Charcoal ground floor (a deep band with a light line), white-grey office floors above.
      facade(a.x0, a.z0, a.x1, a.z1, nx, nz, GF, h, 0xdfe3e8);
      const len = nx ? rd(a) : rw(a), mx = nx > 0 ? a.x1 : nx < 0 ? a.x0 : cx(a), mz = nz > 0 ? a.z1 : nz < 0 ? a.z0 : cz(a);
      solid.push(tint(boxAt(nx ? 6 : len, GF, nx ? len : 6, mx - nx * 3, GF / 2, mz - nz * 3), front ? 0x30353c : 0x464c54));
      glow.push(tint(boxAt(nx ? 1 : len - 6, 2, nx ? len - 6 : 1, mx + nx * 0.6, GF - 6, mz + nz * 0.6), front ? BLUEWHITE : COOLGREY));
      // Vertical fins on the office floors (the grid), and a white crown.
      for (let t = 25; t < len; t += 50) {
        const fx = nx ? mx + nx * 3 : a.x0 + t, fz = nx ? a.z0 + t : mz + nz * 3;
        white.push(tint(boxAt(nx ? 6 : 4, h - GF, nx ? 4 : 6, fx, GF + (h - GF) / 2, fz), FRAME));
      }
      white.push(tint(boxAt(nx ? 8 : len + 8, 24, nx ? len + 8 : 8, mx, h + 4, mz), FRAME));
      glow.push(tint(boxAt(nx ? 1 : len, 2, nx ? len : 1, mx + nx * 4.6, h - 14, mz + nz * 4.6), WHITE));
      if (front) {
        signs.push(quad(76, 19, CELLS.way(1), mx + nx * 3.8 + (nx ? 0 : -len / 2 + 60), GF + 24, mz + nz * 3.8 + (nx ? -len / 2 + 60 : 0), nx, nz));
      }
    }
    white.push(tint(flat(rw(a), rd(a), cx(a), h + 0.4, cz(a)), 0xbfc5cc));
    for (let k = 0; k < Math.max(1, Math.floor(Math.max(rw(a), rd(a)) / 110)); k++) {
      roofPlant.push(rw(a) > rd(a) ? M4(a.x0 + 60 + k * 110, h + 20, cz(a)) : M4(cx(a), h + 20, a.z0 + 60 + k * 110));
    }
  }

  // ------------------------------------------------------------ CONTROL CORE
  const flagMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.45, side: THREE.DoubleSide });
  let flag!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  {
    const C = CORE, U = CORE_UNIT, F = CORE_FRAME, s = U.half * 2;
    // The unit: a charcoal shaft on a white plinth, white corner fins, light bands, a control window band.
    white.push(tint(boxAt(s + 16, 14, s + 16, C.x, 7, C.z), FRAME));
    solid.push(tint(boxAt(s, U.h - 14, s, C.x, 14 + (U.h - 14) / 2, C.z), CHARCOAL));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) white.push(tint(boxAt(6, U.h - 14, 6, C.x + sx * (U.half + 1), 14 + (U.h - 14) / 2, C.z + sz * (U.half + 1)), FRAME));
    for (const y of [70, 140, 210]) glow.push(tint(boxAt(s + 2.4, 3, s + 2.4, C.x, y, C.z), y === 140 ? WHITE : BLUEWHITE));
    glass.push(tint(boxAt(s + 3, 34, s + 3, C.x, 262, C.z), 0xcfe2f5));
    glow.push(tint(boxAt(s + 3.4, 2, s + 3.4, C.x, 280, C.z), BLUEWHITE));
    white.push(tint(boxAt(s + 20, 16, s + 20, C.x, U.h - 8, C.z), FRAME));
    glow.push(tint(boxAt(s + 21, 2, s + 21, C.x, U.h - 18, C.z), WHITE));
    // The owner's band on the crown (shares the flag's material) and the flag itself.
    const band = new THREE.Mesh(new THREE.BoxGeometry(s + 6, 18, s + 6).translate(C.x, U.h + 10, C.z), flagMat);
    band.name = 'chuo';
    scene.add(band);
    white.push(tint(new THREE.CylinderGeometry(3, 3, 120, 6).translate(C.x, U.h + 19 + 60, C.z), 0xc9b37a));
    flag = new THREE.Mesh(new THREE.PlaneGeometry(110, 66), flagMat);
    flag.position.set(C.x + 55, U.h + 19 + 90, C.z);
    flag.castShadow = true;
    scene.add(flag);
    // The frame: four white columns and the square of beams, light lines under the beams, green status lights on the corners.
    const span = F.half * 2 + F.col;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = C.x + sx * F.half, z = C.z + sz * F.half;
      white.push(tint(boxAt(F.col, F.y1, F.col, x, F.y1 / 2, z), FRAME));
      glow.push(tint(boxAt(F.col + 1.4, F.y0 - 40, 2, x, 20 + (F.y0 - 40) / 2, z - sz * (F.col / 2 + 0.2)), BLUEWHITE));
      glow.push(tint(boxAt(10, 6, 10, x, F.y1 + 3, z), GREEN));
      clusterOf(x).signs.push(quad(28, 14, CELLS.plate, x - sx * (F.col / 2 + 0.6), 150, z, -sx, 0));
    }
    for (const sg of [-1, 1]) {
      white.push(tint(boxAt(span, F.y1 - F.y0, F.col, C.x, (F.y0 + F.y1) / 2, C.z + sg * F.half), FRAME));
      white.push(tint(boxAt(F.col, F.y1 - F.y0, span, C.x + sg * F.half, (F.y0 + F.y1) / 2, C.z), FRAME));
      glow.push(tint(boxAt(span - 30, 1, 4, C.x, F.y0 - 0.6, C.z + sg * F.half), BLUEWHITE));
      glow.push(tint(boxAt(4, 1, span - 30, C.x + sg * F.half, F.y0 - 0.6, C.z), BLUEWHITE));
      // The name on the frame's west and east faces.
      signs.push(quad(span - 40, F.y1 - F.y0 - 10, CELLS.band(0), C.x + sg * (F.half + F.col / 2 + 0.6), (F.y0 + F.y1) / 2, C.z, sg, 0));
    }
    pool(C.x, C.z, 150, BLUEWHITE, 1.1);
  }

  // ------------------------------------------------------------ SIGNAL PYLONS, consoles, terraces
  for (const [x, z] of PYLONS) {
    pylons.push(M4(x, PYLON.h / 2, z));
    const toAxis = z < CORE.z ? 1 : -1;
    glow.push(tint(boxAt(4, PYLON.h - 50, 1, x, 20 + (PYLON.h - 50) / 2, z + toAxis * (PYLON.w / 2 + 0.6)), WHITE));
    glow.push(tint(boxAt(PYLON.w + 1, 4, PYLON.w + 1, x, PYLON.h - 10, z), GREEN));
    pool(x, z + toAxis * 30, 46, WHITE, 0.9);
  }
  for (const c of CONSOLES) {
    sideFaces(c, 0, CONSOLE_H, CHARCOAL, solid);
    white.push(tint(boxAt(rw(c) + 2, 3, rd(c) + 2, cx(c), CONSOLE_H + 1.5, cz(c)), MIDGREY));
    for (const s of [-1, 1]) clusterOf(cx(c)).signs.push(quad(rw(c) - 8, CONSOLE_H - 12, CELLS.console, cx(c), CONSOLE_H / 2 + 2, cz(c) + s * (rd(c) / 2 + 0.6), 0, s));
  }
  for (const t of TERRACES) {
    sideFaces(t, 0, TERRACE_STEP, 0x8b9199, white);
    sideFaces(t.top, TERRACE_STEP, TERRACE_STEP * 2, 0x9aa0a8, white);
    const open = (r: ChuoRect, y: number) => {
      // Light nosings on the step edges that face the plaza (east, and the side away from the band).
      const north = r.z0 <= 500;
      clusterOf(r.x0).geo.push(tint(line(r.x1 - 2, r.z0 + 2, r.x1 - 2, r.z1 - 2, 2, y + 0.4), WHITE));
      clusterOf(r.x0).geo.push(tint(line(r.x0 + 2, north ? r.z1 - 2 : r.z0 + 2, r.x1 - 2, north ? r.z1 - 2 : r.z0 + 2, 2, y + 0.4), WHITE));
    };
    open(t, TERRACE_STEP);
    open(t.top, TERRACE_STEP * 2);
  }

  // ------------------------------------------------------------ lamps
  let lampsDrawn = 0;
  for (const l of CHUO_LAMPS) {
    const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
    white.push(tint(boxAt(Math.abs(dx) * 22 + 5, 4, Math.abs(dz) * 22 + 5, l.x + dx * 11, 188, l.z + dz * 11), MIDGREY));
    lampHeads.push(M4(l.x + dx * 22, 184, l.z + dz * 22));
    lampsDrawn++;
  }

  // ------------------------------------------------------------ materials and meshes
  const tex = atlas();
  const signMat = nearFade(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 1 }), 30, 120);
  const solidMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }), 30, 120);
  const whiteMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }), 30, 120);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.3, depthWrite: false });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const poolMat = new THREE.MeshBasicMaterial({ map: radialGlowTexture(), vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  NIGHT_GLOW.push({
    set: (k) => {
      signMat.emissiveIntensity = 0.55 + 0.2 * k;
      glowMat.color.setScalar(0.62 + 0.3 * k);
      // Floor lines: quiet by day, the plan you read at night (thin, never a wash).
      lineMat.color.setScalar(0.5 + 0.38 * k);
      poolMat.opacity = 0.04 + 0.26 * k;
    },
  });
  let tris = 0, meshes = 0;
  const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((x) => {
    const n = x.index ? x.toNonIndexed() : x;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
    return n;
  }));
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean, receive = true, order = 0, parent: THREE.Object3D = scene) => {
    if (!list.length) return;
    const g = merge(list);
    if (!g) return;
    tris += g.attributes.position.count / 3;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.renderOrder = order;
    m.name = 'chuo';
    parent.add(m);
    meshes++;
  };
  {
    const m = new THREE.MeshStandardMaterial({ map: sharedFacadeTexture('concrete'), vertexColors: true, roughness: 0.8, emissive: 0xffffff, emissiveMap: sharedFacadeTexture('concrete', true), emissiveIntensity: 0.35 });
    glowAtNight(m, 0.35, 0.7);
    add(facades, m, true);
  }
  add(solid, solidMat, true);
  add(white, whiteMat, true);
  add(signs, signMat, false);
  add(glow, glowMat, false, false);
  add(ground, groundMat, false);
  add(floorLines, lineMat, false, false);
  add(glass, glassMat, false, false, 1);
  add(pools, poolMat, false, false, 1);
  tris += 2 * 2; // the flag and its band (approximately)
  // Repeated parts, instanced.
  let instanced = 0;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cast = true, parent: THREE.Object3D = scene) => {
    if (!ms.length) return;
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = cast;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.name = 'chuo';
    parent.add(m);
    tris += ((geo.index ? geo.index.count : geo.attributes.position.count) / 3) * ms.length;
    instanced++;
  };
  inst(new THREE.BoxGeometry(PYLON.w, PYLON.h, PYLON.w), new THREE.MeshStandardMaterial({ color: CHARCOAL, roughness: 0.5, metalness: 0.3 }), pylons);
  inst(new THREE.BoxGeometry(PILLAR, 100, PILLAR), new THREE.MeshStandardMaterial({ color: 0xe6e9ed, roughness: 0.5 }), pillars);
  inst(new THREE.BoxGeometry(46, 36, 34), new THREE.MeshStandardMaterial({ color: 0xa8afb7, roughness: 0.6, metalness: 0.3 }), roofPlant, false);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0xdce8ff, emissiveIntensity: 0.8 });
  glowAtNight(headMat, 0.8, 1.4);
  inst(new THREE.BoxGeometry(18, 5, 18), headMat, lampHeads, false);
  // Near detail per cluster (street level only; nothing beyond DETAIL_FAR).
  const nearMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  NIGHT_GLOW.push({ set: (k) => { nearMat.color.setScalar(0.65 + 0.3 * k); } });
  let lods = 0;
  near.forEach((cl, i) => {
    const lod = new THREE.LOD();
    lod.name = 'chuo-detail';
    const grp = new THREE.Group();
    lod.addLevel(grp, 0);
    lod.addLevel(new THREE.Object3D(), DETAIL_FAR);
    lod.position.set(CLUSTERS[i].x, 0, CLUSTERS[i].z);
    grp.position.set(-CLUSTERS[i].x, 0, -CLUSTERS[i].z);
    add(cl.geo, nearMat, false, false, 0, grp);
    add(cl.signs, signMat, false, false, 0, grp);
    scene.add(lod);
    lods++;
  });
  return { annexes: ANNEXES.length, meshes, instanced, lods, triangles: Math.round(tris), lamps: lampsDrawn, flag };
}
