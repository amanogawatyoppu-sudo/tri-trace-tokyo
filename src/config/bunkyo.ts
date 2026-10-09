/**
 * MAP REFORGE parallel D — 文京 QUIET SLOPES.
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). Shibuya is the maze, Shinjuku goes up and
 * down, Akihabara is shortcuts, Ueno is wide views, Ikebukuro is rooftops, Shinagawa is speed;
 * Bunkyo is the ground itself: a quiet residential ridge (台地) between two low lanes, cut by
 * slopes, held up by stone retaining walls (石垣) and lined with garden walls (塀) and hedges.
 * Who goes over the crest of a slope is out of sight; who stands on the ridge sees the lane below
 * and is seen from it.
 *
 * - A. RIDGE ROAD: the residential road along the top of the ridge, on the cliff edge (y 104,
 *   ≈ 4 m). Easy running and a view over the LOW ROAD below through the guard fence, but the
 *   people on it are as easy to see. SLOPE GATE climbs onto it from 春日通り in the north and
 *   RIDGE TERRACE ends it in the south over the river valley.
 * - B. SLOPE LANE: the slopes that cross the ridge. Two lanes cut west into the ridge from the
 *   WALL PATH (KAMI-ZAKA and NAKA-ZAKA), TWIN SLOPES down its east cliff from the fork (one north,
 *   one south, to the LOW ROAD), and STONE BEND round the ridge's south-west corner. Climbing is
 *   slow (the usual climb rule), going down is not; at the crest the far side drops out of view.
 * - C. WALL PATH: the quiet lane along the foot of the ridge's west 石垣, between it and the
 *   garden walls and hedges of the houses below. Out of sight of nearly everything; a little
 *   longer (it jogs round a corner in the north), never a dead end (side lanes to the west).
 *
 * The LOW ROAD runs north–south along the foot of the east cliff, parallel to the RIDGE ROAD
 * (high and low roads, side by side); QUIET COURT is a small square in the houses east of it.
 * The strategic point (東京ドーム前), the bases and the LOCK POINTs are far from here and do not
 * move. Coordinates are world units (26 per metre); x east, z south.
 */

export type BunkyoSide = 'n' | 's' | 'e' | 'w';
export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** The rebuilt area (generated city pieces whose centre is inside are removed): from the lane at
 *  x −1040 to the lane at x 540, from 春日通り's south side to the lane along the river (z −3231). */
export const BUNKYO_ZONE = { x0: -980, z0: -4632, x1: 480, z1: -3291 } as const;
export const inBunkyoZone = (x: number, z: number) => x > BUNKYO_ZONE.x0 && x < BUNKYO_ZONE.x1 && z > BUNKYO_ZONE.z0 && z < BUNKYO_ZONE.z1;

/** Height of the ridge (≈ 4 m) and of the landing at STONE BEND's corner. */
export const RIDGE_H = 104;
export const BEND_H = 70;

/** The ridge (台地) as solid ground pieces (the slopes are cut between them). */
export const PLATEAU: readonly (Rect & { id: string })[] = [
  { id: 'north', x0: -620, z0: -4450, x1: -250, z1: -4180 }, // houses between the gate and KAMI-ZAKA
  { id: 'ridge', x0: -250, z0: -4250, x1: -120, z1: -3530 }, // RIDGE ROAD and RIDGE TERRACE
  { id: 'middle', x0: -620, z0: -4060, x1: -250, z1: -3900 }, // houses between the two cut lanes
  { id: 'walk', x0: -620, z0: -3780, x1: -250, z1: -3650 }, // the open walk over NAKA-ZAKA and the WALL PATH
  { id: 'pine', x0: -620, z0: -3650, x1: -520, z1: -3530 }, // the pine garden inside STONE BEND
  { id: 'kura', x0: -410, z0: -3650, x1: -330, z1: -3530 }, // the storehouse garden
  { id: 'terrace', x0: -330, z0: -3650, x1: -250, z1: -3530 }, // RIDGE TERRACE's west half
];
/** The ridge pieces nobody walks on (gardens round houses, behind walls and hedges). */
export const PRIVATE: readonly string[] = ['north', 'middle', 'pine', 'kura'];

