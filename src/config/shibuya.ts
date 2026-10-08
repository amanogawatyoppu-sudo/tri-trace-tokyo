/**
 * v10 MAP REFORGE — 渋谷 NEON MAZE, the Golden Sector (the quality bar for the other districts).
 *
 * Pure layout data (no imports from map.ts, which applies it after the generated city is laid
 * out, so the rest of Tokyo stays exactly as it was). The centre of Shibuya is rebuilt by hand
 * round the scramble crossing at (-2700, 1899):
 *
 * - MAIN STREET: the avenue (明治通り) runs unbroken north–south through the scramble. Wide,
 *   fast, and seen from everywhere.
 * - BACK ALLEY: a maze of 雑居ビル east of the avenue (narrow lanes that jog so no lane is a
 *   straight sight line) and a lane through the north-east block.
 * - UPPER ROUTE: the SKY RING, an elevated pedestrian ring over the scramble, with a grand stair
 *   down into the station square, a skywalk along the avenue that lands by the back alley, and a
 *   deck that drops into the north-east lane.
 *
 * The station square keeps the strategic point (スクランブル交差点, ~(-3067, 2220)) open.
 * Coordinates are world units (26 per metre); x east, z south.
 */

export type ShibuyaSide = 'n' | 's' | 'e' | 'w';

/** A hand-placed building: footprint, storeys, and which sides face a street or lane. */
export interface ShibuyaBuilding {
  id: string;
  x0: number; z0: number; x1: number; z1: number;
  floors: number;
  /** Sides that face a street, lane or the square (shopfronts, signs). The first is the main front. */
  fronts: ShibuyaSide[];
  /** Façade character for the middle storeys. */
  skin: 'tileA' | 'tileB' | 'concrete' | 'glass' | 'dark';
  /** Big screen on this side (the crossing and square screens). */
  screen?: ShibuyaSide;
  /** Fire escape / pipes side (a lane-facing back wall). */
  service?: ShibuyaSide;
  /** Roof dressing. */
  roof?: 'plant' | 'billboard' | 'crown' | 'terrace';
}

export const SHIBUYA_CROSSING = { x: -2700, z: 1899 };

/** Height of the elevated decks (≈5.4 m: clear of lorries, the same rise as the footbridges). */
export const SKY_H = 140;

/** Ground-level areas rebuilt here (generated city pieces whose centre is inside are removed). */
export const SHIBUYA_ZONES: readonly { x0: number; z0: number; x1: number; z1: number }[] = [
  { x0: -3600, z0: 1190, x1: -2890, z1: 2700 }, // station side, between the tracks and the avenue
  { x0: -2890, z0: 2019, x1: -2510, z1: 2692 }, // the avenue south of the crossing (the old tower blocked it)
  { x0: -2510, z0: 2019, x1: -1894, z1: 2693 }, // the back-alley block
  { x0: -2510, z0: 1190, x1: -1894, z1: 1779 }, // the north-east block
];

/** Maze cell (≈1.5 m); the lanes are three cells wide (≈4.4 m). */
export const MAZE = { x0: -2420, z0: 2091, cell: 38 };
/**
 * The back-alley block, one character per cell: a letter is a building, '.' a lane. The west
 * mouth (rows 3–5) opens on the avenue under the NEON MAZE gate; the north mouth (cols 3–5)
 * on the street; the east (rows 7–9) and south (cols 6–8) mouths on the side street and the
 * alley. Every turn shifts the lane, so no lane gives a straight view through the block.
 */
export const MAZE_MAP = [
  'AAA...BBBBBB',
  'AAA...BBBBBB',
  'AAA...BBBBBB',
  '......BBBBBB',
  '......BBBBBB',
  '.......CCCCC',
  'DDD....CCCCC',
  'DDD.........',
  'DDD.........',
  'DDD.........',
  'EEEEE....FFF',
  'EEEEE....FFF',
  'EEEEEG...FFF',
  'EEEEEG...FFF',
  'EEEEEG...FFF',
] as const;

