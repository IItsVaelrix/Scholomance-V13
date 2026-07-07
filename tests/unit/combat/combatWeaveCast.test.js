import { describe, expect, it } from 'vitest';
import { resolveCombatWeaveCast } from '../../../src/game/combat/combatWeaveCast.js';

describe('resolveCombatWeaveCast', () => {
  it('attaches resolvedTargets without requiring scene context', () => {
    const result = resolveCombatWeaveCast({
      verse: 'The iron bell answers the hollow dark.',
      weave: 'offensive the flesh',
    });
    expect(result.bridge).toBeDefined();
    expect(result.resolvedTargets).toEqual({
      clauses: [],
      primaryTargetId: null,
      unresolvedObjects: [],
      modeHint: 'combat',
    });
  });

  it('binds weave objects when scene context is present', () => {
    const result = resolveCombatWeaveCast({
      verse: 'The iron bell answers the hollow dark.',
      weave: 'rend the flesh',
      sceneContext: {
        sceneId: 'combat-arena',
        casterId: 'player',
        targets: [{
          id: 'dummy',
          label: 'Sparring Dummy',
          kind: 'combatant',
          weaveObjects: ['FLESH'],
          inRange: true,
          reachable: true,
        }],
      },
    });
    expect(result.resolvedTargets.primaryTargetId).toBe('dummy');
    expect(result.bridge.resolvedTargets.primaryTargetId).toBe('dummy');
  });

  it('uses the selected combat target when weave only names an object', () => {
    const result = resolveCombatWeaveCast({
      verse: 'The flame bites where iron sleeps.',
      weave: 'rend the flesh',
      sceneContext: {
        sceneId: 'combat-arena',
        casterId: 'player',
        selectedCombatTargetId: 'sentinel-west',
        targets: [
          {
            id: 'sentinel-west',
            label: 'Brazier Sentinel',
            kind: 'combatant',
            weaveObjects: ['FLESH'],
            inRange: true,
            reachable: true,
          },
          {
            id: 'dummy',
            label: 'Sparring Dummy',
            kind: 'combatant',
            weaveObjects: ['FLESH'],
            inRange: true,
            reachable: true,
            interactionPriority: 500,
          },
        ],
      },
    });

    expect(result.resolvedTargets.primaryTargetId).toBe('sentinel-west');
  });

  it('resolves named sentinel targets for Invoke attack casts', () => {
    const result = resolveCombatWeaveCast({
      verse: 'The flame bites where iron sleeps.',
      weave: 'rend sentinel west',
      sceneContext: {
        sceneId: 'combat-arena',
        casterId: 'player',
        targets: [{
          id: 'sentinel-west',
          label: 'Brazier Sentinel',
          kind: 'combatant',
          weaveObjects: ['FLESH', 'FIRE'],
          inRange: true,
          reachable: true,
          weaveAliases: ['SENTINEL', 'BRAZIER'],
        }],
      },
    });

    expect(result.resolvedTargets.primaryTargetId).toBe('sentinel-west');
    expect(result.bridge.resolvedTargets.primaryTargetId).toBe('sentinel-west');
    expect(result.bridge).toBeDefined();
  });
});