/** A. RIDGE ROAD (on the ridge piece 'ridge', open from end to end) and RIDGE TERRACE at its south end. */
export const RIDGE_ROAD: Rect = { x0: -250, z0: -4250, x1: -120, z1: -3530 };
export const RIDGE_TERRACE: Rect = { x0: -330, z0: -3650, x1: -120, z1: -3530 };
/** The fork on the east cliff: a landing at ridge height where the TWIN SLOPES part. */
export const FORK: Rect = { x0: -120, z0: -3900, x1: -20, z1: -3760 };
/** STONE BEND's corner landing. */
export const BEND_CORNER: Rect = { x0: -520, z0: -3530, x1: -410, z1: -3420 };

/** A slope or stair: rises from `low` to `high` toward +axis (dir 1) or −axis (dir −1). */
export interface BkSlope extends Rect {
  id: string;
  name: string;
  axis: 'x' | 'z';
  dir: 1 | -1;
  low: number;
  high: number;
  style: 'slope' | 'stairs';
  /** Sides with a guard fence where the slope stands above the ground beside it. */
  rails: BunkyoSide[];
}
export const SLOPES: readonly BkSlope[] = [
  // SLOPE GATE: 春日通り → the north end of the RIDGE ROAD (rises south, 382 long, gradient 0.27).
  { id: 'gate', name: 'SLOPE GATE', x0: -250, z0: -4632, x1: -120, z1: -4250, axis: 'z', dir: 1, low: 0, high: RIDGE_H, style: 'slope', rails: ['e', 'w'] },
  // KAMI-ZAKA and NAKA-ZAKA: cut lanes from the WALL PATH up east onto the ridge (370 long, 0.28).
  { id: 'kami', name: 'KAMI-ZAKA', x0: -620, z0: -4180, x1: -250, z1: -4060, axis: 'x', dir: 1, low: 0, high: RIDGE_H, style: 'slope', rails: [] },
  { id: 'naka', name: 'NAKA-ZAKA', x0: -620, z0: -3900, x1: -250, z1: -3780, axis: 'x', dir: 1, low: 0, high: RIDGE_H, style: 'slope', rails: [] },
  // TWIN SLOPES: from the FORK down the east cliff, one north and one south, to the LOW ROAD (380 long, 0.27).
  { id: 'twinN', name: 'TWIN SLOPES (N)', x0: -120, z0: -4280, x1: -20, z1: -3900, axis: 'z', dir: 1, low: 0, high: RIDGE_H, style: 'slope', rails: ['e'] },
  { id: 'twinS', name: 'TWIN SLOPES (S)', x0: -120, z0: -3760, x1: -20, z1: -3380, axis: 'z', dir: -1, low: 0, high: RIDGE_H, style: 'slope', rails: ['e', 'w'] },
  // STONE BEND: east along the ridge's south foot, round the corner landing, north up into the ridge.
  { id: 'bendLow', name: 'STONE BEND', x0: -760, z0: -3530, x1: -520, z1: -3420, axis: 'x', dir: 1, low: 0, high: BEND_H, style: 'slope', rails: ['s', 'n'] },
  { id: 'bendHigh', name: 'STONE BEND', x0: -520, z0: -3650, x1: -410, z1: -3530, axis: 'z', dir: -1, low: BEND_H, high: RIDGE_H, style: 'slope', rails: [] },
  // The stone stair from RIDGE TERRACE down to the river lane (235 long, 0.44: like Ueno's STONE AXIS).
  { id: 'terraceStair', name: 'TERRACE STAIR', x0: -250, z0: -3530, x1: -170, z1: -3295, axis: 'z', dir: -1, low: 0, high: RIDGE_H, style: 'stairs', rails: ['e', 'w'] },
];

