import { describe, expect, it } from 'vitest';
import {
  analyzeVerseForm,
  evaluateSyntacticalChess,
  SYNTACTIC_ARCHETYPE_PROFILES,
} from '../../codex/core/combat.syntax-chess.js';

const shade = { name: 'Whispering Shade', syntacticProfile: SYNTACTIC_ARCHETYPE_PROFILES.SHADE_BASE };
const golem = { name: 'Iron Golem', syntacticProfile: SYNTACTIC_ARCHETYPE_PROFILES.GOLEM_BASE };
const seraph = { name: 'Glass Seraph', syntacticProfile: SYNTACTIC_ARCHETYPE_PROFILES.SERAPH_GLASS_BASE };
const rot = { name: 'Rot Apostle', syntacticProfile: SYNTACTIC_ARCHETYPE_PROFILES.ROT_BASE };

describe('analyzeVerseForm', () => {
  it('detects interrogative mood and PROBE shape', () => {
    const form = analyzeVerseForm('Who wears your face? Where does the shadow end?');
    expect(form.dominantMood).toBe('interrogative');
    expect(form.shapes).toContain('PROBE');
  });

  it('detects imperative mood and COMMAND shape', () => {
    const form = analyzeVerseForm('Burn the sermon. Wash the wound. Cleanse the mold.');
    expect(form.dominantMood).toBe('imperative');
    expect(form.shapes).toContain('COMMAND');
  });

  it('detects anaphora as LITANY', () => {
    const form = analyzeVerseForm('Sing the first pane. Sing the second pane. Sing the final pane.');
    expect(form.anaphora).toBe(true);
    expect(form.shapes).toContain('LITANY');
  });

  it('detects declarative framing as WARD', () => {
    const form = analyzeVerseForm('The wall is patient and the stone will hold.');
    expect(form.shapes).toContain('WARD');
  });

  it('detects ritual chains from sequence markers', () => {
    const form = analyzeVerseForm('First the salt, then the acid, then the rust until the hinge gives.');
    expect(form.shapes).toContain('RITUAL_CHAIN');
  });

  it('is deterministic and pure', () => {
    const verse = 'Name the veil. Name the echo. Who remains?';
    expect(analyzeVerseForm(verse)).toEqual(analyzeVerseForm(verse));
  });
});

describe('grammatical form vs archetype', () => {
  it('rewards PROBE structure against a Shade', () => {
    const probing = evaluateSyntacticalChess({
      phrase: 'Who testifies against the lantern? Where does your veil end?',
      enemy: shade,
    });
    expect(probing.matchedSyntaxWeaknesses).toContain('PROBE');
    expect(probing.components.formMatch).toBeGreaterThan(0);
    expect(probing.events.some((event) => event.type === 'SYNTAX_FORM_ADVANTAGE')).toBe(true);
  });

  it('punishes WARD declarations against a Shade', () => {
    const warding = evaluateSyntacticalChess({
      phrase: 'The lantern is bright and the dawn will hold.',
      enemy: shade,
    });
    expect(warding.resistedSyntaxForms).toContain('WARD');
    expect(warding.components.formResist).toBeGreaterThan(0);
  });

  it('lets ritual chains grind a Golem', () => {
    const chain = evaluateSyntacticalChess({
      phrase: 'First the brine, then the rust, then the salt until the iron joint gives.',
      enemy: golem,
    });
    expect(chain.matchedSyntaxWeaknesses).toContain('RITUAL_CHAIN');
  });

  it('lets litany rhythm press a Glass Seraph', () => {
    const litany = evaluateSyntacticalChess({
      phrase: 'Ring the pane. Ring the choir. Ring the halo until it cracks.',
      enemy: seraph,
    });
    expect(litany.matchedSyntaxWeaknesses).toContain('LITANY');
    expect(litany.multiplier).toBeGreaterThanOrEqual(0.82);
    expect(litany.multiplier).toBeLessThanOrEqual(1.28);
  });

  it('lets imperative purification scour a Rot Apostle', () => {
    const command = evaluateSyntacticalChess({
      phrase: 'Wash the wound. Salt the sermon. Purify the spore-bed with sunlit brine.',
      enemy: rot,
    });
    expect(command.matchedSyntaxWeaknesses).toContain('COMMAND');
    expect(command.mood).toBe('imperative');
  });

  it('keeps the multiplier envelope', () => {
    const extreme = evaluateSyntacticalChess({
      phrase: 'Who? Sing the pane. Sing the pane. First then until. The wall is bright.',
      enemy: seraph,
      profile: { verseIRAmplifier: { noveltySignal: 1 } },
    });
    expect(extreme.multiplier).toBeGreaterThanOrEqual(0.82);
    expect(extreme.multiplier).toBeLessThanOrEqual(1.28);
  });
});
