import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxPrim } from '../config/map';
import { BUNKYO_BUILT, STOREY, GROUND_FLOOR, WORLD, prng } from '../config/map';
import type { BkHouse, BkSlope, BunkyoSide, Rect } from '../config/bunkyo';
import {
  BEND_CORNER, BEND_H, BUNKYO_LAMPS, BUNKYO_LIGHTS, COURT_LANE, EAST_LANE, FORK, LOW_ROAD, PLATEAU, POLE_RUNS, PRIVATE, QUIET_COURT, RIDGE_H,
  RIDGE_TERRACE, SIDE_LANE, SLOPES, SW_YARD, WALLS, WALL_PATH,
} from '../config/bunkyo';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { boxAt, flat } from './shibuya';
import { detailNoise, radialGlowTexture, roofTileTexture } from './textures';

/**
 * MAP REFORGE parallel D — 文京 QUIET SLOPES, as drawn.
 *
 * Bunkyo reads through its ground: grey asphalt lanes, ring-grooved concrete on the slopes (the
 * anti-slip circles of Tokyo's steep streets), granite and brown 石垣 holding up the ridge, cream
 * plaster and stone garden walls with dark tile caps, clipped hedges, low houses in white, beige,
 * grey and timber with dark tiled roofs. Thin concrete 電柱 with their wires, a few warm lamps
 * and gate lights; no neon, no big signs (only the wooden name posts that stand at the foot of
 * each 坂, and four small plaques). Everything is merged per material or instanced, so the whole
 * district is a couple of dozen meshes.
 */

/** Bunkyo's palette: quiet greys, stone browns, deep greens, house whites and beiges, warm light. */
const C = {
  asphalt: 0x56585c, asphaltDark: 0x4a4c50, line: 0xd8d4c8, ring: 0x8d8b85, curb: 0x9a958a,
  granite: 0x8c877d, stone: 0x8a7a66, stoneDark: 0x6e6152, coping: 0xa39a8a, ohya: 0xb0a68c,
  moss: 0x3c4a2e, garden: 0x4a5a34, gravel: 0x8e8674, paver: 0x8f897d,
  plaster: 0xe6dfcf, block: 0x9c9a94, tile: 0x3c3f44,
  hedge: 0x2f4a29,
  white: 0xece8de, beige: 0xd9cdb4, grey: 0xa9a7a1, wood: 0x7a5a3e, trim: 0x4a4440, door: 0x5a4632,
  roof: 0x45484e, roofWarm: 0x5a4f48,
  iron: 0x2c2e31, pole: 0x9c9a94,
  lamp: BUNKYO_LIGHTS[0], window: BUNKYO_LIGHTS[1], foot: BUNKYO_LIGHTS[2],
};

export interface BunkyoStats { meshes: number; triangles: number; houses: number; lamps: number; poles: number; instanced: number }

/** Geometry with a baked vertex colour (keeps its UVs, so textured and plain pieces merge alike). */
function tint(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color), n = ng.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (ng.attributes.uv1) ng.deleteAttribute('uv1');
  return ng;
}

/** Rewrites UVs in world units (1 tile per `tile`), so stone and paving never stretch. */
function worldUv(g: THREE.BufferGeometry, tile: number, tileV = tile): THREE.BufferGeometry {
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else if (nx > 0.5) uv.setXY(i, z / tile, y / tileV);
    else uv.setXY(i, x / tile, y / tileV);
  }
  return g;
}

/** Ground overlays sit a little above what they cover; pull them forward in depth so nothing shows through far away. */
const ABOVE = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

const rectFlat = (r: Rect, y: number) => flat(r.x1 - r.x0, r.z1 - r.z0, (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
const rectBox = (r: Rect, y0: number, y1: number) => boxAt(r.x1 - r.x0, y1 - y0, r.z1 - r.z0, (r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);

const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], shadow = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, ms.length));
  ms.forEach((x, i) => m.setMatrixAt(i, x));
  m.count = ms.length;
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

/** A box from a to b (a beam: rails, wires' brackets, slanted copings), `w` wide and `h` high. */
function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number): THREE.BufferGeometry {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  const g = new THREE.BoxGeometry(len, h, w);
  const m = new THREE.Matrix4();
  const xAxis = new THREE.Vector3(dx, dy, dz).normalize();
  const zAxis = new THREE.Vector3(-dz, 0, dx).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
  m.makeBasis(xAxis, yAxis, zAxis).setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g.applyMatrix4(m);
}

// ------------------------------------------------------------ the ground's shape (same rules as config/map.ts)
const onRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export function slopeAt(s: BkSlope, x: number, z: number): number {
  const a0 = s.axis === 'x' ? s.x0 : s.z0, a1 = s.axis === 'x' ? s.x1 : s.z1, u = ((s.axis === 'x' ? x : z) - a0) / (a1 - a0);
  const t = Math.min(1, Math.max(0, s.dir === 1 ? u : 1 - u));
  return s.low + (s.high - s.low) * t;
}
/** Walkable ground height of the district at (x, z): the ridge, the landings, the slopes, else the street (0). */
export function bunkyoGround(x: number, z: number): number {
  let h = 0;
  for (const r of PLATEAU) if (onRect(r, x, z)) h = Math.max(h, RIDGE_H);
  if (onRect(FORK, x, z)) h = Math.max(h, RIDGE_H);
  if (onRect(BEND_CORNER, x, z)) h = Math.max(h, BEND_H);
  for (const s of SLOPES) if (onRect(s, x, z)) h = Math.max(h, slopeAt(s, x, z));
  return h;
}

