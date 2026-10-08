import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxPrim } from '../config/map';
import { CURB, GROUND_FLOOR, SHINAGAWA_BUILT, STOREY, WORLD, floorsToHeight, insideLoop, prng } from '../config/map';
import type { ShinagawaBuilding, ShinagawaSide } from '../config/shinagawa';
import {
  ARCH, BOULEVARD, CANOPY, DECK_H, DECK_LEGS, DECK_STAIRS, FORUM, GATEWAY_POINT, PLATFORM, PLATFORM_LANE, PROP_SIZE, SERVICE, SHINAGAWA_LAMPS, SHINAGAWA_LIGHTS,
  SHINAGAWA_PROPS, TRANSIT_DECK,
} from '../config/shinagawa';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { nearFade } from './city';
import { radialGlowTexture, sharedFacadeTexture } from './textures';
import type { FacadeKind } from './textures';

/**
 * MAP REFORGE parallel C — 品川 FUTURE GATEWAY, as drawn.
 *
 * The opposite of Akihabara's grain: few, large, calm pieces. White and light-grey architecture,
 * blue-grey curtain glass, navy for the few signs, and a little warm white in the lobbies. The
 * future look comes from the buildings themselves (fins, set-backs, lit crowns), the floor
 * (large slabs, thin light lines that point the way), the canopies and the light — not from
 * advertising. GATEWAY ARCH frames the boulevard, the TRANSIT DECK carries a continuous light
 * line along its fascia so the deck reads from far away, GLASS FORUM is a lit glass hall, and
 * the LIGHT PLATFORM's floor lines lead to the exits.
 *
 * Light at night is white to blue-white and indirect (soffits, fascias, floor lines, lobby
 * glow), bright enough that nothing reads as a dark hole and never a white-out.
 *
 * Performance: the district is wide, so repeated parts are shared (one instanced column for
 * the colonnade, the canopy and the station hall; one bench, planter, totem and plant box each)
 * and the small street-level detail sits in three LOD clusters that drop it beyond 1,600 units.
 * Façades reuse the city's shared textures; one small atlas carries every sign.
 */

const [WHITE, BLUEWHITE, GLASSBLUE, WARM] = SHINAGAWA_LIGHTS;
const NAVY = 0x1d2a44, PANEL = 0xccd1d7, LIGHTGREY = 0xbcc2c9, STEEL = 0x8c96a3, FRAME = 0xdadde2;

const ATLAS_W = 1024, ATLAS_H = 512;
type Cell = [number, number, number, number];
const CELLS = {
  lobby: (i: number): Cell => [(i % 4) * 256, 0, 256, 128],
  way: (i: number): Cell => [(i % 4) * 256, 128, 256, 64],
  band: (i: number): Cell => [(i % 2) * 512, 192 + Math.floor(i / 2) * 64, 512, 64],
  shutter: [0, 384, 128, 128] as Cell,
  door: [128, 384, 128, 128] as Cell,
  totem: [256, 384, 64, 128] as Cell,
  swatch: [1000, 500, 8, 8] as Cell,
};
const WAYS = [['GATEWAY BLVD', '大通り', '↔'], ['TRANSIT DECK', 'デッキ', '↑'], ['SERVICE', '通路', '→'], ['STATION', '品川駅', '↗']];
const BANDS = ['SHINAGAWA  FUTURE GATEWAY', 'GLASS FORUM', 'TRANSIT SPINE  品川', 'LIGHT PLATFORM', 'GATEWAY ARCH  品川', 'TAKANAWA  品川'];
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
  // Lobbies behind glass: warm-white ceilings, stone floor, a counter, planting, people-free.
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = CELLS.lobby(i);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, '#fff6ea'); grd.addColorStop(0.55, '#e9e4dc'); grd.addColorStop(1, '#b9b6b0');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,240,215,.9)';
    for (let k = 0; k < 4; k++) g.fillRect(x + 20 + k * 60, y + 8, 40, 5); // ceiling lights
    if (i === 0) { g.fillStyle = '#d7d2c8'; g.fillRect(x + 60, y + 78, 136, 26); g.fillStyle = '#8a8f96'; g.fillRect(x + 60, y + 74, 136, 5); }
    if (i === 1) for (let k = 0; k < 3; k++) { g.fillStyle = '#5f7f62'; g.beginPath(); g.ellipse(x + 50 + k * 80, y + 70, 20, 28, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d6d2ca'; g.fillRect(x + 38 + k * 80, y + 92, 24, 16); }
    if (i === 2) { g.fillStyle = '#c5ccd4'; for (let k = 0; k < 5; k++) g.fillRect(x + 24 + k * 46, y + 30, 8, 98); g.fillStyle = css(GLASSBLUE, 0.5); g.fillRect(x + 90, y + 40, 80, 30); }
    if (i === 3) { g.fillStyle = '#d9d5cd'; g.fillRect(x + 20, y + 88, 216, 8); for (let k = 0; k < 6; k++) { g.fillStyle = '#a7aeb6'; g.fillRect(x + 30 + k * 36, y + 60, 6, 28); } }
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.moveTo(x + 40, y + h); g.lineTo(x + 120, y); g.lineTo(x + 150, y); g.lineTo(x + 70, y + h); g.fill();
    g.fillStyle = '#e8ebef';
    g.fillRect(x, y, w, 4); g.fillRect(x, y + h - 4, w, 4); g.fillRect(x, y, 4, h); g.fillRect(x + w - 4, y, 4, h); g.fillRect(x + w / 2 - 2, y, 4, h);
  }
  // Wayfinding: navy plates, white type, a glass-blue arrow.
  WAYS.forEach(([en, jp, arrow], i) => {
    const [x, y, w, h] = CELLS.way(i);
    g.fillStyle = css(NAVY); g.fillRect(x, y, w, h);
    g.fillStyle = css(GLASSBLUE); g.fillRect(x, y + h - 4, w, 4);
    text(arrow, x + 30, y + h / 2, 36, css(GLASSBLUE), 'center', '900');
    text(en, x + 60, y + 22, 21, '#ffffff', 'left', '800');
    text(jp, x + 60, y + 46, 18, 'rgba(255,255,255,.75)', 'left', '700');
  });
  // Name bands on the architecture (light letters on a white or navy ground).
  BANDS.forEach((s, i) => {
    const [x, y, w, h] = CELLS.band(i);
    const dark = i !== 1;
    g.fillStyle = dark ? css(NAVY) : '#eef1f4'; g.fillRect(x, y, w, h);
    text(s, x + w / 2, y + h / 2 + 1, 34, dark ? '#f2f6ff' : '#1d2a44', 'center', '800');
    g.fillStyle = css(GLASSBLUE, 0.9); g.fillRect(x + 20, y + h - 6, w - 40, 2);
  });
  {
    const [x, y, w, h] = CELLS.shutter;
    g.fillStyle = '#b8bdc4'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let r = 6; r < h; r += 7) g.fillRect(x, y + r, w, 2);
    g.fillStyle = '#e9edf1'; g.fillRect(x, y, w, 10);
    text('DOCK', x + w / 2, y + 22, 14, '#1d2a44', 'center', '900');
  }
  {
    const [x, y, w, h] = CELLS.door;
    g.fillStyle = '#9aa3ad'; g.fillRect(x, y, w, h);
    g.fillStyle = '#7b848e'; g.fillRect(x + 30, y + 20, w - 60, h - 20);
    g.fillStyle = '#dfe5ea'; g.fillRect(x + w - 44, y + 70, 6, 14);
    g.fillStyle = css(NAVY); g.fillRect(x + 30, y + 4, w - 60, 12);
  }
  {
    const [x, y, w, h] = CELLS.totem;
    g.fillStyle = css(NAVY); g.fillRect(x, y, w, h);
    text('品', x + w / 2, y + 24, 30, '#ffffff', 'center', '900');
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,.6)' : css(GLASSBLUE); g.fillRect(x + 10, y + 52 + k * 18, w - 20, 8); }
  }
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
/** Geometry with a baked vertex colour. */
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
/** A thin strip on the ground from (ax, az) to (bx, bz). */
const line = (ax: number, az: number, bx: number, bz: number, w: number, y: number) => {
  const len = Math.hypot(bx - ax, bz - az);
  return flat(w, len, (ax + bx) / 2, y, (az + bz) / 2, Math.atan2(bx - ax, bz - az));
};

