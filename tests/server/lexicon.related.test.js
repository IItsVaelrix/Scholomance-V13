import { describe, it, expect } from 'vitest';
import { createLexiconAdapter } from '../../codex/server/adapters/lexicon.sqlite.adapter.js';

const DB = 'scholomance_dict.sqlite';

describe('lexicon relations', () => {
  it('returns broader/narrower/akin for a common noun', () => {
    const a = createLexiconAdapter(DB);
    const rel = a.lookupRelated('dog', 20);
    expect(Array.isArray(rel.broader)).toBe(true);
    expect(rel.broader.length + rel.narrower.length + rel.akin.length).toBeGreaterThan(0);
    a.close();
  });
  it('symbols-loose returns domain/exemplifies lemmas or empty', () => {
    const a = createLexiconAdapter(DB);
    const rows = a.lookupSymbolsLoose('rose', 12);
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) expect(['domain', 'exemplifies']).toContain(r.via);
    a.close();
  });
  it('empty adapter stubs for lookupRelated and lookupSymbolsLoose', () => {
    const emptyA = createLexiconAdapter(null);
    expect(emptyA.__unsafe.connected).toBe(false);

    // lookupRelated should return empty shape without throwing
    const relResult = emptyA.lookupRelated('test', 20);
    expect(relResult).toEqual({ broader: [], narrower: [], akin: [] });

    // lookupSymbolsLoose should return empty array without throwing
    const symbolsResult = emptyA.lookupSymbolsLoose('test', 12);
    expect(Array.isArray(symbolsResult)).toBe(true);
    expect(symbolsResult.length).toBe(0);

    emptyA.close();
  });
});
