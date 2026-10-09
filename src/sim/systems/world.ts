import type { Prim, RampPrim } from '../../config/map';
import { BOUNDS, WALK_EDGE, WORLD, insideLoop, loopSignedDist } from '../../config/map';
import { CR } from '../../config/constants';

/** Highest ledge a character can walk up without stairs. */
export const STEP_UP = 12;
/** Height of a character's body, for head clearance under floors. */
export const BODY_H = 50;
/** Eye and chest heights above the feet, for line of sight. */
export const EYE_H = 40;
export const CHEST_H = 28;
/** Speed of dropping off a ledge (units/s). */
export const FALL_SPEED = 520;

// ---------------------------------------------------------------- spatial grid
const CELL = 100;
const COLS = Math.ceil((BOUNDS.maxX - BOUNDS.minX + 400) / CELL);
const ROWS = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ + 400) / CELL);
const OX = BOUNDS.minX - 200, OZ = BOUNDS.minZ - 200;
/** Per cell: the primitives overlapping it (indices for de-duplication, and the primitives themselves). */
const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
const gridPrims: Prim[][] = Array.from({ length: COLS * ROWS }, () => []);
const col = (x: number) => Math.floor((x - OX) / CELL);
const row = (z: number) => Math.floor((z - OZ) / CELL);
WORLD.forEach((p, i) => {
  const c0 = col(p.x - p.w / 2), r0 = row(p.z - p.d / 2), c1 = col(p.x + p.w / 2), r1 = row(p.z + p.d / 2);
  for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
    for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) { grid[r * COLS + c].push(i); gridPrims[r * COLS + c].push(p); }
  }
});
let stamp = 0;
const seen = new Uint32Array(WORLD.length);
const NONE: Prim[] = [];

/** Primitives whose footprint may overlap the given rectangle. */
function near(x0: number, z0: number, x1: number, z1: number, out: Prim[]): Prim[] {
  out.length = 0;
  stamp++;
  const c0 = Math.max(0, col(x0)), r0 = Math.max(0, row(z0)), c1 = Math.min(COLS - 1, col(x1)), r1 = Math.min(ROWS - 1, row(z1));
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const ids = grid[r * COLS + c];
      for (let k = 0; k < ids.length; k++) { const i = ids[k]; if (seen[i] !== stamp) { seen[i] = stamp; out.push(WORLD[i]); } }
    }
  }
  return out;
}
const scratch: Prim[] = [];

/** Primitives whose footprint may contain the point (x, z): the cell's own list (read only, not a copy). */
function at(x: number, z: number): readonly Prim[] {
  const c = col(x), r = row(z);
  return c < 0 || r < 0 || c >= COLS || r >= ROWS ? NONE : gridPrims[r * COLS + c];
}

/** Primitives whose footprint may contain the point (x, z) (a fresh array). */
export function primsAt(x: number, z: number): Prim[] {
  return [...at(x, z)];
}

/**
 * Primitives in the cells a 2D segment passes through (grid traversal, not its whole
 * bounding box: a long diagonal sight line touches a few dozen cells, not hundreds).
 */
function alongSegment(ax: number, az: number, bx: number, bz: number, out: Prim[]): Prim[] {
  out.length = 0;
  stamp++;
  let c = col(ax), r = row(az);
  const cEnd = col(bx), rEnd = row(bz);
  const dx = bx - ax, dz = bz - az;
  const sc = dx > 0 ? 1 : -1, sr = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? (c + 1) * CELL + OX - ax : ax - (c * CELL + OX)) / Math.abs(dx)) : Infinity;
  let tz = dz !== 0 ? ((dz > 0 ? (r + 1) * CELL + OZ - az : az - (r * CELL + OZ)) / Math.abs(dz)) : Infinity;
  for (let guard = 0; guard < COLS + ROWS + 4; guard++) {
    if (c >= 0 && r >= 0 && c < COLS && r < ROWS) {
      const ids = grid[r * COLS + c];
      for (let k = 0; k < ids.length; k++) { const i = ids[k]; if (seen[i] !== stamp) { seen[i] = stamp; out.push(WORLD[i]); } }
    }
    if (c === cEnd && r === rEnd) break;
    if (tx < tz) { tx += tdx; c += sc; } else { tz += tdz; r += sr; }
  }
  return out;
}