/** Guard fences (see-through iron over a low stone kerb, 32 high) along open edges of the ridge. */
export const RIDGE_FENCES: readonly (Rect & { y: number })[] = [
  // RIDGE ROAD's cliff edge over the TWIN SLOPES and the LOW ROAD (open at the FORK).
  { x0: -126, z0: -4250, x1: -120, z1: -3900, y: RIDGE_H },
  { x0: -126, z0: -3760, x1: -120, z1: -3530, y: RIDGE_H },
  // The FORK's outer edge.
  { x0: -26, z0: -3900, x1: -20, z1: -3760, y: RIDGE_H },
  // RIDGE TERRACE's south edge (open where the stair goes down).
  { x0: -330, z0: -3536, x1: -250, z1: -3530, y: RIDGE_H },
  { x0: -170, z0: -3536, x1: -120, z1: -3530, y: RIDGE_H },
  // The walk over NAKA-ZAKA (north edge) and over the WALL PATH (west edge).
  { x0: -620, z0: -3780, x1: -250, z1: -3774, y: RIDGE_H },
  { x0: -620, z0: -3780, x1: -614, z1: -3650, y: RIDGE_H },
  // STONE BEND's corner landing: its outer (east and south) edges.
  { x0: -416, z0: -3530, x1: -410, z1: -3420, y: BEND_H },
  { x0: -520, z0: -3426, x1: -410, z1: -3420, y: BEND_H },
];

/** C. WALL PATH (ground): north section from 春日通り, the jog (a side lane to the west street), the long section under the 石垣. */
export const WALL_PATH: readonly (Rect & { id: string })[] = [
  { id: 'north', x0: -880, z0: -4632, x1: -760, z1: -4330 },
  { id: 'jog', x0: -980, z0: -4330, x1: -620, z1: -4230 },
  { id: 'long', x0: -760, z0: -4230, x1: -620, z1: -3530 },
];
/** Side lane west from the WALL PATH (on the line of the city lane at z −3954), and the yard at the south end. */
export const SIDE_LANE: Rect = { x0: -980, z0: -4015, x1: -760, z1: -3895 };
export const SW_YARD: Rect = { x0: -980, z0: -3600, x1: -760, z1: -3291 };
/** The lane along the river side, from the yard to the LOW ROAD (south of the ridge). */
export const RIVER_LANE: Rect = { x0: -760, z0: -3420, x1: -120, z1: -3291 };
/** The LOW ROAD along the foot of the east cliff (the TWIN SLOPES run down its west half). */
export const LOW_ROAD: Rect = { x0: -120, z0: -4632, x1: 110, z1: -3291 };
/** East lanes from the LOW ROAD to the city lane at x 540, and QUIET COURT. */
export const EAST_LANE: Rect = { x0: 110, z0: -4420, x1: 480, z1: -4320 };
export const COURT_LANE: Rect = { x0: 110, z0: -3820, x1: 480, z1: -3740 };
export const QUIET_COURT: Rect = { x0: 180, z0: -3860, x1: 420, z1: -3700 };

