import { SITES } from '../src/config/map';
import { AKIBA_ZONES } from '../src/config/akihabara';
import { inUenoZone } from '../src/config/ueno';
import { SHINAGAWA_ZONE } from '../src/config/shinagawa';
import { CHUO_ZONE } from '../src/config/chuo';
import type { NationId } from '../src/config/nations';
import { NATIONS } from '../src/config/nations';
import type { RoleId, RosterSize } from '../src/config/roles';
import { FixedStepClock, STEP_MS } from '../src/core/clock';
import { createRng } from '../src/core/rng';
import type { Entity } from '../src/sim/entity';
import { teleport } from '../src/sim/entity';
import { advanceFrame } from '../src/sim/game';
import type { GameState } from '../src/sim/state';
import { createGameState } from '../src/sim/state';

/** Open, flat ground (皇居前広場) with no world geometry nearby. */
export const SPOT = { x: SITES.open.x, z: SITES.open.z };

export function newGame(nation: NationId = 'sun', role: RoleId = 'soldier', seed = 1, size: RosterSize = 6): GameState {
  return createGameState(nation, role, createRng(seed), size);
}

export function find(state: GameState, nation: NationId, role: RoleId): Entity {
  return state.entities.find((e) => e.nation === nation && e.role === role)!;
}

/** Runs the real frame driver for `ms` of wall-clock time at ~60fps. */
export function runFrames(state: GameState, ms: number, clock = new FixedStepClock()): void {
  const frames = Math.round(ms / STEP_MS);
  for (let i = 0; i < frames; i++) advanceFrame(state, clock, STEP_MS);
}

export function placeAtBase(e: Entity): void {
  const b = NATIONS[e.nation].base;
  teleport(e, b.x, b.z);
}

/**
 * Freezes everyone except the listed entities in place so a test can control
 * interactions without AI interference (stunned entities skip AI and actions).
 */
export function freezeOthers(state: GameState, keep: Entity[]): void {
  for (const e of state.entities) if (!keep.includes(e)) e.stunUntil = Infinity;
}

/** Inside the rebuilt centre of Akihabara (MAP REFORGE phase 3): its zones and the arcade it reworks. */
export function inAkihabara(p: { x: number; z: number; group?: string }): boolean {
  return p.group === 'arcade' || AKIBA_ZONES.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1);
}

/** Inside the rebuilt area of Ueno (MAP REFORGE parallel A: GREEN HEIGHTS). */
export function inUeno(p: { x: number; z: number }): boolean {
  return inUenoZone(p.x, p.z);
}

/** Inside the rebuilt area of Shinagawa (MAP REFORGE parallel C, FUTURE GATEWAY). */
export function inShinagawa(p: { x: number; z: number }): boolean {
  const Z = SHINAGAWA_ZONE;
  return p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1;
}

/** Inside the rebuilt area of Chuo (MAP REFORGE parallel F, CONTROL CORE). */
export function inChuo(p: { x: number; z: number }): boolean {
  const Z = CHUO_ZONE;
  return p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1;
}