// ---------------------------------------------------------------- primitive geometry
export function rampHeight(p: RampPrim, x: number, z: number): number {
  const len = p.axis === 'x' ? p.w : p.d;
  const u = ((p.axis === 'x' ? x - p.x : z - p.z) / len) + 0.5;
  const t = Math.min(1, Math.max(0, p.dir === 1 ? u : 1 - u));
  return p.hLow + (p.hHigh - p.hLow) * t;
}

function inside(p: Prim, x: number, z: number): boolean {
  return Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2;
}

/** Standing support includes the rim, so floors that meet edge to edge have no seam to fall through. */
function underfoot(p: Prim, x: number, z: number): boolean {
  return Math.abs(x - p.x) <= p.w / 2 + 0.5 && Math.abs(z - p.z) <= p.d / 2 + 0.5;
}

/** Top surface height of a primitive at (x, z). */
export function topAt(p: Prim, x: number, z: number): number {
  return p.kind === 'box' ? p.y1 : rampHeight(p, x, z);
}

/** Highest top a circle of radius r overlapping the primitive would touch. */
function topOverCircle(p: Prim, x: number, z: number, r: number): number {
  if (p.kind === 'box') return p.y1;
  // Sample the up-slope edge of the circle, clamped into the ramp.
  const ux = p.axis === 'x' ? p.dir * r : 0, uz = p.axis === 'z' ? p.dir * r : 0;
  const cx = Math.min(p.x + p.w / 2, Math.max(p.x - p.w / 2, x + ux));
  const cz = Math.min(p.z + p.d / 2, Math.max(p.z - p.d / 2, z + uz));
  return rampHeight(p, cx, cz);
}

// ---------------------------------------------------------------- queries

/**
 * Height a character standing at (x, z) with feet at `y` rests on: the highest
 * floor under that point it can reach (no higher than y + STEP_UP). Ground is 0.
 */
export function supportHeight(x: number, z: number, y: number): number {
  let best = 0;
  const cell = at(x, z);
  for (let k = 0; k < cell.length; k++) {
    const p = cell[k];
    if (p.noFloor || !underfoot(p, x, z)) continue;
    const t = topAt(p, x, z);
    if (t <= y + STEP_UP && t > best) best = t;
  }
  return best;
}

/** Whether a character at (x, y, z) would intersect a wall, parapet, cliff or water. */
export function blocked(x: number, z: number, y: number, r = CR): boolean {
  if (!insideLoop(x, z, WALK_EDGE + r)) return true; // the fence along the Yamanote tracks is the edge of the world
  for (const p of near(x - r, z - r, x + r, z + r, scratch)) if (blocks(p, x, z, y, r)) return true;
  return false;
}

/**
 * Whether one primitive stops a character at (x, y, z): the body is the square of
 * half-size r around it (the shape every collision test here uses, push-out included).
 */
function blocks(p: Prim, x: number, z: number, y: number, r: number): boolean {
  if (Math.abs(x - p.x) >= p.w / 2 + r || Math.abs(z - p.z) >= p.d / 2 + r) return false;
  if (p.y0 >= y + BODY_H) return false; // overhead: walk underneath
  return topOverCircle(p, x, z, r) > y + STEP_UP;
}

/** How far a body overlaps a primitive's collision square (the shorter way out). */
function depth(p: Prim, x: number, z: number, r: number): number {
  return Math.min(p.w / 2 + r - Math.abs(x - p.x), p.d / 2 + r - Math.abs(z - p.z));
}

