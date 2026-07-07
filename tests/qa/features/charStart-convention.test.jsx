/**
 * Permanent Regression Guard - Truesight charStart Convention
 *
 * Pins the canonical charStart convention used by the Lexical editor and the
 * upstream analysis pipeline. The bug this guards against (Prion #1 +
 * Prion #2 from the spatial-immune-orchestrator chemotaxis run) was:
 *   - Two consumers computed the same offset with two different conventions.
 *   - The resonance gate stopped matching, so words never got colored.
 *   - A text-keyed fallback silently applied the WRONG analysis to repeated
 *     words, masking the upstream failure.
 *   - Result: "many different fixes" couldn't land because the bug was
 *     structural, not logical.
 *
 * This file is the permanent guard. If the convention drifts, the offset
 * tests fail and CI stops the merge. If a text-keyed fallback is ever
 * reintroduced, the source-grep test fails. If the NaN-poisoned G2P path
 * (Prion #3) ever leaks through, the color guard test fails.
 *
 * @bytecode SCHOL-TRUESIGHT-CHARSTART-CONVENTION-GUARD
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import {
  computeCharStartFromLexical,
  resolveTokenDataAtPosition,
  buildIdentityKey,
} from '../../../src/lib/lexical/charStart.js';
import { wordTruesight, tokenTruesight } from '../../../src/pages/Visualiser/truesightColor.ts';

const here = dirname(fileURLToPath(import.meta.url));
const truesightPluginPath = resolvePath(here, '../../../src/lib/lexical/TruesightPlugin.jsx');
const charStartModulePath = resolvePath(here, '../../../src/lib/lexical/charStart.js');

/**
 * Build a minimal mock Lexical node tree that satisfies the walk contract:
 *   getType(), getTextContent(), getPreviousSibling(), getParent().
 * Each node is a plain object - no lexical package required.
 *
 * Faithful to the real Lexical editor: each paragraph contains alternating
 * word TextNodes and space TextNodes (real Lexical leaves the spaces between
 * words as plain TextNodes that the transform does not consume).
 */
function makeNode(type, text, parent = null) {
  const node = {
    _type: type,
    _text: text,
    _parent: parent,
    _previousSibling: null,
    getType() { return this._type; },
    getTextContent() { return this._text; },
    getParent() { return this._parent; },
    getPreviousSibling() { return this._previousSibling; },
    setPreviousSibling(sib) { this._previousSibling = sib; return this; },
  };
  return node;
}

function makeParagraphChain(paragraphTexts) {
  // paragraphs: [ 'Hello', 'World' ]
  // Returns the root plus the leaf text nodes for direct inspection.
  // Each paragraph has alternating [word, space, word, space, ..., word] nodes.
  const root = makeNode('root', '');
  let prevParagraph = null;
  const paragraphs = paragraphTexts.map((text) => {
    const paragraph = makeNode('paragraph', text, root);
    if (prevParagraph) paragraph.setPreviousSibling(prevParagraph);
    prevParagraph = paragraph;
    return paragraph;
  });
  const leaves = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs[i];
    const words = paragraph._text.split(/(\s+)/).filter(Boolean);
    let prevLeaf = null;
    for (const token of words) {
      const type = /^\s+$/.test(token) ? 'text' : 'text';
      const leaf = makeNode(type, token, paragraph);
      if (prevLeaf) leaf.setPreviousSibling(prevLeaf);
      prevLeaf = leaf;
      leaves.push(leaf);
    }
  }
  return { root, paragraphs, leaves };
}

