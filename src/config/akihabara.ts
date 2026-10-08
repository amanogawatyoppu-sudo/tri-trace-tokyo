/**
 * v10 MAP REFORGE phase 3 — 秋葉原 ELECTRIC GRID.
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). Before this, the Kanda River's and 聖橋's
 * keep-out areas had swallowed whole blocks: from the tracks to the LUNA base there were two
 * buildings. The district is rebuilt as a small-grain electric town north of the river, round
 * three ways through:
 *
 * - MAIN ELECTRIC STREET: north–south on 聖橋's axis, from the bridge to the arcade. A two-lane
 *   carriageway between busy pavements (poles, vending machines, kerb-side stalls): fast, and
 *   seen from the shopfronts, the GRID GATE footbridge and the LOCK YARD.
 * - COMPONENT ALLEY: lanes of parts shops west of the street (from CIRCUIT ARCADE's new south
 *   door to the riverside) and two short lanes east of it down to DATA JUNCTION. Every lane
 *   turns, so none gives a long view.
 * - SERVICE CUT: the back lane along the railway viaduct (base → DATA JUNCTION, the shortest
 *   way, behind POWER NODE), and two covered passages through buildings (搬入口), one of them
 *   under the GRID GATE stair.
 *
 * LUNA's base, the LOCK POINT, the strategic point (電気街), the river and 聖橋 do not move.
 * Coordinates are world units (26 per metre); x east, z south.
 */

export type AkibaSide = 'n' | 's' | 'e' | 'w';

/** A hand-placed building (a narrow 雑居ビル or a row of stalls). */
export interface AkibaBuilding {
  id: string;
  x0: number; z0: number; x1: number; z1: number;
  floors: number;
  /** Sides that face a street, lane or square (shopfronts, signs). The first is the main front. */
  fronts: AkibaSide[];
  /** Façade: white tile, grey tile, bare concrete or a dark panel front. */
  skin: 'white' | 'grey' | 'concrete' | 'dark';
  /** Back wall on a lane (cable racks, air-con units, pipes, a back door). */
  service?: AkibaSide;
  /**
   * A covered passage through the ground floor (搬入口): the building stands on its upper
   * storeys only, people walk underneath along `under`.
   */
  under?: 'x' | 'z';
}

/** Ground-level areas rebuilt here (generated city pieces whose centre is inside are removed). */
export const AKIBA_ZONES: readonly { x0: number; z0: number; x1: number; z1: number }[] = [
  { x0: 1600, z0: -2827, x1: 2950, z1: -2240 }, // north bank, from the field west of the lanes to the viaduct
  { x0: 2350, z0: -3050, x1: 2546, z1: -2827 }, // the square in front of the arcade's east door (GRID TOWER)
];

/** MAIN ELECTRIC STREET: 聖橋's axis (x 2222), pavements both sides, a two-lane carriageway. */
export const MAIN_STREET = { x0: 2082, x1: 2362, road0: 2142, road1: 2302, z0: -2827, z1: -2497 } as const;

/** CIRCUIT ARCADE: the existing walk-through arcade (same place, same east and west doors) gets a south door. */
export const ARCADE_SOUTH_DOOR = { x: 1911, width: 106 } as const;

/** GRID GATE: a narrow footbridge over the street, from the west pavement to the LOCK YARD. */
export const GATE_H = 80;
export const GRID_GATE = {
  deck: { x0: 2084, x1: 2418, z0: -2800, z1: -2752 },
  /**
   * West stair on the west pavement (rises north; it ends north of P1, so P1's passage comes out
   * on open pavement), east stair along the LOCK YARD's north edge (rises west).
   */
  stairs: [
    { id: 'gateW', x0: 2084, z0: -2752, x1: 2140, z1: -2606, axis: 'z' as const, dir: -1 as const },
    { id: 'gateE', x0: 2418, z0: -2800, x1: 2568, z1: -2752, axis: 'x' as const, dir: -1 as const },
  ],
  // One row, on the kerbs at the deck's south edge (the north edge is cantilevered, so the kerb by the arcade stays
  // clear); the east end rests on the stair head.
  legs: [[2136, -2758], [2308, -2758]] as [number, number][],
} as const;