/** Down in the water (river, moat, pond): below its surface inside its outline. */
export function inWater(x: number, z: number, y: number): boolean {
  // Standing on a bridge deck (or any floor) over the water is dry, even if the deck is low.
  if (supportHeight(x, z, y) > 0) return false;
  for (const p of at(x, z)) {
    if (p.mat === 'water' && p.kind === 'box' && y < p.y1 && Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) return true;
  }
  return false;
}

/** Point inside solid, sight-blocking matter (walls, floors, hills; not water). */
export function solidAt(x: number, y: number, z: number): boolean {
  for (const p of at(x, z)) {
    if (p.seeThrough || !inside(p, x, z)) continue;
    if (y > p.y0 && y < topAt(p, x, z)) return true;
  }
  return false;
}

/** Does the segment a→b pass through the box's interior (slab test)? */
function segmentHitsBox(ax: number, ay: number, az: number, bx: number, by: number, bz: number, p: Prim, y1: number): boolean {
  // Slab test on x, y and z in turn (no arrays: this runs for every sight line).
  slabT.t0 = 0;
  slabT.t1 = 1;
  return slab(ax, bx - ax, p.x - p.w / 2, p.x + p.w / 2, slabT) && slab(ay, by - ay, p.y0, y1, slabT) && slab(az, bz - az, p.z - p.d / 2, p.z + p.d / 2, slabT);
}
const slabT = { t0: 0, t1: 1 };
function slab(o: number, d: number, lo: number, hi: number, t: { t0: number; t1: number }): boolean {
  if (Math.abs(d) < 1e-9) return o > lo && o < hi;
  let ta = (lo - o) / d, tb = (hi - o) / d;
  if (ta > tb) { const q = ta; ta = tb; tb = q; }
  if (ta > t.t0) t.t0 = ta;
  if (tb < t.t1) t.t1 = tb;
  return t.t0 < t.t1;
}

const losScratch: Prim[] = [];

/**
 * 3D line of sight. Boxes (walls, floors, buildings) are tested exactly, so
 * even a thin floor slab blocks; ramps are sampled finely.
 */
export function lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const cand = alongSegment(ax, az, bx, bz, losScratch);
  let ramps = false;
  for (const p of cand) {
    if (p.seeThrough) continue;
    if (p.kind === 'ramp') { ramps = true; continue; }
    if (segmentHitsBox(ax, ay, az, bx, by, bz, p, p.y1)) return false;
  }
  if (!ramps) return true;
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(2, Math.ceil(len / 8));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    for (const p of cand) {
      if (p.kind !== 'ramp' || !inside(p, x, z)) continue;
      if (y > p.y0 && y < rampHeight(p, x, z)) return false;
    }
  }
  return true;
}

export interface Body {
  x: number;
  y: number;
  z: number;
}

/** Farthest a wedged body is moved to free it (one body width: never a jump across the map). */
const PUSH_MAX = 2 * CR;
const RING_STEPS = 16;
const freeScratch: Prim[] = [];
const wallScratch: Prim[] = [];
const freeSpot = { x: 0, z: 0 };

/**
 * Moves a body toward (nx, nz): X then Z separately so it slides along walls
 * (the v6 feel), stepping up stairs/slopes. Vertical settling is separate.
 * With `assist` (characters; not route checks) a wedged body may move along the
 * gap it is in and a body clipping a corner is guided round it.
 */