/** A house (2–3 storeys) or a small apartment (4). `base`: standing on the ridge or at street level. */
export interface BkHouse extends Rect {
  id: string;
  floors: number;
  base: number;
  /** Side facing its street (door, gate lamp). */
  front: BunkyoSide;
  roof: 'gable' | 'hip' | 'flat';
  skin: 'white' | 'beige' | 'grey' | 'wood';
}
const H = RIDGE_H;
export const HOUSES: readonly BkHouse[] = [
  // West, at street level: two facing the city lane at x −1040, two north / south of the side lane, two more south.
  { id: 'wn1', x0: -972, z0: -4596, x1: -892, z1: -4470, floors: 2, base: 0, front: 'w', roof: 'gable', skin: 'beige' },
  { id: 'wn2', x0: -972, z0: -4456, x1: -892, z1: -4342, floors: 2, base: 0, front: 'w', roof: 'hip', skin: 'white' },
  { id: 'w1a', x0: -972, z0: -4222, x1: -776, z1: -4126, floors: 2, base: 0, front: 'n', roof: 'gable', skin: 'wood' },
  { id: 'w1b', x0: -972, z0: -4114, x1: -776, z1: -4023, floors: 3, base: 0, front: 's', roof: 'hip', skin: 'white' },
  { id: 'w2a', x0: -972, z0: -3887, x1: -790, z1: -3752, floors: 2, base: 0, front: 'n', roof: 'hip', skin: 'grey' },
  { id: 'w2b', x0: -972, z0: -3740, x1: -790, z1: -3612, floors: 2, base: 0, front: 's', roof: 'gable', skin: 'beige' },
  // North, at street level, facing 春日通り (backs against the ridge's north 石垣), and one in the WALL PATH's corner.
  { id: 'n1', x0: -750, z0: -4590, x1: -604, z1: -4450, floors: 3, base: 0, front: 'n', roof: 'flat', skin: 'white' },
  { id: 'n2', x0: -590, z0: -4590, x1: -434, z1: -4450, floors: 2, base: 0, front: 'n', roof: 'gable', skin: 'beige' },
  { id: 'n3', x0: -420, z0: -4590, x1: -266, z1: -4450, floors: 2, base: 0, front: 'n', roof: 'hip', skin: 'grey' },
  { id: 'nc', x0: -752, z0: -4444, x1: -626, z1: -4338, floors: 2, base: 0, front: 'w', roof: 'gable', skin: 'wood' },
  // On the ridge, north block (between the gate and KAMI-ZAKA).
  { id: 'r1', x0: -610, z0: -4440, x1: -446, z1: -4322, floors: 2, base: H, front: 'n', roof: 'hip', skin: 'white' },
  { id: 'r2', x0: -430, z0: -4440, x1: -268, z1: -4322, floors: 2, base: H, front: 'e', roof: 'gable', skin: 'beige' },
  { id: 'r3', x0: -610, z0: -4308, x1: -446, z1: -4194, floors: 2, base: H, front: 's', roof: 'gable', skin: 'grey' },
  { id: 'r4', x0: -430, z0: -4308, x1: -268, z1: -4194, floors: 3, base: H, front: 'e', roof: 'hip', skin: 'wood' },
  // On the ridge, middle block (between KAMI-ZAKA and NAKA-ZAKA).
  { id: 'r5', x0: -610, z0: -4050, x1: -446, z1: -3910, floors: 2, base: H, front: 'n', roof: 'gable', skin: 'beige' },
  { id: 'r6', x0: -430, z0: -4050, x1: -268, z1: -3910, floors: 2, base: H, front: 'e', roof: 'hip', skin: 'white' },
  // The storehouse (蔵) in its garden by RIDGE TERRACE.
  { id: 'kura', x0: -398, z0: -3630, x1: -342, z1: -3560, floors: 2, base: H, front: 'e', roof: 'gable', skin: 'white' },
  // East, at street level: along 春日通り, the two rows round QUIET COURT, the south rows.
  { id: 'e1', x0: 140, z0: -4590, x1: 250, z1: -4430, floors: 2, base: 0, front: 'n', roof: 'gable', skin: 'white' },
  { id: 'e2', x0: 262, z0: -4590, x1: 372, z1: -4430, floors: 3, base: 0, front: 'n', roof: 'hip', skin: 'beige' },
  { id: 'e3', x0: 384, z0: -4596, x1: 472, z1: -4430, floors: 4, base: 0, front: 'n', roof: 'flat', skin: 'grey' },
  { id: 'e4', x0: 140, z0: -4310, x1: 250, z1: -4112, floors: 2, base: 0, front: 'w', roof: 'hip', skin: 'wood' },
  { id: 'e5', x0: 262, z0: -4310, x1: 372, z1: -4112, floors: 2, base: 0, front: 'n', roof: 'gable', skin: 'white' },
  { id: 'e6', x0: 384, z0: -4310, x1: 472, z1: -4112, floors: 2, base: 0, front: 'n', roof: 'hip', skin: 'beige' },
  { id: 'e7', x0: 140, z0: -4098, x1: 250, z1: -3872, floors: 2, base: 0, front: 'w', roof: 'gable', skin: 'grey' },
  { id: 'e8', x0: 262, z0: -4098, x1: 372, z1: -3872, floors: 2, base: 0, front: 's', roof: 'hip', skin: 'white' },
  { id: 'e9', x0: 384, z0: -4098, x1: 472, z1: -3872, floors: 3, base: 0, front: 's', roof: 'gable', skin: 'beige' },
  { id: 'e10', x0: 140, z0: -3688, x1: 250, z1: -3512, floors: 2, base: 0, front: 'n', roof: 'hip', skin: 'beige' },
  { id: 'e11', x0: 262, z0: -3688, x1: 372, z1: -3512, floors: 2, base: 0, front: 'n', roof: 'gable', skin: 'wood' },
  { id: 'e12', x0: 384, z0: -3688, x1: 472, z1: -3512, floors: 2, base: 0, front: 'n', roof: 'hip', skin: 'white' },
  { id: 'e13', x0: 140, z0: -3498, x1: 250, z1: -3338, floors: 2, base: 0, front: 's', roof: 'gable', skin: 'white' },
  { id: 'e14', x0: 262, z0: -3498, x1: 372, z1: -3338, floors: 3, base: 0, front: 's', roof: 'hip', skin: 'grey' },
  { id: 'e15', x0: 384, z0: -3498, x1: 472, z1: -3338, floors: 4, base: 0, front: 's', roof: 'flat', skin: 'beige' },
];

