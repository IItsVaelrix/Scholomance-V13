import { describe, it, expect } from 'vitest';
import { parseDiscoveryInquiry } from '../../../codex/core/constellation/discoveryInquiry.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

function parseQuery(q) {
  return parseDiscoveryInquiry(resolveQueryIdentity(q));
}

describe('parseDiscoveryInquiry', () => {
  it('parses resemble + feel more emotional', () => {
    const p = parseQuery('Words that resemble darkness but feel more emotional');
    expect(p.status).toBe('ok');
    expect(p.seeds).toEqual(['darkness']);
    expect(p.relation).toBe('resemble');
    expect(p.modifiers).toEqual(['emotional']);
    expect(p.modifierSources[0]).toEqual({ token: 'emotional', source: 'span' });
    expect(p.constraints.rhymeWith).toBeNull();
  });

  it('parses rhyme with gravity + spiritual modifier', () => {
    const p = parseQuery('words that rhyme with gravity but feel spiritual');
    expect(p.status).toBe('ok');
    expect(p.relation).toBe('rhyme');
    expect(p.constraints.rhymeWith).toBe('gravity');
    expect(p.seeds).toContain('gravity');
    expect(p.modifiers).toEqual(['spiritual']);
  });

  it('parses near grief + hard rhyme with sea', () => {
    const p = parseQuery('words semantically near grief that rhyme with sea');
    expect(p.status).toBe('ok');
    expect(p.relation).toBe('near');
    expect(p.seeds).toEqual(['grief']);
    expect(p.constraints.rhymeWith).toBe('sea');
    expect(p.modifiers).toEqual([]);
  });

  it('treats unknown token after more as span modifier (sepulchral)', () => {
    const p = parseQuery('words like winter but more sepulchral');
    expect(p.seeds).toEqual(['winter']);
    expect(p.relation).toBe('resemble');
    expect(p.modifiers).toEqual(['sepulchral']);
    expect(p.modifierSources[0].source).toBe('span');
  });

  it('refuses when no seeds remain', () => {
    const p = parseQuery('words that feel more');
    expect(p.status).toBe('refuse');
    expect(p.seeds).toEqual([]);
  });
});
