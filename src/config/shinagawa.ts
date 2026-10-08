/**
 * MAP REFORGE parallel C — 品川 FUTURE GATEWAY.
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). Before this, the west side of the tracks
 * between 高輪ゲートウェイ and 品川 was mostly empty ground: a few houses, a walk-up building
 * standing 51 units from the strategic point, and the STAR base. It is rebuilt as the new Tokyo:
 * glass and white architecture, wide walks and long straight lines, read at speed.
 *
 * - A. GATEWAY BOULEVARD: one long east–west straight (≈ 60 m) from the city street in the west,
 *   through GATEWAY ARCH, onto the LIGHT PLATFORM by the station. The fastest way, and seen
 *   from everywhere (the deck, the tower lobbies, the plaza).
 * - B. TRANSIT DECK (TRANSIT SPINE): a mid-level walkway along the boulevard's north side, over a
 *   colonnade. Runs beside the boulevard the whole way (deck and street chase each other) and
 *   passes under the arch too. Safe, but only three ways off: two stairs down to the north
 *   frontage and the grand stair onto the plaza.
 * - C. SERVICE CORRIDOR: behind the south row, past loading bays and plant, in two offset
 *   sections joined by service cuts; both cuts lead back onto the boulevard, and the east end
 *   comes out along the STAR base onto the plaza.
 *
 * The strategic point (品川駅前, (142, 4451) by the tracks), the STAR base and the LOCK POINT
 * do not move; nothing is built within the point's capture radius or on the base square.
 * Coordinates are world units (26 per metre); x east, z south.
 */

export type ShinagawaSide = 'n' | 's' | 'e' | 'w';

/** A hand-placed building. */
export interface ShinagawaBuilding {
  id: string;
  x0: number; z0: number; x1: number; z1: number;
  floors: number;
  /** Sides that face the boulevard, the plaza, the deck or a walk (lobbies, wayfinding). The first is the main front. */
  fronts: ShinagawaSide[];
  /** Façade: blue-grey curtain glass, white panel and fin, or a light concrete service building. */
  skin: 'glass' | 'white' | 'service';
  /** Back wall on the service corridor (loading bays, plant, ducts). */
  service?: ShinagawaSide;
  /** Set back above the podium (towers): the shaft above `podium` storeys is inset by this much. */
  setback?: number;
  podium?: number;
}

/** The rebuilt area (generated city pieces whose centre is inside are removed). */
export const SHINAGAWA_ZONE = { x0: -1640, z0: 3940, x1: 700, z1: 5060 } as const;

/** The strategic point as the game finds it (the nearest walkable spot to SECTORS[8].pointNear). */
export const GATEWAY_POINT = { x: 142, z: 4451 } as const;

/** A. GATEWAY BOULEVARD: the carriageway and its two raised walks (the north walk runs under the deck). */
export const BOULEVARD = { x0: -1640, x1: -570, z0: 4200, z1: 4640, road0: 4380, road1: 4580 } as const;

/** B. TRANSIT DECK height (≈ 5.8 m: clear of buses, the same family as Shibuya's ring) and the deck. */
export const DECK_H = 150;
export const TRANSIT_DECK = { x0: -1600, x1: -420, z0: 4200, z1: 4320 } as const;
/** The only ways off the deck. */
export const DECK_STAIRS: readonly { id: string; x0: number; z0: number; x1: number; z1: number; axis: 'x' | 'z'; dir: 1 | -1; low: number }[] = [
  { id: 'west', x0: -1600, z0: 3920, x1: -1500, z1: 4200, axis: 'z', dir: 1, low: 4 }, // down to the north frontage (west end)
  { id: 'forum', x0: -800, z0: 3920, x1: -700, z1: 4200, axis: 'z', dir: 1, low: 4 }, // beside GLASS FORUM, down to the north frontage
  { id: 'grand', x0: -420, z0: 4200, x1: -140, z1: 4320, axis: 'x', dir: -1, low: 0 }, // the grand stair onto the LIGHT PLATFORM
];
/** Columns of the colonnade under the deck (against the building line, a few on the kerb side). */
export const DECK_LEGS: readonly [number, number][] = [
  [-1560, 4212], [-1320, 4212], [-1080, 4212], [-840, 4212], [-620, 4212],
  [-1440, 4308], [-1140, 4308], [-840, 4308], [-600, 4308],
];

