import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RampPrim } from '../config/map';
import { UENO_HILL, WORLD, prng } from '../config/map';
import type { Rect, UenoTree } from '../config/ueno';
import {
  CANOPY_WALK, CULTURE_GATE, EAST_LAWN, EAST_PLAZA, GREEN_TERRACE, GROVE, GROVE_WALLS, HEDGES, HEDGE_H, PLATEAU, PLAZA, PROMENADE, RAMP_LANDING,
  ROUTES, STONE_AXIS, TRELLIS, UENO_HALL, UENO_LAMPS, UENO_LIGHTS, UENO_TREES, WALL_H, WEST_ARM, WEST_RAMP,
} from '../config/ueno';
import { rampHeight } from '../sim/systems/world';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { nearFade } from './city';
import { boxAt, flat } from './shibuya';
import { radialGlowTexture, stoneFacadeTexture } from './textures';

/**
 * MAP REFORGE (parallel A) — 上野 GREEN HEIGHTS, as drawn.
 *
 * Ueno reads through ground and trees, not signs: granite paving on the square and GREEN TERRACE,
 * a pale gravel GRAND PROMENADE, moss and a worn dirt path in the grove, lawns, clipped hedges and
 * low dry-stone walls; big trees whose crowns sit high over the paths (the trunk is what hides
 * you; the leaves never cover the camera: they dissolve near it like every tree in the city).
 * Built things are low and stone-grey: CULTURE GATE, the STONE AXIS with stone lantern pillars,
 * the terrace balustrade, UENO HALL with its colonnade and verdigris roof, a wisteria trellis.
 * Light is warm park lamps and a little white; almost no neon. Everything is merged per material
 * or instanced (trunks, crowns, lamps, benches, balusters), so the district adds a dozen meshes.
 */

/** Ueno's palette: deep greens, stone greys, warm browns, warm lamp light, a little white. */
const C = {
  granite: 0x8e897f, graniteDark: 0x766f65, terrace: 0x9b9488, gravel: 0x8a8270, shade: 0x7a7262, edge: 0x6f6a5c,
  moss: 0x36422a, dirt: 0x6e5a40, lawn: 0x45602f, lawnDark: 0x3b5228,
  hedge: 0x2e4b27, wallStone: 0x8a8476, cap: 0xa29c8e, wood: 0x6b4a30, woodDark: 0x4a3322, bronze: 0x2e2c28,
  hall: 0xd2cbbb, roof: 0x5d8a78, white: 0xf3efe6,
  lamp: UENO_LIGHTS[0], warmWhite: UENO_LIGHTS[1], leaf: UENO_LIGHTS[2],
};

export interface UenoStats { meshes: number; triangles: number; trees: number; lamps: number; benches: number }

/** Geometry with a baked vertex colour (keeps its UVs, so textured and plain pieces merge alike). */
function tint(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color), n = ng.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return ng;
}

/** Ground overlays sit a little above the city's ground plane; pull them forward in depth so it never shows through far from the camera (as Shibuya and Akihabara do). */
const ABOVE_GROUND = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

