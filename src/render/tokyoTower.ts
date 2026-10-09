import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxPrim } from '../config/map';
import { STOREY, TOKYO_TOWER_H, WORLD, prng } from '../config/map';
import type { TtwRect } from '../config/tokyoTower';
import {
  AXIS, FOOTING, FOOTING_H, GATE, GATE_PLANTERS, LEGS, PLANTER_H, PROP_SIZE, RED_H, RED_TERRACE, RING_H, SERVICE_KIOSK, SERVICE_LANE, SERVICE_WALL,
  SKY_PLAZA, SOUTH_BLOCKS, STAIRS, TERRACES, TOWER_RED, TOWER_WHITE, TT, TTW_LAMPS, TTW_LIGHTS, TTW_PROPS, TUNNEL,
} from '../config/tokyoTower';
import { NIGHT_GLOW, glowAtNight } from './nightGlow';
import { boxAt, flat } from './shibuya';
import { latticeTexture, sharedFacadeTexture, stoneTexture } from './textures';

/**
 * MAP REFORGE parallel E — 東京タワー RED HEIGHT, as drawn.
 *
 * The tower carries the district: a deep crimson and warm-white lattice (not SOL's orange, not
 * STAR's yellow) on four legs that stand in SKY PLAZA, with open arches between them. Round it,
 * everything is calm and heavy: dark grey concrete and stone retaining walls, pale stone paving,
 * deep green planting, black steel rails, a little deep red on the gate lintel, the RED TERRACE
 * girders and the axis inlay. No advertising.
 *
 * Night: the tower is not a light source. Its steel is lit from below — a floodlight term in its
 * material, strongest at the foot and fading up the body, scaled by the lattice's own colour —
 * so it reads warm red against the navy sky without a glowing outline or a white-out. The ground
 * carries warm-white lamps, dim edge lights on every terrace coping and a lit nosing on every
 * step, so edges, stairs and the slope read in the normal camera.
 *
 * Performance: the tower is a silhouette of open lattice frustums (a few hundred triangles); the
 * district is merged per material (about twenty meshes) and its repeated furniture is instanced.
 */

const C = {
  red: TOWER_RED, redLattice: 0x8a1a20, white: TOWER_WHITE, redDark: 0x6e1418,
  wall: 0x5d5f62, wallDark: 0x46484b, stone: 0x7c7770, coping: 0xa59e92, pave: 0x9a948a, plaza: 0x8e897f,
  axis: 0x4a4c50, axisEdge: 0x9d978c, inlay: 0x7c1a20, grass: 0x3d5a2d, grassDark: 0x324c26, hedge: 0x2c4627, gravel: 0x857e70,
  padGlow: 0x5e5648, parapetCap: 0x8c867b, steel: 0x25272a, steelLight: 0x4b4f55, service: 0x6e7175, wood: 0x6b4a30, lane: 0x77746e,
};
const [WARM, RED_LIGHT, WARM_GREY] = TTW_LIGHTS;

/** Geometry with a baked vertex colour (keeps its UVs, so textured and plain pieces merge alike). */
function tint(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color), n = ng.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return ng;
}

/** Rewrites UVs in world units (1 tile per `tu` across, `tv` up), so stone never stretches. */
function worldUv(g: THREE.BufferGeometry, tu: number, tv = tu): THREE.BufferGeometry {
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    if (ny > 0.5) uv.setXY(i, x / tu, z / tu);
    else if (nx > 0.5) uv.setXY(i, z / tu, y / tv);
    else uv.setXY(i, x / tu, y / tv);
  }
  return g;
}

/** Ground overlays sit a little above the city's ground plane; pulled forward in depth so it never shows through far away. */
const ABOVE_GROUND = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

