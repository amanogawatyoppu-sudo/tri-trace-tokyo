/**
 * v10.1 MAP REFORGE — 新宿 VERTICAL CITY (the second district, built to the Shibuya bar).
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city and
 * after Shibuya, so the rest of Tokyo stays exactly as it was). The centre of Shinjuku, between
 * the tracks and the back streets east of 明治通り, is rebuilt by hand:
 *
 * - MAIN STREET (主戦場): VERTICAL AVENUE, 明治通り (x −2700) joined up from the 歌舞伎町 walk-up
 *   to 新宿御苑 (it was cut in two by the walk-up's and the garden's reserves), crossing 靖国通り
 *   at the VERTICAL CROSS. The SOL base square opens straight onto it; the strategic point
 *   (新宿御苑前) is at its south end. Fast and short, and seen from the deck, the bridge and
 *   the towers' feet.
 * - BACK ROUTES: NIGHT LANES, a block of narrow lanes north of the LOCK POINT (base square →
 *   the walk-up / the street north), and RAIL LANE, the gap between the T3 tower and the tracks
 *   (base square → the garden's west side).
 * - UPPER ROUTE, in two levels:
 *   · DECK 2 (140, the same rise as Shibuya's SKY RING): a gallery along the east towers' feet
 *     over 靖国通り, an arm across the avenue north of the crossing and a gallery down the base
 *     square's east edge. Four stairs to the ground.
 *   · HIGH (280): the podium roofs of T2 and T3 and the SKY BRIDGE between them over the avenue
 *     (the VERTICAL GATE). Two ways up, both from DECK 2; it overlooks the strategic point and
 *     the square, but there is nowhere to run.
 *
 * The SOL base, its LOCK POINT, the strategic point, the garden and the walk-up stay where they
 * were. Coordinates are world units (26 per metre); x east, z south.
 */

export type ShinjukuSide = 'n' | 's' | 'e' | 'w';

/** A hand-placed building (footprint, storeys, faces), as in config/shibuya.ts. */
export interface ShinjukuBuilding {
  id: string;
  x0: number; z0: number; x1: number; z1: number;
  floors: number;
  /** Sides that face a street, lane, deck or the square. The first is the main front. */
  fronts: ShinjukuSide[];
  skin: 'tileA' | 'tileB' | 'concrete' | 'glass';
  /** Fire escape / pipes side. */
  service?: ShinjukuSide;
  roof?: 'plant' | 'billboard';
  /**
   * A tower: a podium of `podium` height (its roof walkable where `walkRoof`), and the shaft
   * above it on `shaft` (a part of the footprint), `floors` storeys in all.
   */
  tower?: { podium: number; shaft: { x0: number; z0: number; x1: number; z1: number }; walkRoof: boolean };
}

/** Floor of DECK 2 and of the high level (podium roofs, the SKY BRIDGE). */
export const DECK_H = 140;
export const HIGH_H = 280;

/** The VERTICAL CROSS: 明治通り (x −2700) × 靖国通り (z −1350). */
export const SHINJUKU_CROSS = { x: -2700, z: -1350 };

/** Ground-level areas rebuilt here (generated city pieces whose centre is inside are removed). */
export const SHINJUKU_ZONES: readonly { x0: number; z0: number; x1: number; z1: number }[] = [
  { x0: -3600, z0: -2250, x1: -2890, z1: -640 }, // base side: the square, the lanes, T3 (the walk-up's centre is east of this)
  { x0: -2890, z0: -2003, x1: -2510, z1: -640 }, // the avenue
  { x0: -2510, z0: -2258, x1: -2160, z1: -640 }, // the east towers
];

/** The avenue, joined up (south of the walk-up to the garden), as street pieces. */
export const AVENUE = { x: -2700, w: 380, z0: -2003, z1: -654 };

