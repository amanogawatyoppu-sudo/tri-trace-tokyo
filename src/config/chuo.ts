/**
 * MAP REFORGE parallel F — 中央 CONTROL CORE.
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). Before this, 日比谷 was open ground round
 * the red-and-white radio mast (管制塔), two 霞が関 ministry blocks and a few generated houses:
 * the most contested sector of the map was a large empty field. It is rebuilt as a controlled,
 * geometric facility: straight lines, a grid, pillars, low plant and frames, symmetrical about
 * the east–west line through the core (z = 710). Not a maze: three clear routes meet at the core.
 *
 * - CONTROL CORE: the 管制塔 itself (TOWER, which the rules use, does not move): a mid-rise
 *   control unit on the same 60 × 60 footprint as the old mast, under a raised square frame on
 *   four columns. The ground round it (the tower zone, r 80) stays open and level.
 * - A. CORE AXIS: the main road from the west (霞が関) straight through WEST GATE and across CORE
 *   PLAZA to the core. Fastest, wide open, lined by SIGNAL PYLONS and lit: dangerous.
 * - B. RING ROUTE: a lane all the way round the facility, between the CONTROL RING (the low band
 *   of control buildings round the plaza) and the outer annexes; on the east it runs behind the
 *   core, between the core's glass back wall and DATA WALL by the tracks. A long way round, but it
 *   reaches every side: see who comes in at one gate and be at the other first.
 * - C. CONTROL PASSAGE: two halls (north and south, mirrored) flanking the core. You come off the
 *   ring straight into a covered hall and weave between pillars and equipment racks; the racks
 *   cut the view for a moment, and the hall lets you out right beside the core.
 *
 * The strategic point (日比谷公園, (1142, 851)) and the tower stay where they were, on open
 * ground; there are no bases or LOCK POINTs in this sector. Coordinates are world units
 * (26 per metre); x east, z south.
 */

export interface ChuoRect { x0: number; z0: number; x1: number; z1: number }

/** The rebuilt area (generated city pieces whose centre is inside are removed). */
export const CHUO_ZONE = { x0: 700, z0: 160, x1: 2060, z1: 1260 } as const;

/** The CONTROL CORE stands on the 管制塔 (TOWER in map.ts: the rules and the AI use it). */
export const CORE = { x: 1479, z: 710 } as const;
/** The tower zone the rules use (TOWER.r): open, level ground round the core unit. */
export const CORE_ZONE_R = 80;
/** The control unit (same footprint as the old mast), its height, and the frame over it. */
export const CORE_UNIT = { half: 30, h: 340 } as const;
export const CORE_FRAME = { half: 100, col: 24, y0: 292, y1: 330 } as const;

/** The strategic point as the game finds it (the nearest walkable spot to SECTORS[6].pointNear). */
export const CONTROL_POINT = { x: 1142, z: 851 } as const;

/** A. CORE AXIS: from the west edge of the facility to the tower zone. */
export const AXIS = { x0: 700, x1: CORE.x - CORE_ZONE_R, z0: 630, z1: 790 } as const;

/** CORE PLAZA (the paved floor inside the CONTROL RING; the east part is the core court between the halls). */
export const PLAZA = { x0: 1000, z0: 500, x1: 1600, z1: 920 } as const;
export const CORE_COURT = { x0: 1390, z0: 590, x1: 1600, z1: 830 } as const;

/** B. RING ROUTE: the outer edge of the lane (120 wide) round the CONTROL RING. */
export const RING = { x0: 820, z0: 300, x1: 1750, z1: 1120, w: 120 } as const;
/** The ring's four sides (lane rectangles; the east side runs behind the core). */
export const RING_LANES: readonly (ChuoRect & { id: 'n' | 's' | 'w' | 'e' })[] = [
  { id: 'n', x0: RING.x0, z0: RING.z0, x1: RING.x1, z1: RING.z0 + RING.w },
  { id: 's', x0: RING.x0, z0: RING.z1 - RING.w, x1: 1600, z1: RING.z1 },
  { id: 'w', x0: RING.x0, z0: RING.z0, x1: RING.x0 + RING.w, z1: RING.z1 },
  { id: 'e', x0: 1630, z0: RING.z0, x1: RING.x1, z1: 940 },
];