interface Face { ax: number; az: number; bx: number; bz: number; nx: number; nz: number; len: number }
function faceOf(b: { x0: number; z0: number; x1: number; z1: number }, side: ShinagawaSide): Face {
  switch (side) {
    case 's': return { ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, nx: 0, nz: 1, len: b.x1 - b.x0 };
    case 'n': return { ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, nx: 0, nz: -1, len: b.x1 - b.x0 };
    case 'e': return { ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, nx: 1, nz: 0, len: b.z1 - b.z0 };
    default: return { ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, nx: -1, nz: 0, len: b.z1 - b.z0 };
  }
}
const along = (f: Face, s: number, out: number): [number, number] => {
  const tx = (f.bx - f.ax) / f.len, tz = (f.bz - f.az) / f.len;
  return [f.ax + tx * s + f.nx * out, f.az + tz * s + f.nz * out];
};
const SIDES: ShinagawaSide[] = ['n', 's', 'e', 'w'];

const TILE_U = 200, TILE_V = 4 * STOREY;
const SKIN: Record<ShinagawaBuilding['skin'], { tex: FacadeKind; tint: number }> = {
  glass: { tex: 'glass', tint: 0xb4c6d4 },
  white: { tex: 'concrete', tint: 0xe2e4e8 },
  service: { tex: 'concrete', tint: 0xc4c8ce },
};
/** Near-detail clusters (LOD): street-level detail is dropped beyond this distance from a cluster's centre. */
const CLUSTERS = [{ x: -1350, z: 4500 }, { x: -850, z: 4500 }, { x: -150, z: 4450 }];
const DETAIL_FAR = 1600;

export interface ShinagawaStats { buildings: number; meshes: number; instanced: number; lods: number; triangles: number; lamps: number }