/** GRID TOWER: a mid-size lattice mast in the square by the arcade's east door. */
export const GRID_TOWER = { x: 2470, z: -2930, half: 24, h: 650, ring: 430 } as const;
/**
 * Cables from GRID TOWER's ring to the roofs and poles round it: drawn only (no collision), and
 * hung high, so nothing under them is ever in the way. [x, y, z] of the far end.
 */
export const GRID_CABLES: readonly [number, number, number][] = [
  [2024, 560, -2805], // B1's roof
  [2755, 400, -2770], // R1a's roof
  [2350, 300, -2880], // the mast on the arcade's east end
  [2600, 300, -2760], // the GRID GATE east stair head's pole
  [2316, 300, -2810], // the main street's first pole
];
/** Lowest a GRID TOWER cable may sag (well over the footbridge and anyone on it). */
export const CABLE_MIN_Y = 260;

/** DATA JUNCTION: the strategic point's square on the river bank, where the lanes come out. */
export const DATA_JUNCTION = { x0: 2362, z0: -2430, x1: 2870, z1: -2250 } as const;
/** Free-standing LED message boards round the square (outside the point's capture radius). */
export const JUNCTION_BOARDS: readonly { x: number; z: number; w: number; d: number; h: number }[] = [
  { x: 2500, z: -2400, w: 90, d: 8, h: 150 },
  { x: 2805, z: -2395, w: 80, d: 8, h: 150 },
  { x: 2858, z: -2320, w: 8, d: 70, h: 130 },
];

/** POWER NODE: switchgear, transformers and cable trays on the viaduct side of the back lane. */
export const POWER_NODE = { x0: 2892, z0: -2790, x1: 2918, z1: -2630, h: 210 } as const;

/** LOCK YARD: the open ground round the LOCK POINT, between the street and the stalls. */
export const LOCK_YARD = { x0: 2362, z0: -2800, x1: 2720, z1: -2600 } as const;

/** The three ways, as the tests walk them. */
export const ROUTES = {
  /** COMPONENT ALLEY, west: arcade door → spine → west lane → south-west lane → riverside; the south-east lane; the east lane. */
  spine: { x0: 1860, z0: -2827, x1: 1966, z1: -2560 },
  westLane: { x0: 1702, z0: -2700, x1: 1860, z1: -2560 },
  southWestLane: { x0: 1702, z0: -2560, x1: 1806, z1: -2447 },
  // South of C2, open on its south side to the riverside walk.
  southEastLane: { x0: 1966, z0: -2520, x1: 2082, z1: -2400 },
  partsLane: { x0: 2570, z0: -2600, x1: 2670, z1: -2430 },
  riverCorner: { x0: 2362, z0: -2500, x1: 2470, z1: -2250 },
  /** SERVICE CUT: the back lane (north part behind R1, south part behind the stalls). */
  serviceNorth: { x0: 2790, z0: -2810, x1: 2892, z1: -2610 },
  serviceSouth: { x0: 2760, z0: -2610, x1: 2870, z1: -2430 },
} as const;