/** Storeys, fronts and skins of the maze buildings (footprints come from MAZE_MAP). */
export const MAZE_BUILDINGS: Record<string, Omit<ShibuyaBuilding, 'id' | 'x0' | 'z0' | 'x1' | 'z1'>> = {
  A: { floors: 9, fronts: ['n', 'w', 'e'], skin: 'dark', roof: 'billboard' }, // pencil tower on the scramble corner (no screen: it stood right against the skywalk)
  B: { floors: 6, fronts: ['n', 'e', 'w'], skin: 'tileB', screen: 'n', service: 's', roof: 'plant' },
  C: { floors: 2, fronts: ['s', 'w'], skin: 'concrete', service: 'n', roof: 'plant' },
  D: { floors: 4, fronts: ['w', 'e', 'n'], skin: 'tileA', service: 's' },
  E: { floors: 6, fronts: ['w', 's', 'n'], skin: 'tileB', service: 'e', roof: 'billboard' },
  F: { floors: 3, fronts: ['e', 's', 'w'], skin: 'tileA', roof: 'plant' },
  G: { floors: 1, fronts: ['e'], skin: 'concrete' }, // a standing bar
};

/** The other new buildings (station side and the north-east block). */
export const SHIBUYA_BUILDINGS: readonly ShibuyaBuilding[] = [
  // North-east block: the corner tower on the scramble, a lane between the rows.
  { id: 'H1', x0: -2420, z0: 1400, x1: -2240, z1: 1670, floors: 8, fronts: ['s', 'w', 'e'], skin: 'glass', screen: 'w', roof: 'crown' },
  { id: 'H2', x0: -2420, z0: 1280, x1: -2240, z1: 1400, floors: 4, fronts: ['n', 'w', 'e'], skin: 'tileA', roof: 'plant' },
  { id: 'H3', x0: -2080, z0: 1280, x1: -1964, z1: 1480, floors: 3, fronts: ['w', 'n', 'e'], skin: 'tileB', service: 's', roof: 'plant' },
  { id: 'H4', x0: -2080, z0: 1480, x1: -1964, z1: 1670, floors: 5, fronts: ['w', 's', 'e'], skin: 'concrete', screen: 's', roof: 'billboard' },
  // Station side: two blocks north of the square, the HALO tower south of it.
  { id: 'NW1', x0: -3220, z0: 1560, x1: -3100, z1: 1765, floors: 3, fronts: ['e', 's'], skin: 'tileA', roof: 'billboard' },
  { id: 'NW2', x0: -3205, z0: 1250, x1: -3030, z1: 1540, floors: 5, fronts: ['e', 's'], skin: 'tileB', screen: 'e', service: 'n', roof: 'plant' },
  { id: 'HALO', x0: -3140, z0: 2460, x1: -3000, z1: 2650, floors: 22, fronts: ['n', 'e'], skin: 'glass', roof: 'crown' },
];

/** Elevated decks (walkable tops at SKY_H): the SKY RING and its arms. */
export const SKY_DECKS: readonly { id: string; x0: number; z0: number; x1: number; z1: number }[] = [
  { id: 'ringN', x0: -3090, z0: 1680, x1: -2410, z1: 1760 }, // over the avenue north of the crossing (runs on west over the grand stair)
  { id: 'ringS', x0: -2990, z0: 2040, x1: -2420, z1: 2120 }, // over the avenue south of the crossing
  { id: 'ringW', x0: -2990, z0: 1760, x1: -2910, z1: 2040 }, // over the square's edge
  { id: 'ringE', x0: -2490, z0: 1760, x1: -2410, z1: 2040 }, // over the side street
  { id: 'skywalk', x0: -2490, z0: 2120, x1: -2420, z1: 2400 }, // along the avenue to the back alley
  { id: 'deckNE', x0: -2410, z0: 1680, x1: -2165, z1: 1760 }, // into the north-east block
];

/** Stairs up to the decks: the grand stair (square), the skywalk's landing (alley) and the lane stair. */
export const SKY_STAIRS: readonly { id: string; x0: number; z0: number; x1: number; z1: number; axis: 'x' | 'z'; dir: 1 | -1 }[] = [
  { id: 'grand', x0: -3090, z0: 1760, x1: -3010, z1: 2040, axis: 'z', dir: -1 }, // rises north from the square
  { id: 'alley', x0: -2490, z0: 2400, x1: -2420, z1: 2680, axis: 'z', dir: -1 }, // rises north from the alley
  { id: 'lane', x0: -2240, z0: 1400, x1: -2165, z1: 1680, axis: 'z', dir: 1 }, // rises south from the north-east lane
];

