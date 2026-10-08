/**
 * MAP REFORGE — 池袋 ROOFTOP NETWORK.
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). Shinjuku climbs; Ikebukuro walks across:
 * a district of 2–5 storey buildings whose roofs are joined by narrow bridges and stairs, so the
 * chase runs sideways over the rooftops rather than up a tower.
 *
 * - STATION SIDE (north of the 5号線 avenue): the station square keeps the strategic point
 *   (池袋駅前広場, ~(-2258, -5349)) open. On its south-east corner stands SKY SERVICE, a 3F
 *   building with a big plant room on the roof and a fire escape down to the square; from its
 *   roof the SKY LINK, a narrow footbridge, crosses over the avenue and the expressway ramp.
 * - ROOFTOP NETWORK (the block south of the avenue): two rows of narrow 3F buildings either side
 *   of a back lane. Their roofs are joined into a ring (ROOFTOP LOOP) by a bridge over the lane
 *   and bridges over the cross alley; the NETWORK HUB, a platform over the lane at the alley
 *   crossing, joins both rows in the middle (so there are two ways across, and losing one
 *   leaves the other). SIGNAL GARDEN is the south-west roof (antennas, plant and planters).
 * - STREET LOOP: the four streets round that block (the avenue under the bridge, the side
 *   street, the lane-sized road to the south and 明治通り): fast and open, seen from every roof.
 * - BACKSTAIR CUT: four scissor fire escapes from the ground to the roofs (明治通り's outdoor
 *   stair, the side street's, the back lane's up to the hub, the square's up SKY SERVICE).
 *   Flights are no steeper than a character can climb (≈ 0.49).
 *
 * Nowhere to fall to and nowhere to get stuck: every roof edge without a bridge or stair has a
 * fence, and every roof has at least two ways off (tested). Coordinates are world units (26 per metre);
 * x east, z south.
 */

export type IkbSide = 'n' | 's' | 'e' | 'w';

/** Storey heights (same as map.ts: 4.2 m ground floor, 3.3 m above). */
const GF = Math.round(4.2 * 26), ST = Math.round(3.3 * 26);
export const ikbHeight = (floors: number) => GF + (floors - 1) * ST;
/** Roof level of the network (3F). */
export const R3 = ikbHeight(3);

/** Rebuilt areas (generated city pieces whose centre is inside are removed; tests hash everything outside). */
export const IKB_ZONES: readonly { id: string; x0: number; z0: number; x1: number; z1: number }[] = [
  { id: 'station', x0: -2640, z0: -5700, x1: -1100, z1: -5012 }, // north of the avenue, from 明治通り to the alley at x -1040
  { id: 'network', x0: -2510, z0: -4632, x1: -1894, z1: -4015 }, // the block south of the avenue
  { id: 'link', x0: -2075, z0: -5012, x1: -2009, z1: -4632 }, // the SKY LINK's span over the avenue
  { id: 'skyline', x0: -1850, z0: -6180, x1: -1450, z1: -5780 }, // beyond the tracks: where the 60-storey tower now stands
];
export const inIkebukuro = (x: number, z: number) => IKB_ZONES.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

/** The strategic point's square (kept clear: nothing solid within 150 of the point). */
export const IKB_SQUARE = { x: -2258, z: -5349, r: 150 };

/** A hand-placed building. `walk`: its roof is part of the network (fenced, reachable). */
export interface IkbBuilding {
  id: string;
  x0: number; z0: number; x1: number; z1: number;
  floors: number;
  walk: boolean;
  /** Sides that face a street or the square (shopfronts, signs). The first is the main front. */
  fronts: IkbSide[];
  /** Façade character. */
  skin: 'tile' | 'concrete' | 'panel' | 'brick' | 'dark';
  /** Side with service doors, pipes and air-con units (a lane or a back). */
  service?: IkbSide;
  role?: 'skyService' | 'signalGarden';
}

