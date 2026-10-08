/**
 * MAP REFORGE (parallel A) — 上野 GREEN HEIGHTS.
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). Shibuya is the maze, Shinjuku goes up and
 * down, Akihabara is shortcuts; Ueno is wide views, natural ground and height. Nowhere to hide
 * for long: you see the enemy from far off, and the choice is which of the trees, slopes, stone
 * steps and high ground to use to get away. Three ways from the square in front of LUNA's base
 * to the strategic point on top of the hill:
 *
 * - A. GRAND PROMENADE: a broad, straight walk north along the foot of the hill's west cliff,
 *   with the WEST RAMP climbing onto the plateau. The fastest way, lit at night, and watched
 *   along its whole length from the plateau's edge.
 * - B. GROVE PATH: a path through big trees, hedges and low stone walls west of the promenade.
 *   Trunks and hedges cut the view every few steps but it never closes into a maze; three gaps in
 *   the hedge open onto the promenade and the old side street comes in from the west.
 * - C. TERRACE ROUTE: the STONE AXIS, a long two-flight stone stair on LUNA's base axis, up to
 *   GREEN TERRACE, a stone terrace over the square, and on across the plateau. Slower (climbing),
 *   but from the terrace you see the whole square and the promenade below.
 *
 * CANOPY WALK runs along the foot of the north cliff under big trees, joining the promenade and
 * the grove to the east lawn; CULTURE GATE frames the axis at the square's south edge; UENO HALL,
 * a low stone culture hall, stands on the plateau's north side. LUNA's base, the LOCK POINT, the
 * strategic point (上野の山), the hill itself and 不忍池 do not move.
 * Coordinates are world units (26 per metre); x east, z south.
 */

export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** The area rebuilt here (generated city pieces whose centre is inside are removed). */
export const UENO_ZONES: readonly Rect[] = [
  // From the grove (east of the side street's last houses) to the railway fence, and from the
  // avenue's south pavement to the edge of LUNA's base.
  { x0: 1885, z0: -4545, x1: 3300, z1: -3320 },
];

/** Inside the rebuilt area. */
export const inUenoZone = (x: number, z: number) => UENO_ZONES.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

/** The hill (上野の山, unchanged: x 2470–3030, z −4369…−3809, top 130). */
export const PLATEAU = { x0: 2470, x1: 3030, z0: -4369, z1: -3809, top: 130 } as const;

/** The base axis: CULTURE GATE, STONE AXIS and GREEN TERRACE line up on it (LUNA's base is at x 2796). */
export const AXIS_X = 2800;

/** GREEN TERRACE: a stone terrace stepping out from the plateau over the square. */
export const GREEN_TERRACE = { x0: 2600, x1: 3000, z0: -3809, z1: -3725, top: 130 } as const;

/** STONE AXIS: two flights (65 each, gradient 0.46) with a landing, 140 wide, rising north. */
export const STONE_AXIS = {
  x0: AXIS_X - 70, x1: AXIS_X + 70,
  upper: { z0: -3725, z1: -3585, h0: 65, h1: 130 },
  landing: { z0: -3585, z1: -3525, h: 65 },
  lower: { z0: -3525, z1: -3385, h0: 0, h1: 65 },
} as const;

/** CULTURE GATE: two stone pillars and a lintel across the axis at the square's south edge. */
export const CULTURE_GATE = { x: AXIS_X, z: -3350, half: 130, h: 250, lintel: 214 } as const;

/** The square (広場) west of the axis, its arm along the pond's north shore, and the lawn east of the axis. */
export const PLAZA: Rect = { x0: 2355, x1: 2730, z0: -3809, z1: -3330 };
export const WEST_ARM: Rect = { x0: 2150, x1: 2355, z0: -3725, z1: -3612 };
export const EAST_PLAZA: Rect = { x0: 2870, x1: 3160, z0: -3725, z1: -3330 };

/** A. GRAND PROMENADE (ground, 200 wide, straight north from the square to the avenue). */
export const PROMENADE: Rect = { x0: 2150, x1: 2350, z0: -4545, z1: -3612 };
/** A's climb: the WEST RAMP against the hill's west cliff (rises north, 0 → 130 over 300), and its landing. */
export const WEST_RAMP: Rect = { x0: 2350, x1: 2470, z0: -4165, z1: -3865 };
export const RAMP_LANDING: Rect = { x0: 2350, x1: 2470, z0: -4369, z1: -4165 };

/** B. GROVE PATH (ground, between the side street's houses and the promenade). */
export const GROVE: Rect = { x0: 1886, x1: 2132, z0: -4545, z1: -3612 };

/** CANOPY WALK: along the foot of the north cliff, from the promenade to the east lawn. */
export const CANOPY_WALK: Rect = { x0: 2150, x1: 3230, z0: -4545, z1: -4369 };
/** The lawn between the hill's east cliff and the railway fence. */
export const EAST_LAWN: Rect = { x0: 3030, x1: 3230, z0: -4369, z1: -3725 };

/** UENO HALL: a low stone culture hall on the plateau's north side (clear of the point). */
export const UENO_HALL = { x0: 2560, x1: 2740, z0: -4365, z1: -4265, h: 200 } as const;