/** NIGHT LANES: cell ≈ 1.5 m, lanes three cells wide (≈ 4.4 m), as Shibuya's maze. */
export const LANES = { x0: -3420, z0: -2250, cell: 38 };
/**
 * One character per cell: a letter is a building, '.' a lane. The north mouth (cols 3–5) opens
 * on the street, the east mouths (rows 3–4 and 8–9) on the walk-up's lane, the south mouth
 * (cols 0–2) on the base square by the NIGHT LANES gate.
 */
export const LANES_MAP = [
  'AAA...BBB',
  'AAA...BBB',
  'AAA...BBB',
  'AAA......',
  '.........',
  '...DDDCCC',
  '...DDDCCC',
  '...DDDCCC',
  '...DDD...',
  '...DDD...',
  '...EEEFFF',
  '...EEEFFF',
] as const;

export const LANE_BUILDINGS: Record<string, Omit<ShinjukuBuilding, 'id' | 'x0' | 'z0' | 'x1' | 'z1'>> = {
  A: { floors: 6, fronts: ['e', 's', 'n'], skin: 'tileB', service: 'w', roof: 'plant' },
  B: { floors: 4, fronts: ['w', 's', 'n'], skin: 'tileA', service: 'e', roof: 'billboard' },
  C: { floors: 3, fronts: ['n', 'w', 'e'], skin: 'concrete', roof: 'plant' },
  D: { floors: 9, fronts: ['w', 'n', 'e'], skin: 'tileA', service: 's', roof: 'billboard' }, // the pencil tower of blade signs
  E: { floors: 2, fronts: ['w', 'n', 'e'], skin: 'concrete', roof: 'plant' }, // standing bars
  F: { floors: 5, fronts: ['n', 'e', 'w'], skin: 'tileB', roof: 'plant' },
};

/** Towers and the other buildings. */
export const SHINJUKU_BUILDINGS: readonly ShinjukuBuilding[] = [
  // T1: north-east corner of the VERTICAL CROSS (PILLAR VISION stands at its foot).
  { id: 'T1', x0: -2420, z0: -1990, x1: -2200, z1: -1630, floors: 28, fronts: ['w', 's', 'e'], skin: 'glass', service: 'n',
    tower: { podium: 281, shaft: { x0: -2400, z0: -1960, x1: -2220, z1: -1650 }, walkRoof: false } },
  // T1b: low block north of T1, by the deck's north stair.
  { id: 'T1b', x0: -2420, z0: -2240, x1: -2200, z1: -2010, floors: 5, fronts: ['w', 'n', 's'], skin: 'tileB', service: 'e', roof: 'billboard' },
  // T2: south-east, the east leg of the VERTICAL GATE. Its podium roof is the high level.
  { id: 'T2', x0: -2420, z0: -1070, x1: -2200, z1: -660, floors: 26, fronts: ['w', 'n', 's'], skin: 'glass', service: 'e',
    tower: { podium: HIGH_H, shaft: { x0: -2330, z0: -1070, x1: -2200, z1: -830 }, walkRoof: true } },
  // T3: south-west, on the square's south side: the west leg of the gate.
  { id: 'T3', x0: -3230, z0: -900, x1: -2985, z1: -680, floors: 24, fronts: ['e', 'n', 's'], skin: 'glass', service: 'w',
    tower: { podium: HIGH_H, shaft: { x0: -3230, z0: -900, x1: -3080, z1: -760 }, walkRoof: true } },
];

/** DECK 2 (walkable tops at DECK_H). */
export const DECKS: readonly { id: string; x0: number; z0: number; x1: number; z1: number }[] = [
  { id: 'galE', x0: -2490, z0: -1990, x1: -2420, z1: -700 }, // along the east towers, over 靖国通り
  { id: 'armN', x0: -2980, z0: -1780, x1: -2490, z1: -1710 }, // across the avenue north of the crossing
  { id: 'galW', x0: -2980, z0: -1710, x1: -2910, z1: -1180 }, // down the base square's east edge
];