export const IKB_BUILDINGS: readonly IkbBuilding[] = [
  // Station side: SKY SERVICE and a low row round the square; mid-rise backdrop to the east.
  { id: 'K', x0: -2080, z0: -5260, x1: -1820, z1: -5050, floors: 3, walk: true, fronts: ['w', 'n'], skin: 'concrete', service: 'n', role: 'skyService' },
  { id: 'P1', x0: -2560, z0: -5230, x1: -2430, z1: -5060, floors: 3, walk: false, fronts: ['e', 'n'], skin: 'tile', service: 's' },
  { id: 'P2', x0: -2430, z0: -5190, x1: -2240, z1: -5060, floors: 2, walk: false, fronts: ['n', 'e'], skin: 'panel', service: 's' },
  { id: 'Q1', x0: -1680, z0: -5450, x1: -1540, z1: -5280, floors: 4, walk: false, fronts: ['w', 's'], skin: 'tile', service: 'n' },
  { id: 'Q2', x0: -1680, z0: -5180, x1: -1540, z1: -5050, floors: 2, walk: false, fronts: ['w', 'n'], skin: 'brick', service: 'e' },
  { id: 'Q3', x0: -1440, z0: -5500, x1: -1320, z1: -5280, floors: 5, walk: false, fronts: ['s', 'w'], skin: 'dark', service: 'n' },
  { id: 'Q4', x0: -1440, z0: -5180, x1: -1320, z1: -5050, floors: 3, walk: false, fronts: ['n', 'w'], skin: 'concrete', service: 'e' },
  { id: 'Q5', x0: -1220, z0: -5540, x1: -1120, z1: -5280, floors: 3, walk: false, fronts: ['s', 'w'], skin: 'panel', service: 'n' },
  { id: 'Q6', x0: -1220, z0: -5180, x1: -1120, z1: -5050, floors: 4, walk: false, fronts: ['n', 'w'], skin: 'tile', service: 'e' },
  // ROOFTOP NETWORK: the west row and the east row (3F) either side of the back lane.
  { id: 'W1', x0: -2370, z0: -4560, x1: -2290, z1: -4430, floors: 3, walk: true, fronts: ['w', 'n'], skin: 'tile', service: 'e' },
  { id: 'W2', x0: -2370, z0: -4430, x1: -2290, z1: -4300, floors: 3, walk: true, fronts: ['w'], skin: 'panel', service: 'e' },
  { id: 'W3', x0: -2370, z0: -4210, x1: -2290, z1: -4040, floors: 3, walk: true, fronts: ['w', 's'], skin: 'concrete', service: 'e', role: 'signalGarden' },
  { id: 'E1', x0: -2080, z0: -4560, x1: -1998, z1: -4420, floors: 3, walk: true, fronts: ['n', 'e'], skin: 'dark', service: 'w' },
  { id: 'E2', x0: -2080, z0: -4420, x1: -1998, z1: -4300, floors: 3, walk: true, fronts: ['e'], skin: 'brick', service: 'w' },
  { id: 'E3', x0: -2080, z0: -4210, x1: -1984, z1: -4040, floors: 3, walk: true, fronts: ['e', 's'], skin: 'tile', service: 'w' },
];

/** The back lane between the rows and the cross alley (ground). */
export const IKB_LANE = { x0: -2290, x1: -2080, z0: -4632, z1: -4015 };
export const IKB_ALLEY = { x0: -2510, x1: -1894, z0: -4300, z1: -4210 };

/** Flat walkable decks (top at `y`, 12 thick): bridges, the hub and stair landings. */
export interface IkbDeck { id: string; x0: number; z0: number; x1: number; z1: number; y: number; kind: 'bridge' | 'hub' | 'landing' }
/** Stairs: `low` → `high` rising toward `dir` along `axis`. Raised ones (low > 0) are open underneath. */
export interface IkbStair {
  id: string; x0: number; z0: number; x1: number; z1: number;
  axis: 'x' | 'z'; dir: 1 | -1; low: number; high: number;
  kind: 'fire' | 'outdoor' | 'roof' | 'bridge';
}

/**
 * A scissor fire escape: four flights stacked in two columns (a, b) with landings at both ends,
 * from the street to a 3F roof. Flights run along `axis` over [s0, s1]; the first starts at
 * ground level at the `start` end in column a. The top landing is at the start end (left out
 * when a deck is already there). Each flight rises 70 over 144 (a character climbs ≤ ~0.54),
 * and stacked flights keep head room (≥ 50) under the one above.
 */
