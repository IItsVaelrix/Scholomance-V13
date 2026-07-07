import { describe, expect, it } from 'vitest';
import { calculateCombatScore } from '../../../codex/core/combat.scoring.js';
import { resolveObeliskPuzzle } from '../../../codex/core/obelisk-puzzle.resolver.js';

function castSnapshot({ verse, weave, playerAdjacent = true } = {}) {
  const combatScore = calculateCombatScore({ text: verse, weave });
  return {
    verse,
    weave,
    combatScore,
    bridge: combatScore.bridge,
    playerAdjacent,
  };
}

describe('resolveObeliskPuzzle', () => {
  it('resolves overload during a high charge phase', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'active', phase: 'charge', intensity: 0.85 },
      castSnapshot({
        verse: 'The thunder answers the swollen rune.',
        weave: 'utter resonate the air then shatter the stone',
      }),
    );

    expect(verdict.kind).toBe('overload');
    expect(verdict.events[0]).toMatchObject({
      type: 'DISCOVERY_OBELISK_OVERLOAD',
      path: 'meltdown',
    });
  });

  it('resolves overload during discharge for a resonance cast', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'active', phase: 'discharge', intensity: 1 },
      castSnapshot({
        verse: 'Arc upon arc overload the lattice bell.',
        weave: 'utter resonate the air',
      }),
    );

    expect(verdict.kind).toBe('overload');
  });

  it('resolves siphon for drain the obelisk electrical power grammar', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'active', phase: 'charge', intensity: 0.6 },
      castSnapshot({
        verse: 'Drain the Obelisk of its electrical power',
        weave: 'drain the obelisk',
        playerAdjacent: true,
      }),
    );

    expect(verdict.kind).toBe('siphon');
  });

  it('resolves siphon during charge for a sustained drain grammar', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'active', phase: 'charge', intensity: 0.6 },
      castSnapshot({
        verse: 'I pull the hush from the tower breath.',
        weave: 'silent hollow the soul while deplete the mind',
      }),
    );

    expect(verdict.kind).toBe('siphon');
    expect(verdict.manaGrant).toBe(9);
    expect(verdict.events[0]).toMatchObject({
      type: 'DISCOVERY_OBELISK_SIPHON',
      path: 'siphon',
      manaGrant: 9,
    });
  });

  it('rejects cooldown casts with timing feedback', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'active', phase: 'cooldown', intensity: 0.9 },
      castSnapshot({
        verse: 'The thunder answers the swollen rune.',
        weave: 'utter resonate the air then shatter the stone',
      }),
    );

    expect(verdict.kind).toBe('none');
    expect(verdict.reason).toBe('bad_phase');
    expect(verdict.displayText).toBe('timing...');
  });

  it('requires adjacency in v1', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'active', phase: 'charge', intensity: 0.85 },
      castSnapshot({
        verse: 'The thunder answers the swollen rune.',
        weave: 'utter resonate the air then shatter the stone',
        playerAdjacent: false,
      }),
    );

    expect(verdict.kind).toBe('none');
    expect(verdict.reason).toBe('not_adjacent');
    expect(verdict.displayText).toBe('too far...');
  });

  it('ignores casts once the obelisk is no longer active', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'lowered', phase: 'charge', intensity: 0.85 },
      castSnapshot({
        verse: 'The thunder answers the swollen rune.',
        weave: 'utter resonate the air then shatter the stone',
      }),
    );

    expect(verdict.kind).toBe('none');
    expect(verdict.reason).toBe('inactive');
    expect(verdict.displayText).toBe('too late...');
  });

  it('does not reward collapsed low-bridge grammar', () => {
    const verdict = resolveObeliskPuzzle(
      { state: 'active', phase: 'charge', intensity: 0.9 },
      castSnapshot({
        verse: 'Thunder thunder thunder.',
        weave: 'offensive disruption utility offensive the flesh',
      }),
    );

    expect(verdict.kind).toBe('none');
    expect(verdict.reason).toBe('collapsed');
    expect(verdict.displayText).toBe('syntax frayed...');
  });

  it('is deterministic for the same cast and phase snapshot', () => {
    const snapshot = { state: 'active', phase: 'charge', intensity: 0.75 };
    const cast = castSnapshot({
      verse: 'Drain the purple swell; quiet the spark.',
        weave: 'deep defensive the mind while hollow the soul',
    });

    expect(resolveObeliskPuzzle(snapshot, cast)).toEqual(resolveObeliskPuzzle(snapshot, cast));
  });
});