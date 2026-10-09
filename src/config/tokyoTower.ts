/**
 * MAP REFORGE parallel E — 東京タワー RED HEIGHT.
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). Before this, the tower stood on a wide
 * empty gravel lot: four legs, the FootTown block between them with one outdoor stair, the
 * 増上寺 hall to the east and nothing else to use. It is rebuilt as an open high ground at the
 * foot of the landmark: a horseshoe of raised terraces round an open plaza under the tower.
 *
 * - A. RED AXIS: one straight north–south approach on the tower's centre line, from the avenue
 *   in the south through TOWER GATE, across SKY PLAZA, between the legs and on under RED
 *   TERRACE. The fastest way and the most exposed: the tower is ahead the whole way and the
 *   terraces look down on it.
 * - B. TERRACE RING: the raised terraces (≈ 4.6 m) on three sides of the plaza, joined over the
 *   axis by RED TERRACE (≈ 8 m). A longer way round that sees everything below; stairs go down
 *   into the plaza (both sides, under the tower), south to the gate, west to the avenue and
 *   east into the service lane.
 * - C. SERVICE SLOPE: the back way along the east, between the terrace's retaining wall and
 *   SERVICE WALL (the equipment block by the tracks). Out of sight of the plaza; its mouth is
 *   tucked in beside the gate's east stair. A tunnel under the east terrace comes out at the
 *   tower's south-east leg, and the slope at the north end climbs onto the ring.
 *
 * The strategic point (東京タワー下, SECTORS[7]) stays at the tower's foot on open ground in
 * SKY PLAZA. Coordinates are world units (26 per metre); x east, z south.
 */

/** A rectangle in plan. */
export interface TtwRect { x0: number; z0: number; x1: number; z1: number }

/** The tower's centre (geo(35.6586, 139.7454) in map.ts). */
export const TT = { x: 487, z: 2375 } as const;

/**
 * The rebuilt area: the main block round the tower, and the south approach (the axis down to
 * the avenue, and the two blocks beside it). Generated pieces whose centre is inside are removed.
 */
export const TTW_ZONES: readonly (TtwRect & { id: string })[] = [
  { id: 'main', x0: -140, z0: 1880, x1: 1440, z1: 2990 },
  { id: 'south', x0: 200, z0: 2990, x1: 1090, z1: 3505 },
];
export function inTokyoTowerZone(x: number, z: number): boolean {
  return TTW_ZONES.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
}

/** Terrace (TERRACE RING) and RED TERRACE heights. */
export const RING_H = 120;
export const RED_H = 210;

/** The tower's legs (centres, ±200 from the centre) and their concrete footings. */
export const LEGS: readonly [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [TT.x + sx * 200, TT.z + sz * 200]);
export const LEG = 50, FOOTING = 84, FOOTING_H = 64;

/** A. RED AXIS: the carriageway on the tower's centre line, from the avenue up to the north court. */
export const AXIS = { x0: 400, x1: 575, z0: 1880, z1: 3505 } as const;

/** SKY PLAZA: the open square under and south of the tower (street level). */
export const SKY_PLAZA = { x0: 170, z0: 2085, x1: 805, z1: 2960 } as const;
/** The strategic point as the game finds it (the nearest walkable spot to SECTORS[7].pointNear). */
export const TOWER_POINT = { x: 487, z: 2825 } as const;

/** B. TERRACE RING: the solid terrace blocks (retaining walls all round, walkable top at RING_H). */
export const TERRACES: readonly (TtwRect & { id: string })[] = [
  { id: 'west', x0: 40, z0: 1990, x1: 170, z1: 2700 },
  { id: 'nw', x0: 170, z0: 1990, x1: 220, z1: 2085 },
  { id: 'ne', x0: 755, z0: 1990, x1: 805, z1: 2085 },
  { id: 'eastN', x0: 805, z0: 1990, x1: 935, z1: 2440 },
  { id: 'eastS', x0: 805, z0: 2560, x1: 935, z1: 2700 },
  // The landing at the top of SERVICE SLOPE.
  { id: 'landing', x0: 935, z0: 1990, x1: 1055, z1: 2050 },
];
/** The east terrace's bridge over the service tunnel (C → the tower's foot). */
export const TUNNEL = { x0: 805, z0: 2440, x1: 935, z1: 2560 } as const;