const RISE = R3 / 4, LANDING = 52;
function scissor(
  id: string, axis: 'x' | 'z', s0: number, s1: number, start: 'lo' | 'hi',
  a: [number, number], b: [number, number], kind: IkbStair['kind'], top = true,
): { stairs: IkbStair[]; decks: IkbDeck[] } {
  const stairs: IkbStair[] = [], decks: IkbDeck[] = [];
  const away = start === 'lo' ? 1 : -1; // direction of the first flight
  const c0 = Math.min(a[0], b[0]), c1 = Math.max(a[1], b[1]);
  const rect = (u0: number, u1: number, v0: number, v1: number) => (axis === 'x' ? { x0: u0, x1: u1, z0: v0, z1: v1 } : { x0: v0, x1: v1, z0: u0, z1: u1 });
  const endAt = (atStart: boolean) => ((start === 'lo') === atStart ? [s0 - LANDING, s0] : [s1, s1 + LANDING]) as [number, number];
  for (let k = 0; k < 4; k++) {
    const col = k % 2 ? b : a, dir = (k % 2 ? -away : away) as 1 | -1;
    stairs.push({ id: `${id}.${k + 1}`, ...rect(s0, s1, col[0], col[1]), axis, dir, low: RISE * k, high: RISE * (k + 1), kind });
    const atStart = k % 2 === 1, y = RISE * (k + 1);
    if (k === 3 && !top) continue;
    const [u0, u1] = endAt(atStart);
    decks.push({ id: `${id}.l${k + 1}`, ...rect(u0, u1, c0, c1), y, kind: 'landing' });
  }
  return { stairs, decks };
}

// BACKSTAIR CUT: four fire escapes from the ground to the roofs.
/** SKY SERVICE's, from the station square up its north wall (flights eastward from the square side). */
const FE_K = scissor('feK', 'x', -2011, -1867, 'lo', [-5364, -5312], [-5312, -5260], 'fire');
/** The side street's, up the east row's back (from the alley mouth northward; top onto E2). */
const FE_E = scissor('feE', 'z', -4500, -4356, 'hi', [-1946, -1894], [-1998, -1946], 'fire');
/** 明治通り's outdoor stair up the west row (from the avenue corner southward; top onto W1). */
const FE_W = scissor('avenue', 'z', -4508, -4364, 'lo', [-2474, -2422], [-2422, -2370], 'outdoor');
/** The back lane's, against the east row's wall (from under the hub northward; it tops out on the hub). */
const FE_L = scissor('feL', 'z', -4489, -4345, 'hi', [-2132, -2080], [-2184, -2132], 'fire', false);

export const IKB_DECKS: readonly IkbDeck[] = [
  // SKY LINK: SKY SERVICE's roof → over the avenue and the expressway ramp → E1.
  { id: 'link', x0: -2070, z0: -5050, x1: -2014, z1: -4560, y: R3, kind: 'bridge' },
  // NETWORK HUB over the lane at the alley crossing (joins W2, W3, E2, E3 and the lane's fire escape).
  { id: 'hub', x0: -2290, z0: -4345, x1: -2080, z1: -4140, y: R3, kind: 'hub' },
  // The lane bridge (ROOFTOP LOOP's north side): W1 ↔ E1.
  { id: 'laneBridge', x0: -2290, z0: -4560, x1: -2080, z1: -4504, y: R3, kind: 'bridge' },
  // Bridges over the cross alley in each row.
  { id: 'alleyW', x0: -2358, z0: -4300, x1: -2290, z1: -4210, y: R3, kind: 'bridge' },
  { id: 'alleyE', x0: -2080, z0: -4300, x1: -2011, z1: -4210, y: R3, kind: 'bridge' },
  ...FE_K.decks, ...FE_E.decks, ...FE_W.decks, ...FE_L.decks,
];

export const IKB_STAIRS: readonly IkbStair[] = [...FE_K.stairs, ...FE_E.stairs, ...FE_W.stairs, ...FE_L.stairs];