/** Builds 品川 FUTURE GATEWAY into the scene. */
export function buildShinagawa(scene: THREE.Scene): ShinagawaStats {
  const skins: Record<string, THREE.BufferGeometry[]> = {};
  const solid: THREE.BufferGeometry[] = [], white: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [], lobby: THREE.BufferGeometry[] = [], ground: THREE.BufferGeometry[] = [], floorLines: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [];
  /** Per-cluster near detail: merged pieces and instance matrices per prop kind. */
  const near = CLUSTERS.map(() => ({ geo: [] as THREE.BufferGeometry[], props: { bench: [] as THREE.Matrix4[], planter: [] as THREE.Matrix4[], totem: [] as THREE.Matrix4[], vent: [] as THREE.Matrix4[], plant: [] as THREE.Matrix4[] } }));
  const clusterOf = (x: number, z: number) => {
    let best = 0, bd = Infinity;
    CLUSTERS.forEach((c, i) => { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = i; } });
    return near[best];
  };
  const columns: THREE.Matrix4[] = [], ducts: THREE.Matrix4[] = [], roofPlant: THREE.Matrix4[] = [];
  const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
  const pool = (x: number, z: number, r: number, col: number, y = 0.6) => pools.push(tint(flat(r * 2, r * 2, x, y, z), col));
  const GF = GROUND_FLOOR;
  const groundAt = (x: number, z: number) => (x < BOULEVARD.x1 && z > 3890 && z < 5061 && !(z > BOULEVARD.road0 && z < BOULEVARD.road1) && !(x > -881 && z > 4856) ? CURB : 0);

  // ------------------------------------------------------------ buildings
  const facade = (b: ShinagawaBuilding, f: Face, y0: number, y1: number, c: THREE.Color, uOff: number) => {
    const g = new THREE.PlaneGeometry(f.len, y1 - y0);
    const uv = g.attributes.uv;
    const v0 = (y0 - GF) / TILE_V, v1 = (y1 - GF) / TILE_V;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uOff + uv.getX(i) * (f.len / TILE_U), v0 + uv.getY(i) * (v1 - v0));
    const [cx, cz] = along(f, f.len / 2, 0);
    g.rotateY(Math.atan2(f.nx, f.nz)).translate(cx, (y0 + y1) / 2, cz);
    const ng = g.toNonIndexed(), n = ng.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (skins[SKIN[b.skin].tex] ??= []).push(ng);
  };
  let lampsDrawn = 0;
  for (const b of SHINAGAWA_BUILT.buildings) {
    const br = prng(b.id.charCodeAt(0) * 97 + b.x0);
    const c = new THREE.Color(SKIN[b.skin].tint).multiplyScalar(0.96 + br() * 0.06);
    const uOff = Math.floor(br() * 4) * 0.5;
    const base = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const ph = b.setback && b.podium ? floorsToHeight(b.podium) : b.h;
    const s = b.setback ?? 0;
    const shaft = { x0: b.x0 + s, z0: b.z0 + s, x1: b.x1 - s, z1: b.z1 - s };
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    for (const side of SIDES) {
      const f = faceOf(b, side), front = b.fronts.includes(side), ang = Math.atan2(f.nx, f.nz);
      // Podium (or the whole building): glazing at street level on the fronts, the skin above.
      facade(b, f, front ? base + GF : base, ph, c, uOff);
      if (front) {
        const n = Math.max(1, Math.round(f.len / 150)), bw = f.len / n;
        for (let k = 0; k < n; k++) {
          const [wx, wz] = along(f, bw * (k + 0.5), 1.4);
          lobby.push(quad(bw - 14, GF - 12, CELLS.lobby(Math.floor(br() * 4)), wx, base + (GF - 12) / 2, wz, f.nx, f.nz));
          const [px, pz] = along(f, bw * k, 3);
          white.push(tint(boxAt(10, GF, 8, px, base + GF / 2, pz, ang), FRAME));
        }
        // A white band over the lobby, a thin light line under it.
        const [ox, oz] = along(f, f.len / 2, 5);
        white.push(tint(boxAt(f.len + 8, 12, 12, ox, base + GF + 2, oz, ang), FRAME));
        const [lx, lz] = along(f, f.len / 2, 11.5);
        glow.push(tint(boxAt(f.len - 10, 2, 1, lx, base + GF - 5, lz, ang), WARM));
        // An entrance canopy on the main front, and its light on the walk.
        if (side === b.fronts[0] && f.len > 140) {
          const [ex, ez] = along(f, f.len / 2, 40);
          white.push(tint(boxAt(Math.min(220, f.len - 40), 8, 80, ex, base + GF - 18, ez, ang), FRAME));
          glow.push(tint(boxAt(Math.min(200, f.len - 60), 1, 60, ex, base + GF - 22.6, ez, ang), BLUEWHITE));
          pool(ex, ez + 0, 90, WARM, base + 0.7);
        }
        // Wayfinding plate at one corner.
        if (br() < 0.6 && b.floors > 1) {
          const [wx, wz] = along(f, 20, 2);
          signs.push(quad(76, 19, CELLS.way(Math.floor(br() * 4)), wx + (f.bx - f.ax) / f.len * 30, base + GF + 26, wz + (f.bz - f.az) / f.len * 30, f.nx, f.nz));
        }
      } else if (side === b.service) {
        // Loading bays and plant on the corridor side.
        const n = Math.max(1, Math.floor(f.len / 110));
        for (let k = 0; k < n; k++) {
          const sPos = (f.len / n) * (k + 0.5);
          const [dx, dz] = along(f, sPos, 1.2);
          signs.push(quad(80, 78, k % 2 ? CELLS.door : CELLS.shutter, dx, base + 40, dz, f.nx, f.nz));
          const [hx, hz] = along(f, sPos, 16);
          white.push(tint(boxAt(100, 4, 32, hx, base + 96, hz, ang), LIGHTGREY));
          glow.push(tint(boxAt(70, 1, 3, hx, base + 93.5, hz, ang), BLUEWHITE));
          const [qx, qz] = along(f, sPos + 48, 7);
          if (k % 2 === 0 && sPos + 60 < f.len) ducts.push(M4(qx, base + Math.min(ph, 300) / 2 + 40, qz, ang, 1, Math.min(ph, 300) / 40, 1));
        }
      } else {
        // Blind sides: a service door.
        const [dx, dz] = along(f, Math.min(50, f.len / 2), 1.2);
        signs.push(quad(46, 70, CELLS.door, dx, base + 35, dz, f.nx, f.nz));
      }
      // Architecture: white fins (white skin) or slim mullions and spandrel lines (glass skin), up the podium.
      const fin = b.skin === 'white' ? 44 : b.skin === 'glass' ? 100 : 0;
      if (fin && ph - base > GF + 20) {
        for (let t = fin / 2; t < f.len; t += fin) {
          const [fx, fz] = along(f, t, b.skin === 'white' ? 5 : 2);
          white.push(tint(boxAt(b.skin === 'white' ? 6 : 3, ph - base - GF, b.skin === 'white' ? 10 : 4, fx, base + GF + (ph - base - GF) / 2, fz, ang), FRAME));
        }
      }
      if (b.skin !== 'service') {
        const [sx, sz] = along(f, f.len / 2, 1.1);
        for (let k = 2; k <= (b.podium ?? b.floors); k++) solid.push(tint(boxAt(f.nx ? 2 : f.len, 3, f.nx ? f.len : 2, sx, base + GF + (k - 2) * STOREY, sz), 0x9aa6b2));
      }
    }
    // Podium roof (towers): a terrace with a light rim; the set-back shaft above.
    if (b.setback && b.podium) {
      white.push(tint(flat(b.x1 - b.x0, b.z1 - b.z0, cx, ph + 0.5, cz), 0xd3d7dc));
      for (const side of SIDES) {
        const f = faceOf(shaft, side), ang = Math.atan2(f.nx, f.nz);
        facade(b, f, ph, b.h, c, uOff);
        const fin = b.skin === 'white' ? 44 : 100;
        for (let t = fin / 2; t < f.len; t += fin) {
          const [fx, fz] = along(f, t, b.skin === 'white' ? 5 : 2);
          white.push(tint(boxAt(b.skin === 'white' ? 6 : 3, b.h - ph, b.skin === 'white' ? 10 : 4, fx, (ph + b.h) / 2, fz, ang), FRAME));
        }
        // Lit crown (reads on the skyline at night) and the podium's rim light.
        const [rx, rz] = along(f, f.len / 2, 3);
        glow.push(tint(boxAt(f.nx ? 2 : f.len, 5, f.nx ? f.len : 2, rx, b.h - 30, rz), GLASSBLUE));
        white.push(tint(boxAt(f.nx ? 8 : f.len + 8, 30, f.nx ? f.len + 8 : 8, rx, b.h + 10, rz), FRAME));
        const pf = faceOf(b, side);
        const [px, pz] = along(pf, pf.len / 2, 2);
        glow.push(tint(boxAt(pf.nx ? 2 : pf.len, 3, pf.nx ? pf.len : 2, px, ph - 4, pz), BLUEWHITE));
      }
      for (let k = 0; k < 3; k++) roofPlant.push(M4(shaft.x0 + 40 + k * 50, b.h + 20, cz, 0, 1, 1, 1));
    } else {
      white.push(tint(flat(b.x1 - b.x0, b.z1 - b.z0, cx, b.h + 0.5, cz), 0xc7ccd2));
      for (const side of SIDES) {
        const f = faceOf(b, side);
        const [rx, rz] = along(f, f.len / 2, 2);
        white.push(tint(boxAt(f.nx ? 6 : f.len + 6, 16, f.nx ? f.len + 6 : 6, rx, b.h + 6, rz), FRAME));
      }
      if (b.skin === 'service') roofPlant.push(M4(cx, b.h + 20, cz));
    }
  }
  // The station hall: a cantilever canopy over its south door.
  {
    const h = SHINAGAWA_BUILT.buildings.find((b) => b.id === 'HALL');
    if (h) {
      const cx = (h.x0 + h.x1) / 2;
      white.push(tint(boxAt(h.x1 - h.x0 + 60, 10, 110, cx, 150, h.z1 + 50), FRAME));
      glow.push(tint(boxAt(h.x1 - h.x0 + 20, 1, 80, cx, 144.4, h.z1 + 50), BLUEWHITE));
      signs.push(quad(260, 32, CELLS.band(5), cx, 172, h.z1 + 106, 0, 1));
      white.push(tint(boxAt(h.x1 - h.x0 + 60, 26, 4, cx, 172, h.z1 + 104), NAVY));
      for (const dx of [-120, 120]) columns.push(M4(cx + dx, 72, h.z1 + 92, 0, 1, 144 / 100, 1));
      pool(cx, h.z1 + 50, 140, BLUEWHITE);
    }
  }

  // ------------------------------------------------------------ TRANSIT DECK
  {
    const D = TRANSIT_DECK, H = DECK_H;
    const cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2, w = D.x1 - D.x0, d = D.z1 - D.z0;
    white.push(tint(boxAt(w, 12, d, cx, H - 6, cz), PANEL));
    // Deck floor: light slabs, and the spine itself drawn on it — a lit centre line between two
    // lane lines, with chevrons every 160 pointing to the station (one axis, one direction).
    ground.push(tint(flat(w, d - 8, cx, H + 0.3, cz), 0xb4b9c0));
    ground.push(tint(flat(w - 20, 44, cx, H + 0.4, cz), 0xc3c7cd));
    floorLines.push(tint(line(D.x0 + 10, cz, D.x1 - 10, cz, 4, H + 0.6), BLUEWHITE));
    for (const dz of [-22, 22]) floorLines.push(tint(line(D.x0 + 10, cz + dz, D.x1 - 10, cz + dz, 2, H + 0.6), GLASSBLUE));
    for (let x = D.x0 + 120; x < D.x1 - 40; x += 160) {
      for (const sg of [-1, 1]) floorLines.push(tint(line(x - 14, cz + sg * 16, x + 4, cz + sg * 3, 4, H + 0.65), BLUEWHITE));
    }
    // Gantries over the spine: slim white portals carrying the name and the way to the station.
    for (const gx of [D.x0 + 250, -1050, -750]) {
      const top = H + 165;
      for (const z of [D.z0 + 5, D.z1 - 5]) white.push(tint(boxAt(6, top - H, 6, gx, H + (top - H) / 2, z), FRAME));
      white.push(tint(boxAt(10, 30, d - 4, gx, top - 6, cz), FRAME));
      glow.push(tint(boxAt(4, 1, d - 20, gx, top - 21.6, cz), BLUEWHITE));
      for (const nx of [-1, 1]) {
        signs.push(quad(d - 30, 20, CELLS.band(2), gx + nx * 5.4, top - 6, cz, nx, 0));
        signs.push(quad(64, 16, CELLS.way(3), gx + nx * 5.4, top - 30, cz + 24, nx, 0));
      }
      pool(gx, cz, 60, BLUEWHITE, H + 0.7);
    }
    // South fascia (faces the boulevard): white band and one continuous light line — the deck reads from far away.
    white.push(tint(boxAt(w, 26, 6, cx, H - 8, D.z1 + 3), NAVY));
    glow.push(tint(boxAt(w, 3, 1, cx, H - 12, D.z1 + 6.5), GLASSBLUE));
    // Soffit lights over the colonnade.
    for (let x = D.x0 + 60; x < D.x1 - 40; x += 120) glow.push(tint(boxAt(70, 1, 8, x, H - 12.6, cz), WHITE));
    for (let x = D.x0 + 120; x < D.x1; x += 240) pool(x, cz, 80, BLUEWHITE, CURB + 0.6);
  }
  // Balustrades: glass panes with a white handrail (from the collision pieces, so they match exactly).
  for (const p of WORLD) {
    if (p.group !== 'shgDeck' || p.kind !== 'box') continue;
    const b = p as BoxPrim;
    if (b.mat === 'glass') {
      glass.push(tint(boxAt(b.w, b.y1 - b.y0 - 4, b.d * 0.4, b.x, (b.y0 + b.y1) / 2 - 2, b.z), 0xb8d4e6));
      white.push(tint(boxAt(b.w + 1, 4, b.d + 1, b.x, b.y1 - 2, b.z), FRAME));
      clusterOf(b.x, b.z).geo.push(tint(boxAt(b.w > b.d ? b.w : 1, 1.5, b.w > b.d ? 1 : b.d, b.x, b.y1 - 4.5, b.z), BLUEWHITE));
    }
  }
  for (const [x, z] of DECK_LEGS) columns.push(M4(x, (DECK_H - 12) / 2, z, 0, 1, (DECK_H - 12) / 100, 1));
  // Stairs: white treads with light nosings, glass sides.
  for (const s of DECK_STAIRS) {
    const along_ = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0, across = s.axis === 'x' ? s.z1 - s.z0 : s.x1 - s.x0;
    const n = Math.round(along_ / 14), rise = (DECK_H - s.low) / n;
    for (let k = 0; k < n; k++) {
      // k = 0 at the low end.
      const t = (k + 0.5) / n, h = s.low + rise * (k + 1);
      const pos = s.axis === 'x'
        ? { x: s.dir === 1 ? s.x0 + t * along_ : s.x1 - t * along_, z: (s.z0 + s.z1) / 2 }
        : { x: (s.x0 + s.x1) / 2, z: s.dir === 1 ? s.z0 + t * along_ : s.z1 - t * along_ };
      const sw = s.axis === 'x' ? along_ / n : across, sd = s.axis === 'x' ? across : along_ / n;
      white.push(tint(boxAt(sw, 6, sd, pos.x, h - 3, pos.z), k % 2 ? 0xc5cad0 : 0xcfd3d8));
      if (k % 2 === 0) clusterOf(pos.x, pos.z).geo.push(tint(boxAt(s.axis === 'x' ? 1.5 : across - 8, 1, s.axis === 'x' ? across - 8 : 1.5, pos.x + (s.axis === 'x' ? -s.dir * sw / 2 : 0), h + 0.2, pos.z + (s.axis === 'z' ? -s.dir * sd / 2 : 0)), BLUEWHITE));
    }
    // The underside (a sloped white soffit).
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, slope = Math.atan2(DECK_H - s.low, along_);
    const g = new THREE.BoxGeometry(s.axis === 'x' ? Math.hypot(along_, DECK_H - s.low) : across, 8, s.axis === 'x' ? across : Math.hypot(along_, DECK_H - s.low));
    if (s.axis === 'x') g.rotateZ(-s.dir * slope); else g.rotateX(s.dir * slope);
    white.push(tint(g.translate(cx, (DECK_H + s.low) / 2 - 10, cz), PANEL));
    // Glass cheeks on the open sides and a glowing plate at the foot.
    for (const sgn of [-1, 1]) {
      const gx = s.axis === 'x' ? cx : cx + sgn * (across / 2 - 2), gz = s.axis === 'x' ? cz + sgn * (across / 2 - 2) : cz;
      const cg = new THREE.BoxGeometry(s.axis === 'x' ? Math.hypot(along_, DECK_H - s.low) : 2, 34, s.axis === 'x' ? 2 : Math.hypot(along_, DECK_H - s.low));
      if (s.axis === 'x') cg.rotateZ(-s.dir * slope); else cg.rotateX(s.dir * slope);
      glass.push(tint(cg.translate(gx, (DECK_H + s.low) / 2 + 17, gz), 0xb8d4e6));
    }
    const foot = s.axis === 'x' ? { x: s.dir === 1 ? s.x0 - 30 : s.x1 + 30, z: cz } : { x: cx, z: s.dir === 1 ? s.z0 - 30 : s.z1 + 30 };
    pool(foot.x, foot.z, 70, BLUEWHITE, s.low + 0.7);
    signs.push(quad(76, 19, CELLS.way(1), foot.x + (s.axis === 'z' ? across / 2 + 20 : 0), s.low + 150, foot.z + (s.axis === 'x' ? -across / 2 - 30 : 0), s.axis === 'x' ? s.dir : 0, s.axis === 'z' ? -s.dir : 0));
  }
  // Deck name band on the fascia, near both ends.
  for (const x of [TRANSIT_DECK.x0 + 260, -900]) signs.push(quad(240, 22, CELLS.band(2), x, DECK_H - 8, TRANSIT_DECK.z1 + 6.4, 0, 1));

  // ------------------------------------------------------------ GATEWAY ARCH
  {
    const A = ARCH, x = (A.x0 + A.x1) / 2, w = A.x1 - A.x0;
    const z0 = A.pierN.z0, z1 = A.pierS.z1, inner0 = A.pierN.z1, inner1 = A.pierS.z0;
    // One white, one piece: piers and lintel share a colour, the inner corners are filled with
    // haunches so the opening reads as a portal, a dark reveal traces the outer edge against the
    // city behind it and a fine light line traces the opening. No growth in size, no colour.
    const ARCHWHITE = 0xe2e4e8;
    for (const p of [A.pierN, A.pierS]) {
      const pz = (p.z0 + p.z1) / 2, pd = p.z1 - p.z0, base = CURB;
      // Tapered pier: wider at the foot, a light slot on its inner face.
      white.push(tint(boxAt(w, A.lintel0 - base, pd, x, base + (A.lintel0 - base) / 2, pz), ARCHWHITE));
      white.push(tint(boxAt(w + 24, 60, pd + 24, x, base + 30, pz), 0xc6cbd1));
      // Haunch: a 45° fillet where the pier meets the lintel (above every head and the deck).
      const corner = p === A.pierN ? p.z1 : p.z0;
      white.push(tint(new THREE.BoxGeometry(w, 64, 64).rotateX(Math.PI / 4).translate(x, A.lintel0, corner), ARCHWHITE));
      const inner = p === A.pierN ? p.z1 : p.z0, sgn = p === A.pierN ? 1 : -1;
      glow.push(tint(boxAt(8, A.lintel0 - 80, 1, x, (A.lintel0 + 80) / 2, inner + sgn * 0.8), BLUEWHITE));
      for (const fx of [A.x0, A.x1]) for (let k = 1; k <= 3; k++) white.push(tint(boxAt(2, A.lintel0 - 70, 6, fx + (fx === A.x0 ? -1 : 1), (A.lintel0 + 70) / 2, p.z0 + (pd * k) / 4), FRAME));
    }
    // Lintel: thicker at the top, a soffit line the whole span, the name on both faces.
    white.push(tint(boxAt(w + 20, A.top - A.lintel0, z1 - z0 + 40, x, (A.lintel0 + A.top) / 2, (z0 + z1) / 2), ARCHWHITE));
    white.push(tint(boxAt(w - 20, 30, z1 - z0 + 60, x, A.top + 15, (z0 + z1) / 2), 0xd0d4d9));
    // The outline on both faces: navy reveal round the outside, a light line round the opening.
    const h45 = 64 / Math.SQRT2;
    for (const nx of [-1, 1]) {
      const fx = x + nx * (w / 2 + 10.4), px = x + nx * (w / 2 + 0.4);
      for (const ez of [z0 - 20 + 3, z1 + 20 - 3]) white.push(tint(boxAt(1, A.top - A.lintel0, 4, fx, (A.lintel0 + A.top) / 2, ez), NAVY));
      white.push(tint(boxAt(1, 4, z1 - z0 + 40, fx, A.top - 2, (z0 + z1) / 2), NAVY));
      for (const ez of [z0 + 2, z1 - 2]) white.push(tint(boxAt(1, A.lintel0 - 60 - CURB, 4, px, (A.lintel0 + 60 + CURB) / 2, ez), NAVY));
      // Opening: up the north pier, along the haunch, the soffit, the other haunch, down the south pier.
      const y0 = 80, yH = A.lintel0 - h45;
      glow.push(tint(boxAt(1, yH - y0, 3, px, (y0 + yH) / 2, inner0 + 2), BLUEWHITE));
      glow.push(tint(boxAt(1, yH - y0, 3, px, (y0 + yH) / 2, inner1 - 2), BLUEWHITE));
      glow.push(tint(boxAt(1, 3, inner1 - inner0 - 2 * h45, fx, A.lintel0 - 2, (inner0 + inner1) / 2), BLUEWHITE));
      for (const [cz_, sg] of [[inner0, 1], [inner1, -1]] as const) {
        glow.push(tint(new THREE.BoxGeometry(1, 3, 64).rotateX(-sg * Math.PI / 4).translate(px, A.lintel0 - h45 / 2 - 1, cz_ + sg * (h45 / 2 + 1)), BLUEWHITE));
      }
    }
    glow.push(tint(boxAt(12, 1, inner1 - inner0, x, A.lintel0 - 0.6, (inner0 + inner1) / 2), GLASSBLUE));
    for (const nx of [-1, 1]) {
      signs.push(quad(440, 55, CELLS.band(4), x + nx * (w / 2 + 10.6), A.lintel0 + 40, (inner0 + inner1) / 2, nx, 0));
      glow.push(tint(boxAt(1, 3, z1 - z0 + 30, x + nx * (w / 2 + 10.8), A.top - 12, (z0 + z1) / 2), GLASSBLUE));
    }
    // A threshold of light across the ground under the gate.
    floorLines.push(tint(line(x, inner0 + 130, x, inner1 - 6, 6, 0.9), BLUEWHITE));
    floorLines.push(tint(line(x, inner0 + 4, x, inner0 + 116, 6, CURB + 0.9), BLUEWHITE));
    pool(x, (inner0 + inner1) / 2 + 60, 220, BLUEWHITE, 0.8);
  }

  // ------------------------------------------------------------ GLASS FORUM
  {
    const F = FORUM, cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2;
    for (const p of WORLD) {
      if (p.group !== 'shgForum' || p.kind !== 'box') continue;
      const b = p as BoxPrim;
      if (b.y0 > 0) continue;
      glass.push(tint(boxAt(b.w, b.y1 - CURB, b.d, b.x, CURB + (b.y1 - CURB) / 2, b.z), 0xa9c8dc));
      // Mullions and transoms (white), from the wall piece.
      const len = Math.max(b.w, b.d), horiz = b.w > b.d;
      for (let t = 0; t <= len; t += 60) {
        const mx = horiz ? b.x - b.w / 2 + t : b.x, mz = horiz ? b.z : b.z - b.d / 2 + t;
        white.push(tint(boxAt(horiz ? 3 : 18, b.y1 - CURB, horiz ? 18 : 3, mx, CURB + (b.y1 - CURB) / 2, mz), FRAME));
      }
      for (const y of [GF, GF + 110, F.h - 30]) white.push(tint(boxAt(horiz ? b.w : 18, 4, horiz ? 18 : b.d, b.x, y, b.z), FRAME));
    }
    // Roof: an overhanging white blade with a skylight and a soffit line round the edge.
    white.push(tint(boxAt(F.x1 - F.x0 + 80, 14, F.z1 - F.z0 + 60, cx, F.h + 7, cz), 0xdfe2e6));
    glow.push(tint(boxAt(F.x1 - F.x0 - 80, 1, F.z1 - F.z0 - 80, cx, F.h - 0.6, cz), WARM));
    for (const dz of [-1, 1]) glow.push(tint(boxAt(F.x1 - F.x0 + 70, 2, 1, cx, F.h - 1, cz + dz * ((F.z1 - F.z0) / 2 + 29)), GLASSBLUE));
    // Inside: a stone floor, warm light, benches round the trees; the name over both doors.
    ground.push(tint(flat(F.x1 - F.x0 - 28, F.z1 - F.z0 - 28, cx, CURB + 0.4, cz), 0xe4e1da));
    pool(cx, cz, 170, WARM, CURB + 0.8);
    for (const [x, z] of [[-1080, 4060], [-850, 4120]]) clusterOf(x, z).geo.push(tint(boxAt(70, 18, 70, x, CURB + 9, z), 0xbfc4ca));
    for (const z of [F.z0 - 1, F.z1 + 1]) signs.push(quad(240, 30, CELLS.band(1), F.doorN.at, GF + 70, z, 0, z < cz ? -1 : 1));
  }

  // ------------------------------------------------------------ the station canopy
  {
    const C = CANOPY, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2;
    white.push(tint(boxAt(C.x1 - C.x0 + 40, 10, C.z1 - C.z0 + 40, cx, C.y - 5, cz), 0xdfe2e6));
    for (let x = C.x0; x <= C.x1; x += 50) glow.push(tint(boxAt(3, 1, C.z1 - C.z0, x, C.y - 10.6, cz), BLUEWHITE));
    for (const [x, z] of C.cols) columns.push(M4(x, (C.y - 10) / 2, z, 0, 0.8, (C.y - 10) / 100, 0.8));
    pool(cx, cz, 200, BLUEWHITE);
  }

  // ------------------------------------------------------------ ground
  // Walks: large light slabs in two tones (the boulevard, the frontage, the corridor at a darker tone).
  const SLAB = 60;
  const slabs = (x0: number, z0: number, x1: number, z1: number, y: number, tones: number[], skip?: (x: number, z: number) => boolean) => {
    for (let x = x0; x < x1 - 1; x += SLAB) for (let z = z0; z < z1 - 1; z += SLAB) {
      const w = Math.min(SLAB, x1 - x), d = Math.min(SLAB, z1 - z), mx = x + w / 2, mz = z + d / 2;
      if (skip?.(mx, mz) || !insideLoop(mx, mz, 150)) continue;
      ground.push(tint(flat(w - 1.2, d - 1.2, mx, y, mz), tones[(Math.floor(x / SLAB) + Math.floor(z / SLAB) * 3) % tones.length]));
    }
  };
  const inBuilding = (x: number, z: number) => SHINAGAWA_BUILT.buildings.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)
    || (x > FORUM.x0 && x < FORUM.x1 && z > FORUM.z0 && z < FORUM.z1);
  const WALK = [0xb1b6bc, 0xbabec3, 0xaaafb5];
  slabs(-1650, 3890, BOULEVARD.x1, BOULEVARD.road0, CURB + 0.3, WALK, inBuilding);
  slabs(-1650, BOULEVARD.road1, BOULEVARD.x1, 4660, CURB + 0.3, WALK, inBuilding);
  // The service corridor: darker concrete, hatched loading bays.
  for (const s of SERVICE) {
    ground.push(tint(flat(s.x1 - s.x0, s.z1 - s.z0, (s.x0 + s.x1) / 2, CURB + 0.3, (s.z0 + s.z1) / 2), 0x7d828a));
  }
  for (const [x0, x1, z] of [[-1600, -1340, 4990], [-1190, -970, 4810], [-850, -580, 4842]] as const) {
    for (let x = x0; x < x1; x += 22) ground.push(tint(line(x, z - 8, x + 12, z + 8, 3, CURB + 0.5), 0xe6e8eb));
  }
  floorLines.push(tint(line(-1630, 4950, -1320, 4950, 2, CURB + 0.6), BLUEWHITE), tint(line(-1260, 4660, -1260, 5050, 2, CURB + 0.6), BLUEWHITE));
  floorLines.push(tint(line(-1200, 4850, -960, 4850, 2, CURB + 0.6), BLUEWHITE), tint(line(-910, 4660, -910, 4880, 2, CURB + 0.6), BLUEWHITE));
  floorLines.push(tint(line(-860, 4860, -470, 4860, 2, CURB + 0.6), BLUEWHITE));
  // The colonnade under the deck: a light line along the building faces.
  floorLines.push(tint(line(-1600, 4228, -570, 4228, 3, CURB + 0.6), WARM));
  // Kerb lines along the boulevard (white).
  for (const z of [BOULEVARD.road0 - 2, BOULEVARD.road1 + 2]) floorLines.push(tint(line(BOULEVARD.x0, z, ARCH.x0, z, 3, CURB + 0.5), WHITE));

  // LIGHT PLATFORM: pale granite at street level, and the light lines that point to every exit.
  const GRANITE = [0xaeb1b4, 0xa6a9ad, 0xb6b8ba];
  slabs(PLATFORM.x0, PLATFORM.z0, PLATFORM.x1, PLATFORM.z1, 0.35, GRANITE, (x, z) => inBuilding(x, z) || (x > -881 && z > 4856) || (z > 4200 && z < 4320 && x < -140));
  {
    const P = GATEWAY_POINT, y = 0.8;
    const exits: [number, number][] = [[ARCH.x1 + 10, 4480], [-140, 4260], [-470, 4860], [30, 4150], [-420, 4560]];
    for (const [ex, ez] of exits) {
      // From just outside the capture ring to the exit: the line, and a short bar across at the exit.
      const d = Math.hypot(ex - P.x, ez - P.z), ux = (ex - P.x) / d, uz = (ez - P.z) / d;
      floorLines.push(tint(line(P.x + ux * 175, P.z + uz * 175, ex, ez, 5, y), BLUEWHITE));
      floorLines.push(tint(line(ex - uz * 30, ez + ux * 30, ex + uz * 30, ez - ux * 30, 4, y), GLASSBLUE));
    }
    // A broken ring round the point (outside the capture radius).
    for (let k = 0; k < 24; k += 2) {
      const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
      floorLines.push(tint(line(P.x + Math.cos(a0) * 175, P.z + Math.sin(a0) * 175, P.x + Math.cos(a1) * 175, P.z + Math.sin(a1) * 175, 4, y), GLASSBLUE));
    }
    // The boulevard's axis carried on across the plaza (the long straight reads to the point).
    floorLines.push(tint(line(-1630, 4480, ARCH.x0 - 10, 4480, 3, 0.7), BLUEWHITE));
    // The fast lane across the platform: a pale stone runway on the axis, dashed lane edges and
    // short light bars every 80 — the floor says "this way, keep it clear" without a single object.
    const L = PLATFORM_LANE, lx0 = ARCH.x1 + 10, edgeX = (z: number) => P.x - Math.sqrt(175 ** 2 - (z - P.z) ** 2);
    ground.push(tint(flat(edgeX(4480) - lx0 - 10, 50, (lx0 + edgeX(4480) - 10) / 2, 0.5, 4480), 0xc1c4c8));
    for (const z of [L.z0, L.z1]) for (let x = lx0; x < edgeX(z) - 30; x += 50) floorLines.push(tint(line(x, z, x + 30, z, 3, y), BLUEWHITE));
    for (let x = lx0 + 40; x < edgeX(4480) - 20; x += 80) floorLines.push(tint(line(x, 4462, x, 4498, 3, y), GLASSBLUE));
    // Station wayfinding hung from the canopy (above every head), facing the arch and the lane.
    for (const [hx, hz, cell] of [[CANOPY.x0 - 4, 4610, 3], [CANOPY.x0 - 4, 4720, 2], [-150, CANOPY.z0 - 4, 0]] as const) {
      const alongX = hz === CANOPY.z0 - 4;
      for (const k of [-1, 1]) white.push(tint(boxAt(2, 40, 2, hx + (alongX ? k * 40 : 0), CANOPY.y - 30, hz + (alongX ? 0 : k * 40)), FRAME));
      white.push(tint(boxAt(alongX ? 104 : 4, 28, alongX ? 4 : 104, hx, CANOPY.y - 64, hz), NAVY));
      signs.push(quad(100, 25, CELLS.way(cell), hx + (alongX ? 0 : -2.4), CANOPY.y - 64, hz + (alongX ? -2.4 : 0), alongX ? 0 : -1, alongX ? -1 : 0));
    }
    // Stone inlays under the seating and the planters: the furniture sits on its own ground.
    for (const p of SHINAGAWA_PROPS) {
      if (p.kind !== 'bench' && p.kind !== 'planter') continue;
      if (p.x < PLATFORM.x0 || p.z < PLATFORM.z0 || p.z > PLATFORM.z1) continue;
      const s = PROP_SIZE[p.kind], rot = Math.abs(Math.sin(p.ang ?? 0)) > 0.5;
      ground.push(tint(flat((rot ? s.d : s.w) + 30, (rot ? s.w : s.d) + 30, p.x, 0.45, p.z), 0x9ea2a7));
    }
  }

  // ------------------------------------------------------------ props, lamps
  for (const p of SHINAGAWA_PROPS) {
    const s = PROP_SIZE[p.kind], base = groundAt(p.x, p.z), ang = p.ang ?? 0;
    clusterOf(p.x, p.z).props[p.kind].push(M4(p.x, base, p.z, ang));
    if (p.kind === 'totem') {
      for (const sg of [-1, 1]) signs.push(quad(s.w - 6, s.h - 10, CELLS.totem, p.x + Math.sin(ang) * sg * 5.2, base + s.h / 2, p.z + Math.cos(ang) * sg * 5.2, Math.sin(ang) * sg, Math.cos(ang) * sg));
    }
    if (p.kind === 'planter') pool(p.x, p.z, 50, WARM, base + 0.6);
  }
  for (const l of SHINAGAWA_LAMPS) {
    const base = groundAt(l.x, l.z);
    if (l.wall) {
      const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
      white.push(tint(boxAt(Math.abs(dx) * 26 + 6, 4, Math.abs(dz) * 26 + 6, l.x + dx * 12, base + 120, l.z + dz * 12), FRAME));
      glow.push(tint(boxAt(Math.abs(dx) * 22 + 3, 1, Math.abs(dz) * 22 + 3, l.x + dx * 12, base + 117.6, l.z + dz * 12), BLUEWHITE));
      lampsDrawn++;
    }
    pool(l.x + Math.cos(l.ang) * 40, l.z + Math.sin(l.ang) * 40, 110, BLUEWHITE, base + 0.7);
  }

  // ------------------------------------------------------------ materials and meshes
  const tex = atlas();
  const signMat = nearFade(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.62, roughness: 1 }), 30, 120);
  const lobbyMat = nearFade(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, roughness: 1 }), 30, 120);
  const solidMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 }), 30, 120);
  const whiteMat = nearFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }), 30, 120);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const poolMat = new THREE.MeshBasicMaterial({ map: radialGlowTexture(), vertexColors: true, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  NIGHT_GLOW.push({
    set: (k) => {
      signMat.emissiveIntensity = 0.62 + 0.18 * k;
      lobbyMat.emissiveIntensity = 0.6 + 0.3 * k;
      glowMat.color.setScalar(0.72 + 0.28 * k);
      lineMat.color.setScalar(0.55 + 0.4 * k);
      // Pools stay faint by day and carry the walks at night, never a wash.
      poolMat.opacity = 0.06 + 0.32 * k;
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
    m.name = 'shinagawa';
    parent.add(m);
    meshes++;
  };
  for (const [k, list] of Object.entries(skins)) {
    const kind = k as FacadeKind;
    const m = new THREE.MeshStandardMaterial({ map: sharedFacadeTexture(kind), vertexColors: true, roughness: kind === 'glass' ? 0.3 : 0.8, metalness: kind === 'glass' ? 0.3 : 0, emissive: 0xffffff, emissiveMap: sharedFacadeTexture(kind, true), emissiveIntensity: 0.4 });
    glowAtNight(m, 0.4, 0.75);
    add(list, m, true);
  }
  add(white, whiteMat, true);
  add(solid, solidMat, false);
  add(lobby, lobbyMat, false);
  add(signs, signMat, false);
  add(glow, glowMat, false, false);
  add(ground, groundMat, false);
  add(floorLines, lineMat, false, false);
  add(glass, glassMat, false, false, 1);
  add(pools, poolMat, false, false, 1);
  // Shared parts, instanced.
  let instanced = 0;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cast = true, parent: THREE.Object3D = scene) => {
    if (!ms.length) return;
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = cast;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.name = 'shinagawa';
    parent.add(m);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * ms.length;
    instanced++;
  };
  const columnMat = new THREE.MeshStandardMaterial({ color: 0xeef0f3, roughness: 0.45, metalness: 0.1 });
  inst(new THREE.CylinderGeometry(12, 13, 100, 12), columnMat, columns);
  inst(new THREE.BoxGeometry(14, 40, 10), new THREE.MeshStandardMaterial({ color: 0xb7bec6, roughness: 0.6, metalness: 0.3 }), ducts, false);
  inst(new THREE.BoxGeometry(40, 40, 30), new THREE.MeshStandardMaterial({ color: 0xc3c8ce, roughness: 0.7 }), roofPlant, false);
  // Near detail per cluster: one LOD each (street level only; nothing beyond DETAIL_FAR).
  const benchGeo = merge([boxAt(90, 5, 22, 0, 20, 0), boxAt(8, 18, 18, -36, 9, 0), boxAt(8, 18, 18, 36, 9, 0)].map((g) => g.toNonIndexed()))!;
  const planterGeo = merge([boxAt(70, 26, 70, 0, 13, 0), boxAt(60, 2, 60, 0, 26.5, 0)].map((g) => g.toNonIndexed()))!;
  const totemGeo = new THREE.BoxGeometry(30, 120, 10).translate(0, 60, 0);
  const ventGeo = merge([boxAt(60, 60, 60, 0, 30, 0), boxAt(66, 8, 66, 0, 64, 0)].map((g) => g.toNonIndexed()))!;
  const plantGeo = new THREE.BoxGeometry(50, 60, 18).translate(0, 30, 0);
  const propMats = {
    bench: new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.7 }),
    planter: new THREE.MeshStandardMaterial({ color: 0xe6e8eb, roughness: 0.6 }),
    totem: new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.5 }),
    vent: new THREE.MeshStandardMaterial({ color: 0xd0d4d9, roughness: 0.6, metalness: 0.2 }),
    plant: new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.6, metalness: 0.3 }),
  };
  const nearMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  NIGHT_GLOW.push({ set: (k) => { nearMat.color.setScalar(0.7 + 0.3 * k); } });
  let lods = 0;
  near.forEach((cl, i) => {
    const lod = new THREE.LOD();
    lod.name = 'shinagawa-detail';
    const grp = new THREE.Group();
    lod.addLevel(grp, 0);
    lod.addLevel(new THREE.Object3D(), DETAIL_FAR);
    lod.position.set(CLUSTERS[i].x, 0, CLUSTERS[i].z);
    // Children are placed in world coordinates: undo the LOD's own offset.
    grp.position.set(-CLUSTERS[i].x, 0, -CLUSTERS[i].z);
    add(cl.geo, nearMat, false, false, 0, grp);
    inst(benchGeo, propMats.bench, cl.props.bench, true, grp);
    inst(planterGeo, propMats.planter, cl.props.planter, true, grp);
    inst(totemGeo, propMats.totem, cl.props.totem, true, grp);
    inst(ventGeo, propMats.vent, cl.props.vent, true, grp);
    inst(plantGeo, propMats.plant, cl.props.plant, false, grp);
    scene.add(lod);
    lods++;
  });
  return { buildings: SHINAGAWA_BUILT.buildings.length, meshes, instanced, lods, triangles: Math.round(tris), lamps: lampsDrawn };
}
