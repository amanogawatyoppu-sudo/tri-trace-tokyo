import { describe, expect, it } from 'vitest';
import { AI_SPEED } from '../src/config/constants';
import { NATIONS } from '../src/config/nations';
import { attackTarget, decideNormal, kingRefuge } from '../src/ai/strategy';
import { NO_STRATEGY } from '../src/ai/strategy';
import { teleport } from '../src/sim/entity';
import { sectorAt, sectorPoint } from '../src/sim/war';
import { factionTick } from '../src/ai/faction';
import { find, freezeOthers, newGame, runFrames } from './helpers';

const UENO = 4, IKEBUKURO = 2;

describe('AI QUALITY PHASE 2: where the AI goes', () => {
  it('a sector our people found unguarded is picked more often, but only once someone has looked', () => {
    const pick = (watched: boolean) => {
      const state = newGame('star', 'communicator', 1);
      state.time = 60000;
      if (watched) state.factions.sun.watchedAt[UENO] = state.time - 5000;
      let n = 0;
      for (let k = 0; k < 400; k++) if (attackTarget(state, 'sun', null)?.sector === UENO) n++;
      return n;
    };
    const blind = pick(false), seen = pick(true);
    // At the start nobody knows anything: a far sector is not "unguarded" just because nobody has looked.
    expect(seen).toBeGreaterThan(blind + 20);
  });

  it('an attack on a far sector lasts long enough to get there', () => {
    const state = newGame('star', 'communicator', 2);
    state.tower.owner = 'sun'; // no tower plan in the way
    let s = decideNormal(state, 'sun', NO_STRATEGY);
    for (let k = 0; k < 50 && s.kind !== 'ATTACK_SECTOR'; k++) s = decideNormal(state, 'sun', NO_STRATEGY);
    expect(s.kind).toBe('ATTACK_SECTOR');
    const p = sectorPoint(s.sector!), b = NATIONS.sun.base;
    expect(s.until - state.time).toBeGreaterThanOrEqual(14000 + (Math.hypot(p.x - b.x, p.z - b.z) / AI_SPEED) * 1000 - 1);
  });

  it('a king settled in a quiet sector of its own mostly stays there', () => {
    const state = newGame('star', 'communicator', 3);
    const at = sectorPoint(IKEBUKURO);
    let stay = 0;
    for (let k = 0; k < 300; k++) if (sectorAt(kingRefuge(state, 'sun', at).x, kingRefuge(state, 'sun', at).z) === IKEBUKURO) stay++;
    let fromBase = 0;
    for (let k = 0; k < 300; k++) { const r = kingRefuge(state, 'sun', NATIONS.sun.base); if (sectorAt(r.x, r.z) === IKEBUKURO) fromBase++; }
    expect(stay).toBeGreaterThan(fromBase);
  });

  it('an escort following a far, moving king gets out of the pocket by the tower leg', () => {
    // (319.7, 2251) between a 東京タワー leg and a prop: the planned route runs into the prop,
    // and the king's every step re-aims the escort, which used to hide that it never moved.
    const state = newGame('star', 'communicator', 39);
    state.nextEventAt = Infinity;
    const king = find(state, 'sun', 'king'), soldier = find(state, 'sun', 'soldier'), ranger = find(state, 'sun', 'ranger');
    teleport(king, -2300, -5300);
    teleport(ranger, -631, 5000);
    teleport(soldier, 319.7, 2251);
    freezeOthers(state, [king, soldier]);
    factionTick(state);
    expect(soldier.ai.task?.kind).toBe('escortKing');
    const x0 = soldier.x, z0 = soldier.z;
    runFrames(state, 20000);
    expect(Math.hypot(soldier.x - x0, soldier.z - z0)).toBeGreaterThan(300);
  });
});