/**
 * Roof plant that hides people (solid, sight-blocking): plant rooms, water tanks on frames, the
 * hub's relay cabinet, antenna bases. `y` is the roof it stands on.
 */
export interface IkbPlant { id: string; x0: number; z0: number; x1: number; z1: number; y: number; h: number; kind: 'room' | 'tank' | 'cabinet' | 'mast' | 'planter' }
export const IKB_PLANT: readonly IkbPlant[] = [
  { id: 'K.room', x0: -1960, z0: -5235, x1: -1850, z1: -5135, y: R3, h: 110, kind: 'room' }, // SKY SERVICE plant room
  { id: 'K.tank', x0: -1900, z0: -5120, x1: -1860, z1: -5080, y: R3, h: 90, kind: 'tank' },
  { id: 'hub.cab', x0: -2230, z0: -4285, x1: -2170, z1: -4225, y: R3, h: 90, kind: 'cabinet' }, // NETWORK HUB relay cabinet
  { id: 'W2.room', x0: -2316, z0: -4420, x1: -2296, z1: -4370, y: R3, h: 80, kind: 'room' },
  { id: 'W3.mast', x0: -2364, z0: -4130, x1: -2344, z1: -4090, y: R3, h: 70, kind: 'mast' }, // SIGNAL GARDEN antenna base
  { id: 'W3.plant', x0: -2316, z0: -4110, x1: -2296, z1: -4060, y: R3, h: 60, kind: 'room' },
  { id: 'W3.bed1', x0: -2364, z0: -4190, x1: -2344, z1: -4160, y: R3, h: 26, kind: 'planter' },
  { id: 'W3.bed2', x0: -2316, z0: -4170, x1: -2300, z1: -4130, y: R3, h: 26, kind: 'planter' },
  { id: 'E3.cab', x0: -2014, z0: -4140, x1: -1990, z1: -4090, y: R3, h: 55, kind: 'cabinet' },
];

/** Street lamps added in the rebuilt areas (gameplay lamps: their pools light people at night). */
export const IKB_LAMPS: readonly { x: number; z: number; ang: number; wall?: boolean }[] = [
  // The station square, round its edge (clear of the point).
  { x: -2470, z: -5300, ang: 0 }, { x: -2090, z: -5420, ang: Math.PI }, { x: -2160, z: -5170, ang: -Math.PI / 2 },
  // STREET LOOP round the network block: 明治通り side, the avenue side, the side street, the south road.
  { x: -2496, z: -4600, ang: Math.PI }, { x: -2496, z: -4120, ang: Math.PI },
  { x: -2250, z: -4618, ang: Math.PI / 2 }, { x: -1990, z: -4618, ang: Math.PI / 2 },
  { x: -1912, z: -4600, ang: 0 }, { x: -1912, z: -4130, ang: 0 },
  { x: -2380, z: -4026, ang: -Math.PI / 2 }, { x: -2030, z: -4026, ang: -Math.PI / 2 },
  // The back lane: one wall lamp under the hub (the rest stays dark for the rules; screen light keeps it readable).
  { x: -2286, z: -4380, ang: 0, wall: true },
];

/** Named spots (tests, screenshots, the run). */
export const IKB_SPOTS = {
  square: { x: -2258, y: 0, z: -5349 },
  skyServiceRoof: { x: -1920, y: R3, z: -5080 },
  linkMid: { x: -2042, y: R3, z: -4820 },
  hub: { x: -2150, y: R3, z: -4190 },
  w1: { x: -2330, y: R3, z: -4500 },
  w2: { x: -2330, y: R3, z: -4330 },
  signalGarden: { x: -2330, y: R3, z: -4145 },
  e1: { x: -2039, y: R3, z: -4440 },
  e3: { x: -2032, y: R3, z: -4080 },
  lane: { x: -2240, y: 4, z: -4400 },
  alley: { x: -2470, y: 4, z: -4255 },
  loopAvenue: { x: -2250, y: 4, z: -4650 },
  loopStreet: { x: -1780, y: 0, z: -4300 },
  loopSouth: { x: -2200, y: 0, z: -3955 },
};