/** Buildings. Footprints touch where a row continues; lanes between are ≥ 100 wide. */
export const AKIBA_BUILDINGS: readonly AkibaBuilding[] = [
  // West of the street: the COMPONENT ALLEY block.
  { id: 'A1', x0: 1702, z0: -2827, x1: 1782, z1: -2700, floors: 3, fronts: ['s', 'w'], skin: 'grey', service: 'n' },
  { id: 'A2', x0: 1782, z0: -2827, x1: 1860, z1: -2700, floors: 5, fronts: ['e', 's'], skin: 'white' },
  { id: 'B1', x0: 1966, z0: -2827, x1: 2082, z1: -2775, floors: 6, fronts: ['e', 'w'], skin: 'white', service: 'n' },
  { id: 'B2', x0: 1966, z0: -2775, x1: 2082, z1: -2722, floors: 4, fronts: ['e', 'w'], skin: 'dark' },
  { id: 'C1', x0: 1966, z0: -2722, x1: 2082, z1: -2670, floors: 5, fronts: ['e', 'w'], skin: 'white' },
  { id: 'C2', x0: 1966, z0: -2670, x1: 2082, z1: -2620, floors: 3, fronts: ['e', 'w'], skin: 'grey' },
  { id: 'P1', x0: 1966, z0: -2620, x1: 2082, z1: -2520, floors: 4, fronts: ['e', 'w', 's'], skin: 'concrete', under: 'x' },
  { id: 'E1', x0: 1806, z0: -2560, x1: 1886, z1: -2447, floors: 4, fronts: ['n', 'w', 's'], skin: 'white' },
  { id: 'E2', x0: 1886, z0: -2560, x1: 1966, z1: -2447, floors: 2, fronts: ['n', 'e', 's'], skin: 'dark' },
  // East of the street: stalls down to DATA JUNCTION, and the row between the LOCK YARD and the back lane.
  { id: 'K1', x0: 2362, z0: -2600, x1: 2470, z1: -2500, floors: 2, fronts: ['w', 's', 'n'], skin: 'white' },
  { id: 'K2', x0: 2470, z0: -2600, x1: 2570, z1: -2430, floors: 3, fronts: ['s', 'e', 'w', 'n'], skin: 'grey' },
  { id: 'K3', x0: 2670, z0: -2610, x1: 2760, z1: -2430, floors: 2, fronts: ['w', 's'], skin: 'white', service: 'e' },
  { id: 'R1', x0: 2720, z0: -2790, x1: 2790, z1: -2715, floors: 4, fronts: ['w', 'n'], skin: 'dark', service: 'e' },
  { id: 'R2', x0: 2720, z0: -2715, x1: 2790, z1: -2610, floors: 3, fronts: ['w'], skin: 'concrete', service: 'e', under: 'x' },
];

/** Electricity poles (電柱) and the wires strung between them (indices), including across the street. */
export const AKIBA_POLES: readonly [number, number][] = [
  [2134, -2808], [2310, -2808], [2310, -2690], [2310, -2575], [2134, -2505], [2310, -2510], // main street
  [1961, -2690], [1707, -2694], [1707, -2452], [2076, -2455], // west lanes and the riverside
  [2662, -2600], [2662, -2440], [2866, -2600], [2864, -2445], [2600, -2795], // east lanes, the back lane, the stair head
];
export const AKIBA_WIRES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 5], [4, 5], [0, 2], [4, 3], // along and across the street
  [6, 7], [7, 8], [8, 9], [9, 4], [6, 9], // the lanes
  [10, 11], [12, 13], [11, 13], [10, 12], [14, 12], [14, 2], // east lanes, the back lane
];

/** Vending machines: [x, z, facing]. */
export const AKIBA_VENDING: readonly [number, number, AkibaSide][] = [
  [2093, -2800, 'e'], [2351, -2650, 'w'], [2351, -2530, 'w'],
  [1795, -2520, 'w'], [1977, -2490, 'e'], [2582, -2560, 'e'], [2771, -2470, 'e'],
];

/** Street lamps added here (gameplay lamps: their pools light people at night). The lanes stay dark for the rules. */
export const AKIBA_LAMPS: readonly { x: number; z: number; ang: number; wall?: boolean }[] = [
  { x: 2316, z: -2800, ang: Math.PI }, { x: 2316, z: -2620, ang: Math.PI }, { x: 2128, z: -2800, ang: 0 }, { x: 2128, z: -2470, ang: 0 },
  { x: 2400, z: -2265, ang: -Math.PI / 2 }, { x: 2862, z: -2300, ang: Math.PI },
  { x: 2716, z: -2760, ang: Math.PI, wall: true }, { x: 2400, z: -2990, ang: 0 },
];