/** Garden walls and hedges (solid: they hide a person standing behind them). */
export type WallKind = 'plaster' | 'stone' | 'block' | 'hedge';
export interface BkWall extends Rect { base: number; h: number; kind: WallKind }
/** Height of a garden wall (≈ 1.8 m: over a standing person's eyes) and of a hedge. */
export const WALL_H = 48;
export const HEDGE_H = 52;
const w = (x0: number, z0: number, x1: number, z1: number, kind: WallKind, base = 0): BkWall => ({ x0, z0, x1, z1, base, h: kind === 'hedge' ? HEDGE_H : WALL_H, kind });
export const WALLS: readonly BkWall[] = [
  // WALL PATH, west side: plaster walls with tile caps, a hedge, block walls (each lot its own).
  w(-886, -4600, -880, -4330, 'plaster'),
  w(-770, -4230, -760, -4015, 'plaster'),
  w(-786, -3895, -776, -3750, 'hedge'),
  w(-770, -3750, -760, -3600, 'block'),
  // The corner house in the jog: its garden wall along the WALL PATH's north section.
  w(-760, -4450, -752, -4338, 'plaster'),
  // On the ridge: stone garden walls round the two house blocks (RIDGE ROAD side, the cut lanes' rims, the west rim).
  w(-258, -4450, -250, -4180, 'stone', H), w(-620, -4188, -250, -4180, 'stone', H), w(-620, -4450, -612, -4180, 'stone', H), w(-620, -4450, -250, -4442, 'stone', H),
  w(-258, -4060, -250, -3900, 'stone', H), w(-620, -4060, -250, -4052, 'stone', H), w(-620, -3908, -250, -3900, 'stone', H), w(-620, -4060, -612, -3900, 'stone', H),
  // The pine garden (hedge all round) and the storehouse garden (stone).
  w(-620, -3650, -520, -3644, 'hedge', H), w(-620, -3650, -614, -3530, 'hedge', H), w(-526, -3650, -520, -3530, 'hedge', H), w(-620, -3536, -520, -3530, 'hedge', H),
  w(-410, -3650, -330, -3644, 'stone', H), w(-410, -3650, -404, -3530, 'stone', H), w(-336, -3650, -330, -3530, 'stone', H), w(-410, -3536, -330, -3530, 'stone', H),
  // LOW ROAD, east side: the houses' walls and hedges (gaps are the lanes).
  w(110, -4600, 118, -4420, 'block'),
  w(110, -4320, 118, -4110, 'hedge'), w(110, -4100, 118, -3866, 'plaster'),
  w(110, -3700, 118, -3510, 'hedge'), w(110, -3500, 118, -3330, 'plaster'),
  // QUIET COURT: hedges on its corners, leaving the lanes in and out.
  w(118, -3866, 180, -3858, 'hedge'), w(118, -3708, 180, -3700, 'hedge'),
  w(420, -3866, 480, -3858, 'hedge'), w(420, -3708, 480, -3700, 'hedge'),
  // East lane: front walls of the north row.
  w(130, -4426, 480, -4420, 'block'),
];