/** The high level: the landing at the top of the west ramp and the SKY BRIDGE (walkable tops at HIGH_H). */
export const HIGH_DECKS: readonly { id: string; x0: number; z0: number; x1: number; z1: number }[] = [
  { id: 'landW', x0: -2985, z0: -900, x1: -2910, z1: -730 },
  { id: 'bridge', x0: -2910, z0: -800, x1: -2420, z1: -730 },
];

/** Stairs: hLow → hHigh, rising toward `dir` along `axis`. */
export const SHINJUKU_STAIRS: readonly { id: string; x0: number; z0: number; x1: number; z1: number; axis: 'x' | 'z'; dir: 1 | -1; hLow: number; hHigh: number }[] = [
  { id: 'north', x0: -2490, z0: -2270, x1: -2420, z1: -1990, axis: 'z', dir: 1, hLow: 0, hHigh: DECK_H }, // from the street by the walk-up
  { id: 'garden', x0: -2490, z0: -700, x1: -2420, z1: -420, axis: 'z', dir: -1, hLow: 0, hHigh: DECK_H }, // from the garden, by the point
  { id: 'yasukuni', x0: -2420, z0: -1625, x1: -2140, z1: -1555, axis: 'x', dir: -1, hLow: 0, hHigh: DECK_H }, // where the footbridge's stair was
  { id: 'lanes', x0: -3260, z0: -1780, x1: -2980, z1: -1710, axis: 'x', dir: 1, hLow: 0, hHigh: DECK_H }, // from the NIGHT LANES gate
  { id: 'upE', x0: -2420, z0: -1070, x1: -2330, z1: -800, axis: 'z', dir: 1, hLow: DECK_H, hHigh: HIGH_H }, // DECK 2 → T2's roof
  { id: 'upW', x0: -2980, z0: -1180, x1: -2910, z1: -900, axis: 'z', dir: 1, hLow: DECK_H, hHigh: HIGH_H }, // DECK 2 → the west landing
];

/** Columns under DECK 2 (pavements and the square, never a traffic lane). */
export const DECK_LEGS: readonly [number, number][] = [
  // galE: against the towers' walls, out of the way of people on the pavement.
  [-2432, -1960], [-2432, -1745], [-2455, -1575], [-2455, -1125], [-2432, -1040], [-2432, -730],
  // galW: on its west edge (people coming out of the square turn north along the kerb side).
  [-2968, -1745], [-2968, -1500], [-2968, -1220],
];

/** NIGHT LANES gate at the lanes' south mouth (two posts and a sign across). */
export const LANES_GATE = { z: -1800, x0: -3412, x1: -3312, top: 210, sign: [150, 200] as const };

/**
 * PILLAR VISION: a vertical LED column wrapped round T1's south-west corner, facing the crossing
 * (south over 靖国通り and west over the avenue). It starts above DECK 2's railing.
 */
export const PILLAR = { x: -2420, z: -1630, w: 64, y0: 180, y1: 560 };

/** Street lamps in the rebuilt area (gameplay lamps). */
export const SHINJUKU_LAMPS: readonly { x: number; z: number; ang: number; wall?: boolean }[] = [
  // The avenue, both pavements.
  { x: -2905, z: -1880, ang: 0 }, { x: -2495, z: -1880, ang: Math.PI },
  { x: -2905, z: -1040, ang: 0 }, { x: -2495, z: -1180, ang: Math.PI },
  { x: -2905, z: -700, ang: 0 },
  // The base square, by the tracks.
  { x: -3360, z: -1500, ang: 0 }, { x: -3350, z: -1000, ang: 0 },
  // NIGHT LANES: one wall lamp at the gate; the lanes beyond stay dark for the rules (hiding).
  { x: -3300, z: -1806, ang: -Math.PI / 2, wall: true },
];

/** Shinjuku's light colours: white, cold cyan, violet, crimson (≥ 24° from every faction hue; see tests). */
export const SHINJUKU_LIGHTS = [0xf2f6ff, 0x6ef2f0, 0x9a7bff, 0xff3b5c] as const;
