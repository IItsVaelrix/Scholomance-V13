import { describe, expect, it } from 'vitest';
import {
  isCombatBestiaryGlossaryToken,
  lookupCombatBestiaryGlossaryTerm,
  parseCombatBestiaryGlossaryText,
} from '../../../src/game/combat/bestiary/combatBestiary.glossary.js';

describe('combat bestiary glossary', () => {
  it('detects ALL-CAPS registry tokens', () => {
    expect(isCombatBestiaryGlossaryToken('BAPO')).toBe(true);
    expect(isCombatBestiaryGlossaryToken('BRAZIER_SENTINEL')).toBe(true);
    expect(isCombatBestiaryGlossaryToken('Dormant')).toBe(false);
    expect(isCombatBestiaryGlossaryToken('A')).toBe(false);
  });

  it('resolves scholomance stats, syntax shapes, and imagery families', () => {
    expect(lookupCombatBestiaryGlossaryTerm('BAPO')?.title).toBe('Battle Poetry');
    expect(lookupCombatBestiaryGlossaryTerm('PROBE')?.body).toMatch(/Interrogative verse form/i);
    expect(lookupCombatBestiaryGlossaryTerm('DISSONANCE')?.body).toMatch(/Discord/i);
    expect(lookupCombatBestiaryGlossaryTerm('FLESH')?.body).toMatch(/Spellweave object/i);
    expect(lookupCombatBestiaryGlossaryTerm('SONIC')?.title).toMatch(/Sonic/);
  });

  it('parses mixed copy into glossary segments', () => {
    const segments = parseCombatBestiaryGlossaryText(
      'Press DISSONANCE with PROBE forms. Avoid RESONANCE.',
    );

    expect(segments.some((segment) => segment.type === 'term' && segment.value === 'DISSONANCE')).toBe(true);
    expect(segments.some((segment) => segment.type === 'term' && segment.value === 'PROBE')).toBe(true);
    expect(segments.some((segment) => segment.type === 'text' && segment.value.includes('with'))).toBe(true);
  });
});