/** Gates through the CONTROL RING (open, framed overhead). */
export const GATES: readonly (ChuoRect & { id: 'west' | 'north' | 'south' })[] = [
  { id: 'west', x0: 940, z0: AXIS.z0, x1: 1000, z1: AXIS.z1 },
  { id: 'north', x0: 1080, z0: 420, x1: 1240, z1: 500 },
  { id: 'south', x0: 1080, z0: 920, x1: 1240, z1: 1000 },
];
/** Height of the gate frames' lintels (well over heads) and of the CONTROL RING blocks. */
export const GATE_LINTEL = 230;
export const RING_H = 110;

/** CONTROL RING: the low band of control buildings round the plaza (solid; the halls complete it on the east). */
export const RING_BLOCKS: readonly (ChuoRect & { id: string })[] = [
  { id: 'nw', x0: 940, z0: 420, x1: 1000, z1: AXIS.z0 },
  { id: 'n1', x0: 1000, z0: 420, x1: 1080, z1: 500 },
  { id: 'n2', x0: 1240, z0: 420, x1: 1330, z1: 500 },
  { id: 'sw', x0: 940, z0: AXIS.z1, x1: 1000, z1: 1000 },
  { id: 's1', x0: 1000, z0: 920, x1: 1080, z1: 1000 },
  { id: 's2', x0: 1240, z0: 920, x1: 1330, z1: 1000 },
];

/**
 * C. CONTROL PASSAGE: two covered halls flanking the core court. Walls on the west and east,
 * open to the ring on the outer side (and the outer-east corner, cut back for the ring), open
 * to the core court on the inner side; the west wall stops short of the court, leaving a side
 * door to the plaza (so nobody snags between it and the core frame's column). Inside, two equipment racks that overlap across the
 * hall force a short weave (in down the east lane, out up the west one; ≥ 110 clear at each,
 * wider than Akihabara's lanes) and cut the line of sight through the hall.
 */
export interface ChuoHall {
  id: 'north' | 'south';
  x0: number; z0: number; x1: number; z1: number;
  /** Side facing the ring (the way in from outside). */
  outer: 'n' | 's';
  /** Walls (solid), racks (solid, chest-high and above), pillars. */
  walls: readonly ChuoRect[];
  racks: readonly ChuoRect[];
  pillars: readonly [number, number][];
}
export const HALL_ROOF = 190;
export const HALL_WALL = 30;
export const RACK_H = 90;
export const PILLAR = 22;
const hall = (id: ChuoHall['id'], s: 1 | -1): ChuoHall => {
  // Laid out for the north hall; the south one is its mirror about z = 710.
  const m = (z: number) => (s < 0 ? z : 1420 - z);
  const r = (x0: number, za: number, x1: number, zb: number): ChuoRect => ({ x0, z0: Math.min(m(za), m(zb)), x1, z1: Math.max(m(za), m(zb)) });
  return {
    id, ...r(1330, 420, 1630, 590), outer: s < 0 ? 'n' : 's',
    walls: [r(1330, 420, 1360, 540), r(1600, 480, 1630, 590)],
    // The first rack closes the west of the mouth, the second the east of the way out; between them a 130-deep cross aisle.
    racks: [r(1360, 420, 1490, 440), r(1470, 570, 1600, 590)],
    // Columns along the walls and one in the middle of the aisle (it cuts the last diagonal view through).
    pillars: [[1375, m(505)], [1480, m(505)], [1585, m(505)]],
  };
};
export const HALLS: readonly ChuoHall[] = [hall('north', -1), hall('south', 1)];
/** The two lanes of the weave (x of their centre lines): in from the ring on the east, out to the core on the west. */
export const HALL_LANES = { in: 1545, out: 1415 } as const;

/** The core's back wall (between the halls): glass between columns, so the ring sees the core and the core sees the ring. */
export const CORE_BACK = { x0: 1600, z0: 590, x1: 1630, z1: 830, h: RING_H } as const;

/** DATA WALL: the long information wall by the tracks (the ring's east side), and the cap that closes the space behind it. */
export const DATA_WALL = { x0: 1750, z0: RING.z0, x1: 1770, z1: 840, h: 280 } as const;
export const DATA_CAP = { x0: 1770, z0: RING.z0, x1: 2020, z1: RING.z0 + 20, h: 200 } as const;

