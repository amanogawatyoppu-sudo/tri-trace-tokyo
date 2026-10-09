/**
 * Per-character AI state. Plain data kept on the Entity so it survives with the
 * rest of the simulation state; only the AI modules read or write it.
 */

export type AiState =
  | 'PATROL' // roam between hotspots
  | 'INVESTIGATE' // go check a place an ally (or an event) reported
  | 'CHASE' // an enemy is in sight: pursue it
  | 'INTERCEPT' // an ally is already chasing: cut the enemy off
  | 'SEARCH' // lost sight: sweep around the last known position
  | 'GUARD' // hold a jail or post
  | 'ESCORT' // stay by the king
  | 'RESCUE' // head for a jail to free an ally
  | 'FLEE' // get away from a threat
  | 'HOLD' // stand at a post (sniper perch, tower)
  | 'SQUAD'; // move with the squad leader, in formation

/** What this character last knew about an enemy. */
export interface Sighting {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Game time (ms) of the sighting. */
  t: number;
  /** When this continuous sighting began (reaction time counts from here). */
  since: number;
  /** Estimated ground velocity (units/s) from consecutive sightings. */
  vx: number;
  vz: number;
}

export interface Waypoint {
  x: number;
  y: number;
  z: number;
}

export interface NavPath {
  /** Waypoints to walk through, ending at the goal. */
  points: Waypoint[];
  i: number;
  goal: Waypoint;
}

/** Job handed out by the nation's commander (see ai/faction.ts). */
export type Task =
  | { kind: 'rescueKing'; jail: 'sun' | 'moon' | 'star' }
  | { kind: 'rescueEscort'; jail: 'sun' | 'moon' | 'star' }
  | { kind: 'guardJail' }
  | { kind: 'escortKing' }
  | { kind: 'raidJail'; jail: 'sun' | 'moon' | 'star' }
  | { kind: 'takeTower' }
  | { kind: 'hunt'; nation: 'sun' | 'moon' | 'star' }
  /**
   * Find and catch a nation's king (v7.30): go to the best lead the nation has (a lit king,
   * a king-like enemy someone saw), else sweep that nation's rear where kings keep.
   */
  | { kind: 'huntKing'; nation: 'sun' | 'moon' | 'star'; lead: Waypoint | null }
  /** The war (v7.13): march on a sector's strategic point (maybe by a second route), hold one, cover one from high ground. */
  | { kind: 'assault'; sector: number; via: Waypoint | null }
  | { kind: 'defend'; sector: number }
  | { kind: 'overwatch'; sector: number }
  /** Keyholders wait a little behind the fighting, ready for a rescue. */
  | { kind: 'standby'; sector: number }
  /** Communicators without the tower support from the rear. */
  | { kind: 'rear'; sector: number };

export interface AiMemory {
  state: AiState;
  /** Enemy being chased / searched for. */
  targetId: number | null;
  /** Enemies currently in view (ids), refreshed by perception. */
  visible: number[];
  /** Last known sighting per enemy. */
  seen: Map<number, Sighting>;
  /** 0 = calm … 1 = fully alert (recent contact). */
  alert: number;
  goal: Waypoint | null;
  path: NavPath | null;
  /** Point to turn toward while standing (sniper aim); turned a little each step. */
  lookAt: { x: number; z: number } | null;
  /** Enemy a sniper is drawing a bead on (its red laser is visible). */
  aimId: number | null;
  /** Squad: the leader this character follows (an AI or the player), and its place in the formation. */
  leaderId: number | null;
  slot: number;
  /** Cached "can walk straight to the formation spot" check. */
  directOk: boolean;
  directAt: number;
  /** Game time of the next decision and perception update. */
  thinkAt: number;
  perceiveAt: number;
  replanAt: number;
  searchUntil: number;
  searchCenter: Waypoint | null;
  /** Chase role among allies after the same enemy. */
  chaseRole: 'direct' | 'intercept' | 'flank' | 'ambush';
  flankSide: 1 | -1;
  task: Task | null;
  /** Stuck detection: last position that counted as progress. */
  progressX: number;
  progressZ: number;
  progressAt: number;
  /** Longest time (s) this AI spent unable to make progress (diagnostics/tests). */
  maxStuckSec: number;
  /** When the current waypoint became current (to give up on one that cannot be reached). */
  wpAt: number;
  wpIndex: number;
  /** Squad: closest it has got to its formation spot lately (sliding along a wall is not progress). */
  bestSpotD: number;
  /** Diagnostics: seconds spent above ground level (stairs, floors, hills). */
  highSec: number;
  /** Pausing to look around after reaching a patrol / search point, until this time. */
  idleUntil: number;
  /**
   * Route recovery (AI QUALITY PHASE 1). `detour`: walking to a nearby spot to get off a wall,
   * after which the real route is planned again (until `detourUntil` at the latest).
   * `stuckCount`: recoveries in a row without reaching a route point (gives the goal up at 4).
   * `wpBestD` / `wpBestAt`: closest it has got to the current route point, and when (sliding
   * along a wall or circling a point counts as stuck too).
   */
  detour: boolean;
  detourUntil: number;
  stuckCount: number;
  wpBestD: number;
  wpBestAt: number;
  /** Last spot the body itself got 20 units away from, and when (never reset by a new goal). */
  moveX: number;
  moveZ: number;
  moveAt: number;
  /**
   * Chase deadlock (AI QUALITY PHASE 1): the enemy AI it is locked in a close mutual chase with,
   * since when, and when that was last true (a short gap does not reset it).
   */
  duelWith: number | null;
  duelSince: number;
  duelSeen: number;
  /** Duels settled lately (a second one with the same enemy ends the chase on both sides), and the last one's time. */
  duelCount: number;
  duelAt: number;
  /** Breaking off: back away until this time; then leave `ignoreId` alone until `ignoreUntil`. */
  breakUntil: number;
  ignoreId: number | null;
  ignoreUntil: number;
  /** Close pursuit of one target (within reach, any target): who, since when, and its last grab attempt. */
  closeWith: number | null;
  closeSince: number;
  closeSeen: number;
  grabAt: number;
}

export function createAiMemory(): AiMemory {
  return {
    state: 'PATROL', targetId: null, visible: [], seen: new Map(), alert: 0,
    goal: null, path: null, lookAt: null, aimId: null, leaderId: null, slot: 0, directOk: false, directAt: 0, thinkAt: 0, perceiveAt: 0, replanAt: 0,
    searchUntil: 0, searchCenter: null, chaseRole: 'direct', flankSide: 1, task: null,
    progressX: 0, progressZ: 0, progressAt: 0, maxStuckSec: 0, wpAt: 0, wpIndex: -1, bestSpotD: Infinity, highSec: 0, idleUntil: 0,
    detour: false, detourUntil: 0, stuckCount: 0, wpBestD: Infinity, wpBestAt: 0, moveX: 0, moveZ: 0, moveAt: 0,
    duelWith: null, duelSince: 0, duelSeen: -Infinity, duelCount: 0, duelAt: -Infinity, breakUntil: 0, ignoreId: null, ignoreUntil: 0,
    closeWith: null, closeSince: 0, closeSeen: -Infinity, grabAt: -Infinity,
  };
}