/** RED TERRACE: the high deck over the axis, north of the tower (look up the tower, down the axis). */
export const RED_TERRACE = { x0: 400, z0: 1975, x1: 575, z1: 2100 } as const;

export interface TtwStair extends TtwRect {
  id: string;
  axis: 'x' | 'z';
  /** The stair rises toward +axis (1) or −axis (−1). */
  dir: 1 | -1;
  low: number;
  high: number;
  style: 'stairs' | 'slope';
}
/** Every stair and slope (gradient ≤ 0.53: what the walker climbs). */
export const STAIRS: readonly TtwStair[] = [
  // Up to RED TERRACE from the ring, one each side.
  { id: 'redW', x0: 220, z0: 1990, x1: 400, z1: 2085, axis: 'x', dir: 1, low: RING_H, high: RED_H, style: 'stairs' },
  { id: 'redE', x0: 575, z0: 1990, x1: 755, z1: 2085, axis: 'x', dir: -1, low: RING_H, high: RED_H, style: 'stairs' },
  // Into the plaza under the tower, facing each other across the axis.
  { id: 'innerW', x0: 170, z0: 2290, x1: 400, z1: 2370, axis: 'x', dir: -1, low: 0, high: RING_H, style: 'stairs' },
  { id: 'innerE', x0: 575, z0: 2290, x1: 805, z1: 2370, axis: 'x', dir: 1, low: 0, high: RING_H, style: 'stairs' },
  // Down to the gate at the south ends of the horseshoe.
  { id: 'southW', x0: 50, z0: 2700, x1: 160, z1: 2960, axis: 'z', dir: -1, low: 0, high: RING_H, style: 'stairs' },
  { id: 'southE', x0: 815, z0: 2700, x1: 925, z1: 2960, axis: 'z', dir: -1, low: 0, high: RING_H, style: 'stairs' },
  // Down the west retaining wall to the avenue (rises south, along the wall).
  { id: 'west', x0: -50, z0: 2400, x1: 40, z1: 2640, axis: 'z', dir: 1, low: 0, high: RING_H, style: 'stairs' },
  // C. SERVICE SLOPE: the long gentle slope from the service lane up to the landing.
  { id: 'service', x0: 935, z0: 2050, x1: 1055, z1: 2390, axis: 'z', dir: -1, low: 0, high: RING_H, style: 'slope' },
];

/** C. the service lane (street level) between the east terrace and SERVICE WALL. */
export const SERVICE_LANE = { x0: 935, z0: 2390, x1: 1065, z1: 2900 } as const;
/** SERVICE WALL: the equipment block by the tracks (solid, no roof to stand on), stepped with the tracks; it runs back to the
 * district edge so there is no blind alley behind it. */
export const SERVICE_WALL: readonly (TtwRect & { h: number })[] = [
  { x0: 1065, z0: 1990, x1: 1440, z1: 2420, h: 360 },
  { x0: 1065, z0: 2420, x1: 1440, z1: 2700, h: 300 },
  { x0: 1065, z0: 2700, x1: 1440, z1: 2840, h: 240 },
];
/** The kiosk that hides the lane's mouth from the gate (solid, low). */
export const SERVICE_KIOSK = { x0: 975, z0: 2945, x1: 1085, z1: 3005, h: 110 } as const;

/** TOWER GATE: two piers either side of the axis and the deep red lintel high over it. */
export const GATE = { z0: 2955, z1: 2995, pierW: { x0: 330, x1: 398 }, pierE: { x0: 577, x1: 645 }, lintel0: 300, top: 344 } as const;
/** Low planters along the plaza's south edge (the gate is the way in; the eye passes over them). */
export const GATE_PLANTERS: readonly TtwRect[] = [
  { x0: 170, z0: 2962, x1: 330, z1: 2988 },
  { x0: 645, z0: 2962, x1: 805, z1: 2988 },
];
export const PLANTER_H = 34;