export function moveBody(b: Body, nx: number, nz: number, assist = true): void {
  const x0 = b.x, z0 = b.z;
  if (fits(b, nx, b.z, assist)) b.x = nx;
  if (fits(b, b.x, nz, assist)) b.z = nz;
  // Almost stopped dead (the slide along the wall is next to nothing): round the corner if that is all it is.
  if (assist && Math.hypot(b.x - x0, b.z - z0) < 0.25 * Math.hypot(nx - x0, nz - z0)) {
    if (Math.abs(nx - x0) >= Math.abs(nz - z0)) roundCorner(b, nx - b.x, 'x');
    else roundCorner(b, nz - b.z, 'z');
  }
  if ((b.x === x0 && b.z === z0) || !dropsIntoGap(b.y, b.x, b.z)) return;
  // The step would drop it into a gap: keep whichever half of it does not.
  const x1 = b.x, z1 = b.z;
  b.x = x0; b.z = z0;
  if (x1 !== x0 && fits(b, x1, z0, assist) && !dropsIntoGap(b.y, x1, z0)) b.x = x1;
  else if (z1 !== z0 && fits(b, x0, z1, assist) && !dropsIntoGap(b.y, x0, z1)) b.z = z1;
}

/** How far round a corner a body is guided when it walks into one nearly square on. */
const CORNER = CR * 0.75;

/**
 * A step along one axis was stopped by the very edge of something (the body only
 * clips a corner) and the body barely moved: slide sideways toward the near end of
 * it, by no more than the step, so the body rounds the corner instead of sticking to
 * it. The sideways move is an ordinary checked move.
 */
function roundCorner(b: Body, step: number, axis: 'x' | 'z'): void {
  if (Math.abs(step) < 1e-6) return;
  const tx = axis === 'x' ? b.x + step : b.x, tz = axis === 'z' ? b.z + step : b.z;
  if (!insideLoop(tx, tz, WALK_EDGE + CR)) return;
  // The smallest sideways shift that clears everything in the way of the step.
  let best = Infinity;
  const prims = [...near(tx - CR, tz - CR, tx + CR, tz + CR, freeScratch)];
  for (const p of prims) {
    if (!blocks(p, tx, tz, b.y, CR)) continue;
    const c = axis === 'x' ? b.z : b.x, pc = axis === 'x' ? p.z : p.x, half = (axis === 'x' ? p.d : p.w) / 2 + CR + 0.05;
    for (const side of [pc - half - c, pc + half - c]) {
      if (Math.abs(side) > CORNER || Math.abs(side) >= Math.abs(best)) continue;
      const sx = axis === 'x' ? tx : b.x + side, sz = axis === 'x' ? b.z + side : tz;
      if (!blocked(sx, sz, b.y)) best = side;
    }
  }
  if (best === Infinity) return;
  const slide = Math.sign(best) * Math.min(Math.abs(best), Math.abs(step));
  const sx = axis === 'x' ? b.x : b.x + slide, sz = axis === 'x' ? b.z + slide : b.z;
  if (!blocked(sx, sz, b.y) && !dropsIntoGap(b.y, sx, sz)) { b.x = sx; b.z = sz; }
}

/**
 * Whether a body may move to (x, z) at its height: the spot is free and does not
 * drop it into a gap narrower than itself; or the body is already wedged and the
 * move takes it no deeper into anything (so it can walk out along a crevice).
 */
export function canStep(b: Body, x: number, z: number): boolean {
  return fits(b, x, z, true) && !dropsIntoGap(b.y, x, z);
}

function fits(b: Body, x: number, z: number, escape: boolean): boolean {
  if (!blocked(x, z, b.y)) return true;
  return escape && blocked(b.x, b.z, b.y) && noDeeper(b, x, z);
}

/** A wedged body's move to (x, z) overlaps nothing it was not already in, and nothing more deeply. */
function noDeeper(b: Body, x: number, z: number): boolean {
  if (!insideLoop(x, z, WALK_EDGE + CR) && loopSignedDist(x, z) < loopSignedDist(b.x, b.z)) return false;
  const near_ = near(x - CR, z - CR, x + CR, z + CR, freeScratch);
  for (let k = 0; k < near_.length; k++) {
    const p = near_[k];
    if (!blocks(p, x, z, b.y, CR)) continue;
    if (!blocks(p, b.x, b.z, b.y, CR) || depth(p, x, z, CR) > depth(p, b.x, b.z, CR) + 1e-9) return false;
  }
  return true;
}