/** Utility poles (電柱, base height) in runs; wires join consecutive poles of a run. */
export const POLE_RUNS: readonly { base: number; pts: readonly [number, number][] }[] = [
  { base: 0, pts: [[100, -4590], [100, -4290], [100, -3990], [100, -3690], [100, -3390]] }, // LOW ROAD
  { base: H, pts: [[-240, -4230], [-240, -3960], [-240, -3700]] }, // RIDGE ROAD
  { base: 0, pts: [[-750, -4320], [-750, -4040], [-750, -3780], [-628, -3590]] }, // WALL PATH (the last one against the 石垣, clear of the corner onto STONE BEND)
  { base: 0, pts: [[120, -4330], [300, -4330], [470, -4330]] }, // east lane
  { base: 0, pts: [[-870, -4600], [-870, -4340]] }, // WALL PATH north section
];

/** Lamps (warm, few: Bunkyo is darker than the shopping districts). A post from the ground to the head at 184. */
export const BUNKYO_LAMPS: readonly { x: number; z: number; ang: number }[] = [
  { x: -108, z: -4600, ang: Math.PI }, // SLOPE GATE
  { x: -240, z: -4100, ang: 0 }, { x: -240, z: -3830, ang: 0 }, // RIDGE ROAD
  { x: -140, z: -3545, ang: Math.PI }, // RIDGE TERRACE
  { x: 92, z: -4290, ang: Math.PI }, { x: 92, z: -3390, ang: Math.PI }, // LOW ROAD
  { x: 300, z: -3712, ang: -Math.PI / 2 }, // QUIET COURT
  { x: -420, z: -3410, ang: -Math.PI / 2 }, // STONE BEND (the corner)
  { x: -770, z: -3955, ang: Math.PI }, // WALL PATH at the side lane (the only lamp on the path)
  { x: 300, z: -4330, ang: Math.PI / 2 }, // east lane
];

/** Bunkyo's light colours: warm lamp, warm white window, dim amber foot light (never a faction hue; see tests). */
export const BUNKYO_LIGHTS = [0xffe2bc, 0xfff1dc, 0xead2ae] as const;

/** Garden and street trees (trunk solid, crown drawn by the city renderer): x, z, crown top. */
export const BUNKYO_TREES: readonly [number, number, number][] = [
  [-570, -3590, H + 250], // the pine at STONE BEND
  [-480, -3712, H + 230], [-290, -3600, H + 240], // the walk over NAKA-ZAKA, RIDGE TERRACE
  [-900, -3500, 250], [-830, -3380, 230], [-940, -3330, 240], // SW yard
  [300, -3780, 260], // QUIET COURT
];

/** Spots that tests and the review shots use. */
export const SPOTS = {
  gateFoot: { x: -185, z: -4600 },
  ridgeNorth: { x: -185, z: -4200 },
  ridgeMid: { x: -185, z: -3980 },
  fork: { x: -70, z: -3830 },
  terrace: { x: -230, z: -3590 },
  lowNorth: { x: 50, z: -4400 },
  lowMid: { x: 50, z: -3830 },
  lowSouth: { x: 50, z: -3330 },
  wallNorth: { x: -820, z: -4560 },
  wallMid: { x: -690, z: -3960 },
  wallSouth: { x: -690, z: -3600 },
  bendFoot: { x: -800, z: -3475 },
  court: { x: 250, z: -3760 },
} as const;
