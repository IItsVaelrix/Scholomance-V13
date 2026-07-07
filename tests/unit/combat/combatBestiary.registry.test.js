import { describe, expect, it, beforeEach } from 'vitest';
import {
  bootstrapCombatBestiary,
  buildCombatBestiaryDossier,
  buildCombatDefenderProfile,
  buildBestiaryRuntimeContext,
  hasCombatBestiaryEntry,
  listCombatBestiaryEntries,
  registerCombatBestiaryEntry,
  resolveCombatBestiaryEntry,
} from '../../../src/game/combat/bestiary/index.js';
import { sentinelBrazierBestiaryEntry } from '../../../src/game/combat/bestiary/entries/sentinelBrazier.entry.js';

describe('combat bestiary registry', () => {
  beforeEach(() => {
    bootstrapCombatBestiary();
  });

  it('bootstraps the sentinel brazier entry', () => {
    const ids = listCombatBestiaryEntries().map((entry) => entry.id);
    expect(ids).toContain('sentinel-brazier');
  });

  it('resolves sentinel dossiers from enemy id', () => {
    const context = buildBestiaryRuntimeContext({
      enemyId: 'sentinel-west',
      record: { id: 'sentinel-west', aggroed: true, defeated: false },
      entitySnapshot: { hp: 32, maxHp: 40 },
      target: {
        id: 'sentinel-west',
        kind: 'combatant',
        metadata: { role: 'sentinel', shortLabel: 'Sentinel α' },
      },
    });

    expect(hasCombatBestiaryEntry(context)).toBe(true);
    expect(resolveCombatBestiaryEntry(context)?.id).toBe('sentinel-brazier');

    const dossier = buildCombatBestiaryDossier(context);
    expect(dossier?.title).toBe('Sentinel α');
    expect(dossier?.chess?.archetype).toBe('BRAZIER_SENTINEL');
    expect(dossier?.sections.some((section) => section.id === 'vitals')).toBe(true);
  });

  it('builds a defender profile for syntactical chess scoring', () => {
    const defender = buildCombatDefenderProfile(buildBestiaryRuntimeContext({
      enemyId: 'sentinel-east',
      record: { id: 'sentinel-east', aggroed: false },
      entitySnapshot: { hp: 40, maxHp: 40 },
    }));

    expect(defender).toMatchObject({
      id: 'sentinel-east',
      school: 'SONIC',
      role: 'sentinel',
      bestiaryId: 'sentinel-brazier',
    });
    expect(defender.syntacticProfile.archetype).toBe('BRAZIER_SENTINEL');
  });

  it('allows registering additional enemy archetypes', () => {
    registerCombatBestiaryEntry({
      id: 'void-wraith',
      priority: 200,
      matches: (context) => context.target?.metadata?.role === 'void-wraith',
      buildDossier: () => ({
        enemyId: 'wraith-1',
        title: 'Void Wraith',
        sections: [{ id: 'lore', label: 'Lore', lines: ['A test entry.'] }],
      }),
      buildDefender: () => ({
        id: 'wraith-1',
        name: 'Void Wraith',
        school: 'VOID',
        role: 'void-wraith',
        syntacticProfile: sentinelBrazierBestiaryEntry.buildDefender({
          enemyId: 'sentinel-west',
          record: { aggroed: false },
          entitySnapshot: { hp: 10, maxHp: 10 },
        }).syntacticProfile,
      }),
    });

    const dossier = buildCombatBestiaryDossier(buildBestiaryRuntimeContext({
      enemyId: 'wraith-1',
      target: { id: 'wraith-1', metadata: { role: 'void-wraith' } },
    }));

    expect(dossier?.title).toBe('Void Wraith');
    expect(resolveCombatBestiaryEntry(buildBestiaryRuntimeContext({
      enemyId: 'wraith-1',
      target: { id: 'wraith-1', metadata: { role: 'void-wraith' } },
    }))?.id).toBe('void-wraith');
  });
});