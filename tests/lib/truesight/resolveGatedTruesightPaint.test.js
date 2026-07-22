/**
 * COLOR_DRAGON permanent regression block — gene BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK.
 *
 * When the resonance gate is active, hue may come ONLY from backend token fields
 * (rhymeFamily / rhymeKey / vowelFamily). Frontend G2P (wordTruesight / analyzeDeep)
 * must never paint a gated word, and must never invent a family when tokenData is absent.
 *
 * Visualiser already obeys this in visualizerTruesightAmp.js. This module is the
 * shared Lexical/Scribe authority so the same law cannot drift again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const wordTruesight = vi.fn(() => ({
  color: '#00ffaa',
  school: 'WILL',
  analysis: { client: true },
}));
const tokenTruesight = vi.fn((tokenData) => ({
  color: '#ff00aa',
  school: 'SONIC',
  analysis: tokenData,
}));

vi.mock('../../../src/pages/Visualiser/truesightColor.ts', () => ({
  wordTruesight: (...args) => wordTruesight(...args),
  tokenTruesight: (...args) => tokenTruesight(...args),
}));

const { resolveGatedTruesightPaint } = await import(
  '../../../src/lib/truesight/resolveGatedTruesightPaint.js'
);

describe('resolveGatedTruesightPaint — COLOR_DRAGON law', () => {
  beforeEach(() => {
    wordTruesight.mockClear();
    tokenTruesight.mockClear();
  });

  it('gated + resonant + backend tokenData → tokenTruesight with no frontend fallback', () => {
    const gate = new Map([[0, 'rhyme']]);
    const tokenData = { vowelFamily: 'IY', rhymeKey: 'IY-open', charStart: 0 };
    const paint = resolveGatedTruesightPaint({
      resonantCharStarts: gate,
      charStart: 0,
      tokenData,
      word: 'see',
    });

    expect(paint.shouldColor).toBe(true);
    expect(paint.tier).toBe('rhyme');
    expect(paint.color).toBe('#ff00aa');
    expect(paint.school).toBe('SONIC');
    expect(tokenTruesight).toHaveBeenCalledWith(tokenData, 'see', { allowFrontendFallback: false });
    expect(wordTruesight).not.toHaveBeenCalled();
  });

  it('COLOR_DRAGON: gated + resonant WITHOUT tokenData stays uncolored (never wordTruesight)', () => {
    const gate = new Map([[0, 'rhyme']]);
    const paint = resolveGatedTruesightPaint({
      resonantCharStarts: gate,
      charStart: 0,
      tokenData: null,
      word: 'love',
    });

    expect(paint.shouldColor).toBe(false);
    expect(paint.tier).toBe('rhyme');
    expect(paint.color).toBeNull();
    expect(paint.school).toBeNull();
    expect(paint.truesightClass).toBe('grimoire-word--grey');
    expect(wordTruesight).not.toHaveBeenCalled();
    expect(tokenTruesight).not.toHaveBeenCalled();
  });

  it('gated but non-resonant → grey, no frontend G2P', () => {
    const gate = new Map([[10, 'rhyme']]);
    const paint = resolveGatedTruesightPaint({
      resonantCharStarts: gate,
      charStart: 0,
      tokenData: { vowelFamily: 'OW' },
      word: 'move',
    });

    expect(paint.shouldColor).toBe(false);
    expect(paint.tier).toBeNull();
    expect(paint.color).toBeNull();
    expect(paint.truesightClass).toBe('grimoire-word--grey');
    expect(wordTruesight).not.toHaveBeenCalled();
    expect(tokenTruesight).not.toHaveBeenCalled();
  });

  it('ungated (null gate) → never paints via wordTruesight (empty gate = grey, not skittles)', () => {
    const paint = resolveGatedTruesightPaint({
      resonantCharStarts: null,
      charStart: 0,
      tokenData: { vowelFamily: 'IY' },
      word: 'see',
    });

    expect(paint.shouldColor).toBe(false);
    expect(paint.color).toBeNull();
    expect(paint.truesightClass).toBe('grimoire-word--grey');
    expect(wordTruesight).not.toHaveBeenCalled();
  });

  it('empty Map gate → grey everywhere (authority-empty is not a license to invent hue)', () => {
    const paint = resolveGatedTruesightPaint({
      resonantCharStarts: new Map(),
      charStart: 0,
      tokenData: { vowelFamily: 'IY' },
      word: 'see',
    });

    expect(paint.shouldColor).toBe(false);
    expect(paint.color).toBeNull();
    expect(wordTruesight).not.toHaveBeenCalled();
  });

  it('assonance tier gets soft class, still backend-only hue', () => {
    const gate = new Map([[0, 'assonance']]);
    const tokenData = { rhymeKey: 'AE-T', charStart: 0 };
    const paint = resolveGatedTruesightPaint({
      resonantCharStarts: gate,
      charStart: 0,
      tokenData,
      word: 'cat',
    });

    expect(paint.shouldColor).toBe(true);
    expect(paint.tier).toBe('assonance');
    expect(paint.truesightClass).toContain('grimoire-word--assonant');
    expect(paint.truesightClass).toContain('grimoire-word--SONIC');
    expect(tokenTruesight).toHaveBeenCalledWith(tokenData, 'cat', { allowFrontendFallback: false });
  });
});

describe('permanent source lock — TruesightPlugin must not call wordTruesight', () => {
  it('TruesightPlugin.jsx routes paint through resolveGatedTruesightPaint and never imports wordTruesight', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const src = readFileSync(join(root, 'src/lib/lexical/TruesightPlugin.jsx'), 'utf8');

    expect(src).toMatch(/resolveGatedTruesightPaint/);
    expect(src).not.toMatch(/\bwordTruesight\b/);
    // Must not open a gated-path to tokenTruesight without the shared resolver
    // (that path previously passed `{ token: text }` and let analyzeDeep invent hue).
    expect(src).not.toMatch(/tokenTruesight\s*\(/);
  });
});