// ------------------------------------------------------------ textures (small canvases, tiled in world units)
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 石垣: courses of big squared stones with dark joints (greyscale; the vertex colour gives the hue). */
function ishigakiTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rnd = prng(7101);
  g.fillStyle = '#3a3a3a';
  g.fillRect(0, 0, 256, 256);
  let y = 0;
  while (y < 256) {
    const rh = 34 + rnd() * 22;
    let x = -rnd() * 40;
    while (x < 256) {
      const w = 40 + rnd() * 50, l = 150 + rnd() * 60;
      g.fillStyle = `rgb(${l},${l - 4},${l - 10})`;
      g.beginPath();
      // Slightly irregular quads (squared stones, worn corners).
      g.moveTo(x + 2 + rnd() * 3, y + 2 + rnd() * 3);
      g.lineTo(x + w - 2 - rnd() * 3, y + 2 + rnd() * 3);
      g.lineTo(x + w - 2 - rnd() * 3, y + rh - 2 - rnd() * 3);
      g.lineTo(x + 2 + rnd() * 3, y + rh - 2 - rnd() * 3);
      g.closePath();
      g.fill();
      // A lighter top edge and a few pits.
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 4, y + 3, w - 8, 3);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`;
        g.fillRect(x + rnd() * w, y + rnd() * rh, 2 + rnd() * 3, 2 + rnd() * 3);
      }
      x += w;
    }
    y += rh;
  }
  return tex(c);
}

/** The concrete of a steep slope with its rings (滑り止めのリング模様), greyscale. */
function ringTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rnd = prng(7102);
  g.fillStyle = '#bdbdbd';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.strokeStyle = 'rgba(60,60,60,0.55)';
  g.lineWidth = 3;
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    const cx = k * 64 + 32 + (r % 2) * 32, cy = r * 64 + 32;
    for (const ox of [0, -256]) {
      g.beginPath();
      g.arc(cx + (cx + ox > 256 ? ox : 0), cy, 22, 0, Math.PI * 2);
      g.stroke();
    }
  }
  return tex(c);
}

/** Asphalt and stone setts for the flat ground (greyscale noise; colour from the vertices). */
function groundTex(kind: 'asphalt' | 'setts'): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rnd = prng(kind === 'asphalt' ? 7103 : 7104);
  g.fillStyle = '#c4c4c4';
  g.fillRect(0, 0, 256, 256);
  if (kind === 'setts') {
    for (let r = 0; r < 8; r++) {
      let x = (r % 2) * -16;
      while (x < 256) {
        const w = 28 + rnd() * 20, l = 170 + rnd() * 50;
        g.fillStyle = `rgb(${l},${l},${l - 4})`;
        g.fillRect(x + 1.5, r * 32 + 1.5, w - 3, 29);
        x += w;
      }
    }
  }
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  return tex(c);
}

/** Windows, doors and the gate light, in one small atlas: [x, y, w, h] in a 256×128 canvas. */
type Cell = [number, number, number, number];
const WIN: Record<'win' | 'lit' | 'door' | 'shutter' | 'sliding', Cell> = {
  win: [0, 0, 64, 64], lit: [64, 0, 64, 64], door: [128, 0, 64, 128], shutter: [192, 0, 64, 64], sliding: [192, 64, 64, 64],
};
function windowAtlas(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  const frame = (x: number, y: number, w: number, h: number, glass: string, curtain: string | null) => {
    g.fillStyle = '#d6d2c8';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#3b3d40';
    g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = glass;
    g.fillRect(x + 9, y + 9, w / 2 - 10, h - 18);
    g.fillRect(x + w / 2 + 1, y + 9, w / 2 - 10, h - 18);
    if (curtain) {
      g.fillStyle = curtain;
      g.fillRect(x + 9, y + 9, 10, h - 18);
      g.fillRect(x + w - 19, y + 9, 10, h - 18);
    }
  };
  frame(0, 0, 64, 64, '#2a3440', null);
  frame(64, 0, 64, 64, '#ffe2b0', '#e8c890');
  // Door: dark timber with a small lit transom.
  g.fillStyle = '#d6d2c8';
  g.fillRect(128, 0, 64, 128);
  g.fillStyle = '#4a3a2a';
  g.fillRect(136, 14, 48, 114);
  g.fillStyle = '#6a5440';
  for (let y = 24; y < 124; y += 14) g.fillRect(140, y, 40, 2);
  g.fillStyle = '#c8b48a';
  g.fillRect(140, 4, 40, 8);
  // 雨戸 (storm shutters, closed) and a sliding glass door.
  g.fillStyle = '#8e8a82';
  g.fillRect(192, 0, 64, 64);
  g.fillStyle = '#7a766e';
  for (let y = 4; y < 64; y += 6) g.fillRect(194, y, 60, 2);
  frame(192, 64, 64, 64, '#2a3440', '#cfc8b8');
  return tex(c, false);
}
const cellUv = (g: THREE.BufferGeometry, cell: Cell) => {
  const [cx, cy, cw, ch] = cell, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * cw) / 256, 1 - (cy + (1 - uv.getY(i)) * ch) / 128);
  return g;
};

/** Plaques and the slope name posts (標柱), one atlas 1024×512. */
const PLAQUES = [
  ['SLOPE GATE', '坂の門'], ['RIDGE TERRACE', '高台テラス'], ['STONE BEND', '石垣の曲がり坂'], ['QUIET COURT', '静かな広場'],
  ['RIDGE ROAD', '尾根の道'], ['WALL PATH', '塀の小径'], ['LOW ROAD', '下の道'], ['TWIN SLOPES', '双子坂'],
];
const POSTS = [['上坂', 'KAMI-ZAKA'], ['中坂', 'NAKA-ZAKA'], ['双子坂', 'FUTAGO-ZAKA'], ['門坂', 'MON-ZAKA'], ['曲り坂', 'MAGARI-ZAKA'], ['石段', 'ISHIDAN']];
const ROUTE = [['A', 'RIDGE ROAD', '尾根の道'], ['B', 'SLOPE LANE', '坂道'], ['C', 'WALL PATH', '塀の小径']];
const SIGN = {
  plaque: (i: number): Cell => [(i % 2) * 512, Math.floor(i / 2) * 80, 512, 80],
  post: (i: number): Cell => [i * 64, 320, 64, 192],
  route: (i: number): Cell => [384 + i * 213, 320, 213, 64],
};
function signAtlas(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#2b2722';
  g.fillRect(0, 0, 1024, 512);
  const text = (s: string, x: number, y: number, size: number, color: string, weight = '700', align: CanvasTextAlign = 'center') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  PLAQUES.forEach(([en, jp], i) => {
    const [x, y, w, h] = SIGN.plaque(i);
    g.fillStyle = '#3a342b';
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.strokeStyle = '#9a8460';
    g.lineWidth = 3;
    g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    text(en, x + w / 2, y + 32, 30, '#efe4c8');
    text(jp, x + w / 2, y + 60, 20, '#cdbb92', '600');
  });
  POSTS.forEach(([jp, en], i) => {
    const [x, y, w, h] = SIGN.post(i);
    g.fillStyle = '#b89a6c';
    g.fillRect(x + 2, y, w - 4, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 6; k++) g.fillRect(x + 4 + k * 10, y, 1, h);
    [...jp].forEach((ch, k) => text(ch, x + w / 2, y + 30 + k * 40, 34, '#2a2018', '800'));
    g.save();
    g.translate(x + w - 9, y + h - 6);
    g.rotate(-Math.PI / 2);
    text(en, 0, 0, 11, '#3a2e22', '700', 'left');
    g.restore();
  });
  ROUTE.forEach(([k, en, jp], i) => {
    const [x, y, w, h] = SIGN.route(i);
    g.fillStyle = '#efe9dc';
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#3d4a36';
    g.fillRect(x + 10, y + 10, 44, 44);
    text(k, x + 32, y + 33, 34, '#efe9dc', '800');
    text(en, x + 62, y + 24, 19, '#26241f', '700', 'left');
    text(jp, x + 62, y + 46, 15, '#4a463c', '600', 'left');
  });
  const t = tex(c, false);
  return t;
}
function signQuad(w: number, h: number, cell: Cell, x: number, y: number, z: number, ang: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [cx, cy, cw, ch] = cell, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * cw) / 1024, 1 - (cy + (1 - uv.getY(i)) * ch) / 512);
  return g.rotateY(ang).translate(x, y, z);
}

/** RIDGE ROAD's asphalt: the road from the top of SLOPE GATE to RIDGE TERRACE (the terrace is paved in granite). */
const RIDGE_ROAD_RECT: Rect = { x0: -250, x1: -120, z0: -4250, z1: -3650 };

const SIDE_N: Record<BunkyoSide, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export function buildBunkyo(scene: THREE.Scene): BunkyoStats {
  const rnd = prng(2929);
  const meshes: THREE.Object3D[] = [];
  const add = (...o: THREE.Object3D[]) => { meshes.push(...o); scene.add(...o); };
  const merged = (list: THREE.BufferGeometry[], mat: THREE.Material, cast = true) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list)!, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    add(m);
  };
  const H = RIDGE_H;

  // ------------------------------------------------------------ flat ground: lanes, the ridge's tops, gardens, the court
  const asphalt: THREE.BufferGeometry[] = [], setts: THREE.BufferGeometry[] = [];
  const road = (r: Rect, y: number, col: number) => asphalt.push(worldUv(tint(rectFlat(r, y), col), 220));
  const paved = (r: Rect, y: number, col: number) => setts.push(worldUv(tint(rectFlat(r, y), col), 110));
  // On the ridge: RIDGE ROAD (asphalt), the walk and RIDGE TERRACE (setts), the FORK (setts), gardens (moss).
  road({ ...RIDGE_ROAD_RECT }, H + 0.5, C.asphalt);
  for (const r of PLATEAU) {
    if (r.id === 'ridge' || r.id === 'terrace') continue;
    if (PRIVATE.includes(r.id)) paved(r, H + 0.4, C.moss);
    else paved(r, H + 0.5, C.paver);
  }
  paved({ x0: RIDGE_TERRACE.x0, x1: RIDGE_TERRACE.x1, z0: RIDGE_TERRACE.z0, z1: RIDGE_TERRACE.z1 }, H + 0.55, C.granite);
  paved(FORK, H + 0.5, C.granite);
  paved(BEND_CORNER, BEND_H + 0.5, C.granite);
  // In the valleys: the WALL PATH in stone setts, the court in pale gravel, the yard in gravel and moss.
  for (const r of WALL_PATH) paved(r, 0.7, C.paver);
  paved(SIDE_LANE, 0.7, C.paver);
  paved(QUIET_COURT, 0.75, C.gravel);
  paved(SW_YARD, 0.66, C.garden);
  paved({ x0: SW_YARD.x0 + 40, x1: SW_YARD.x1 - 30, z0: SW_YARD.z0 + 30, z1: SW_YARD.z1 - 10 }, 0.7, C.gravel);
  // A white edge line along both sides of the LOW ROAD and the RIDGE ROAD (the night reads the way on).
  for (const x of [LOW_ROAD.x1 - 10, -10]) asphalt.push(worldUv(tint(rectFlat({ x0: x - 2, x1: x + 2, z0: LOW_ROAD.z0, z1: LOW_ROAD.z1 }, 0.8), C.line), 220));
  for (const x of [RIDGE_ROAD_RECT.x0 + 14, RIDGE_ROAD_RECT.x1 - 16]) asphalt.push(worldUv(tint(rectFlat({ x0: x - 2, x1: x + 2, z0: RIDGE_ROAD_RECT.z0, z1: RIDGE_TERRACE.z0 }, H + 0.8), C.line), 220));
  for (const r of [EAST_LANE, COURT_LANE]) for (const z of [r.z0 + 8, r.z1 - 8]) asphalt.push(worldUv(tint(rectFlat({ x0: r.x0, x1: r.x1, z0: z - 1.5, z1: z + 1.5 }, 0.8), C.line), 220));
  merged(asphalt, new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTex('asphalt'), vertexColors: true, roughness: 0.95, ...ABOVE }), false);
  merged(setts, new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTex('setts'), vertexColors: true, roughness: 0.95, ...ABOVE }), false);

  // ------------------------------------------------------------ 石垣: the ridge's sides, the landings, copings; slope sides; garden walls in stone
  const stone: THREE.BufferGeometry[] = [];
  const sbox = (g: THREE.BufferGeometry, col: number, tile = 120) => stone.push(worldUv(tint(g, col), tile));
  const groundTops: (Rect & { y: number })[] = [...PLATEAU.map((r) => ({ ...r, y: H })), { ...FORK, y: H }, { ...BEND_CORNER, y: BEND_H }];
  for (const r of groundTops) {
    // Sides (the top is drawn above as ground), each in the colour of its stone; a coping course on the exposed rims.
    const col = r.y === H ? C.stone : C.granite;
    const w = r.x1 - r.x0, d = r.z1 - r.z0, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
    const g = new THREE.BoxGeometry(w, r.y, d);
    g.translate(x, r.y / 2, z);
    // Drop the top and bottom faces (indices 2 and 3 in BoxGeometry's groups).
    const idx = g.index!, keepIdx: number[] = [];
    for (const grp of g.groups) if (grp.materialIndex !== 2 && grp.materialIndex !== 3) for (let k = grp.start; k < grp.start + grp.count; k++) keepIdx.push(idx.getX(k));
    g.setIndex(keepIdx);
    g.clearGroups();
    sbox(g, col, 84);
    for (const [ax, az, bx, bz, nx, nz] of [[r.x0, r.z0, r.x1, r.z0, 0, -1], [r.x0, r.z1, r.x1, r.z1, 0, 1], [r.x0, r.z0, r.x0, r.z1, -1, 0], [r.x1, r.z0, r.x1, r.z1, 1, 0]] as const) {
      // Coping where the outside is lower ground (sampled at the edge's middle and its quarters).
      const len = Math.hypot(bx - ax, bz - az);
      for (let t0 = 0; t0 < len - 1; t0 += 40) {
        const t1 = Math.min(len, t0 + 40), tm = (t0 + t1) / 2;
        const px = ax + ((bx - ax) * tm) / len + nx * 6, pz = az + ((bz - az) * tm) / len + nz * 6;
        if (bunkyoGround(px, pz) > r.y - 20) continue;
        const cx = ax + ((bx - ax) * tm) / len + nx * 2, cz = az + ((bz - az) * tm) / len + nz * 2;
        sbox(boxAt(nx ? 8 : t1 - t0, 7, nx ? t1 - t0 : 8, cx, r.y - 2.5, cz), C.coping, 60);
      }
    }
  }
  // Slope sides where they stand above the ground (cheek walls), and a kerb along each side of the running surface.
  for (const s of SLOPES) {
    const along = s.axis === 'x' ? [s.x0, s.x1] : [s.z0, s.z1];
    for (const side of (s.axis === 'x' ? ['n', 's'] : ['w', 'e']) as BunkyoSide[]) {
      const [nx, nz] = SIDE_N[side];
      const edge = side === 'n' ? s.z0 : side === 's' ? s.z1 : side === 'w' ? s.x0 : s.x1;
      const at = (u: number, y: number) => (s.axis === 'x' ? [u, y, edge] : [edge, y, u]) as [number, number, number];
      const hOf = (u: number) => slopeAt(s, s.axis === 'x' ? u : edge, s.axis === 'x' ? edge : u);
      // Cheek wall: a quad strip (bottom at 0, top following the slope), facing out.
      const n = 8, pos: number[] = [];
      for (let k = 0; k < n; k++) {
        const u0 = along[0] + ((along[1] - along[0]) * k) / n, u1 = along[0] + ((along[1] - along[0]) * (k + 1)) / n;
        const a0 = at(u0, 0), a1 = at(u1, 0), b0 = at(u0, hOf(u0)), b1 = at(u1, hOf(u1));
        // Both windings: the wall is seen from the lane beside it and, in a cut, never (the ridge covers it).
        for (const p of [a0, a1, b1, a0, b1, b0, a0, b1, a1, a0, b0, b1]) pos.push(...p);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.computeVertexNormals();
      sbox(g, s.style === 'stairs' ? C.granite : C.stone, 84);
      // Kerb (granite), following the slope.
      const k0 = along[0], k1 = along[1], inset = 4;
      const ex = s.axis === 'x' ? 0 : -nx * inset, ez = s.axis === 'x' ? -nz * inset : 0;
      const [ax0, , az0] = at(k0, 0), [bx0, , bz0] = at(k1, 0);
      sbox(beam(ax0 + ex, hOf(k0) + 2, az0 + ez, bx0 + ex, hOf(k1) + 2, bz0 + ez, 8, 6), C.curb, 60);
    }
  }
  // Garden walls in stone (and block): body and cap.
  for (const wl of WALLS) {
    if (wl.kind !== 'stone' && wl.kind !== 'block') continue;
    const body = rectBox(wl, wl.base, wl.base + wl.h - 5);
    sbox(body, wl.kind === 'stone' ? C.ohya : C.block, wl.kind === 'stone' ? 70 : 40);
    sbox(rectBox({ x0: wl.x0 - 2, x1: wl.x1 + 2, z0: wl.z0 - 2, z1: wl.z1 + 2 }, wl.base + wl.h - 5, wl.base + wl.h), C.coping, 60);
  }
  // SLOPE GATE: the two granite posts with caps and the low wing wall (from the world's own solids).
  for (const p of WORLD) {
    if (p.group !== 'bunkyoGate' || p.kind !== 'box') continue;
    const b = p as BoxPrim;
    sbox(boxAt(b.w, b.y1 - b.y0 - 10, b.d, b.x, (b.y0 + b.y1 - 10) / 2, b.z), C.granite, 80);
    sbox(boxAt(b.w + 10, 10, b.d + 10, b.x, b.y1 - 5, b.z), C.stoneDark, 80);
  }
  // Terrace stair treads (granite) — the stair's solid is a ramp; its steps are drawn here.
  for (const s of SLOPES) {
    if (s.style !== 'stairs') continue;
    const len = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0, n = Math.max(3, Math.round((s.high - s.low) / 4.5));
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, wide = s.axis === 'x' ? s.z1 - s.z0 : s.x1 - s.x0;
    for (let i = 0; i < n; i++) {
      const h = s.low + ((s.high - s.low) * (i + 1)) / n, u = (i + 0.5) / n, off = (s.dir === 1 ? u - 0.5 : 0.5 - u) * len;
      const g = s.axis === 'x' ? boxAt(len / n, h, wide, cx + off, h / 2, cz) : boxAt(wide, h, len / n, cx, h / 2, cz + off);
      sbox(g, i % 2 ? C.granite : 0x948f85, 90);
    }
  }
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ishigakiTexture(), vertexColors: true, roughness: 0.92 });
  merged(stone, stoneMat);

  // ------------------------------------------------------------ the slopes' running surface (ring-grooved concrete) with white edge lines
  const rings: THREE.BufferGeometry[] = [], lines: THREE.BufferGeometry[] = [];
  for (const s of SLOPES) {
    if (s.style === 'stairs') continue;
    const w = s.x1 - s.x0, d = s.z1 - s.z0;
    const g = new THREE.PlaneGeometry(w, d, s.axis === 'x' ? 8 : 1, s.axis === 'z' ? 8 : 1).rotateX(-Math.PI / 2).translate((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, slopeAt(s, pos.getX(i), pos.getZ(i)) + 0.6);
    g.computeVertexNormals();
    // UVs along the slope's own length, so the rings are round on the incline.
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const along = s.axis === 'x' ? Math.hypot(x - s.x0, y - slopeAt(s, s.x0, z)) : Math.hypot(z - s.z0, y - slopeAt(s, x, s.z0));
      uv.setXY(i, (s.axis === 'x' ? along : x) / 70, (s.axis === 'x' ? z : along) / 70);
    }
    rings.push(tint(g, C.ring));
    // Painted edge lines, 10 in from each side.
    for (const side of (s.axis === 'x' ? [s.z0 + 10, s.z1 - 10] : [s.x0 + 10, s.x1 - 10])) {
      const a = s.axis === 'x' ? [s.x0, side] : [side, s.z0], b = s.axis === 'x' ? [s.x1, side] : [side, s.z1];
      lines.push(tint(beam(a[0], slopeAt(s, a[0], a[1]) + 0.9, a[1], b[0], slopeAt(s, b[0], b[1]) + 0.9, b[1], 3, 0.3), C.line));
    }
  }
  merged(rings, new THREE.MeshStandardMaterial({ color: 0xffffff, map: ringTexture(), vertexColors: true, roughness: 0.9, ...ABOVE }), false);

  // ------------------------------------------------------------ houses: bodies, roofs, windows, doors, balconies
  const bodies: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [], wins: THREE.BufferGeometry[] = [], litWins: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const gl = (g: THREE.BufferGeometry, col: number) => glow.push(tint(g, col));
  const SKIN: Record<BkHouse['skin'], number> = { white: C.white, beige: C.beige, grey: C.grey, wood: C.wood };
  const gateLamps: [number, number, number][] = [];
  for (const hs of BUNKYO_BUILT.houses) {
    const w = hs.x1 - hs.x0, d = hs.z1 - hs.z0, cx = (hs.x0 + hs.x1) / 2, cz = (hs.z0 + hs.z1) / 2, y0 = hs.base, top = y0 + hs.h;
    const skin = new THREE.Color(SKIN[hs.skin]).multiplyScalar(0.94 + rnd() * 0.1);
    bodies.push(worldUv(tint(boxAt(w, hs.h, d, cx, y0 + hs.h / 2, cz), skin), 90));
    // A plinth course and the floor bands.
    bodies.push(worldUv(tint(boxAt(w + 2, 10, d + 2, cx, y0 + 5, cz), C.trim), 90));
    if (hs.floors > 1) bodies.push(worldUv(tint(boxAt(w + 3, 4, d + 3, cx, y0 + GROUND_FLOOR - 4, cz), skin.clone().multiplyScalar(0.82)), 90));
    // Roof.
    const ov = 10, ry = top;
    if (hs.roof === 'flat') {
      bodies.push(worldUv(tint(boxAt(w + 4, 12, d + 4, cx, ry + 6, cz), skin.clone().multiplyScalar(0.9)), 90));
      roofs.push(worldUv(tint(boxAt(w - 10, 2, d - 10, cx, ry + 3, cz), C.tile), 90));
    } else {
      const alongX = w >= d, span = (alongX ? d : w) + ov * 2, run = (alongX ? w : d) + ov * 2, rise = span * 0.3;
      // Gable: a triangular prism; hip: the ridge is shorter by the span (a pitched pyramid along the long side).
      const ridge = hs.roof === 'gable' ? run : Math.max(10, run - span);
      const half = span / 2, rh = ridge / 2, rr = run / 2;
      const P = (a: number, b: number, y: number): [number, number, number] => (alongX ? [cx + a, ry + y, cz + b] : [cx + b, ry + y, cz + a]);
      const v = [P(-rr, -half, 0), P(rr, -half, 0), P(rr, half, 0), P(-rr, half, 0), P(-rh, 0, rise), P(rh, 0, rise)];
      const tris = [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [1, 2, 5], [3, 0, 4]];
      const pos: number[] = [];
      for (const t of tris) {
        const [a, b, c] = t.map((k) => v[k]);
        // Orient every face outward (away from the house's centre line).
        const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
        const mid = new THREE.Vector3(...a).add(new THREE.Vector3(...b)).add(new THREE.Vector3(...c)).divideScalar(3).sub(new THREE.Vector3(cx, ry, cz));
        if (n.dot(mid) < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const uv = new Float32Array((pos.length / 3) * 2);
      for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = (alongX ? pos[i * 3] : pos[i * 3 + 2]) / 60; uv[i * 2 + 1] = (pos[i * 3 + 1] + (alongX ? pos[i * 3 + 2] : pos[i * 3])) / 40; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      roofs.push(tint(g, rnd() < 0.5 ? C.roof : C.roofWarm));
      // Gable ends: a wall triangle on the short sides of a gable roof.
      if (hs.roof === 'gable') {
        for (const s of [-1, 1]) {
          const tri = new THREE.BufferGeometry();
          const a = P(s * (rr - ov), -half + ov, 0), b = P(s * (rr - ov), half - ov, 0), c = P(s * (rr - ov), 0, rise * ((half - ov) / half));
          tri.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...(s > 0 === alongX ? b : c), ...(s > 0 === alongX ? c : b)], 3));
          tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
          tri.computeVertexNormals();
          bodies.push(tint(tri, skin));
          // (Drawn both ways round: a gable is seen from either side of the street.)
          const back = tri.clone();
          const p = back.attributes.position;
          for (let i = 0; i < p.count; i += 3) { const tx = p.getX(i + 1), ty = p.getY(i + 1), tz = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, tx, ty, tz); }
          back.computeVertexNormals();
          bodies.push(tint(back, skin));
        }
      }
    }
    // Windows on every side and floor (a sliding door and 雨戸 on some ground floors), the door on the front.
    const fr = (side: BunkyoSide) => {
      const [nx, nz] = SIDE_N[side];
      const len = nx ? d : w, ox = nx ? (nx > 0 ? hs.x1 : hs.x0) : cx, oz = nz ? (nz > 0 ? hs.z1 : hs.z0) : cz;
      return { nx, nz, len, ox, oz, ang: Math.atan2(nx, nz) };
    };
    for (const side of ['n', 's', 'e', 'w'] as BunkyoSide[]) {
      const f = fr(side), n = Math.max(1, Math.floor((f.len - 30) / 56));
      for (let fl = 0; fl < hs.floors; fl++) {
        const fy = y0 + (fl === 0 ? 0 : GROUND_FLOOR + (fl - 1) * STOREY), wy = fy + (fl === 0 ? 54 : 46);
        for (let k = 0; k < n; k++) {
          const t = -f.len / 2 + ((k + 0.5) * f.len) / n;
          const isDoor = fl === 0 && side === hs.front && k === 0;
          const px = f.ox + f.nx * 0.8 + (f.nz ? t : 0), pz = f.oz + f.nz * 0.8 + (f.nx ? t : 0);
          if (isDoor) {
            wins.push(cellUv(new THREE.PlaneGeometry(30, 70), WIN.door).rotateY(f.ang).translate(px, fy + 35, pz));
            gateLamps.push([px + f.nx * 3 + (f.nz ? 22 : 0), fy + 80, pz + f.nz * 3 + (f.nx ? 22 : 0)]);
            continue;
          }
          const r = rnd(), cell = fl === 0 && r < 0.2 ? WIN.shutter : fl === 0 && r < 0.4 ? WIN.sliding : WIN.win;
          const g = cellUv(new THREE.PlaneGeometry(34, fl === 0 && cell === WIN.sliding ? 56 : 36), cell).rotateY(f.ang).translate(px, wy, pz);
          // About a third of the windows are lit after dark (a quiet street: most houses are dark or curtained).
          if (cell === WIN.win && rnd() < 0.33) litWins.push(cellUv(new THREE.PlaneGeometry(34, 36), WIN.lit).rotateY(f.ang).translate(px + f.nx * 0.1, wy, pz + f.nz * 0.1));
          else wins.push(g);
        }
      }
      // A balcony on the front's upper floor (slab and rail).
      if (side === hs.front && hs.floors >= 2 && hs.roof !== 'flat' && rnd() < 0.6) {
        const by = y0 + GROUND_FLOOR, bl = Math.min(f.len - 30, 120);
        const bx = f.ox + f.nx * 14, bz = f.oz + f.nz * 14;
        bodies.push(tint(boxAt(f.nx ? 28 : bl, 6, f.nx ? bl : 28, bx, by, bz), C.grey));
        bodies.push(tint(boxAt(f.nx ? 2 : bl, 30, f.nx ? bl : 2, f.ox + f.nx * 27, by + 18, f.oz + f.nz * 27), C.trim));
      }
    }
  }
  merged(bodies, new THREE.MeshStandardMaterial({ color: 0xffffff, map: detailNoise(), vertexColors: true, roughness: 0.9 }));
  merged(roofs, new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofTileTexture(), vertexColors: true, roughness: 0.8 }));
  const winTex = windowAtlas();
  merged(wins, new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.6 }), false);
  const litMat = new THREE.MeshStandardMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.05, roughness: 0.6 });
  glowAtNight(litMat, 0.05, 0.85);
  merged(litWins, litMat, false);
  // Gate lights (門灯) beside each front door: small warm boxes, drawn only.
  for (const [x, y, z] of gateLamps) gl(boxAt(6, 8, 6, x, y, z), C.lamp);

  // ------------------------------------------------------------ garden walls in plaster (with tile caps) and hedges
  const plaster: THREE.BufferGeometry[] = [], green: THREE.BufferGeometry[] = [];
  for (const wl of WALLS) {
    if (wl.kind === 'plaster') {
      plaster.push(worldUv(tint(rectBox(wl, wl.base, wl.base + wl.h - 6), C.plaster), 80));
      plaster.push(worldUv(tint(rectBox({ x0: wl.x0 - 3, x1: wl.x1 + 3, z0: wl.z0 - 3, z1: wl.z1 + 3 }, wl.base + wl.h - 6, wl.base + wl.h), C.tile), 80));
      plaster.push(worldUv(tint(rectBox({ x0: wl.x0 - 1, x1: wl.x1 + 1, z0: wl.z0 - 1, z1: wl.z1 + 1 }, wl.base, wl.base + 6), C.stoneDark), 80));
    } else if (wl.kind === 'hedge') {
      const c = new THREE.Color(C.hedge).multiplyScalar(0.9 + rnd() * 0.2);
      green.push(worldUv(tint(rectBox(wl, wl.base, wl.base + wl.h - 8), c), 50));
      green.push(worldUv(tint(rectBox({ x0: wl.x0 + 2, x1: wl.x1 - 2, z0: wl.z0 + 2, z1: wl.z1 - 2 }, wl.base + wl.h - 8, wl.base + wl.h), c.clone().multiplyScalar(1.15)), 50));
    }
  }
  // Low planting along the foot of the 石垣 on the WALL PATH and under the walk's fence (drawn only, ankle high).
  for (let z = -4220; z < -3540; z += 64) {
    if (z > -4190 && z < -4050) continue;
    if (z > -3910 && z < -3770) continue;
    green.push(worldUv(tint(boxAt(14, 14 + rnd() * 8, 44, -628, 8, z), new THREE.Color(C.hedge).multiplyScalar(1.05 + rnd() * 0.1)), 50));
  }
  // Shrubs in the pine garden and round the court's tree.
  for (const [x, z, y] of [[-600, -3560, H], [-545, -3630, H], [-600, -3620, H], [270, -3790, 0], [330, -3770, 0]] as const) {
    green.push(worldUv(tint(boxAt(30, 18, 26, x, y + 9, z), new THREE.Color(C.hedge).multiplyScalar(1.1)), 50));
  }
  merged(plaster, new THREE.MeshStandardMaterial({ color: 0xffffff, map: detailNoise(), vertexColors: true, roughness: 0.95 }));
  merged(green, new THREE.MeshStandardMaterial({ color: 0xffffff, map: detailNoise(), vertexColors: true, roughness: 1 }));

  // ------------------------------------------------------------ guard fences: kerb, posts and rails (iron), following the ground
  const iron: THREE.BufferGeometry[] = [], posts: THREE.Matrix4[] = [];
  for (const p of WORLD) {
    if (p.kind !== 'box' || (p.group !== 'bunkyoFence' && !(p.group === 'bunkyoSlope' && p.mat === 'metal'))) continue;
    const alongX = p.w >= p.d, len = alongX ? p.w : p.d;
    const a = alongX ? [p.x - len / 2, p.z] : [p.x, p.z - len / 2], b = alongX ? [p.x + len / 2, p.z] : [p.x, p.z + len / 2];
    // The fence stands on the walking surface beside it (the slope or the ridge), sampled just inside.
    const gy = (x: number, z: number) => Math.max(bunkyoGround(x, z), (p as BoxPrim).y0 > 0 && (p as BoxPrim).y1 - (p as BoxPrim).y0 <= 33 ? (p as BoxPrim).y0 : 0);
    const ya = gy(a[0], a[1]), yb = gy(b[0], b[1]);
    iron.push(tint(beam(a[0], ya + 3, a[1], b[0], yb + 3, b[1], 8, 6), C.curb));
    iron.push(tint(beam(a[0], ya + 32, a[1], b[0], yb + 32, b[1], 3, 3), C.iron));
    iron.push(tint(beam(a[0], ya + 18, a[1], b[0], yb + 18, b[1], 2, 2), C.iron));
    for (let t = 0; t <= len; t += 30) {
      const x = a[0] + ((b[0] - a[0]) * t) / len, z = a[1] + ((b[1] - a[1]) * t) / len, y = ya + ((yb - ya) * t) / len;
      posts.push(M4(x, y + 17, z, 0, 1, 30 / 26, 1));
    }
  }
  merged(iron, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.3 }));

  // ------------------------------------------------------------ 電柱 and wires; lamps (posts and heads)
  const poleM: THREE.Matrix4[] = [], armM: THREE.Matrix4[] = [], transM: THREE.Matrix4[] = [];
  const wirePts: number[] = [];
  for (const run of POLE_RUNS) {
    run.pts.forEach(([x, z], i) => {
      const nxt = run.pts[Math.min(i + 1, run.pts.length - 1)], prv = run.pts[Math.max(i - 1, 0)];
      const ang = Math.atan2(nxt[1] - prv[1], nxt[0] - prv[0]);
      poleM.push(M4(x, run.base + 130, z, 0, 1, 260 / 26, 1));
      armM.push(M4(x, run.base + 244, z, -ang));
      if (i % 2 === 1) transM.push(M4(x + 8, run.base + 200, z));
      if (i < run.pts.length - 1) {
        const [bx, bz] = run.pts[i + 1];
        for (const [off, y] of [[-20, 248], [20, 248], [0, 232]] as const) {
          const ox = -Math.sin(ang) * off, oz = Math.cos(ang) * off, sag = Math.hypot(bx - x, bz - z) * 0.03;
          const N = 8;
          for (let k = 0; k < N; k++) {
            for (const t of [k / N, (k + 1) / N]) wirePts.push(x + ox + (bx - x) * t, run.base + y - sag * 4 * t * (1 - t), z + oz + (bz - z) * t);
          }
        }
      }
    });
  }
  const concrete = new THREE.MeshStandardMaterial({ color: C.pole, roughness: 0.85 });
  add(instanced(new THREE.CylinderGeometry(4, 5.5, 26, 8), concrete, poleM));
  add(instanced(new THREE.BoxGeometry(5, 5, 60), new THREE.MeshStandardMaterial({ color: 0x5d5f62, roughness: 0.7 }), armM, false));
  add(instanced(new THREE.CylinderGeometry(7, 7, 22, 8), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.6 }), transM));
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
    add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1b1b1d })));
  }
  // Lamps: a slim post from the ground under it to the head at 184 (on the ridge a short gate-lamp post).
  const lampPosts: THREE.Matrix4[] = [], lampArms: THREE.Matrix4[] = [];
  const pools: THREE.BufferGeometry[] = [];
  for (const l of BUNKYO_LAMPS) {
    const gy = bunkyoGround(l.x, l.z), dx = Math.cos(l.ang), dz = Math.sin(l.ang), hx = l.x + dx * 22, hz = l.z + dz * 22;
    lampPosts.push(M4(l.x, (gy + 190) / 2, l.z, 0, 1, (190 - gy) / 26, 1));
    lampArms.push(M4(l.x + dx * 11, 192, l.z + dz * 11, -l.ang));
    gl(boxAt(10, 12, 10, hx, 184, hz), C.lamp);
    glow.push(tint(boxAt(14, 3, 14, hx, 191.5, hz), C.iron));
    // On raised ground the city's pool lies under the ridge: draw this lamp's pool on the ground it lights.
    if (gy > 10) pools.push(flat(300, 300, hx, bunkyoGround(hx, hz) + 0.9, hz));
  }
  // Foot lights (drawn only; not in the night rules): low warm lights on the slopes' kerbs and at the FORK and the WALL PATH's corners,
  // so the incline, the crest and the way on read after dark in a district with few lamps.
  const footPosts: THREE.Matrix4[] = [];
  const foot = (x: number, z: number) => {
    const y = bunkyoGround(x, z);
    footPosts.push(M4(x, y + 7, z, 0, 0.6, 14 / 26, 0.6));
    gl(boxAt(5, 3, 5, x, y + 15, z), C.foot);
    pools.push(flat(90, 90, x, y + 0.95, z));
  };
  for (const s of SLOPES) {
    if (s.style === 'stairs') continue;
    const along = s.axis === 'x' ? [s.x0, s.x1] : [s.z0, s.z1], len = along[1] - along[0];
    const side = s.axis === 'x' ? s.z0 + 6 : s.x0 + 6;
    for (let t = 30; t < len; t += 120) foot(s.axis === 'x' ? along[0] + t : side, s.axis === 'x' ? side : along[0] + t);
  }
  for (const [x, z] of [[-30, -3895], [-30, -3765], [-626, -4325], [-626, -4235], [-770, -3610], [-770, -4020], [-205, -3540], [-415, -3500]] as const) foot(x, z);
  // Terrace stair nosings (a dim lit edge on every tread, as on Ueno's stone steps).
  const nosings: THREE.BufferGeometry[] = [];
  for (const s of SLOPES) {
    if (s.style !== 'stairs') continue;
    const len = s.z1 - s.z0, n = Math.max(3, Math.round((s.high - s.low) / 4.5)), cx = (s.x0 + s.x1) / 2;
    for (let i = 0; i < n; i++) {
      const h = s.low + ((s.high - s.low) * (i + 1)) / n, u = i / n, off = (s.dir === 1 ? u - 0.5 : 0.5 - u) * len;
      nosings.push(new THREE.BoxGeometry(s.x1 - s.x0 - 16, 0.7, 2.2).translate(cx, h + 0.36, (s.z0 + s.z1) / 2 + off));
    }
  }
  const nosingMat = new THREE.MeshBasicMaterial({ color: 0xfff0d8, transparent: true, opacity: 0.2 });
  NIGHT_GLOW.push({ set: (k) => { nosingMat.opacity = 0.15 + 0.5 * k; } });
  if (nosings.length) add(new THREE.Mesh(mergeGeometries(nosings)!, nosingMat));

  // ------------------------------------------------------------ signs: four plaques, the 標柱 at the foot of each 坂, route boards
  const signs: THREE.BufferGeometry[] = [];
  const woodPosts: THREE.BufferGeometry[] = [];
  const plaque = (i: number, x: number, y: number, z: number, ang: number, w = 70) => signs.push(signQuad(w, w * 0.156, SIGN.plaque(i), x, y, z, ang));
  plaque(0, -300, 40, -4614 - 7.6, Math.PI, 38); // SLOPE GATE, on the wing wall (facing the avenue)
  plaque(1, -290, H + 16, RIDGE_TERRACE.z1 - 6.6, Math.PI, 60); // RIDGE TERRACE, on the terrace fence (read from the terrace)
  plaque(2, BEND_CORNER.x1 + 0.6, BEND_H - 18, -3475, Math.PI / 2, 60); // STONE BEND, on the corner's 石垣
  plaque(3, 186.6, 16, -3725, -Math.PI / 2, 44); // QUIET COURT, on a low stone at its west mouth
  // 標柱: square timber posts with the slope's name, at each slope's foot (and the bend's).
  const post = (i: number, x: number, z: number, ang: number) => {
    const y = bunkyoGround(x, z);
    woodPosts.push(tint(boxAt(12, 96, 12, x, y + 48, z), 0xb89a6c));
    woodPosts.push(tint(boxAt(15, 4, 15, x, y + 98, z), 0x6a5a44));
    for (const k of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) signs.push(signQuad(11, 33, SIGN.post(i), x + Math.sin(ang + k) * 6.2, y + 70, z + Math.cos(ang + k) * 6.2, ang + k));
  };
  post(0, -640, -4196, -Math.PI / 2); // KAMI-ZAKA
  post(1, -640, -3916, -Math.PI / 2); // NAKA-ZAKA
  post(2, -2, -4300, 0); // FUTAGO-ZAKA, the north foot
  post(2, -2, -3360, Math.PI); // …and the south foot
  post(3, -108, -4580, 0); // MON-ZAKA at SLOPE GATE
  post(4, -780, -3410, -Math.PI / 2); // MAGARI-ZAKA at STONE BEND's foot
  post(5, -260, -3305, Math.PI); // the terrace stair
  // Route boards where the three ways meet (two-sided, on a short post).
  const boardPosts: THREE.Matrix4[] = [];
  const board = (i: number, x: number, z: number, ang: number) => {
    const y = bunkyoGround(x, z);
    boardPosts.push(M4(x, y + 40, z, 0, 1, 80 / 26, 1));
    for (const s of [0, Math.PI]) signs.push(signQuad(40, 12, SIGN.route(i), x + Math.sin(ang + s) * 1.6, y + 84, z + Math.cos(ang + s) * 1.6, ang + s));
  };
  board(0, -112, -4300, 0); // A, at the top of SLOPE GATE… (on the LOW ROAD side: the high road is up the slope)
  board(2, -840, -4560, Math.PI / 2); // C, the WALL PATH's north mouth
  board(1, -740, -4050, Math.PI / 2); // B, at KAMI-ZAKA's foot
  board(0, -232, -4150, Math.PI / 2); // A on the ridge
  const signTex = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.06, roughness: 0.8, side: THREE.DoubleSide });
  glowAtNight(signMat, 0.06, 0.3);
  add(new THREE.Mesh(mergeGeometries(signs)!, signMat));
  merged(woodPosts, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 }));

  // ------------------------------------------------------------ court and terrace furniture: benches, a stone lantern, a small shrine
  const bench = mergeGeometries([boxAt(60, 4, 16, 0, 17, 0), boxAt(4, 17, 14, -24, 8.5, 0), boxAt(4, 17, 14, 24, 8.5, 0)].map((g) => g.toNonIndexed()))!;
  const benches: THREE.Matrix4[] = [];
  const seat = (x: number, z: number, ry: number) => benches.push(M4(x, bunkyoGround(x, z), z, ry));
  seat(240, -3848, 0); seat(340, -3848, 0); seat(240, -3712, Math.PI); seat(340, -3712, Math.PI); // QUIET COURT, along its edges
  seat(-300, -3555, Math.PI); seat(-180, -3640, 0); // RIDGE TERRACE, facing the view south
  seat(-380, -3760, 0); // the walk over NAKA-ZAKA
  add(instanced(bench, new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.8 }), benches));
  const small: THREE.BufferGeometry[] = [];
  // 石灯籠 in the court and at STONE BEND's corner; a small 祠 (shrine) at the court's east side.
  for (const [x, z] of [[205, -3790], [-505, -3435]] as const) {
    const y = bunkyoGround(x, z);
    small.push(tint(boxAt(14, 8, 14, x, y + 4, z), C.granite), tint(boxAt(6, 26, 6, x, y + 21, z), C.granite), tint(boxAt(16, 10, 16, x, y + 39, z), C.granite), tint(new THREE.ConeGeometry(14, 10, 4).rotateY(Math.PI / 4).translate(x, y + 49, z), C.stoneDark));
    gl(boxAt(8, 6, 8, x, y + 39, z), C.foot);
  }
  small.push(tint(boxAt(30, 30, 24, 402, 15, -3844), C.wood), tint(new THREE.ConeGeometry(26, 14, 4).rotateY(Math.PI / 4).translate(402, 37, -3844), C.tile));
  small.push(tint(boxAt(10, 26, 50, 182, 13, -3725), C.granite)); // the court's name stone
  merged(small, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }));

  // ------------------------------------------------------------ dark iron (posts, lamp arms, board posts) and the glow mesh
  const ironMat = new THREE.MeshStandardMaterial({ color: C.iron, roughness: 0.55, metalness: 0.35 });
  add(instanced(new THREE.CylinderGeometry(1.6, 1.6, 26, 5), ironMat, posts, false));
  add(instanced(new THREE.CylinderGeometry(2.4, 3.2, 26, 6), ironMat, [...lampPosts, ...footPosts, ...boardPosts]));
  add(instanced(new THREE.BoxGeometry(22, 3, 3), ironMat, lampArms, false));
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  NIGHT_GLOW.push({ set: (k) => { glowMat.color.setScalar(0.7 + 0.45 * k); } });
  merged(glow, glowMat, false);
  merged(lines, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, ...ABOVE }), false);
  // Warm pools under the drawn-only lights and the ridge lamps (night).
  if (pools.length) {
    const poolMat = new THREE.MeshBasicMaterial({ map: radialGlowTexture(), color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const poolMesh = new THREE.Mesh(mergeGeometries(pools)!, poolMat);
    poolMesh.renderOrder = 1;
    const poolNight = new THREE.Color(0x8a6a40);
    NIGHT_GLOW.push({ set: (k) => { poolMat.color.copy(poolNight).multiplyScalar(k); } });
    add(poolMesh);
  }

  let triangles = 0, inst = 0;
  for (const o of meshes) {
    const m = o as THREE.Mesh, g = m.geometry;
    if (!g || (o as THREE.LineSegments).isLineSegments) continue;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3, im = (m as unknown as THREE.InstancedMesh).isInstancedMesh;
    if (im) inst++;
    triangles += n * (im ? (m as unknown as THREE.InstancedMesh).count : 1);
  }
  return { meshes: meshes.length, triangles: Math.round(triangles), houses: BUNKYO_BUILT.houses.length, lamps: BUNKYO_LAMPS.length, poles: poleM.length, instanced: inst };
}

