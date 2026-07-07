import { describe, expect, it } from 'vitest';
import { parseWeave } from '../../../codex/core/spellweave.engine.js';
import {
  collectTargetAliases,
  extractParsedClauses,
  lookupSceneEnemyToken,
  resolveWeaveTargets,
  resolveWeaveTargetsFromParsed,
} from '../../../src/game/combat/weave-scene-targets.js';

function arenaContext(overrides = {}) {
  return {
    sceneId: 'combat-arena',
    casterId: 'player',
    tick: 0,
    targets: [
      {
        id: 'dummy',
        label: 'Sparring Dummy',
        kind: 'combatant',
        weaveObjects: ['FLESH', 'SINEW', 'BLOOD'],
        tx: 4,
        ty: 4,
        inRange: true,
        reachable: true,
        interactionPriority: 500,
      },
      {
        id: 'obelisk',
        label: 'Central Obelisk',
        kind: 'structure',
        weaveObjects: ['OBELISK', 'STONE', 'FIRE', 'SPIRIT'],
        tx: 4,
        ty: 4,
        inRange: true,
        reachable: true,
        interactionPriority: 450,
      },
      {
        id: 'void-ore-spire',
        label: 'Void Ore Spire',
        kind: 'gatherable',
        weaveObjects: ['STONE'],
        tx: 2,
        ty: 3,
        inRange: true,
        reachable: true,
        interactionPriority: 300,
      },
      {
        id: 'stormheart-orb',
        label: 'Stormheart Orb',
        kind: 'loot',
        weaveObjects: ['SPIRIT', 'SOUL', 'FIRE'],
        tx: 4,
        ty: 4,
        inRange: false,
        reachable: false,
        interactionPriority: 250,
      },
    ],
    ...overrides,
  };
}