/** The two blocks west of the axis's south approach (backdrop; replace two generated towers). */
export const SOUTH_BLOCKS: readonly (TtwRect & { id: string; h: number })[] = [
  { id: 'southA', x0: 210, z0: 3015, x1: 385, z1: 3160, h: 240 },
  { id: 'southB', x0: 210, z0: 3185, x1: 385, z1: 3420, h: 520 },
];

/** Street furniture (benches, bollards, planters, floodlight housings); all low and solid. */
export interface TtwProp { kind: 'bench' | 'planter' | 'flood' | 'bollard' | 'box'; x: number; z: number; ang?: number; y?: number }
export const PROP_SIZE: Record<TtwProp['kind'], { w: number; d: number; h: number }> = {
  bench: { w: 70, d: 24, h: 18 },
  planter: { w: 60, d: 60, h: 34 },
  flood: { w: 30, d: 30, h: 22 },
  bollard: { w: 10, d: 10, h: 26 },
  box: { w: 50, d: 34, h: 60 },
};
const props: TtwProp[] = [];
// Floodlights at each leg's footing (aimed up the tower), on the plaza side.
for (const [x, z] of LEGS) props.push({ kind: 'flood', x: x + (x < TT.x ? 62 : -62), z: z + (z < TT.z ? 62 : -62) });
// Benches round the plaza's edge (never on the axis, never near the point).
for (const z of [2230, 2440, 2800]) props.push({ kind: 'bench', x: 196, z, ang: Math.PI / 2 });
for (const z of [2230, 2660, 2830]) props.push({ kind: 'bench', x: 779, z, ang: Math.PI / 2 });
// Bollards across the axis's south approach (they mark the gate, the axis runs between them).
for (const x of [412, 563]) for (const z of [3030, 3180, 3330]) props.push({ kind: 'bollard', x, z });
// Service lane: equipment boxes against SERVICE WALL.
for (const z of [2470, 2640, 2790]) props.push({ kind: 'box', x: 1040, z, ang: Math.PI / 2 });
// Planters on the terraces (on the outer side, out of the walking line).
props.push({ kind: 'planter', x: 80, z: 2200, y: RING_H }, { kind: 'planter', x: 80, z: 2480, y: RING_H }, { kind: 'planter', x: 890, z: 2200, y: RING_H }, { kind: 'planter', x: 890, z: 2630, y: RING_H });
export const TTW_PROPS: readonly TtwProp[] = props;

/** Trees: the west frontage, the north court, the south forecourt and the green strip by the tracks. */
export const TTW_TREES: readonly [number, number, number][] = [
  [-100, 2040, 260], [-100, 2230, 280], [-100, 2720, 270], [-100, 2900, 250],
  [-20, 1920, 250], [140, 1920, 260], [300, 1920, 240],
  [640, 3060, 250], [760, 3060, 270], [880, 3060, 250], [640, 3240, 260], [760, 3240, 250],
];

/** Lamps (the night street-light system): along the axis, the plaza edge, the ring, the lane. */
export const TTW_LAMPS: readonly { x: number; z: number; ang: number; wall?: boolean }[] = [
  ...[3100, 3330].flatMap((z) => [{ x: 389, z, ang: 0, wall: true }, { x: 592, z, ang: Math.PI }]),
  ...[2160, 2520, 2900].flatMap((z) => [{ x: 178, z, ang: 0, wall: true }, { x: 797, z, ang: Math.PI, wall: true }]),
  { x: 960, z: 2480, ang: 0, wall: true }, { x: 960, z: 2760, ang: 0, wall: true },
  { x: -120, z: 2300, ang: 0 }, { x: -120, z: 2780, ang: 0 },
  { x: 320, z: 1900, ang: Math.PI / 2 }, { x: 660, z: 1900, ang: Math.PI / 2 },
];

/**
 * Colours (render/tokyoTower.ts and the district's sign light). The tower's red is a deep
 * crimson, well away from SOL's orange and STAR's yellow; the light is warm white, the red only
 * on the steel. Nothing here glows red in quantity.
 */
export const TOWER_RED = 0x7a1419;
export const TOWER_WHITE = 0xe6ddcc;
export const TTW_LIGHTS = [0xfff0d8, 0xb3262c, 0xe8e2d6] as const;