/** Hedges between the grove and the promenade (46 high): the gaps between them are the ways across. */
export const HEDGES: readonly Rect[] = [
  { x0: 2132, z0: -3760, x1: 2150, z1: -3680 },
  { x0: 2132, z0: -4010, x1: 2150, z1: -3860 },
  { x0: 2132, z0: -4280, x1: 2150, z1: -4120 },
  { x0: 2132, z0: -4545, x1: 2150, z1: -4400 },
];
export const HEDGE_H = 46;

/** Low stone walls in the grove (44 high: they hide someone crouched behind, not someone standing on the hill). */
export const GROVE_WALLS: readonly Rect[] = [
  { x0: 1886, z0: -3828, x1: 2010, z1: -3812 },
  { x0: 2020, z0: -4208, x1: 2132, z1: -4192 },
  { x0: 1886, z0: -4428, x1: 2010, z1: -4412 },
];
export const WALL_H = 44;

/** The wisteria trellis in the grove (posts, and a slatted roof people walk under). */
export const TRELLIS: Rect & { h: number } = { x0: 1940, z0: -4010, x1: 2060, z1: -3910, h: 112 };

export type TreeKind = 'grove' | 'canopy' | 'park';
/** Big trees: a solid trunk (24 wide, ≈0.9 m: enough to hide behind for a moment) and a high crown. */
export interface UenoTree { x: number; z: number; kind: TreeKind; /** Standing on the plateau. */ high?: boolean }
export const TRUNK = 24;
export const TRUNK_H = 200;
export const UENO_TREES: readonly UenoTree[] = [
  // GROVE PATH
  { x: 1960, z: -3680, kind: 'grove' }, { x: 2060, z: -3700, kind: 'grove' },
  { x: 1950, z: -4100, kind: 'grove' }, { x: 2060, z: -4110, kind: 'grove' },
  { x: 1975, z: -4310, kind: 'grove' },
  { x: 1960, z: -4510, kind: 'grove' }, { x: 2060, z: -4490, kind: 'grove' },
  // CANOPY WALK (north side; the avenue's own trees stand behind them)
  { x: 2500, z: -4500, kind: 'canopy' }, { x: 2660, z: -4500, kind: 'canopy' }, { x: 2820, z: -4500, kind: 'canopy' },
  { x: 2980, z: -4500, kind: 'canopy' }, { x: 3140, z: -4500, kind: 'canopy' },
  // On the plateau: its north rim (crowns over CANOPY WALK) and its corners
  { x: 2820, z: -4320, kind: 'canopy', high: true }, { x: 2980, z: -4320, kind: 'canopy', high: true },
  { x: 2545, z: -4100, kind: 'park', high: true }, { x: 2520, z: -3880, kind: 'park', high: true },
  { x: 2985, z: -3960, kind: 'park', high: true },
  // The square, the east lawn and the pocket under the terrace
  { x: 2520, z: -3730, kind: 'park' }, { x: 2440, z: -3420, kind: 'park' },
  { x: 2990, z: -3650, kind: 'park' }, { x: 3060, z: -3420, kind: 'park' },
  { x: 3150, z: -3950, kind: 'park' }, { x: 3160, z: -4200, kind: 'park' },
];

/** Park lamps (warm). In the night rules a lamp lights a pool round it, so the promenade and the square are lit and the grove is dark. */
export const UENO_LAMPS: readonly { x: number; z: number; ang: number }[] = [
  // GRAND PROMENADE: one side only (the east), so their light stops short of the grove.
  { x: 2338, z: -3700, ang: Math.PI }, { x: 2338, z: -3940, ang: Math.PI }, { x: 2338, z: -4180, ang: Math.PI }, { x: 2338, z: -4420, ang: Math.PI },
  // The square, the axis and the lawn east of it
  { x: 2370, z: -3480, ang: 0 }, { x: 2716, z: -3470, ang: Math.PI }, { x: 2560, z: -3795, ang: Math.PI / 2 },
  { x: 3080, z: -3480, ang: Math.PI }, { x: 2884, z: -3700, ang: 0 },
  // CANOPY WALK and the east lawn
  { x: 2620, z: -4385, ang: -Math.PI / 2 }, { x: 3020, z: -4385, ang: -Math.PI / 2 }, { x: 3044, z: -4060, ang: 0 },
];

/** Ueno's light colours: warm lamp light, white, a little leaf green (never a faction hue; see tests). */
export const UENO_LIGHTS = [0xffe4bc, 0xfff6ea, 0x9ccf86] as const;

/** The three routes (for the plan and the tests): polylines on the ground or the plateau. */
export const ROUTES = {
  promenade: [[2700, -3340], [2450, -3650], [2250, -3680], [2250, -3830], [2410, -3830], [2410, -4250], [2600, -4180], [2750, -4089]],
  grove: [[2700, -3340], [2450, -3650], [2250, -3646], [2080, -3646], [2040, -3760], [2075, -3870], [1960, -3880], [1990, -3990], [2095, -4065], [2250, -4065], [2300, -3880], [2410, -3880], [2410, -4250], [2600, -4180], [2750, -4089]],
  terrace: [[2800, -3340], [2800, -3385], [2800, -3725], [2800, -3790], [2750, -4089]],
} as const;