const rectFlat = (r: TtwRect, y: number) => flat(r.x1 - r.x0, r.z1 - r.z0, (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
const rectBox = (r: TtwRect, y0: number, y1: number, pad = 0) => boxAt(r.x1 - r.x0 + pad * 2, y1 - y0, r.z1 - r.z0 + pad * 2, (r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);

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

/** Large stone slabs (SKY PLAZA, the terraces): a 256 px tile of 4 × 4 slabs with fine joints. */
function slabTexture(seed: number, base: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = prng(seed);
  g.fillStyle = '#5a5650';
  g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    const l = base + rnd() * 6;
    g.fillStyle = `hsl(${30 + rnd() * 8},${3 + rnd() * 4}%,${l}%)`;
    g.fillRect(k * 64 + 1.5, r * 64 + 1.5, 61, 61);
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** SERVICE WALL's skin: concrete panels, louvre bands, a few pipes and stencilled numbers (1 tile ≈ 240 × 240). */
/** Railing infill: thin uprights and a mid rail (not the tower's cross-braced lattice, which read as scaffolding). */
function railTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  for (const x of [0, 32]) g.fillRect(x, 0, 5, 64);
  g.fillRect(0, 30, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function serviceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = prng(3131);
  g.fillStyle = '#8b8d8f';
  g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
    g.fillStyle = `hsl(210,3%,${50 + rnd() * 6}%)`;
    g.fillRect(k * 128 + 1, r * 64 + 1, 126, 62);
  }
  // Louvre band and a door-height vent.
  g.fillStyle = '#3e4144';
  g.fillRect(14, 140, 228, 44);
  g.fillStyle = '#6c7074';
  for (let y = 142; y < 182; y += 5) g.fillRect(16, y, 224, 2);
  g.fillStyle = '#44474a';
  g.fillRect(170, 196, 54, 58);
  // Pipes.
  g.fillStyle = '#5b5e61';
  g.fillRect(96, 0, 8, 140);
  g.fillRect(108, 0, 5, 140);
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(104, 0, 2, 140);
  // Stencil.
  g.fillStyle = 'rgba(30,30,32,.55)';
  g.font = '700 22px sans-serif';
  g.fillText(`TT-${10 + Math.floor(rnd() * 80)}`, 20, 40);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.07})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Plates: the gate name, the landmarks and the three route boards (one small atlas). */
type Cell = [number, number, number, number];
const SIGN_CELLS = {
  gate: [0, 0, 1024, 128] as Cell,
  plaque: (i: number): Cell => [(i % 2) * 512, 128 + Math.floor(i / 2) * 96, 512, 96],
  route: (i: number): Cell => [i * 341, 416, 341, 96],
};
const PLAQUES = [['RED TERRACE', '赤の高台'], ['SKY PLAZA', '塔下広場'], ['SERVICE WALL', '設備擁壁'], ['TERRACE RING', '高台テラス']];
const ROUTE_BOARDS = [['A', 'RED AXIS', '塔への主道'], ['B', 'TERRACE RING', '高台を回る'], ['C', 'SERVICE SLOPE', '裏の坂道']];
function signAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f1f21';
  g.fillRect(0, 0, 1024, 512);
  const text = (s: string, x: number, y: number, size: number, color: string, weight = '700', align: CanvasTextAlign = 'center') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  // Gate plate: cut letters on dark steel, a thin deep red rule.
  g.fillStyle = '#26262a';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#8e1c22';
  g.fillRect(24, 104, 976, 6);
  text('東京タワー', 210, 58, 60, '#efe6d6', '800');
  text('TOWER GATE  ·  RED HEIGHT', 640, 58, 46, '#e3d9c6', '700');
  PLAQUES.forEach(([en, jp], i) => {
    const [x, y, w, h] = SIGN_CELLS.plaque(i);
    g.fillStyle = '#2a2a2d';
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#8e1c22';
    g.fillRect(x + 14, y + 14, 8, h - 28);
    text(en, x + w / 2 + 8, y + 38, 34, '#f0e8da', '700');
    text(jp, x + w / 2 + 8, y + 70, 22, '#c8bfae', '600');
  });
  ROUTE_BOARDS.forEach(([k, en, jp], i) => {
    const [x, y, w, h] = SIGN_CELLS.route(i);
    g.fillStyle = '#ece6da';
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#7e1a20';
    g.fillRect(x + 12, y + 14, 66, 66);
    text(k, x + 45, y + 48, 50, '#f4eee4', '800');
    text(en, x + 92, y + 36, 26, '#222224', '700', 'left');
    text(jp, x + 92, y + 66, 20, '#4a4844', '600', 'left');
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

// ---------------------------------------------------------------- the tower

/**
 * Floodlighting baked into the steel's material: after dark the lattice is lit from below by
 * its own colour (diffuse × warm tint × a fall-off with height), never above the colour itself,
 * so it never turns white. `flood` (0 by day … 1 at night) is driven by NIGHT_GLOW.
 */
function floodlit(m: THREE.MeshStandardMaterial, flood: { value: number }): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlood = flood;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTtwY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTtwY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTtwY;\nuniform float uFlood;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float ttwFall = 0.22 + 0.78 * exp(-max(vTtwY, 0.0) / 1500.0);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.86, 0.72) * (uFlood * ttwFall);`);
  };
  m.customProgramCacheKey = () => 'ttw-floodlit';
  return m;
}

/** A lattice frustum (square in plan, `r` = half width) as open sides with see-through bracing. */
function lattice(y0: number, y1: number, r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1 * Math.SQRT2, r0 * Math.SQRT2, y1 - y0, 4, Math.max(1, Math.round((y1 - y0) / Math.max(60, r0 * 1.2))), true);
  g.rotateY(Math.PI / 4);
  g.translate(0, (y0 + y1) / 2, 0);
  const panel = Math.max(30, (r0 + r1) / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4 * Math.round((r0 + r1) / panel), uv.getY(i) * Math.max(1, Math.round((y1 - y0) / panel)));
  return g.toNonIndexed();
}

/** One leg: a lattice column from (cx, 0, cz) leaning to (tx, h, tz), `r0` → `r1` half width. */
function leg(cx: number, cz: number, tx: number, tz: number, h: number, r0: number, r1: number): THREE.BufferGeometry {
  const g = lattice(0, h, r0, r1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / h;
    pos.setX(i, pos.getX(i) + cx + (tx - cx) * t);
    pos.setZ(i, pos.getZ(i) + cz + (tz - cz) * t);
  }
  g.computeVertexNormals();
  return g;
}

/** An arch of lattice between two legs on one face (a curved strip, seen from both sides). */
function arch(ax: number, az: number, bx: number, bz: number, y0: number, top: number, depth: number, segs = 10): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  const pt = (t: number, dy: number) => {
    const y = y0 + (top - y0) * Math.sin(Math.PI * t) + dy;
    return [ax + (bx - ax) * t, y, az + (bz - az) * t];
  };
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const a0 = pt(t0, 0), a1 = pt(t1, 0), b0 = pt(t0, depth), b1 = pt(t1, depth);
    pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
    uv.push(t0 * segs, 0, t1 * segs, 0, t1 * segs, 1, t0 * segs, 0, t1 * segs, 1, t0 * segs, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function buildTower(flood: { value: number }, redLift: { value: number }, add: (...o: THREE.Object3D[]) => void): void {
  const lat = latticeTexture();
  const mk = (color: number, u = flood) => floodlit(new THREE.MeshStandardMaterial({ color, map: lat, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05 }), u);
  // The red steel: a shade lighter than the solid parts and lifted a little by day (its shaded side
  // stays red against the grey towers behind it); at night the same floodlight as the white.
  const red = mk(C.redLattice, redLift), white = mk(C.white);
  const reds: THREE.BufferGeometry[] = [], whites: THREE.BufferGeometry[] = [];
  // The legs: from the footings (±200) leaning in to the body at 700, and the arches between them.
  const LEG_TOP = 700, BODY_R = 140;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) reds.push(leg(sx * 200, sz * 200, sx * (BODY_R - 18), sz * (BODY_R - 18), LEG_TOP, 26, 18));
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    // Each face leans in with height: the arch sits on the face plane at its mid height.
    const k = 0.62, ox = (ax + bx) / 2, oz = (az + bz) / 2;
    const r = 200 - (200 - BODY_R) * k;
    reds.push(arch(ax * r - ox * 4, az * r - oz * 4, bx * r - ox * 4, bz * r - oz * 4, 300, 520, 26));
  }
  // The body: frustums up to the main deck, then the upper body and the top deck, antenna.
  const stages: [number, number, number, number][] = [
    [LEG_TOP, 1100, BODY_R, 112], [1100, 1600, 112, 92], [1600, 2100, 92, 74], [2100, 2600, 74, 60], [2600, 3000, 60, 52],
    [3130, 3600, 44, 33], [3600, 4100, 33, 22], [4160, 4600, 16, 8],
  ];
  stages.forEach(([y0, y1, r0, r1], i) => (i % 2 ? whites : reds).push(lattice(y0, y1, r0, r1)));
  // Belts: a solid band round the body where the legs meet it (the first platform level).
  const solidRed = floodlit(new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.55, metalness: 0.05 }), redLift);
  const solidWhite = floodlit(new THREE.MeshStandardMaterial({ color: C.white, roughness: 0.5 }), flood);
  const belts: THREE.BufferGeometry[] = [boxAt(BODY_R * 2 + 8, 28, BODY_R * 2 + 8, 0, LEG_TOP + 4, 0)];
  const decks: THREE.BufferGeometry[] = [];
  for (const [y0, y1, w] of [[3000, 3130, 170], [4100, 4160, 80]] as const) decks.push(boxAt(w, y1 - y0, w, 0, (y0 + y1) / 2, 0));
  const deckBand: THREE.BufferGeometry[] = [boxAt(174, 34, 174, 0, 3075, 0), boxAt(84, 18, 84, 0, 4135, 0)];
  const antenna = new THREE.CylinderGeometry(3, 8, TOKYO_TOWER_H - 4600, 6).translate(0, 4600 + (TOKYO_TOWER_H - 4600) / 2, 0);
  const g = new THREE.Group();
  g.position.set(TT.x, 0, TT.z);
  const latticeMesh = (list: THREE.BufferGeometry[], m: THREE.Material) => {
    const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    return mesh;
  };
  g.add(latticeMesh(reds, red), latticeMesh(whites, white));
  g.add(new THREE.Mesh(mergeGeometries([...belts.map((b) => b.toNonIndexed()), antenna.toNonIndexed()])!, solidRed));
  g.add(new THREE.Mesh(mergeGeometries(decks.map((b) => b.toNonIndexed()))!, solidWhite));
  // Deck windows: dark glass by day, a low warm glow at night (lit inside, not a beacon).
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.2, metalness: 0.5, emissive: WARM, emissiveIntensity: 0.0 });
  glowAtNight(glass, 0.02, 0.32);
  g.add(new THREE.Mesh(mergeGeometries(deckBand.map((b) => b.toNonIndexed()))!, glass));
  // Aviation lights: two small red dots high on the antenna (tiny; the only red light in the district).
  const beacon = new THREE.MeshBasicMaterial({ color: RED_LIGHT });
  for (const y of [4600, TOKYO_TOWER_H - 6]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), beacon);
    b.position.y = y;
    g.add(b);
  }
  add(g);
}

// ---------------------------------------------------------------- the district

export interface TokyoTowerStats { meshes: number; triangles: number }

export function buildTokyoTower(scene: THREE.Scene): TokyoTowerStats {
  const meshes: THREE.Object3D[] = [];
  const add = (...o: THREE.Object3D[]) => { meshes.push(...o); scene.add(...o); };
  const rnd = prng(3330);
  const flood = { value: 0 }, redFlood = { value: 0 }, redLift = { value: 0 };
  // redLift: the tower's red steel, 0.2 by day (the shaded side keeps its colour), the same 0.48 as the floodlight at night.
  NIGHT_GLOW.push({ set: (k) => { flood.value = 0.06 + 0.42 * k; redFlood.value = 0.25 * flood.value; redLift.value = 0.2 + 0.28 * k; } });
  buildTower(flood, redLift, add);

  // ------------------------------------------------------------ ground: plaza and axis paving, lawns, lane
  const paved: THREE.BufferGeometry[] = [], soft: THREE.BufferGeometry[] = [], plain: THREE.BufferGeometry[] = [];
  const pave = (r: TtwRect, y: number, col: number) => paved.push(worldUv(tint(rectFlat(r, y), col), 220));
  const lawn = (r: TtwRect, y: number, col: number) => soft.push(tint(rectFlat(r, y), col));
  const line = (r: TtwRect, y: number, col: number) => plain.push(tint(rectFlat(r, y), col));
  // SKY PLAZA: pale stone slabs (its own mesh: a faint warm lift at night, see below), a darker band round its edge.
  const plazaPaved = [worldUv(tint(rectFlat(SKY_PLAZA, 0.6), C.plaza), 220)];
  for (const [x0, x1] of [[SKY_PLAZA.x0, SKY_PLAZA.x0 + 12], [SKY_PLAZA.x1 - 12, SKY_PLAZA.x1]]) line({ x0, x1, z0: SKY_PLAZA.z0, z1: SKY_PLAZA.z1 }, 0.7, C.wallDark);
  // RED AXIS: dark granite, light stone edges and one thin deep red inlay on the centre line (paint, not light).
  pave({ x0: AXIS.x0, x1: AXIS.x1, z0: AXIS.z0, z1: AXIS.z1 }, 0.66, C.axis);
  for (const x of [AXIS.x0 + 4, AXIS.x1 - 4]) line({ x0: x - 4, x1: x + 4, z0: AXIS.z0, z1: AXIS.z1 }, 0.74, C.axisEdge);
  line({ x0: TT.x - 4, x1: TT.x + 4, z0: AXIS.z0, z1: AXIS.z1 }, 0.76, C.inlay);
  // Cross bands every 160 along the approach (they count the distance to the gate).
  for (let z = 3460; z > GATE.z1; z -= 160) line({ x0: AXIS.x0 + 10, x1: AXIS.x1 - 10, z0: z - 3, z1: z + 3 }, 0.75, C.axisEdge);
  // Terrace tops: the same slabs, a shade warmer; RED TERRACE gets the deck below.
  for (const t of TERRACES) pave(t, RING_H + 0.5, C.pave);
  pave(TUNNEL, RING_H + 0.5, C.pave);
  // C. the service lane: plain concrete with white hatch at its mouth and the tunnel.
  line(SERVICE_LANE, 0.62, C.lane);
  for (let k = 0; k < 6; k++) line({ x0: 945 + k * 20, x1: 955 + k * 20, z0: 2860, z1: 2895 }, 0.7, 0xd8d4cc);
  // Lawns: the west frontage, the north court, by the tracks, the south forecourt.
  lawn({ x0: -140, x1: 40, z0: 1990, z1: 2990 }, 0.55, C.grass);
  lawn({ x0: 40, x1: AXIS.x0, z0: 1880, z1: 1975 }, 0.55, C.grassDark);
  lawn({ x0: AXIS.x1, x1: 1060, z0: 1945, z1: 1985 }, 0.55, C.grassDark);
  lawn({ x0: 1380, x1: 1440, z0: 1990, z1: 2420 }, 0.55, C.grass);
  lawn({ x0: 1320, x1: 1395, z0: 2420, z1: 2700 }, 0.55, C.grass);
  lawn({ x0: AXIS.x1 + 30, x1: 940, z0: 3020, z1: 3300 }, 0.55, C.grass);
  // A gravel walk across the forecourt from the axis to the lane mouth.
  pave({ x0: AXIS.x1, x1: 960, z0: 2995, z1: 3020 }, 0.58, C.gravel);
  const pavingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: slabTexture(2402, 60), vertexColors: true, roughness: 0.92, ...ABOVE_GROUND });
  const softMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, ...ABOVE_GROUND });
  // SKY PLAZA at night: the slabs give back a little warm light (the lamps and the floodlit tower
  // bouncing off pale stone), so a runner reads as a dark shape against the floor. No light of its own by day.
  const plazaTex = pavingMat.map!;
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: plazaTex, vertexColors: true, roughness: 0.92, emissive: 0xb8ac96, emissiveMap: plazaTex, emissiveIntensity: 0, ...ABOVE_GROUND });
  glowAtNight(plazaMat, 0, 0.1);
  for (const [list, m] of [[paved, pavingMat], [plazaPaved, plazaMat], [soft, softMat], [plain, softMat]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
    mesh.receiveShadow = true;
    add(mesh);
  }
  // Low indirect light on SKY PLAZA's edges: a dim warm line where the floor meets the terrace walls
  // and along the axis kerbs, and a soft pad at the foot of every stair (where the ways up start).
  // Paint-pale by day, a little brighter at night; far below the lamps (nothing here can white out).
  const dim: THREE.BufferGeometry[] = [];
  const dl = (r: TtwRect, y: number, col: number = WARM_GREY) => dim.push(tint(rectFlat(r, y), col));
  dl({ x0: SKY_PLAZA.x0 + 1, x1: SKY_PLAZA.x0 + 4, z0: SKY_PLAZA.z0, z1: 2700 }, 0.8);
  dl({ x0: SKY_PLAZA.x1 - 4, x1: SKY_PLAZA.x1 - 1, z0: SKY_PLAZA.z0, z1: 2700 }, 0.8);
  for (const x of [AXIS.x0 + 9, AXIS.x1 - 9]) dl({ x0: x - 1.2, x1: x + 1.2, z0: RED_TERRACE.z1, z1: GATE.z0 }, 0.8);
  for (const st of STAIRS) {
    const foot = st.axis === 'x' ? (st.dir === 1 ? st.x0 : st.x1) : (st.dir === 1 ? st.z0 : st.z1);
    if (st.low > 0) continue;
    const out = st.dir === 1 ? -1 : 1; // the ground in front of the first step
    if (st.axis === 'x') {
      dl({ x0: Math.min(foot, foot + out * 3), x1: Math.max(foot, foot + out * 3), z0: st.z0 + 6, z1: st.z1 - 6 }, 0.82);
      dl({ x0: Math.min(foot + out * 3, foot + out * 40), x1: Math.max(foot + out * 3, foot + out * 40), z0: st.z0 + 10, z1: st.z1 - 10 }, 0.78, C.padGlow);
    } else {
      dl({ x0: st.x0 + 6, x1: st.x1 - 6, z0: Math.min(foot, foot + out * 3), z1: Math.max(foot, foot + out * 3) }, 0.82);
      dl({ x0: st.x0 + 10, x1: st.x1 - 10, z0: Math.min(foot + out * 3, foot + out * 40), z1: Math.max(foot + out * 3, foot + out * 40) }, 0.78, C.padGlow);
    }
  }
  const dimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, ...ABOVE_GROUND });
  NIGHT_GLOW.push({ set: (k) => { dimMat.color.setScalar(0.42 + 0.2 * k); } });
  add(new THREE.Mesh(mergeGeometries(dim)!, dimMat));

  // ------------------------------------------------------------ terraces: retaining walls, coping, the tunnel bridge, stairs, the slope
  const walls: THREE.BufferGeometry[] = [], trim: THREE.BufferGeometry[] = [], steps: THREE.BufferGeometry[] = [];
  const wall = (g: THREE.BufferGeometry, col: number) => walls.push(worldUv(tint(g, col), 120, 60));
  const tr = (g: THREE.BufferGeometry, col: number) => trim.push(tint(g, col));
  for (const t of TERRACES) {
    wall(rectBox(t, 0, RING_H - 8), C.stone);
    tr(rectBox(t, RING_H - 8, RING_H, 2), C.coping);
    // A dark plinth course at the foot.
    tr(rectBox(t, 0, 12, 1.5), C.wallDark);
  }
  // The tunnel bridge: its fascias and soffit.
  tr(rectBox(TUNNEL, RING_H - 12, RING_H, 1), C.coping);
  // SERVICE SLOPE and the stairs. Stairs: one block per tread (risers ≈ 7.5); the slope: one ramp.
  const stairNosings: THREE.BufferGeometry[] = [];
  for (const s of STAIRS) {
    const alongX = s.axis === 'x', len = alongX ? s.x1 - s.x0 : s.z1 - s.z0, wide = alongX ? s.z1 - s.z0 : s.x1 - s.x0;
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    if (s.style === 'slope') {
      const g = new THREE.BoxGeometry(alongX ? len : wide, 1, alongX ? wide : len, alongX ? 6 : 1, 1, alongX ? 1 : 6);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = (alongX ? pos.getX(i) : pos.getZ(i)) / len + 0.5;
        const h = s.low + (s.high - s.low) * (s.dir === 1 ? u : 1 - u);
        pos.setY(i, pos.getY(i) > 0 ? h : 0);
      }
      g.translate(cx, 0, cz);
      g.computeVertexNormals();
      walls.push(worldUv(tint(g, C.lane), 120, 60));
      // Grip lines across the slope every 40.
      for (let t = 20; t < len - 10; t += 40) {
        const u = t / len, h = s.low + (s.high - s.low) * (s.dir === 1 ? u : 1 - u);
        const at = alongX ? { x: s.x0 + t, z: cz } : { x: cx, z: s.z0 + t };
        tr(boxAt(alongX ? 3 : wide - 20, 1, alongX ? wide - 20 : 3, at.x, h + 0.6, at.z), 0xbfbab0);
      }
      continue;
    }
    const n = Math.max(3, Math.round((s.high - s.low) / 7.5));
    const base = s.low > 0 ? s.low - 12 : 0;
    if (s.low > 0) wall(boxAt(alongX ? len : wide, base, alongX ? wide : len, cx, base / 2, cz), C.stone);
    for (let i = 0; i < n; i++) {
      const h = s.low + ((s.high - s.low) * (i + 1)) / n;
      // Tread i covers u ∈ [i/n, 1] from the foot (each step a block to the top: the flight reads solid).
      const u0 = i / n, u1 = (i + 1) / n;
      const a = s.dir === 1 ? u0 : 1 - u1, b = s.dir === 1 ? u1 : 1 - u0;
      const p0 = (alongX ? s.x0 : s.z0) + a * len, p1 = (alongX ? s.x0 : s.z0) + b * len;
      const mid = (p0 + p1) / 2, ext = p1 - p0;
      const g = alongX ? boxAt(ext, h - base, wide, mid, (h + base) / 2, cz) : boxAt(wide, h - base, ext, cx, (h + base) / 2, mid);
      steps.push(worldUv(tint(g, i % 2 ? C.coping : 0xb0a99d), 90));
      // A lit nosing on every second tread (the front edge).
      if (i % 2 === 0) {
        const front = s.dir === 1 ? p0 : p1;
        stairNosings.push(alongX ? boxAt(2.2, 0.8, wide - 16, front, h + 0.4, cz) : boxAt(wide - 16, 0.8, 2.2, cx, h + 0.4, front));
      }
    }
  }
  const stoneTex = stoneTexture();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTex, vertexColors: true, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 });
  const stepMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: slabTexture(77, 66), vertexColors: true, roughness: 0.9 });

  // ------------------------------------------------------------ steel: RED TERRACE, gate lintel, rails, lamp brackets, the leg footings' caps
  const steel: THREE.BufferGeometry[] = [], redSteel: THREE.BufferGeometry[] = [];
  const st = (g: THREE.BufferGeometry, col = C.steel) => steel.push(tint(g, col));
  const rs = (g: THREE.BufferGeometry) => redSteel.push(tint(g, C.red));
  {
    const R = RED_TERRACE;
    // Deck slab (pale top), deep red edge girders, cross girders under it.
    tr(rectBox(R, RED_H - 4, RED_H + 0.5), C.pave);
    rs(boxAt(R.x1 - R.x0 + 6, 30, 10, (R.x0 + R.x1) / 2, RED_H - 15, R.z0 + 5));
    rs(boxAt(R.x1 - R.x0 + 6, 30, 10, (R.x0 + R.x1) / 2, RED_H - 15, R.z1 - 5));
    for (const x of [R.x0 + 8, (R.x0 + R.x1) / 2, R.x1 - 8]) rs(boxAt(10, 22, R.z1 - R.z0 - 20, x, RED_H - 15, (R.z0 + R.z1) / 2));
    st(rectBox({ x0: R.x0 + 10, x1: R.x1 - 10, z0: R.z0 + 10, z1: R.z1 - 10 }, RED_H - 10, RED_H - 4), C.steelLight);
  }
  {
    const G = GATE, xw = (G.pierW.x0 + G.pierW.x1) / 2, xe = (G.pierE.x0 + G.pierE.x1) / 2, zc = (G.z0 + G.z1) / 2, d = G.z1 - G.z0;
    for (const x of [xw, xe]) {
      wall(boxAt(G.pierW.x1 - G.pierW.x0, G.top - 10, d, x, (G.top - 10) / 2, zc), C.wall);
      tr(boxAt(G.pierW.x1 - G.pierW.x0 + 6, 10, d + 6, x, G.top - 5, zc), C.coping);
      // A deep red steel strip up each pier's face (inlaid, not lit).
      for (const s of [-1, 1]) rs(boxAt(10, G.top - 60, 2, x, (G.top - 60) / 2 + 20, zc + s * (d / 2 + 1)));
    }
    rs(boxAt(G.pierE.x0 - G.pierW.x1 + 8, G.top - G.lintel0, d - 8, (G.pierW.x1 + G.pierE.x0) / 2, (G.top + G.lintel0) / 2, zc));
  }
  // Leg footings: dark concrete with a pale cap.
  for (const [x, z] of LEGS) {
    wall(boxAt(FOOTING, FOOTING_H - 6, FOOTING, x, (FOOTING_H - 6) / 2, z), C.wallDark);
    tr(boxAt(FOOTING + 4, 6, FOOTING + 4, x, FOOTING_H - 3, z), C.coping);
  }
  // Rails. Where the ring looks onto the plaza and the axis: a steel railing of thin uprights
  // (see-through, it is how the ring watches the plaza). Low stair sides and the ring's back edges
  // (the lawns, the north court, the lane): a low stone parapet instead, with the same footprint and
  // height (the collision and the sight lines are the rail prims', unchanged).
  const meshPanels: THREE.BufferGeometry[] = [];
  const posts: THREE.Matrix4[] = [];
  const parapet = (b: BoxPrim, alongX: boolean) =>
    b.y0 < 90 || // a low stair side
    (!alongX && (b.x < 50 || (b.x > 925 && b.x < 940))) || // the ring's west face, the east face over the lane
    (alongX && b.z < 2000); // the north faces (the north court)
  for (const p of WORLD) {
    if (p.group !== 'ttwRail' || p.kind !== 'box') continue;
    const b = p as BoxPrim, alongX = b.w > b.d, len = alongX ? b.w : b.d, h = b.y1 - b.y0;
    if (parapet(b, alongX)) {
      // On a stair the parapet's top follows the flight (a sloped stone wall down to the ground, not
      // steps of blocks); on a terrace edge it is a level wall on the coping.
      const st = STAIRS.find((q) => b.x > q.x0 - 5 && b.x < q.x1 + 5 && b.z > q.z0 - 5 && b.z < q.z1 + 5 && b.y0 < q.high);
      const top = (x: number, z: number) => {
        if (!st) return b.y1;
        const u = Math.min(1, Math.max(0, st.axis === 'x' ? (x - st.x0) / (st.x1 - st.x0) : (z - st.z0) / (st.z1 - st.z0)));
        return st.low + (st.high - st.low) * (st.dir === 1 ? u : 1 - u) + 34; // the rail height above the steps
      };
      const shape = (g: THREE.BufferGeometry, y0: number, dy: number) => {
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const t = top(pos.getX(i), pos.getZ(i));
          pos.setY(i, pos.getY(i) > 0 ? t + dy : Math.max(0, y0 >= 0 ? y0 : t + y0));
        }
        g.computeVertexNormals();
        return g;
      };
      wall(shape(boxAt(alongX ? len : 8, 1, alongX ? 8 : len, b.x, 0, b.z), st ? 0 : b.y0, -4), C.stone);
      tr(shape(boxAt(alongX ? len + 0.2 : 11, 1, alongX ? 11 : len + 0.2, b.x, 0, b.z), -4, 0), C.parapetCap);
      continue;
    }
    const panel = new THREE.PlaneGeometry(len, h - 6).translate(0, 0, 0);
    if (!alongX) panel.rotateY(Math.PI / 2);
    panel.translate(b.x, b.y0 + (h - 6) / 2 + 2, b.z);
    const uv = panel.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 24, uv.getY(i));
    meshPanels.push(panel.toNonIndexed());
    st(boxAt(alongX ? len : 3, 3, alongX ? 3 : len, b.x, b.y1 - 1.5, b.z));
    const n = Math.max(1, Math.round(len / 60));
    for (let k = 0; k <= n; k++) {
      const t = -len / 2 + (len * k) / n;
      posts.push(M4(alongX ? b.x + t : b.x, b.y0, alongX ? b.z : b.z + t, 0, 1, h / 30, 1));
    }
  }
  const meshMat = new THREE.MeshStandardMaterial({ color: 0x4a4d50, map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.35 });
  add(new THREE.Mesh(mergeGeometries(meshPanels)!, meshMat));
  add(instanced(new THREE.BoxGeometry(3, 30, 3).translate(0, 15, 0), new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.6, metalness: 0.4 }), posts, false));

  // ------------------------------------------------------------ SERVICE WALL, the kiosk, the south blocks
  const svc: THREE.BufferGeometry[] = [];
  const svcTex = serviceTexture();
  for (const w of [...SERVICE_WALL, SERVICE_KIOSK]) {
    svc.push(worldUv(rectBox(w, 0, w.h), 240, 240));
    // Roof plant (silhouette): units and a duct run.
    if (w.h > 200) for (let k = 0; k < 3; k++) {
      const x = w.x0 + 50 + rnd() * (w.x1 - w.x0 - 100), z = w.z0 + 50 + rnd() * (w.z1 - w.z0 - 100);
      tr(boxAt(60 + rnd() * 40, 30 + rnd() * 20, 50 + rnd() * 30, x, w.h + 20, z), C.service);
    }
    tr(rectBox(w, w.h, w.h + 8, 2), C.wallDark);
  }
  const svcMesh = new THREE.Mesh(mergeGeometries(svc)!, new THREE.MeshStandardMaterial({ color: 0xffffff, map: svcTex, roughness: 0.9 }));
  svcMesh.castShadow = svcMesh.receiveShadow = true;
  add(svcMesh);
  {
    const kind = 'concrete' as const;
    const fac: THREE.BufferGeometry[] = [];
    for (const b of SOUTH_BLOCKS) {
      fac.push(worldUv(rectBox(b, 0, b.h), 200, 4 * STOREY));
      tr(rectBox(b, b.h, b.h + 10, 3), C.wallDark);
    }
    const m = new THREE.MeshStandardMaterial({ map: sharedFacadeTexture(kind), color: 0xb9b5ae, roughness: 0.85, emissive: 0xffffff, emissiveMap: sharedFacadeTexture(kind, true), emissiveIntensity: 0.35 });
    glowAtNight(m, 0.2, 0.55);
    const mesh = new THREE.Mesh(mergeGeometries(fac)!, m);
    mesh.castShadow = mesh.receiveShadow = true;
    add(mesh);
  }

  // ------------------------------------------------------------ green: hedges at the terrace foot, planters, the gate planters
  const green: THREE.BufferGeometry[] = [];
  const hedge = (r: TtwRect, h: number, y = 0) => green.push(tint(rectBox(r, y, y + h), new THREE.Color(C.hedge).multiplyScalar(0.9 + rnd() * 0.2)));
  // West frontage: low hedges at the wall's foot (gaps at the stair).
  hedge({ x0: 22, x1: 38, z0: 2000, z1: 2390 }, 26);
  hedge({ x0: 22, x1: 38, z0: 2650, z1: 2690 }, 26);
  // The gate planters (stone box, shrubs on top).
  for (const r of GATE_PLANTERS) {
    tr(rectBox(r, 0, PLANTER_H - 8), C.wallDark);
    hedge({ x0: r.x0 + 4, x1: r.x1 - 4, z0: r.z0 + 3, z1: r.z1 - 3 }, 12, PLANTER_H - 8);
  }
  // Ring planters and plaza planters.
  for (const p of TTW_PROPS) {
    if (p.kind !== 'planter') continue;
    const s = PROP_SIZE.planter, y = p.y ?? 0;
    tr(boxAt(s.w, s.h - 10, s.d, p.x, y + (s.h - 10) / 2, p.z), C.wallDark);
    green.push(tint(new THREE.IcosahedronGeometry(1, 0).scale(s.w * 0.45, 18, s.d * 0.45).translate(p.x, y + s.h, p.z), C.hedge));
  }
  // Under SERVICE WALL on the lane side: a strip of ivy-dark planting along the foot.
  hedge({ x0: 1059, x1: 1065, z0: 2400, z1: 2880 }, 40);
  const greenMesh = new THREE.Mesh(mergeGeometries(green)!, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, flatShading: true }));
  greenMesh.castShadow = greenMesh.receiveShadow = true;
  add(greenMesh);

  // ------------------------------------------------------------ furniture: benches, bollards, equipment boxes, floodlight housings
  const benchGeo = mergeGeometries([boxAt(64, 4, 18, 0, 17, 0), boxAt(4, 17, 16, -26, 8.5, 0), boxAt(4, 17, 16, 26, 8.5, 0)].map((g) => g.toNonIndexed()))!;
  const benches: THREE.Matrix4[] = [], bollards: THREE.Matrix4[] = [], boxes: THREE.Matrix4[] = [], floods: THREE.Matrix4[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const gl = (g: THREE.BufferGeometry, col: number) => glow.push(tint(g, col));
  for (const p of TTW_PROPS) {
    const y = p.y ?? 0, ang = p.ang ?? 0;
    if (p.kind === 'bench') benches.push(M4(p.x, y, p.z, ang));
    else if (p.kind === 'bollard') { bollards.push(M4(p.x, y, p.z)); gl(boxAt(6, 3, 6, p.x, y + 24, p.z), WARM); }
    else if (p.kind === 'box') boxes.push(M4(p.x, y, p.z, ang));
    else if (p.kind === 'flood') {
      // Housing angled up at the tower; its lens glows faintly (the light it throws is in the tower's material).
      const toward = Math.atan2(TT.x - p.x, TT.z - p.z);
      floods.push(M4(p.x, y, p.z, toward));
      gl(new THREE.PlaneGeometry(18, 10).rotateX(-Math.PI / 2 + 0.6).rotateY(toward).translate(p.x + Math.sin(toward) * 6, y + 21, p.z + Math.cos(toward) * 6), WARM_GREY);
    }
  }
  add(instanced(benchGeo, new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.8 }), benches));
  add(instanced(new THREE.CylinderGeometry(4, 5, 26, 8).translate(0, 13, 0), new THREE.MeshStandardMaterial({ color: C.steelLight, roughness: 0.5, metalness: 0.4 }), bollards));
  add(instanced(mergeGeometries([boxAt(50, 54, 34, 0, 27, 0), boxAt(40, 6, 26, 0, 57, 0)].map((g) => g.toNonIndexed()))!, new THREE.MeshStandardMaterial({ color: 0x7d8186, roughness: 0.7 }), boxes));
  add(instanced(mergeGeometries([boxAt(30, 10, 30, 0, 5, 0), boxAt(24, 14, 18, 0, 17, 0)].map((g) => g.toNonIndexed()))!, new THREE.MeshStandardMaterial({ color: 0x303236, roughness: 0.6, metalness: 0.3 }), floods));

  // ------------------------------------------------------------ light: edge lights, nosings, the tunnel soffit, lamp brackets, signs
  // Edge lights: a dim warm line under the coping on every terrace face that looks onto the plaza or the lane.
  const edge = (x0: number, z0: number, x1: number, z1: number, y: number) => gl(boxAt(Math.max(1.2, x1 - x0), 1.6, Math.max(1.2, z1 - z0), (x0 + x1) / 2, y, (z0 + z1) / 2), WARM);
  const W = TERRACES.find((t) => t.id === 'west')!;
  edge(W.x1 + 1, W.z0 + 100, W.x1 + 1, W.z1, RING_H - 12);
  edge(W.x0 - 1, W.z0, W.x0 - 1, W.z1, RING_H - 12);
  for (const id of ['eastN', 'eastS']) {
    const t = TERRACES.find((q) => q.id === id)!;
    edge(t.x0 - 1, t.z0 + (id === 'eastN' ? 100 : 0), t.x0 - 1, t.z1, RING_H - 12);
    edge(t.x1 + 1, t.z0, t.x1 + 1, t.z1, RING_H - 12);
  }
  // RED TERRACE's soffit: a warm line along each edge girder, under the deck (lights the axis as you pass under).
  for (const z of [RED_TERRACE.z0 + 14, RED_TERRACE.z1 - 14]) edge(RED_TERRACE.x0 + 10, z, RED_TERRACE.x1 - 10, z, RED_H - 31);
  // The tunnel: two soffit strips.
  for (const z of [TUNNEL.z0 + 30, TUNNEL.z1 - 30]) edge(TUNNEL.x0 + 6, z, TUNNEL.x1 - 6, z, RING_H - 13);
  // SERVICE SLOPE: side lights along the slope's foot every 60.
  {
    const s = STAIRS.find((q) => q.id === 'service')!;
    for (let z = s.z0 + 30; z < s.z1; z += 60) {
      const u = (z - s.z0) / (s.z1 - s.z0), h = s.low + (s.high - s.low) * (s.dir === 1 ? u : 1 - u);
      gl(boxAt(4, 4, 8, s.x1 - 6, h + 30, z), WARM);
    }
  }
  // Lamp brackets for the wall lamps on the terraces and the lane: a short post on the terrace coping and an arm out.
  const lampPosts: THREE.Matrix4[] = [], lampArms: THREE.Matrix4[] = [];
  for (const l of TTW_LAMPS) {
    if (!l.wall) continue;
    const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
    const hx = l.x + dx * 22, hz = l.z + dz * 22;
    // Stand on whatever is behind the lamp (terrace top, the south blocks' wall, the lane side).
    const backX = l.x - dx * 10, backZ = l.z - dz * 10;
    const base = TERRACES.some((t) => backX > t.x0 - 1 && backX < t.x1 + 1 && backZ > t.z0 - 1 && backZ < t.z1 + 1) ? RING_H : l.x < 0 ? 0 : RING_H;
    if (SOUTH_BLOCKS.some((b) => l.x >= b.x1 - 1 && l.x <= b.x1 + 10)) {
      lampArms.push(M4(l.x + dx * 11, 196, l.z + dz * 11, -l.ang));
    } else {
      lampPosts.push(M4(l.x - dx * 4, base, l.z - dz * 4, 0, 1, (196 - base) / 30, 1));
      lampArms.push(M4(l.x + dx * 9, 196, l.z + dz * 9, -l.ang));
    }
    gl(boxAt(12, 7, 12, hx, 189, hz), WARM);
  }
  add(instanced(new THREE.BoxGeometry(3.5, 30, 3.5).translate(0, 15, 0), new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.6 }), lampPosts, false));
  add(instanced(new THREE.BoxGeometry(26, 3, 3), new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.6 }), lampArms, false));
  const nosingMat = new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.25 });
  NIGHT_GLOW.push({ set: (k) => { nosingMat.opacity = 0.18 + 0.5 * k; } });
  add(new THREE.Mesh(mergeGeometries(stairNosings)!, nosingMat));

  // Signs: the gate plate on both faces of the lintel, landmark plaques, three route boards.
  const signs: THREE.BufferGeometry[] = [];
  const boardPosts: THREE.Matrix4[] = [];
  {
    const G = GATE, span = G.pierE.x0 - G.pierW.x1, zc = (G.z0 + G.z1) / 2, y = (G.top + G.lintel0) / 2;
    for (const s of [-1, 1]) signs.push(signQuad(span - 24, 28, SIGN_CELLS.gate, TT.x, y, zc + s * ((G.z1 - G.z0) / 2 - 2.5), s < 0 ? Math.PI : 0));
    const plaque = (i: number, x: number, y0: number, z: number, ang: number) => signs.push(signQuad(64, 12, SIGN_CELLS.plaque(i), x, y0, z, ang));
    plaque(0, (RED_TERRACE.x0 + RED_TERRACE.x1) / 2, RED_H - 15, RED_TERRACE.z1 + 0.6, 0); // on the girder, facing the tower
    plaque(1, 300, 14, SKY_PLAZA.z1 - 40, 0);
    plaque(2, SERVICE_LANE.x1 - 0.6, 70, 2600, -Math.PI / 2);
    plaque(3, W.x1 + 0.6, 60, 2250, Math.PI / 2);
    const board = (i: number, x: number, z: number, ang: number) => {
      boardPosts.push(M4(x, 0, z));
      for (const s of [0, Math.PI]) signs.push(signQuad(52, 15, SIGN_CELLS.route(i), x + Math.sin(ang + s) * 1.6, 82, z + Math.cos(ang + s) * 1.6, ang + s));
    };
    board(0, AXIS.x1 + 22, 3200, Math.PI / 2); // A on the approach
    board(1, 180, 3030, 0); // B at the west stair foot
    board(2, 1000, 3040, 0); // C by the lane mouth
    board(1, -80, 2380, Math.PI / 2); // B at the west stair
  }
  const signTex = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.1, roughness: 0.7, side: THREE.DoubleSide });
  glowAtNight(signMat, 0.1, 0.38);
  add(new THREE.Mesh(mergeGeometries(signs)!, signMat));
  add(instanced(new THREE.BoxGeometry(3, 80, 3).translate(0, 40, 0), new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.6 }), boardPosts, false));

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  NIGHT_GLOW.push({ set: (k) => { glowMat.color.setScalar(0.5 + 0.45 * k); } });
  add(new THREE.Mesh(mergeGeometries(glow)!, glowMat));

  // Walls and steps last: the gate piers and leg footings add to them further down the build.
  for (const [list, m] of [[walls, wallMat], [steps, stepMat]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
    mesh.castShadow = mesh.receiveShadow = true;
    add(mesh);
  }
  const trimMesh = new THREE.Mesh(mergeGeometries(trim)!, trimMat);
  trimMesh.castShadow = trimMesh.receiveShadow = true;
  add(trimMesh);
  const steelMesh = new THREE.Mesh(mergeGeometries(steel)!, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.35 }));
  const redMesh = new THREE.Mesh(mergeGeometries(redSteel)!, floodlit(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.15 }), redFlood));
  steelMesh.castShadow = redMesh.castShadow = true;
  add(steelMesh, redMesh);

  let triangles = 0;
  for (const m of meshes) m.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
  return { meshes: meshes.length, triangles: Math.round(triangles) };
}