/**
 * Stepping off a ledge (feet at y) to (x, z) lands where the body would not fit and has no room
 * to be pushed free (off the side of a footbridge into a slot beside a building).
 */
function dropsIntoGap(y: number, x: number, z: number): boolean {
  const land = supportHeight(x, z, y);
  if (land >= y - 0.5 || !blocked(x, z, land)) return false;
  return !findFreeSpot(x, z, land, CR);
}

/** A wall (its footprint, not the body margin around it) at (x, z) for feet at y. */
function wallIn(prims: readonly Prim[], x: number, z: number, y: number): Prim | null {
  for (let k = 0; k < prims.length; k++) {
    const p = prims[k];
    if (!inside(p, x, z) || p.y0 >= y + BODY_H) continue;
    if (topAt(p, x, z) > y + STEP_UP) return p;
  }
  return null;
}

/** Whether going straight from (ax, az) to (bx, bz) at height y enters a wall it did not start in. */
function crossesWall(ax: number, az: number, bx: number, bz: number, y: number): boolean {
  const prims = near(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), wallScratch);
  const start = wallIn(prims, ax, az, y);
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
  for (let k = 1; k <= n; k++) {
    const w = wallIn(prims, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, y);
    if (w && w !== start) return true;
  }
  return false;
}

/**
 * The nearest spot a wedged body at (x, y, z) fits, reached without passing through a
 * wall: straight out of each primitive it overlaps along an axis (the way the
 * collision square leaves it), or a ring of nearby points; at most PUSH_MAX away.
 * Result in `freeSpot`; false if there is none (the body stays put and walks out).
 */
function findFreeSpot(x: number, z: number, y: number, r: number): boolean {
  const cand: number[] = []; // x, z, distance
  const add = (cx: number, cz: number) => {
    const d = Math.hypot(cx - x, cz - z);
    if (d <= PUSH_MAX) cand.push(cx, cz, d);
  };
  const prims = [...near(x - r, z - r, x + r, z + r, freeScratch)];
  for (const p of prims) {
    if (!blocks(p, x, z, y, r)) continue;
    add(p.x - p.w / 2 - r - 0.05, z);
    add(p.x + p.w / 2 + r + 0.05, z);
    add(x, p.z - p.d / 2 - r - 0.05);
    add(x, p.z + p.d / 2 + r + 0.05);
  }
  for (let d = 2; d <= PUSH_MAX; d += 2) {
    for (let k = 0; k < RING_STEPS; k++) {
      const a = (k / RING_STEPS) * Math.PI * 2;
      add(x + Math.sin(a) * d, z + Math.cos(a) * d);
    }
  }
  const order = Array.from({ length: cand.length / 3 }, (_, i) => i).sort((i, j) => cand[i * 3 + 2] - cand[j * 3 + 2] || i - j);
  for (const i of order) {
    const cx = cand[i * 3], cz = cand[i * 3 + 1];
    if (blocked(cx, cz, y, r) || crossesWall(x, z, cx, cz, y)) continue;
    freeSpot.x = cx; freeSpot.z = cz;
    return true;
  }
  return false;
}

/**
 * If a body ended up overlapping a wall (dropped off the side of stairs, shoved by
 * separation, teleported), move it to the nearest spot it fits, tested with the same
 * shape as every move. With no such spot close by it stays (not thrown across a
 * wall or far away) and walks out: `canStep` lets a wedged body move along the gap.
 * Once free it is never moved again, so it cannot shake between two walls.
 */
export function pushOut(b: Body, r = CR): void {
  if (!blocked(b.x, b.z, b.y, r)) return;
  if (!directPush(b.x, b.z, b.y, r) && !findFreeSpot(b.x, b.z, b.y, r)) return;
  b.x = freeSpot.x;
  b.z = freeSpot.z;
}

