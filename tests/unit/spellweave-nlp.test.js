import { describe, expect, it } from 'vitest';
import {
  parseWeave,
  resolveWeaveLexeme,
  canonicalizeWeaveText,
} from '../../codex/core/spellweave.engine.js';
import { tokenize } from '../../codex/core/tokenizer.js';

describe('resolveWeaveLexeme', () => {
  it('passes through canonical registry tokens', () => {
    expect(resolveWeaveLexeme('rend')).toEqual({
      original: 'rend',
      token: 'REND',
      source: 'registry',
    });
  });

  it('maps natural-language verbs to weave intents', () => {
    expect(resolveWeaveLexeme('tear')?.token).toBe('REND');
    expect(resolveWeaveLexeme('attack')?.token).toBe('OFFENSIVE');
    expect(resolveWeaveLexeme('protect')?.token).toBe('SHIELD');
    expect(resolveWeaveLexeme('disrupt')?.token).toBe('DISRUPTION');
  });

  it('maps natural-language objects to registry objects', () => {
    expect(resolveWeaveLexeme('body')?.token).toBe('FLESH');
    expect(resolveWeaveLexeme('psyche')?.token).toBe('MIND');
    expect(resolveWeaveLexeme('rock')?.token).toBe('STONE');
  });

  it('strips light inflections before synonym lookup', () => {
    expect(resolveWeaveLexeme('tearing')?.token).toBe('REND');
    expect(resolveWeaveLexeme('attacking')?.token).toBe('OFFENSIVE');
    expect(resolveWeaveLexeme('protected')?.source).toBe('inflection');
  });
});

describe('parseWeave NLP integration', () => {
  it('parses natural-language clauses as legal intent-object bridges', () => {
    const parsed = parseWeave('tear the flesh');
    expect(parsed.clauses[0].intents).toEqual(['REND']);
    expect(parsed.clauses[0].objects).toEqual(['FLESH']);
    expect(parsed.clauses[0].legality).toBe('legal');
    expect(parsed.nlpResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ original: 'tear', token: 'REND', source: 'nlp' }),
      ]),
    );
  });

  it('accepts class-level disruption prose', () => {
    const parsed = parseWeave('disrupt the mind');
    expect(parsed.clauses[0].intents).toEqual(['DISRUPTION']);
    expect(parsed.clauses[0].objects).toEqual(['MIND']);
    expect(parsed.clauses[0].legality).toBe('legal');
  });

  it('chains NLP-resolved clauses on connectors', () => {
    const parsed = parseWeave('attack the flesh then disrupt the stone');
    expect(parsed.clauses).toHaveLength(2);
    expect(parsed.clauses[0].intents).toEqual(['OFFENSIVE']);
    expect(parsed.clauses[1].intents).toEqual(['DISRUPTION']);
    expect(parsed.chainType).toBe('SEQUENCE');
    expect(parsed.strikes).toBe(2);
  });

  it('canonicalizes prose for counsel surfaces', () => {
    const { canonicalWeave, resolutions } = canonicalizeWeaveText('protect the soul', tokenize);
    expect(canonicalWeave).toBe('shield soul');
    expect(resolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ original: 'protect', token: 'SHIELD' }),
      ]),
    );
  });
});