/**
 * Truesight charStart Authority — Single Source of Truth
 *
 * The Lexical editor and the upstream analysis pipeline both number characters
 * in a scroll, but they used to compute the same offset two different ways
 * (a paragraph-sibling walk in `TruesightPlugin` vs a source-relative cursor
 * in `compileVerseToIR`). When the two conventions drifted — by trailing
 * newlines, by `\\r\\n` vs `\\n`, by an extra empty paragraph, by anything —
 * the resonance gate stopped matching, the text-keyed `analysisMap` fallback
 * silently applied the wrong analysis, and the editor either colored
 * everything or nothing. That class of bug is structurally impossible after
 * this module: every consumer in the Lexical editor must import the helper
 * from here, and the test in `tests/qa/features/charStart-convention.test.jsx`
 * pins the convention so any drift trips CI before it reaches production.
 *
 * CONVENTION (v1):
 *   The document is the sequence of top-level (RootNode) paragraph
 *   children, joined by a single `\\n` character. There is no trailing
 *   newline; the last paragraph contributes only its own text length. A
 *   paragraph's own `charStart` equals the sum of all preceding paragraphs'
 *   text lengths plus one `\\n` per preceding paragraph. A word node's
 *   `charStart` equals its enclosing paragraph's `charStart` plus the sum
 *   of all preceding text-node siblings' text lengths within that paragraph.
 *
 *   This is the same convention `$getScrollText()` in `LexicalScrollEditor`
 *   uses to serialize the document, so a round-trip through
 *   `parseScrollText → compile → charStart` is lossless.
 *
 * Pure functions only — no module-scoped state, no DOM access, no React.
 * The Lexical node contract is the minimum needed to walk: `getType()`,
 * `getTextContent()`, `getPreviousSibling()`, `getParent()`. The helper is
 * therefore unit-testable with plain object mocks (see the test file).
 *
 * @bytecode SCHOL-TRUESIGHT-CHARSTART-AUTHORITY
 */

const PARAGRAPH_TYPE = 'paragraph';
const ROOT_TYPE = 'root';

/**
 * Compute the canonical charStart of a Lexical text-bearing node, given the
 * paragraph-joined-with-\\n convention.
 *
 * @param {object} node - A Lexical text-like node (TextNode, TruesightWordNode,
 *   or any node with the same walk contract).
 * @returns {number} The zero-indexed character offset of `node`'s first
 *   character in the joined document. Returns 0 for the root.
 */
export function computeCharStartFromLexical(node) {
  if (!node) return 0;

  let offset = 0;
  let cursor = node;

  // Walk from the node up to the root. At each level, sum the text of every
  // previous sibling and add 1 per previous paragraph sibling to account for
  // the joining newline.
  while (cursor && cursor.getType && cursor.getType() !== ROOT_TYPE) {
    let previousSibling = cursor.getPreviousSibling ? cursor.getPreviousSibling() : null;
    while (previousSibling) {
      const siblingType = previousSibling.getType ? previousSibling.getType() : null;
      const siblingTextLength = textLengthOf(previousSibling);
      offset += siblingTextLength;
      if (siblingType === PARAGRAPH_TYPE) {
        offset += 1; // joining newline
      }
      previousSibling = previousSibling.getPreviousSibling ? previousSibling.getPreviousSibling() : null;
    }
    cursor = cursor.getParent ? cursor.getParent() : null;
  }

  return offset;
}

/**
 * Resolve a text-bearing node's per-position analysis from a position-keyed
 * upstream analysis. This is the ONLY lookup path — no text-keyed fallback,
 * no Map.set collision risk, no silent override.
 *
 * Lookup order (most specific first):
 *   1. `analyzedWordsByCharStart[charStart]` — exact position match
 *   2. `analyzedWordsByIdentity[identity]`    — identity fallback (text + charStart)
 *
 * If neither matches, returns `null`. Callers must handle the null case
 * explicitly (e.g. fall back to the live `wordTruesight` analysis, which
 * does NOT inherit the position of a different occurrence of the same text).
 *
 * @param {object} node - The Lexical text-bearing node.
 * @param {string} textContent - The text content of the node (used for identity).
 * @param {object|null} analyzedWordsByCharStart - Position-keyed upstream map.
 * @param {object|null} analyzedWordsByIdentity - Identity-keyed upstream map.
 * @returns {object|null} The per-position analysis, or `null` if no match.
 */
export function resolveTokenDataAtPosition(node, textContent, analyzedWordsByCharStart, analyzedWordsByIdentity) {
  const charStart = computeCharStartFromLexical(node);

  if (analyzedWordsByCharStart && analyzedWordsByCharStart[charStart] != null) {
    return analyzedWordsByCharStart[charStart];
  }

  if (analyzedWordsByIdentity) {
    const identity = buildIdentityKey(textContent, charStart);
    if (analyzedWordsByIdentity[identity] != null) {
      return analyzedWordsByIdentity[identity];
    }
  }

  return null;
}

/**
 * Build the canonical identity key for a word at a position.
 * The format `${text.toLowerCase()}-${charStart}` is what the upstream
 * analysis produces and what consumers expect. Kept as a separate export
 * so callers can build keys consistently.
 *
 * @param {string} text - The word text.
 * @param {number} charStart - The canonical charStart.
 * @returns {string} The identity key.
 */
export function buildIdentityKey(text, charStart) {
  return `${String(text || '').toLowerCase()}-${charStart}`;
}

/**
 * Internal: text length of a node, with a defensive fallback for non-text
 * nodes. Paragraphs contribute their joined text (handled by the walk
 * itself, but we still need the leaf text count).
 *
 * @param {object} node
 * @returns {number}
 */
function textLengthOf(node) {
  if (!node) return 0;
  if (typeof node.getTextContent === 'function') {
    const text = node.getTextContent();
    return typeof text === 'string' ? text.length : 0;
  }
  return 0;
}