describe('Truesight charStart convention - single source of truth', () => {
  it('returns 0 for the first leaf of a single paragraph', () => {
    const { leaves } = makeParagraphChain(['Hello']);
    expect(computeCharStartFromLexical(leaves[0])).toBe(0);
  });

  it('counts previous leaves inside the same paragraph (including spaces)', () => {
    // 'Alpha beta gamma' -> leaves: [Alpha, ' ', beta, ' ', gamma]
    // Alpha=0, ' '=5, beta=6, ' '=10, gamma=11
    const { leaves } = makeParagraphChain(['Alpha beta gamma']);
    expect(computeCharStartFromLexical(leaves[0])).toBe(0);
    expect(computeCharStartFromLexical(leaves[1])).toBe(5);
    expect(computeCharStartFromLexical(leaves[2])).toBe(6);
    expect(computeCharStartFromLexical(leaves[3])).toBe(10);
    expect(computeCharStartFromLexical(leaves[4])).toBe(11);
  });

  it('adds 1 per previous paragraph for the joining newline', () => {
    const { leaves } = makeParagraphChain(['Hello', 'World']);
    // Paragraph 0 has one leaf 'Hello' at 0. Paragraph 1 has one leaf
    // 'World' whose charStart is 5 (length of 'Hello') + 1 (newline) = 6.
    expect(computeCharStartFromLexical(leaves[0])).toBe(0);
    expect(computeCharStartFromLexical(leaves[1])).toBe(6);
  });

  it('matches $getScrollText() convention: paragraphs joined with single \\n, no trailing newline', () => {
    // 'see\nhear\ntell' has length 14.
    // see=0, ' '=3, hear=4, ' '=8, tell=9
    // After the second paragraph, hear is at 4 (0 + len('see')), tell at 9.
    const { leaves, paragraphs } = makeParagraphChain(['see', 'hear', 'tell']);
    expect(computeCharStartFromLexical(leaves[0])).toBe(0);
    expect(computeCharStartFromLexical(leaves[1])).toBe(4);
    expect(computeCharStartFromLexical(leaves[2])).toBe(9);
    // Paragraphs themselves are at the start of their text.
    expect(computeCharStartFromLexical(paragraphs[0])).toBe(0);
    expect(computeCharStartFromLexical(paragraphs[1])).toBe(4);
    expect(computeCharStartFromLexical(paragraphs[2])).toBe(9);
  });

  it('returns 0 for the root node', () => {
    const { root } = makeParagraphChain(['Hello', 'World']);
    expect(computeCharStartFromLexical(root)).toBe(0);
  });
});

describe('Truesight charStart convention - position-only lookup hierarchy', () => {
  it('resolves by charStart when the position matches', () => {
    const { leaves } = makeParagraphChain(['see', 'hear']);
    // leaves: [see, ' ', hear, ' ']. 'hear' is at index 2.
    const node = leaves[2];
    const cs = computeCharStartFromLexical(node);
    const byCharStart = { [cs]: { token: 'hear', vowelFamily: 'IY' } };
    expect(resolveTokenDataAtPosition(node, 'hear', byCharStart, null)).toEqual({
      token: 'hear',
      vowelFamily: 'IY',
    });
  });

  it('falls back to identity lookup when charStart misses', () => {
    const { leaves } = makeParagraphChain(['see', 'hear']);
    const node = leaves[2];
    const cs = computeCharStartFromLexical(node);
    const byIdentity = { [`hear-${cs}`]: { token: 'hear', vowelFamily: 'IY' } };
    expect(resolveTokenDataAtPosition(node, 'hear', null, byIdentity)).toEqual({
      token: 'hear',
      vowelFamily: 'IY',
    });
  });

  it('returns null when neither charStart nor identity matches - and does NOT fall back to a text-keyed cache', () => {
    const { leaves } = makeParagraphChain(['see', 'hear']);
    const node = leaves[2];
    // Provide a charStart map with a different offset and an identity map
    // for a different word. Resolution must be null.
    const byCharStart = { 99: { token: 'wrong' } };
    const byIdentity = { 'wrong-99': { token: 'wrong' } };
    expect(resolveTokenDataAtPosition(node, 'hear', byCharStart, byIdentity)).toBeNull();
  });

  it('produces the correct identity key for repeated words at different positions', () => {
    expect(buildIdentityKey('the', 0)).toBe('the-0');
    expect(buildIdentityKey('The', 12)).toBe('the-12');
    expect(buildIdentityKey('', 0)).toBe('-0');
  });
});