/** Outer annexes (mid-rise control offices) framing the ring; the gaps between them are the ways in. */
export interface ChuoAnnex extends ChuoRect { id: string; floors: number; front: 'n' | 's' | 'e' | 'w' }
export const ANNEXES: readonly ChuoAnnex[] = [
  { id: 'NW', x0: 735, z0: RING.z0, x1: RING.x0, z1: AXIS.z0 - 10, floors: 4, front: 'e' },
  { id: 'SW', x0: 735, z0: AXIS.z1 + 10, x1: RING.x0, z1: RING.z1, floors: 4, front: 'e' },
  { id: 'N1', x0: RING.x0, z0: 180, x1: 1080, z1: RING.z0, floors: 5, front: 's' },
  { id: 'N2', x0: 1240, z0: 180, x1: 1460, z1: RING.z0, floors: 6, front: 's' },
  { id: 'S1', x0: RING.x0, z0: RING.z1, x1: 1080, z1: 1240, floors: 5, front: 'n' },
  { id: 'S2', x0: 1240, z0: RING.z1, x1: 1460, z1: 1240, floors: 6, front: 'n' },
];

/** SIGNAL PYLONS: slim lit columns lining the axis inside the plaza (the core's frame columns continue the line). */
export const PYLON = { w: 20, h: 260 } as const;
export const PYLONS: readonly [number, number][] = [1070, 1190, 1300].flatMap((x) => [[x, 610], [x, 810]] as [number, number][]);

/** Low plant in the plaza: consoles you can see over (chest height, set against the ring so they leave no slot behind), and the raised control terraces (two steps). */
export const CONSOLE_H = 40;
export const CONSOLES: readonly ChuoRect[] = [
  { x0: 1240, z0: 500, x1: 1320, z1: 530 }, { x0: 1240, z0: 890, x1: 1320, z1: 920 },
];
export const TERRACE_STEP = 12;
export const TERRACES: readonly (ChuoRect & { top: ChuoRect })[] = [
  { x0: 1000, z0: 500, x1: 1080, z1: 580, top: { x0: 1000, z0: 500, x1: 1064, z1: 564 } },
  { x0: 1000, z0: 840, x1: 1080, z1: 920, top: { x0: 1000, z0: 856, x1: 1064, z1: 920 } },
];

/** Gameplay lamps (their pools light people at night): the axis is lit, the ring at intervals, the halls dimly. */
export const CHUO_LAMPS: readonly { x: number; z: number; ang: number; wall: true }[] = [
  // Axis pylons (lamps on the pylons, facing the axis) and the core frame.
  { x: 820, z: 600, ang: 0, wall: true }, { x: 820, z: 820, ang: 0, wall: true },
  { x: 1190, z: 610, ang: Math.PI / 2, wall: true }, { x: 1190, z: 810, ang: -Math.PI / 2, wall: true },
  { x: 1379, z: 610, ang: Math.PI / 4, wall: true }, { x: 1579, z: 810, ang: (-3 * Math.PI) / 4, wall: true },
  // Ring: annex fronts on the north and south sides, the west annexes, DATA WALL.
  { x: 950, z: 300, ang: Math.PI / 2, wall: true }, { x: 1350, z: 300, ang: Math.PI / 2, wall: true },
  { x: 950, z: 1120, ang: -Math.PI / 2, wall: true }, { x: 1350, z: 1120, ang: -Math.PI / 2, wall: true },
  { x: 820, z: 450, ang: 0, wall: true }, { x: 820, z: 970, ang: 0, wall: true },
  { x: 1750, z: 450, ang: Math.PI, wall: true }, { x: 1750, z: 720, ang: Math.PI, wall: true },
  // The halls: one lamp each on the west wall.
  { x: 1360, z: 480, ang: 0, wall: true }, { x: 1360, z: 940, ang: 0, wall: true },
];

/**
 * 中央's light colours: white, cold blue-white, a pale cool grey and a little green. LUNA's sky
 * blue is avoided (the blue-white is nearly white; the green keeps 24° of hue from every faction).
 */
export const CHUO_LIGHTS = [0xf4f7ff, 0xdce8ff, 0x7dffb6, 0xc9d3de] as const;
