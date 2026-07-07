import { describe, expect, it } from 'vitest';
import {
  cycleCombatTargetId,
  listTargetableCombatants,
  mergeSelectedCombatTarget,
} from '../../../src/game/combat/combatTargetSelection.js';

function arenaContext(targets, playerTx = 4, playerTy = 6) {
  return {
    sceneId: 'combat-arena',
    casterId: 'player',
    targets,
    playerTx,
    playerTy,
  };
}

describe('combatTargetSelection', () => {
  it('orders combatants nearest-first with in-range priority', () => {
    const ordered = listTargetableCombatants(arenaContext([
      {
        id: 'sentinel-east',
        kind: 'combatant',
        tx: 6,
        ty: 4,
        inRange: false,
      },
      {
        id: 'sentinel-west',
        kind: 'combatant',
        tx: 2,
        ty: 4,
        inRange: true,
      },
    ]), { playerTx: 4, playerTy: 6 });

    expect(ordered.map((entry) => entry.id)).toEqual(['sentinel-west', 'sentinel-east']);
  });

  it('cycles targets starting at the nearest combatant', () => {
    const ids = ['sentinel-west', 'sentinel-east'];
    expect(cycleCombatTargetId(null, ids)).toBe('sentinel-west');
    expect(cycleCombatTargetId('sentinel-west', ids)).toBe('sentinel-east');
    expect(cycleCombatTargetId('sentinel-east', ids)).toBe('sentinel-west');
  });

  it('applies selected target when weave did not name an enemy', () => {
    const sceneContext = arenaContext([
      {
        id: 'sentinel-west',
        label: 'Brazier Sentinel',
        kind: 'combatant',
        weaveObjects: ['FLESH'],
        inRange: true,
      },
      {
        id: 'dummy',
        label: 'Sparring Dummy',
        kind: 'combatant',
        weaveObjects: ['FLESH'],
        inRange: true,
        interactionPriority: 500,
      },
    ]);

    const merged = mergeSelectedCombatTarget(
      {
        clauses: [],
        primaryTargetId: 'dummy',
        unresolvedObjects: [],
        modeHint: 'combat',
      },
      'sentinel-west',
      sceneContext,
      { canAttack: () => true },
    );

    expect(merged.primaryTargetId).toBe('sentinel-west');
    expect(merged.selectedTargetId).toBe('sentinel-west');
    expect(merged.clauses.at(-1)?.resolvedTarget?.reason).toBe('player_selected');
  });

  it('binds a selected out-of-range target when no primary is resolved yet', () => {
    const sceneContext = arenaContext([
      {
        id: 'sentinel-west',
        kind: 'combatant',
        weaveObjects: ['FLESH'],
        inRange: false,
      },
    ]);

    const merged = mergeSelectedCombatTarget(
      {
        clauses: [],
        primaryTargetId: null,
        unresolvedObjects: ['FLESH'],
        modeHint: 'combat',
      },
      'sentinel-west',
      sceneContext,
      { canAttack: () => false },
    );

    expect(merged.primaryTargetId).toBe('sentinel-west');
  });

  it('does not override explicit named weave targets', () => {
    const sceneContext = arenaContext([
      { id: 'sentinel-west', kind: 'combatant', inRange: true },
      { id: 'sentinel-east', kind: 'combatant', inRange: true },
    ]);

    const merged = mergeSelectedCombatTarget(
      {
        clauses: [],
        primaryTargetId: 'sentinel-east',
        namedTargetId: 'sentinel-east',
        unresolvedObjects: [],
      },
      'sentinel-west',
      sceneContext,
    );

    expect(merged.primaryTargetId).toBe('sentinel-east');
  });
});