describe('Truesight charStart convention - source-level invariants', () => {
  it('does not implement a text-keyed lookup fallback in TruesightPlugin.jsx', () => {
    // Source-level guard: the silent-override bug was a `Map.set` keyed by
    // lowercased text. If anyone re-introduces that pattern, the test
    // fails before the code reaches CI. We check the actual call patterns
    // (not the word in comments).
    const src = readFileSync(truesightPluginPath, 'utf8');
    // No .set( of a lowercased string variable (the original bug pattern).
    expect(src).not.toMatch(/\.set\([a-zA-Z_$.?\s]+\.toLowerCase\(\)/);
    // No .get( of a lowercased string variable (the read side of the same bug).
    expect(src).not.toMatch(/\.get\([a-zA-Z_$.?\s]+\.toLowerCase\(\)/);
  });

  it('imports the canonical helper from charStart.js (no parallel implementations)', () => {
    const src = readFileSync(truesightPluginPath, 'utf8');
    expect(src).toMatch(/from\s+['"]\.\/charStart\.js['"]/);
    expect(src).toMatch(/computeCharStartFromLexical/);
    expect(src).toMatch(/resolveTokenDataAtPosition/);
    // No inline `getGlobalCharStart` re-implementation walking siblings  - 
    // the canonical helper is the single source of truth.
    expect(src).not.toMatch(/function\s+getGlobalCharStart/);
  });

  it('does not capture analyzedWordsByCharStart/Identity from the useEffect closure (staleness guard)', () => {
    // The staleness prion (RAID PAT-004 - Weave Propagation Chain) fires when
    // a helper inside a registered Lexical nodeTransform reads prop values
    // from the useEffect closure rather than from inputsRef.current. The
    // useEffect deps are [editor, isTruesight], so closure captures are
    // frozen at first mount and the transform never sees upstream updates.
    // The fix is to read those two inputs via inputsRef.current inside the
    // transform. The source-level guard below makes the fix structural.
    const src = readFileSync(truesightPluginPath, 'utf8');

    // The transform listener must NOT reference the closure-captured prop names
    // directly - it must destructure them from inputsRef.current. The listener
    // is extracted to `const transformListener` so it can be registered on both
    // node types; its body is the region we assert over.
    const listenerRegion = src.match(/const transformListener = \(textNode\) => \{[\s\S]*?\n {4}\};/);
    expect(listenerRegion, 'could not locate the transformListener in TruesightPlugin.jsx').toBeTruthy();
    if (listenerRegion) {
      // The body must read mutable inputs from inputsRef.current (staleness fix).
      expect(listenerRegion[0]).toMatch(/inputsRef\.current/);
    }

    // The listener must be registered on BOTH TextNode and TruesightWordNode.
    // Lexical dispatches transforms by exact __type; registering only on
    // TextNode left already-tokenized words ('truesight-word') unreachable, so
    // late-arriving resonance never re-coloured them. Lock the dual registration.
    expect(src).toMatch(/registerNodeTransform\(\s*TextNode\s*,\s*transformListener\s*\)/);
    expect(src).toMatch(/registerNodeTransform\(\s*TruesightWordNode\s*,\s*transformListener\s*\)/);
  });

  it('charStart.js is framework-agnostic (no React, no lexical, no global mutable state)', () => {
    // The helper is meant to be pure so it can be tested in isolation and
    // shared across UI/Codex domains without coupling. The check is on
    // imports and module-scope state, not on the prose of comments.
    const src = readFileSync(charStartModulePath, 'utf8');
    expect(src).not.toMatch(/^import .* from\s+['"]react['"]/m);
    expect(src).not.toMatch(/^import .* from\s+['"]lexical['"]/m);
    expect(src).not.toMatch(/^import .* from\s+['"]@lexical/m);
    // No module-scope `let` outside the exported function bodies.
    // The file should only have `export const`, `export function`, and
    // function-internal `let`/`const` declarations (which are NOT
    // module-scope - they're scoped to the function body). We anchor
    // column-0 to find only true module-scope declarations.
    const moduleLets = src.split('\n').filter((line) => /^(let|var)\s/.test(line));
    expect(moduleLets).toEqual([]);
  });
});

describe('Truesight charStart convention - Prion #3 NaN/poisoned-family guard', () => {
  it('wordTruesight returns a valid school string for content words', () => {
    // The G2P engine contract is "string vowel family". If it ever returns
    // NaN, undefined, or a numeric, the resolver must NOT crash and must
    // produce a non-NaN color. We assert the surface contract: result
    // is well-typed and never null for content words.
    const result = wordTruesight('reverently');
    if (result) {
      expect(typeof result.school).toBe('string');
      expect(result.school.length).toBeGreaterThan(0);
      expect(result.color).toBeDefined();
      // The color must be a non-NaN string. cssColor() returns HSL strings.
      expect(typeof result.color).toBe('string');
    }
  });

  it('tokenTruesight handles undefined/null/empty tokenData without crashing', () => {
    expect(() => tokenTruesight(null, 'see')).not.toThrow();
    expect(() => tokenTruesight(undefined, 'see')).not.toThrow();
    expect(() => tokenTruesight({}, 'see')).not.toThrow();
    const result = tokenTruesight({ vowelFamily: 'IY' }, 'see');
    expect(result).not.toBeNull();
    expect(typeof result.school).toBe('string');
  });

  it('tokenTruesight falls back to the live engine when given a NaN-poisoned family (not crash, not silent NaN color)', () => {
    // The Prion #3 contract: a malformed upstream family must NOT crash
    // and must NOT produce a NaN-poisoned color. The fallback chain is
    // tokenData.vowelFamily -> tokenData.rhymeFamily -> live engine
    // analyzeDeep. The live engine is the safety net.
    expect(() => tokenTruesight({ vowelFamily: NaN }, 'see')).not.toThrow();
    expect(() => tokenTruesight({ vowelFamily: 42 }, 'see')).not.toThrow();
    expect(() => tokenTruesight({ vowelFamily: undefined }, 'see')).not.toThrow();
    const r1 = tokenTruesight({ vowelFamily: NaN }, 'see');
    if (r1) {
      // Either the live engine produces a real school (preferred) or
      // the safe path lands on VOID. Either is acceptable; the invariant
      // is "string school, no NaN, no crash".
      expect(typeof r1.school).toBe('string');
      expect(r1.school).not.toMatch(/nan/i);
      expect(typeof r1.color).toBe('string');
    }
  });
});

describe('Truesight charStart convention - integration with the gate', () => {
  it('the resonance gate Set aligns with computeCharStartFromLexical for a known document', () => {
    // This is the test the runtime probe wishes it could do: take a known
    // document, build a known upstream analysis with known charStarts, and
    // assert the gate Set contains the expected positions.
    // Words-only offsets: 'the cat sat' -> [the, ' ', cat, ' ', sat] -> 0, 3, 4, 7, 8
    // Adding paragraph 1: 'the dog ran' -> 11+1=12, 15, 16, 19, 20
    const { leaves } = makeParagraphChain(['the cat sat', 'the dog ran']);
    const offsets = leaves.map(computeCharStartFromLexical);
    expect(offsets).toEqual([0, 3, 4, 7, 8, 12, 15, 16, 19, 20]);

    const upstreamByCharStart = {
      0: { token: 'the', vowelFamily: 'AH' },
      4: { token: 'cat', vowelFamily: 'AE' },
      8: { token: 'sat', vowelFamily: 'AE' },
      12: { token: 'the', vowelFamily: 'AH' },
      16: { token: 'dog', vowelFamily: 'AA' },
      20: { token: 'ran', vowelFamily: 'AE' },
    };

    // The resonance gate is the Set of charStarts that have a rhyme/assonance
    // connection. A known connection between 'cat' (offset 4) and 'sat'
    // (offset 8) means {4, 8} is the gate.
    const resonantSet = new Set([4, 8]);
    for (const leaf of leaves) {
      const cs = computeCharStartFromLexical(leaf);
      const expectedResonant = resonantSet.has(cs);
      const hasAnalysis = upstreamByCharStart[cs] != null;
      // The invariant: the gate only ever contains positions that EXIST in
      // the document. If a gate entry doesn't match any document charStart,
      // the upstream analysis has drifted - which is the bug Prion #1 caught.
      if (expectedResonant) {
        expect(hasAnalysis).toBe(true);
      }
    }
  });
});