/** The blocking primitive a body at (x, y, z) overlaps, if any. */
function blockingPrim(x: number, z: number, y: number, r: number): Prim | null {
  for (const p of near(x - r, z - r, x + r, z + r, scratch)) if (blocks(p, x, z, y, r)) return p;
  return null;
}

/**
 * The usual way out, kept so ordinary bumps resolve as they always have: straight
 * away from the closest point of what the body overlaps (through the nearest edge if
 * its centre is inside), a few times over. Used only when it ends somewhere the body
 * fits without crossing a wall; at a corner or in a narrow gap it does not, and the
 * nearest free spot is searched for instead.
 */
function directPush(x0: number, z0: number, y: number, r: number): boolean {
  let x = x0, z = z0;
  for (let iter = 0; iter < 4; iter++) {
    const p = blockingPrim(x, z, y, r);
    if (!p) break;
    const hw = p.w / 2, hd = p.d / 2;
    const cx = Math.max(p.x - hw, Math.min(p.x + hw, x)), cz = Math.max(p.z - hd, Math.min(p.z + hd, z));
    let dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      dx /= d; dz /= d;
      x = cx + dx * (r + 0.05);
      z = cz + dz * (r + 0.05);
    } else {
      const ex = [p.x - hw - r - 0.05 - x, p.x + hw + r + 0.05 - x], ez = [p.z - hd - r - 0.05 - z, p.z + hd + r + 0.05 - z];
      const opts = [[ex[0], 0], [ex[1], 0], [0, ez[0]], [0, ez[1]]].sort((u, v) => Math.hypot(u[0], u[1]) - Math.hypot(v[0], v[1]));
      x += opts[0][0];
      z += opts[0][1];
    }
  }
  if (blocked(x, z, y, r) || crossesWall(x0, z0, x, z, y)) return false;
  freeSpot.x = x; freeSpot.z = z;
  return true;
}

/**
 * Snaps up onto the floor underfoot (stairs and slopes rise smoothly) or falls
 * toward a lower one. Pass dt = Infinity to land instantly.
 */
export function settle(b: Body, dt: number): void {
  const land = supportHeight(b.x, b.z, b.y);
  if (land < b.y && dt !== Infinity) {
    // Falling: free it once for the floor it will land on, not again at every height on the way down.
    const y = b.y;
    b.y = land;
    pushOut(b);
    b.y = y;
  } else pushOut(b);
  const s = supportHeight(b.x, b.z, b.y);
  if (s >= b.y) b.y = s;
  else b.y = Math.max(s, b.y - FALL_SPEED * dt);
}

/** Floor height for placing a character at (x, z) from above (spawns, jails, teleports). */
export function groundAt(x: number, z: number, fromY = 0): number {
  return supportHeight(x, z, fromY);
}

/**
 * Simulates walking in a straight line (used for nav edges and shortcuts).
 * Returns where the walker ended up. A route counts only where walking straight works
 * on its own, so the walker gets no help (no wedged escape, no guiding round corners).
 */
export function walkLine(from: Body, tx: number, tz: number, step = 8): Body {
  const b = { ...from };
  const len = Math.hypot(tx - b.x, tz - b.z);
  const n = Math.max(1, Math.ceil(len / step));
  const sx = (tx - from.x) / n, sz = (tz - from.z) / n;
  for (let i = 0; i < n; i++) {
    moveBody(b, b.x + sx, b.z + sz, false);
    settle(b, Infinity);
  }
  return b;
}

/** True if walking straight from `from` reaches (tx, ty, tz). */
export function canWalk(from: Body, tx: number, ty: number, tz: number, step = 8): boolean {
  const end = walkLine(from, tx, tz, step);
  return Math.hypot(end.x - tx, end.z - tz) < 3 && Math.abs(end.y - ty) < 6;
}