/**
 * GATEWAY ARCH: a white portal over the deck and the boulevard (two piers and a lintel). Its
 * lintel (≈ 13 m) sits low enough to fill the chase camera's view as you run at it.
 */
export const ARCH = { x0: -570, x1: -470, pierN: { z0: 4100, z1: 4200 }, pierS: { z0: 4640, z1: 4720 }, lintel0: 330, top: 420 } as const;

/** GLASS FORUM: a public glass hall you can run straight through (north and south doors, a west door). */
export const FORUM = { x0: -1130, z0: 3970, x1: -800, z1: 4200, h: 330, doorN: { at: -965, w: 180 }, doorS: { at: -965, w: 180 }, doorW: { at: 4085, w: 120 } } as const;

/** C. SERVICE CORRIDOR: west section, service cut A, middle section, service cut B, the east leg along the base. */
export const SERVICE: readonly { id: string; x0: number; z0: number; x1: number; z1: number }[] = [
  { id: 'west', x0: -1640, z0: 4900, x1: -1320, z1: 5000 },
  { id: 'cutA', x0: -1320, z0: 4640, x1: -1200, z1: 5060 },
  { id: 'mid', x0: -1200, z0: 4800, x1: -960, z1: 4900 },
  { id: 'cutB', x0: -960, z0: 4640, x1: -860, z1: 5060 },
  { id: 'east', x0: -860, z0: 4830, x1: -470, z1: 4890 },
];

/** LIGHT PLATFORM: the station square east of the arch (ground level, the strategic point inside). */
export const PLATFORM = { x0: -470, z0: 4140, x1: 330, z1: 4880 } as const;
/** The fast lane across the platform, from the arch to the point: marked on the floor, never furnished. */
export const PLATFORM_LANE = { z0: 4400, z1: 4560 } as const;
/** The station canopy over the plaza's south side. */
export const CANOPY = { x0: -380, x1: -80, z0: 4560, z1: 4800, y: 300, cols: [[-370, 4570], [-230, 4570], [-90, 4570], [-370, 4790], [-230, 4790], [-90, 4790]] as [number, number][] } as const;

export const SHINAGAWA_BUILDINGS: readonly ShinagawaBuilding[] = [
  // North row (towers over the deck), west to east.
  { id: 'N1', x0: -1490, z0: 3990, x1: -1230, z1: 4200, floors: 24, fronts: ['s', 'n', 'e'], skin: 'glass', setback: 20, podium: 3 },
  { id: 'N3', x0: -440, z0: 3990, x1: -180, z1: 4200, floors: 30, fronts: ['s', 'e', 'n'], skin: 'white', setback: 24, podium: 3 },
  { id: 'HALL', x0: -80, z0: 3990, x1: 140, z1: 4140, floors: 2, fronts: ['s', 'w', 'n'], skin: 'glass' }, // the station entrance hall
  // South row (on the boulevard), the service buildings behind it.
  { id: 'SA', x0: -1600, z0: 4660, x1: -1320, z1: 4900, floors: 14, fronts: ['n', 'e', 'w'], skin: 'white', service: 's', setback: 16, podium: 3 },
  { id: 'SB', x0: -1200, z0: 4660, x1: -960, z1: 4800, floors: 3, fronts: ['n', 'w', 'e'], skin: 'glass', service: 's' },
  { id: 'SC', x0: -860, z0: 4660, x1: -570, z1: 4830, floors: 4, fronts: ['n', 'w'], skin: 'glass', service: 's' },
  { id: 'LX', x0: -1200, z0: 4900, x1: -960, z1: 5050, floors: 2, fronts: ['n', 'w'], skin: 'service', service: 'n' },
  { id: 'SH', x0: -1600, z0: 5000, x1: -1320, z1: 5050, floors: 1, fronts: ['n'], skin: 'service', service: 'n' },
];