describe('resolveWeaveTargets', () => {
  it('is deterministic for the same weave + scene snapshot', () => {
    const parsed = parseWeave('rend the flesh');
    const context = arenaContext();
    const first = resolveWeaveTargetsFromParsed(parsed, context);
    const second = resolveWeaveTargetsFromParsed(parsed, context);
    expect(second).toEqual(first);
    expect(first.primaryTargetId).toBe('dummy');
  });

  it('returns empty resolution when scene context is absent', () => {
    const parsed = parseWeave('rend the flesh');
    expect(resolveWeaveTargetsFromParsed(parsed, undefined)).toEqual({
      clauses: [],
      primaryTargetId: null,
      unresolvedObjects: [],
      modeHint: 'combat',
    });
  });

  it('binds REND FLESH to dummy when dummy accepts FLESH and is in range', () => {
    const parsed = parseWeave('rend the flesh');
    const result = resolveWeaveTargetsFromParsed(parsed, arenaContext());
    expect(result.primaryTargetId).toBe('dummy');
    expect(result.clauses[0].resolvedTarget).toMatchObject({
      id: 'dummy',
      reason: expect.stringContaining('object_match'),
    });
  });

  it('leaves REND FLESH unresolved when dummy is out of range', () => {
    const context = arenaContext({
      targets: [
        {
          id: 'dummy',
          label: 'Sparring Dummy',
          kind: 'combatant',
          weaveObjects: ['FLESH'],
          inRange: false,
          reachable: true,
        },
      ],
    });
    const parsed = parseWeave('rend the flesh');
    const result = resolveWeaveTargetsFromParsed(parsed, context);
    expect(result.primaryTargetId).toBeNull();
    expect(result.unresolvedObjects).toEqual(['FLESH']);
    expect(result.clauses[0].resolvedTarget).toBeNull();
  });

  it('binds DISRUPTION STONE to obelisk when adjacent', () => {
    const parsed = parseWeave('disruption the stone');
    const result = resolveWeaveTargetsFromParsed(parsed, arenaContext());
    expect(result.primaryTargetId).toBe('obelisk');
  });

  it('binds DRAIN OBELISK to the central obelisk structure', () => {
    const parsed = parseWeave('drain the obelisk');
    const result = resolveWeaveTargetsFromParsed(parsed, arenaContext());
    expect(result.primaryTargetId).toBe('obelisk');
    expect(result.clauses[0].objectToken).toBe('OBELISK');
    expect(result.clauses[0].resolvedTarget).toMatchObject({ id: 'obelisk' });
  });

  it('registers OBELISK as a weave object token', () => {
    const parsed = parseWeave('drain the obelisk');
    expect(parsed.objects).toContain('OBELISK');
    expect(parsed.intents).toContain('DRAIN');
  });

  it('binds UTILITY STONE to gatherable spire when intent mode favors gather', () => {
    const context = arenaContext({
      targets: [
        {
          id: 'obelisk',
          label: 'Central Obelisk',
          kind: 'structure',
          weaveObjects: ['STONE'],
          inRange: true,
          reachable: true,
          interactionPriority: 450,
        },
        {
          id: 'void-ore-spire',
          label: 'Void Ore Spire',
          kind: 'gatherable',
          weaveObjects: ['STONE'],
          inRange: true,
          reachable: true,
          interactionPriority: 300,
        },
      ],
    });
    const parsed = parseWeave('transmute the stone');
    const result = resolveWeaveTargetsFromParsed(parsed, context);
    expect(result.primaryTargetId).toBe('void-ore-spire');
  });

  it('tie-breaks multiple STONE targets deterministically by priority then id', () => {
    const context = arenaContext({
      targets: [
        {
          id: 'z-target',
          label: 'Z Target',
          kind: 'structure',
          weaveObjects: ['STONE'],
          inRange: true,
          reachable: true,
          interactionPriority: 400,
        },
        {
          id: 'a-target',
          label: 'A Target',
          kind: 'structure',
          weaveObjects: ['STONE'],
          inRange: true,
          reachable: true,
          interactionPriority: 400,
        },
      ],
    });
    const clauses = extractParsedClauses(parseWeave('disruption the stone'));
    const result = resolveWeaveTargets(clauses, context);
    expect(result.primaryTargetId).toBe('a-target');
  });

  it('derives cast mode hints from the primary intent token', () => {
    expect(resolveWeaveTargetsFromParsed(parseWeave('rend the flesh'), arenaContext()).modeHint)
      .toBe('combat');
    expect(resolveWeaveTargetsFromParsed(parseWeave('disruption the stone'), arenaContext()).modeHint)
      .toBe('puzzle');
    expect(resolveWeaveTargetsFromParsed(parseWeave('transmute the stone'), arenaContext()).modeHint)
      .toBe('gather');
  });

  it('extracts one clause row per object token across chained weaves', () => {
    const parsed = parseWeave('offensive the flesh then disruption the stone');
    const rows = extractParsedClauses(parsed);
    expect(rows).toHaveLength(2);
    expect(rows[0].objectToken).toBe('FLESH');
    expect(rows[1].objectToken).toBe('STONE');
    expect(rows[1].chainType).toBe('SEQUENCE');
  });

  it('binds enemy names typed in weave text to in-range combatants', () => {
    const context = arenaContext({
      targets: [
        {
          id: 'sentinel-west',
          label: 'Brazier Sentinel',
          kind: 'combatant',
          weaveObjects: ['FLESH', 'FIRE'],
          inRange: true,
          reachable: true,
          interactionPriority: 480,
          metadata: { shortLabel: 'Sentinel α' },
        },
        {
          id: 'sentinel-east',
          label: 'Brazier Sentinel',
          kind: 'combatant',
          weaveObjects: ['FLESH', 'FIRE'],
          inRange: false,
          reachable: true,
          interactionPriority: 480,
          metadata: { shortLabel: 'Sentinel β' },
        },
      ],
    });

    const weave = 'rend sentinel west';
    const result = resolveWeaveTargetsFromParsed(parseWeave(weave), context, weave);
    expect(result.primaryTargetId).toBe('sentinel-west');
    expect(result.namedTargetId).toBe('sentinel-west');
    expect(result.clauses[0]).toMatchObject({
      nameToken: 'SENTINEL_WEST',
      resolvedTarget: { id: 'sentinel-west', reason: expect.stringContaining('name_match') },
    });
  });

  it('recognizes sentinel aliases from scene enemy lookup', () => {
    const context = arenaContext({
      targets: [
        {
          id: 'sentinel-west',
          label: 'Brazier Sentinel',
          kind: 'combatant',
          weaveObjects: ['FLESH'],
          inRange: true,
          reachable: true,
          weaveAliases: ['SENTINEL', 'BRAZIER'],
        },
      ],
    });

    const aliases = collectTargetAliases(context.targets[0]);
    expect(aliases.has('SENTINEL')).toBe(true);
    expect(aliases.has('BRAZIER')).toBe(true);
    expect(aliases.has('SENTINEL_WEST')).toBe(true);
    expect(lookupSceneEnemyToken('sentinel', context)?.target.id).toBe('sentinel-west');
    expect(lookupSceneEnemyToken('brazier', context)?.target.id).toBe('sentinel-west');
  });

  it('prefers named enemy over generic object binding when both appear', () => {
    const context = arenaContext({
      targets: [
        {
          id: 'sentinel-west',
          label: 'Brazier Sentinel',
          kind: 'combatant',
          weaveObjects: ['FLESH'],
          inRange: true,
          reachable: true,
          interactionPriority: 480,
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
    });

    const weave = 'rend flesh sentinel west';
    const result = resolveWeaveTargetsFromParsed(parseWeave(weave), context, weave);
    expect(result.primaryTargetId).toBe('sentinel-west');
  });

  it('resolveWeaveTargets tolerates scene context without targets (Polaris forest entry)', () => {
    const parsed = parseWeave('rend flesh');
    const polarisContext = {
      sceneId: 'polaris-sonic-forest',
      casterId: 'player',
      tick: 0,
    };
    expect(() => resolveWeaveTargetsFromParsed(parsed, polarisContext, 'rend flesh')).not.toThrow();
    const result = resolveWeaveTargets(extractParsedClauses(parsed), polarisContext);
    expect(result.clauses).toEqual([]);
  });
});