const rectFlat = (r: Rect, y: number) => flat(r.x1 - r.x0, r.z1 - r.z0, (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);

/** Rewrites UVs in world units (1 tile per `tile`), so stone never stretches. */
function worldUv(g: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  return g;
}

/** Granite setts and slabs (paving): a 256 px tile of irregular courses. */
function pavingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = prng(4242);
  g.fillStyle = '#6f6a62';
  g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 8; r++) {
    let x = (r % 2) * -20;
    while (x < 256) {
      const w = 36 + rnd() * 40, l = 56 + rnd() * 14;
      g.fillStyle = `hsl(${32 + rnd() * 12},${4 + rnd() * 6}%,${l}%)`;
      g.fillRect(x + 1.5, r * 32 + 1.5, w - 3, 29);
      x += w;
    }
  }
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.1})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Signs: the gate plaque, landmark plaques and the three route boards (one small atlas). */
type Cell = [number, number, number, number];
const SIGN_CELLS = {
  gate: [0, 0, 1024, 128] as Cell,
  plaque: (i: number): Cell => [(i % 2) * 512, 128 + Math.floor(i / 2) * 96, 512, 96],
  route: (i: number): Cell => [i * 341, 416, 341, 96],
};
const PLAQUES = [['STONE AXIS', '石段'], ['GREEN TERRACE', '高台テラス'], ['CANOPY WALK', '木立の遊歩道'], ['UENO HALL', '上野文化館'], ['GRAND PROMENADE', '大通り']];
const ROUTE_BOARDS = [['A', 'GRAND PROMENADE', '大通り'], ['B', 'GROVE PATH', '木立の道'], ['C', 'TERRACE ROUTE', '石段・高台']];
function signAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#26241f';
  g.fillRect(0, 0, 1024, 512);
  const text = (s: string, x: number, y: number, size: number, color: string, weight = '700', align: CanvasTextAlign = 'center') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  // Gate plaque: bronze, cut letters.
  g.fillStyle = '#3a3329';
  g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = '#a88a5a';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 1004, 108);
  text('上野', 150, 64, 64, '#e9d7b0', '800');
  text('UENO  GREEN HEIGHTS', 590, 64, 52, '#e9d7b0', '700');
  PLAQUES.forEach(([en, jp], i) => {
    const [x, y, w, h] = SIGN_CELLS.plaque(i);
    g.fillStyle = '#2f2c26';
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.strokeStyle = '#8f7a55';
    g.lineWidth = 3;
    g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    text(en, x + w / 2, y + 38, 34, '#efe3c8', '700');
    text(jp, x + w / 2, y + 70, 22, '#c9b893', '600');
  });
  ROUTE_BOARDS.forEach(([k, en, jp], i) => {
    const [x, y, w, h] = SIGN_CELLS.route(i);
    g.fillStyle = '#f1ece0';
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#2f4a2c';
    g.fillRect(x + 12, y + 14, 66, 66);
    text(k, x + 45, y + 48, 50, '#f1ece0', '800');
    text(en, x + 92, y + 36, 26, '#26241f', '700', 'left');
    text(jp, x + 92, y + 66, 20, '#4a463c', '600', 'left');
  });
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/** A quad textured with one atlas cell, facing +z then turned by `ang` and placed. */
function signQuad(w: number, h: number, cell: Cell, x: number, y: number, z: number, ang: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [cx, cy, cw, ch] = cell, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * cw) / 1024, 1 - (cy + (1 - uv.getY(i)) * ch) / 512);
  return g.rotateY(ang).translate(x, y, z);
}

const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], colors?: number[], shadow = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, ms.length));
  ms.forEach((x, i) => m.setMatrixAt(i, x));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, new THREE.Color(c)));
  m.count = ms.length;
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

/** Ground height a tree or prop stands on (plateau top, terrace or street). */
const standY = (t: UenoTree) => (t.high ? UENO_HILL.top : 0);