/** Low solid things in the open spaces (scale for the wide walks; never on the route's centre line). */
export interface ShinagawaProp { kind: 'bench' | 'planter' | 'totem' | 'vent' | 'plant'; x: number; z: number; ang?: number }
export const SHINAGAWA_PROPS: readonly ShinagawaProp[] = [
  // Boulevard south walk: benches between the trees (against the building line; the two cut mouths stay clear).
  { kind: 'bench', x: -1460, z: 4618 }, { kind: 'bench', x: -1080, z: 4618 }, { kind: 'bench', x: -700, z: 4618 },
  // Wayfinding totems at the cuts and the deck stairs.
  { kind: 'totem', x: -1330, z: 4652, ang: 0 }, { kind: 'totem', x: -975, z: 4648, ang: 0 }, { kind: 'totem', x: -1475, z: 3960, ang: 0 },
  { kind: 'totem', x: -680, z: 3960, ang: 0 }, { kind: 'totem', x: -130, z: 4340, ang: Math.PI / 2 },
  // LIGHT PLATFORM: planters and benches round the edge, a vent shaft, low plant by the tracks.
  { kind: 'bench', x: -330, z: 4690, ang: Math.PI / 2 }, { kind: 'bench', x: -150, z: 4690, ang: Math.PI / 2 },
  { kind: 'planter', x: -250, z: 4362 }, { kind: 'planter', x: -30, z: 4200 }, { kind: 'bench', x: 120, z: 4220 },
  { kind: 'vent', x: 220, z: 4140 },
  // ... and round the canopy and the edges of the fast lane (the lane z 4400–4560 itself stays empty).
  { kind: 'bench', x: -360, z: 4366 }, { kind: 'bench', x: -300, z: 4790 }, { kind: 'bench', x: -160, z: 4790 },
  { kind: 'planter', x: -50, z: 4660 },
  { kind: 'totem', x: -440, z: 4385, ang: 0 }, { kind: 'totem', x: -200, z: 4600, ang: 0 }, { kind: 'totem', x: 40, z: 4580, ang: 0 },
  // North frontage (on the avenue): benches by the forum door.
  { kind: 'bench', x: -1100, z: 3954 }, { kind: 'bench', x: -850, z: 3954 },
  // Service corridor: plant against the walls (the walk stays ≥ 90 wide).
  { kind: 'plant', x: -1560, z: 4990 }, { kind: 'plant', x: -1420, z: 4990 }, { kind: 'plant', x: -1150, z: 4810 },
  { kind: 'plant', x: -1030, z: 4890 }, { kind: 'plant', x: -760, z: 4840 },
];
/** Footprints of the props (w along x when ang = 0, d along z) and heights. */
export const PROP_SIZE: Record<ShinagawaProp['kind'], { w: number; d: number; h: number }> = {
  bench: { w: 90, d: 22, h: 20 },
  planter: { w: 70, d: 70, h: 26 },
  totem: { w: 30, d: 10, h: 120 },
  vent: { w: 60, d: 60, h: 70 },
  plant: { w: 50, d: 18, h: 60 },
};

/** Street trees: the boulevard's south walk, the plaza and the forum hall. */
export const SHINAGAWA_TREES: readonly [number, number][] = [
  [-1560, 4618], [-1360, 4618], [-1160, 4618], [-1000, 4618], [-800, 4618],
  [-440, 4760], [-300, 4880], [-120, 4860], [80, 4300],
  [-1080, 4060], [-850, 4120],
];

/** Gameplay lamps (their pools light people at night): boulevard, corridor (wall lamps), plaza, deck stairs. */
export const SHINAGAWA_LAMPS: readonly { x: number; z: number; ang: number; wall?: boolean }[] = [
  { x: -1500, z: 4600, ang: -Math.PI / 2 }, { x: -1210, z: 4600, ang: -Math.PI / 2 }, { x: -920, z: 4600, ang: -Math.PI / 2 }, { x: -640, z: 4600, ang: -Math.PI / 2 },
  { x: -1380, z: 4206, ang: Math.PI / 2, wall: true }, { x: -1100, z: 4206, ang: Math.PI / 2, wall: true },
  { x: -1460, z: 4906, ang: Math.PI / 2, wall: true }, { x: -1080, z: 4806, ang: Math.PI / 2, wall: true }, { x: -700, z: 4836, ang: Math.PI / 2, wall: true },
  { x: -1206, z: 4960, ang: Math.PI, wall: true },
  { x: -300, z: 4340, ang: 0 }, { x: -40, z: 4700, ang: Math.PI }, { x: 10, z: 4280, ang: Math.PI }, { x: -360, z: 4900, ang: 0 },
];

/**
 * 品川's light colours: white, blue-white, glass blue, a little warm white. The saturated ones
 * keep 24° of hue away from every faction colour (LUNA's sky blue in particular; see tests).
 */
export const SHINAGAWA_LIGHTS = [0xf2f6ff, 0xd6e8ff, 0x6ff0e6, 0xffe6c8] as const;