/** Columns under the decks (on pavements and the square, never in a traffic lane). */
export const SKY_LEGS: readonly [number, number][] = [
  [-2950, 1720], [-2450, 1720], [-2950, 2050], [-2450, 2080], [-3050, 1720],
  [-2455, 2250], [-2455, 2390], [-2290, 1720], [-2190, 1720],
];

/**
 * The NEON MAZE gate at the back alley's west mouth: lit posts on the kerb line of the avenue
 * holding up the skywalk, the sign hung under the deck (low enough for the chase camera).
 */
export const MAZE_GATE = { x: -2502, z0: 2200, z1: 2324, top: SKY_H - 12, sign: [66, 124] as const };

/** 地下入口: the subway entrance kiosk in the station square. */
export const SUBWAY = { x0: -3205, z0: 1800, x1: -3125, z1: 1890, h: 95 };

/**
 * HALO VISION: a round screen standing in front of the HALO tower at the square's south end,
 * facing the square and the crossing. Low (its centre at ≈7 m) so the chase camera sees it.
 */
export const HALO_SCREEN = { x: -3070, z: 2440, y: 190, r: 150 };

/** Street lamps added in the rebuilt area (gameplay lamps: their pools light people at night). */
export const SHIBUYA_LAMPS: readonly { x: number; z: number; ang: number; wall?: boolean }[] = [
  // Station square, round its edge.
  { x: -3240, z: 1980, ang: 0 }, { x: -3200, z: 2400, ang: -Math.PI / 2 }, { x: -2920, z: 2420, ang: Math.PI },
  // The avenue south of the crossing (both sides).
  { x: -2905, z: 2560, ang: 0 }, { x: -2495, z: 2560, ang: Math.PI },
  // Back alley: one wall lamp where the gate opens. The lanes beyond stay dark for the rules
  // (hiding and ambush); neon and shop light keep them readable on screen.
  { x: -2306, z: 2262, ang: 0, wall: true },
];

/**
 * District visual language (MAP REFORGE): what makes each district readable at street level.
 * Only Shibuya is built to it so far; the rest is the brief for the next phases.
 */
export const DISTRICT_LANGUAGE: readonly { sector: string; code: string; motifs: string[]; light: string; streets: string }[] = [
  { sector: '新宿', code: 'VERTICAL CITY', motifs: ['超高層', '縦方向の光', 'オフィスの窓明かり'], light: '白〜冷たい蛍光の縦ライン', streets: '広い街路と2階デッキ' },
  { sector: '渋谷', code: 'NEON MAZE', motifs: ['大型広告と円形ビジョン', '密集した雑居ビル', '空中回廊', 'スクランブル'], light: 'マゼンタ・紫・ミント・ローズ・白（陣営色を使わない）を局所に', streets: '大通り＋入り組んだ路地＋立体ルート' },
  { sector: '池袋', code: 'ROOFTOP NETWORK', motifs: ['屋上の連絡橋', '広い道路'], light: '屋上の誘導灯', streets: '広い道路と屋上' },
  { sector: '文京', code: 'QUIET SLOPES', motifs: ['坂', '住宅', '静けさ'], light: '暖色の門灯（暗すぎない）', streets: '坂と細い道' },
  { sector: '上野', code: 'GREEN HEIGHTS', motifs: ['緑', '石段', '公園'], light: '提灯と石段の足元灯', streets: '公園の高台と坂' },
  { sector: '秋葉原', code: 'ELECTRIC GRID', motifs: ['電子看板', '配線', '狭い店舗'], light: '電子看板の原色', streets: '高架下と路地' },
  { sector: '中央', code: 'CONTROL CORE', motifs: ['管制設備', '幾何学的都市'], light: '白い幾何学ライン', streets: '広場と堀' },
  { sector: '東京タワー', code: 'RED HEIGHT', motifs: ['赤い鉄骨', '高低差'], light: '赤と暖白（白飛びさせない）', streets: '高台と塔' },
  { sector: '品川', code: 'FUTURE GATEWAY', motifs: ['ガラス', '新交通', '未来都市'], light: '青白いガラスの反射', streets: '広い道路と高架' },
];