export function buildUeno(scene: THREE.Scene): UenoStats {
  const rnd = prng(1717);
  const meshes: THREE.Object3D[] = [];
  const add = (...o: THREE.Object3D[]) => { meshes.push(...o); scene.add(...o); };

  // ------------------------------------------------------------ ground: paving, gravel, lawns, moss
  const paved: THREE.BufferGeometry[] = [], soft: THREE.BufferGeometry[] = [];
  const pave = (r: Rect, y: number, col: number) => paved.push(worldUv(tint(rectFlat(r, y), col), 90));
  const lawn = (r: Rect, y: number, col: number) => soft.push(tint(rectFlat(r, y), col));
  // The square, the forecourt in front of the stair foot and the arm along the pond.
  pave(PLAZA, 0.6, C.granite);
  pave(WEST_ARM, 0.62, C.granite);
  pave({ x0: STONE_AXIS.x0 - 20, x1: STONE_AXIS.x1 + 20, z0: STONE_AXIS.lower.z1, z1: -3320 }, 0.64, C.graniteDark);
  // GRAND PROMENADE: pale gravel with dark stone edging.
  pave(PROMENADE, 0.58, C.gravel);
  pave({ x0: GROVE.x1, x1: PROMENADE.x0, z0: PROMENADE.z0, z1: PROMENADE.z1 }, 0.57, C.edge); // under the hedges and their gaps
  pave({ x0: PROMENADE.x1, x1: WEST_RAMP.x1, z0: WEST_RAMP.z1, z1: PLAZA.z0 + 10 }, 0.6, C.granite); // the ramp's foot
  for (const x of [PROMENADE.x0 + 4, PROMENADE.x1 - 4]) pave({ x0: x - 4, x1: x + 4, z0: PROMENADE.z0, z1: PROMENADE.z1 }, 0.7, C.edge);
  // CANOPY WALK: gravel under the trees; the east lawn and the lawn east of the axis.
  pave(CANOPY_WALK, 0.56, C.shade);
  lawn(EAST_LAWN, 0.55, C.lawn);
  lawn(EAST_PLAZA, 0.55, C.lawn);
  pave({ x0: STONE_AXIS.x1, x1: STONE_AXIS.x1 + 60, z0: EAST_PLAZA.z0, z1: EAST_PLAZA.z1 }, 0.66, C.granite);
  pave({ x0: 3060, x1: 3130, z0: EAST_LAWN.z0, z1: EAST_LAWN.z1 }, 0.62, C.gravel);
  // The grove: moss, and a worn dirt path along the route.
  lawn(GROVE, 0.52, C.moss);
  {
    const pts = ROUTES.grove.filter(([x]) => x < GROVE.x1 + 10);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      soft.push(tint(flat(70, len + 40, (ax + bx) / 2, 0.62, (az + bz) / 2, Math.atan2(bx - ax, bz - az)), C.dirt));
    }
  }
  // On top: GREEN TERRACE and the paved strip behind it, and gravel paths across the plateau.
  const T = GREEN_TERRACE, top = PLATEAU.top + 0.6;
  pave({ x0: T.x0, x1: T.x1, z0: -3900, z1: T.z1 }, top, C.terrace);
  pave({ x0: 2760, x1: 2840, z0: UENO_HALL.z1, z1: -3900 }, top - 0.02, C.gravel);
  pave({ x0: PLATEAU.x0, x1: PLATEAU.x1, z0: -4140, z1: -4040 }, top - 0.04, C.gravel);
  pave(RAMP_LANDING, top, C.graniteDark);
  add(new THREE.Mesh(mergeGeometries(paved)!, new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavingTexture(), vertexColors: true, roughness: 0.95, ...ABOVE_GROUND })));
  add(new THREE.Mesh(mergeGeometries(soft)!, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, ...ABOVE_GROUND })));
  for (const m of meshes) m.receiveShadow = true;

  // ------------------------------------------------------------ stone: walls, balustrade, gate, lantern pillars, pond rim, hall
  const stone: THREE.BufferGeometry[] = [];
  const sbox = (w: number, h: number, d: number, x: number, y: number, z: number, col: number) => stone.push(worldUv(tint(boxAt(w, h, d, x, y, z), col), 64));
  for (const r of GROVE_WALLS) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
    sbox(w, WALL_H - 6, d, x, (WALL_H - 6) / 2, z, C.wallStone);
    sbox(w + 4, 6, d + 4, x, WALL_H - 3, z, C.cap);
  }
  // Balustrade on GREEN TERRACE: rails (the colliders), a base course and balusters every 16.
  const balusters: THREE.Matrix4[] = [];
  for (const p of WORLD) {
    if (p.group !== 'uenoRail' || p.kind !== 'box') continue;
    const along = p.w > p.d, len = along ? p.w : p.d;
    sbox(along ? len : 10, 5, along ? 10 : len, p.x, p.y0 + 2.5, p.z, C.cap);
    sbox(along ? len + 2 : 12, 5, along ? 12 : len + 2, p.x, p.y1 - 2.5, p.z, C.cap);
    for (let t = -len / 2 + 8; t < len / 2 - 4; t += 16) balusters.push(M4(along ? p.x + t : p.x, p.y0 + 12, along ? p.z : p.z + t));
  }
  // CULTURE GATE: plinths, shafts, capitals and the lintel with its roof cap.
  {
    const G = CULTURE_GATE;
    for (const s of [-1, 1]) {
      const x = G.x + s * G.half;
      sbox(40, 22, 40, x, 11, G.z, C.graniteDark);
      sbox(28, G.lintel - 22, 28, x, 22 + (G.lintel - 22) / 2, G.z, C.cap);
      sbox(36, 10, 36, x, G.lintel - 5, G.z, C.graniteDark);
    }
    sbox(G.half * 2 + 40, G.h - G.lintel, 26, G.x, (G.h + G.lintel) / 2, G.z, C.wallStone);
    sbox(G.half * 2 + 64, 8, 40, G.x, G.h + 4, G.z, C.graniteDark);
  }
  // Stone lantern pillars under the stair lanterns (the lanterns stand at tread height beside each flight).
  const lanterns: [number, number, number][] = [];
  for (const p of WORLD) {
    if (p.kind !== 'ramp' || p.style !== 'stairs' || p.group !== 'hill') continue;
    if (!(p.x > STONE_AXIS.x0 && p.x < STONE_AXIS.x1)) continue;
    const r = p as RampPrim, len = r.d, wide = r.w;
    for (const u of [0.04, 0.5, 0.96]) for (const s of [-1, 1]) {
      const off = (r.dir === 1 ? u - 0.5 : 0.5 - u) * len;
      const y = rampHeight(r, r.x, r.z + off);
      if (y > 4) sbox(13, y, 13, r.x + s * (wide / 2 + 9), y / 2, r.z + off, C.cap);
      lanterns.push([r.x + s * (wide / 2 + 9), y, r.z + off]);
    }
    // Cheek kerbs along both sides of each flight (low, so you can still step off).
    for (const s of [-1, 1]) sbox(6, 4, len, r.x + s * (wide / 2 - 3), (r.hLow + r.hHigh) / 2 + 1, r.z, C.graniteDark);
  }
  // The low stone beside the stair foot that carries the STONE AXIS plaque.
  sbox(70, 20, 10, STONE_AXIS.x0 - 40, 10, STONE_AXIS.lower.z1 + 0.5, C.graniteDark);
  // A low granite kerb round the pond's north and east shores.
  sbox(470, 8, 10, 2125, 4, -3612, C.graniteDark);
  sbox(10, 8, 345, 2359, 4, -3437, C.graniteDark);
  // The low stone that carries the CANOPY WALK plaque.
  sbox(70, 18, 10, 2360, 9, -4377, C.graniteDark);
  // Ramp edge kerb on the promenade side.
  sbox(6, 10, WEST_RAMP.z1 - RAMP_LANDING.z0, WEST_RAMP.x0 + 3, PLATEAU.top + 4, (RAMP_LANDING.z0 + RAMP_LANDING.z1) / 2, C.graniteDark);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavingTexture(), vertexColors: true, roughness: 0.9 });
  const stoneMesh = new THREE.Mesh(mergeGeometries(stone)!, stoneMat);
  stoneMesh.castShadow = stoneMesh.receiveShadow = true;
  add(stoneMesh);
  add(instanced(new THREE.CylinderGeometry(2.6, 3.6, 14, 6), new THREE.MeshStandardMaterial({ color: C.cap, roughness: 0.9 }), balusters));

  // ------------------------------------------------------------ UENO HALL: stone body, colonnade, pediment, verdigris roof, warm windows
  {
    const H = UENO_HALL, y0 = PLATEAU.top, w = H.x1 - H.x0, d = H.z1 - H.z0, x = (H.x0 + H.x1) / 2, z = (H.z0 + H.z1) / 2;
    const fac = stoneFacadeTexture();
    const body = worldUv(boxAt(w, H.h, d, x, y0 + H.h / 2, z), 120);
    const hall = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: 0xffffff, map: fac, roughness: 0.85 }));
    hall.castShadow = hall.receiveShadow = true;
    const trim: THREE.BufferGeometry[] = [];
    const tb = (bw: number, bh: number, bd: number, bx: number, by: number, bz: number, col: number) => trim.push(tint(boxAt(bw, bh, bd, bx, by, bz), col));
    // Podium step, cornice, the portico on the south (toward the point) and its pediment.
    tb(w + 20, 10, d + 20, x, y0 + 5, z, C.graniteDark);
    tb(w + 12, 12, d + 12, x, y0 + H.h - 6, z, C.cap);
    const pz = H.z1 + 34;
    tb(w - 30, 8, 60, x, y0 + 4, pz - 4, C.cap);
    tb(w - 26, 16, 64, x, y0 + 158, pz - 4, C.cap);
    const ped = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
    trim.push(tint(ped.scale(w - 26, 22, 64).translate(x, y0 + 172, pz - 4), C.hall));
    // Roof: low hipped slab in verdigris.
    tb(w + 16, 8, d + 16, x, y0 + H.h + 4, z, C.roof);
    tb(w - 30, 16, d - 30, x, y0 + H.h + 16, z, C.roof);
    const trimMesh = new THREE.Mesh(mergeGeometries(trim)!, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 }));
    trimMesh.castShadow = true;
    const cols: THREE.Matrix4[] = [];
    for (let k = 0; k < 7; k++) cols.push(M4(H.x0 + 26 + (k * (w - 52)) / 6, y0 + 8 + 75, pz + 18));
    add(hall, trimMesh, instanced(new THREE.CylinderGeometry(7, 8, 150, 10), new THREE.MeshStandardMaterial({ color: C.hall, roughness: 0.8 }), cols));
  }

  // ------------------------------------------------------------ lights: lamp heads, hall windows, terrace bollards, sign faces (one unlit mesh)
  const glow: THREE.BufferGeometry[] = [];
  const gl = (g: THREE.BufferGeometry, col: number) => glow.push(tint(g, col));
  {
    // UENO HALL's tall windows behind the colonnade, and the side windows.
    const H = UENO_HALL, y0 = PLATEAU.top;
    for (let k = 0; k < 6; k++) gl(new THREE.PlaneGeometry(14, 70).translate(H.x0 + 33 + k * 23, y0 + 70, H.z1 + 0.8), C.lamp);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      gl(new THREE.PlaneGeometry(12, 50).rotateY(s * Math.PI / 2).translate(s < 0 ? H.x0 - 0.8 : H.x1 + 0.8, y0 + 80, H.z0 + 25 + k * 35), C.lamp);
    }
  }
  // Terrace bollards and the hilltop path (drawn lights only: the plateau stays dark in the rules).
  const bollards: THREE.Matrix4[] = [];
  const bollard = (x: number, y: number, z: number) => { bollards.push(M4(x, y + 13, z)); gl(boxAt(7, 5, 7, x, y + 27, z), C.warmWhite); };
  for (const x of [GREEN_TERRACE.x0 + 14, STONE_AXIS.x0 - 14, STONE_AXIS.x1 + 14, GREEN_TERRACE.x1 - 14]) bollard(x, PLATEAU.top, GREEN_TERRACE.z1 - 14);
  for (const z of [-3960, -4180]) for (const x of [2750, 2850]) bollard(x, PLATEAU.top, z);
  for (const x of [2560, 2700, 2900]) bollard(x, PLATEAU.top, -4030);
  bollard(RAMP_LANDING.x0 + 14, PLATEAU.top, RAMP_LANDING.z1 - 14);
  bollard(RAMP_LANDING.x1 - 14, PLATEAU.top, RAMP_LANDING.z0 + 60);

  // The STONE AXIS lanterns read too white at night: a slightly dimmer warm shade drawn just round each lantern head
  // and its cap (stairLights.ts, shared with 愛宕山, stays as it is). About 18% less light at night; the nosings are untouched.
  const shade = new THREE.Color(0xfff0d8).multiplyScalar(0.82 / 1.12).getHex();
  for (const [x, y, z] of lanterns) {
    gl(boxAt(11.6, 8.6, 11.6, x, y + 33, z), shade);
    gl(boxAt(17.6, 3.6, 17.6, x, y + 38.5, z), shade);
  }

  // Foot lights: a few low, weak warm lights (drawn only; the night rules keep the grove dark) so the ground, the trunks,
  // the walls and the way on read in the normal camera after dark. In the grove they sit on the wall ends and the hedge
  // ends at the gaps; on CANOPY WALK beside the benches under the cliff.
  const footPosts: THREE.Matrix4[] = [], footPools: [number, number][] = [];
  const foot = new THREE.Color(C.lamp).multiplyScalar(0.55).getHex();
  const footLight = (x: number, z: number, y = 0, px = x, pz = z) => {
    footPosts.push(M4(x, y + 8, z, 0, 0.7, 16 / 26, 0.7));
    gl(boxAt(5, 3, 5, x, y + 17.5, z), foot);
    footPools.push([px, pz]);
  };
  for (const h of HEDGES.slice(1)) footLight((h.x0 + h.x1) / 2, h.z1 - 6, HEDGE_H, (h.x0 + h.x1) / 2 - 24, h.z1 + 20);
  for (const w of GROVE_WALLS) {
    const westEnd = w.x0 > GROVE.x0 + 10, x = westEnd ? w.x0 + 6 : w.x1 - 6, z = (w.z0 + w.z1) / 2;
    footLight(x, z, WALL_H, x + (westEnd ? -20 : 20), z + 22);
  }
  for (const x of [2575, 2905]) footLight(x, PLATEAU.z0 - 8);

  // ------------------------------------------------------------ park lamps (posts; the heads glow, city.ts adds their halo and pool)
  const lampPosts: THREE.Matrix4[] = [], lampArms: THREE.Matrix4[] = [];
  for (const l of UENO_LAMPS) {
    const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
    lampPosts.push(M4(l.x, 100, l.z));
    lampArms.push(M4(l.x + dx * 12, 196, l.z + dz * 12, -l.ang));
    const hx = l.x + dx * 22, hz = l.z + dz * 22;
    gl(boxAt(11, 16, 11, hx, 186, hz), C.lamp);
    glow.push(tint(boxAt(15, 3, 15, hx, 195.5, hz), C.bronze));
  }

  // ------------------------------------------------------------ signs (gate plaque, landmark plaques, route boards)
  const signs: THREE.BufferGeometry[] = [];
  const boardPosts: THREE.Matrix4[] = [];
  {
    const G = CULTURE_GATE;
    for (const s of [-1, 1]) signs.push(signQuad(G.half * 2 - 20, 26, SIGN_CELLS.gate, G.x, (G.h + G.lintel) / 2, G.z + s * 13.6, s < 0 ? Math.PI : 0));
    const plaque = (i: number, x: number, y: number, z: number, ang: number) => signs.push(signQuad(64, 12, SIGN_CELLS.plaque(i), x, y, z, ang));
    plaque(0, STONE_AXIS.x0 - 40, 14, STONE_AXIS.lower.z1 + 6, 0); // STONE AXIS, on a low stone beside the stair foot
    plaque(1, GREEN_TERRACE.x0 + 70, PLATEAU.top + 16, GREEN_TERRACE.z1 + 0.5, 0); // GREEN TERRACE, on the balustrade front
    plaque(3, (UENO_HALL.x0 + UENO_HALL.x1) / 2, PLATEAU.top + 190, UENO_HALL.z1 + 70.5, 0);
    // Route boards: a post and a two-sided board where the ways part (the square) and where they meet again.
    const board = (i: number, x: number, z: number, ang: number) => {
      boardPosts.push(M4(x, 40, z));
      for (const s of [0, Math.PI]) signs.push(signQuad(52, 15, SIGN_CELLS.route(i), x + Math.sin(ang + s) * 1.6, 82, z + Math.cos(ang + s) * 1.6, ang + s));
    };
    board(0, 2300, -3640, Math.PI / 2); // A at the arm's mouth
    board(1, 2120, -3640, Math.PI / 2); // B into the grove
    board(2, STONE_AXIS.x1 + 30, STONE_AXIS.lower.z1 + 30, 0); // C at the stair foot
    board(0, 2340, -3850, -Math.PI / 2); // A at the ramp foot
    board(2, 2880, -4020, Math.PI); // on the plateau
    // CANOPY WALK plaque on a low stone at the walk's west end.
    signs.push(signQuad(64, 12, SIGN_CELLS.plaque(2), 2360, 22, -4371.5, 0));
  }
  const signTex = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.12, roughness: 0.7, side: THREE.DoubleSide });
  glowAtNight(signMat, 0.12, 0.45);
  add(new THREE.Mesh(mergeGeometries(signs)!, signMat));

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  const glowMesh = new THREE.Mesh(mergeGeometries(glow)!, glowMat);
  NIGHT_GLOW.push({ set: (k) => { glowMat.color.setScalar(0.72 + 0.4 * k); } });
  add(glowMesh);

  // ------------------------------------------------------------ hedges, trellis
  const green: THREE.BufferGeometry[] = [];
  for (const h of HEDGES) {
    const w = h.x1 - h.x0, d = h.z1 - h.z0, x = (h.x0 + h.x1) / 2, z = (h.z0 + h.z1) / 2;
    const c = new THREE.Color(C.hedge).multiplyScalar(0.92 + rnd() * 0.16);
    green.push(tint(boxAt(w, HEDGE_H - 8, d, x, (HEDGE_H - 8) / 2, z), c), tint(boxAt(w - 6, 8, d - 6, x, HEDGE_H - 4, z), c.clone().multiplyScalar(1.12)));
  }
  // Low planting at the foot of the cliffs and along the square (drawn only; ankle high).
  for (let x = PLATEAU.x0 + 30; x < PLATEAU.x1 - 20; x += 70) if (Math.abs(x - 2530) > 44 && Math.abs(x - 2860) > 44) green.push(tint(boxAt(46, 10, 16, x, 5, PLATEAU.z0 - 9), new THREE.Color(C.hedge).multiplyScalar(1.1)));
  green.push(tint(boxAt(14, 12, 200, PLAZA.x0 + 8, 6, -3460), new THREE.Color(C.hedge).multiplyScalar(1.05)));
  const hedgeMesh = new THREE.Mesh(mergeGeometries(green)!, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 }));
  hedgeMesh.castShadow = hedgeMesh.receiveShadow = true;
  add(hedgeMesh);
  const wood: THREE.BufferGeometry[] = [];
  {
    const Tr = TRELLIS, P = 14;
    for (const [x, z] of [[Tr.x0 + P / 2, Tr.z0 + P / 2], [Tr.x1 - P / 2, Tr.z0 + P / 2], [Tr.x0 + P / 2, Tr.z1 - P / 2], [Tr.x1 - P / 2, Tr.z1 - P / 2]]) {
      wood.push(tint(boxAt(P, Tr.h, P, x, Tr.h / 2, z), C.woodDark));
    }
    for (const z of [Tr.z0 + 7, Tr.z1 - 7]) wood.push(tint(boxAt(Tr.x1 - Tr.x0 + 10, 8, 10, (Tr.x0 + Tr.x1) / 2, Tr.h + 2, z), C.woodDark));
    for (let x = Tr.x0; x <= Tr.x1; x += 12) wood.push(tint(boxAt(5, 5, Tr.z1 - Tr.z0 + 14, x, Tr.h + 8.5, (Tr.z0 + Tr.z1) / 2), C.wood));
  }
  const woodMesh = new THREE.Mesh(mergeGeometries(wood)!, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 }));
  woodMesh.castShadow = true;
  add(woodMesh);

  // ------------------------------------------------------------ benches (seat, back and legs as one instanced shape)
  const bench = (() => {
    const parts = [boxAt(64, 4, 18, 0, 17, 0), boxAt(64, 12, 3, 0, 27, -8), boxAt(4, 17, 16, -26, 8.5, 0), boxAt(4, 17, 16, 26, 8.5, 0)];
    return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  })();
  const benches: THREE.Matrix4[] = [];
  const seat = (x: number, z: number, ry: number, y = 0) => benches.push(M4(x, y, z, ry));
  // Along the square's edges and the promenade's ramp side, facing the open ground; on GREEN TERRACE facing the view.
  for (const z of [-3700, -3560]) seat(PLAZA.x0 + 26, z, Math.PI / 2);
  for (const z of [-4000, -4100]) seat(WEST_RAMP.x0 - 14, z, -Math.PI / 2);
  for (const x of [2660, 2940]) seat(x, GREEN_TERRACE.z1 - 34, 0, PLATEAU.top);
  for (const x of [2400, 2560, 2740, 2900, 3060]) seat(x, -4532, Math.PI);
  seat(3100, -3600, -Math.PI / 2);
  // CANOPY WALK: two benches with their backs to the cliff, between shrubs, so it reads as a park walk, not a wall.
  for (const x of [2530, 2860]) seat(x, PLATEAU.z0 - 14, Math.PI);
  seat(2600, -4200, 0, PLATEAU.top);
  add(instanced(bench, new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.8 }), benches));

  // ------------------------------------------------------------ posts (lamps, bollards, route boards): one instanced bronze post
  const bronze = new THREE.MeshStandardMaterial({ color: C.bronze, roughness: 0.55, metalness: 0.35 });
  const posts = [
    ...lampPosts.map((m) => m.clone().multiply(new THREE.Matrix4().makeScale(1, 200 / 26, 1))),
    ...bollards,
    ...footPosts,
    ...boardPosts.map((m) => m.clone().multiply(new THREE.Matrix4().makeScale(1, 80 / 26, 1))),
  ];
  add(instanced(new THREE.CylinderGeometry(2.6, 3.4, 26, 6), bronze, posts));
  add(instanced(new THREE.BoxGeometry(24, 3, 3), bronze, lampArms, undefined, false));

  // ------------------------------------------------------------ trees: trunks (instanced) and crowns (instanced blobs that dissolve near the camera)
  const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [], crownCol: number[] = [];
  const SHAPE: Record<UenoTree['kind'], { top: number; r: number; flat: number; n: number }> = {
    grove: { top: 270, r: 66, flat: 0.9, n: 4 },
    canopy: { top: 330, r: 96, flat: 0.6, n: 5 },
    park: { top: 300, r: 78, flat: 0.82, n: 4 },
  };
  for (const t of UENO_TREES) {
    const s = SHAPE[t.kind], y0 = standY(t), tr = prng(Math.round(t.x * 7 + t.z * 3));
    const crownY = y0 + s.top - s.r * s.flat;
    trunks.push(M4(t.x, y0, t.z, tr() * 6, 1, crownY - y0, 1));
    for (let k = 0; k < s.n; k++) {
      const a = (k / s.n) * Math.PI * 2 + tr() * 0.8, off = k === 0 ? 0 : s.r * 0.55;
      const r = s.r * (k === 0 ? 1 : 0.72 + tr() * 0.2);
      crowns.push(M4(t.x + Math.cos(a) * off, crownY + (k === 0 ? 0 : -s.r * 0.2 + tr() * s.r * 0.3), t.z + Math.sin(a) * off, tr() * 6, r, r * s.flat, r));
      const c = new THREE.Color().setHSL(0.26 + tr() * 0.06, 0.32 + tr() * 0.14, 0.16 + tr() * 0.07);
      crownCol.push(c.getHex());
    }
  }
  // Low shrubs along the foot of the cliff on CANOPY WALK (the crown blob, small): drawn only, within 30 of the cliff.
  for (const x of [2385, 2440, 2480, 2660, 2700, 2760, 2950, 2985]) {
    const tr = prng(x), r = 17 + tr() * 8;
    crowns.push(M4(x, r * 0.55, PLATEAU.z0 - 13 - tr() * 6, tr() * 6, r, r * 0.75, r * 0.8));
    crownCol.push(new THREE.Color().setHSL(0.27 + tr() * 0.05, 0.34, 0.17 + tr() * 0.05).getHex());
  }
  // Trunk: 22 wide at the root (the solid is 24), tapering; flared base.
  const trunkGeo = new THREE.CylinderGeometry(7, 10, 1, 8).translate(0, 0.5, 0);
  add(instanced(trunkGeo, nearFade(new THREE.MeshStandardMaterial({ color: 0x4a3a2b, roughness: 1 }), 40, 140), trunks));
  const roots: THREE.Matrix4[] = UENO_TREES.map((t) => M4(t.x, standY(t), t.z, 0, 1, 1, 1));
  add(instanced(new THREE.CylinderGeometry(9, 13, 10, 8).translate(0, 5, 0), new THREE.MeshStandardMaterial({ color: 0x3f3226, roughness: 1 }), roots, undefined, false));
  const crownMesh = instanced(new THREE.IcosahedronGeometry(1, 1), nearFade(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 })), crowns, crownCol);
  add(crownMesh);

  // ------------------------------------------------------------ warm pools under the drawn-only lights (night)
  const glowTex = radialGlowTexture();
  const poolGeo: THREE.BufferGeometry[] = [];
  for (const m of bollards) {
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    poolGeo.push(flat(70, 70, p.x, p.y - 12.2, p.z));
  }
  for (const [x, z] of footPools) poolGeo.push(flat(88, 88, x, 0.9, z));
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pools = new THREE.Mesh(mergeGeometries(poolGeo)!, poolMat);
  pools.renderOrder = 1;
  const poolNight = new THREE.Color(0x8a6a40);
  NIGHT_GLOW.push({ set: (k) => { poolMat.color.copy(poolNight).multiplyScalar(k); } });
  add(pools);

  let triangles = 0;
  for (const o of meshes) {
    const m = o as THREE.Mesh, g = m.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    triangles += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  }
  return { meshes: meshes.length, triangles: Math.round(triangles), trees: UENO_TREES.length, lamps: UENO_LAMPS.length, benches: benches.length };
}
