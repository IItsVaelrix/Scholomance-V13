/**
 * TURNING A PARSE FAILURE INTO A LOCATED, NAMED CATEGORY.
 *
 * The predecessor of this module asked whether a failing sentence CONTAINED a
 * hand-listed marker. That is correlational: a marker equally common in
 * successes is not a blocker, and the list is blind to anything not on it.
 *
 * This asks a causal question instead. The gold tree gives the correct
 * bracketing; the chart gives how far up the composer actually got. The
 * diagnosis is the frontier between them — the lowest gold subtrees the chart
 * failed to build. Location comes from the chart, the NAME comes from the UD
 * annotators, and the ranking comes from our own failures. The external
 * resource supplies vocabulary, never a priority ordering.
 */

/**
 * @type {Readonly<{PARSED: string, LEXICAL: string, GRAMMAR: string, ROOT_TYPE_MISMATCH: string}>}
 */
export const OUTCOME = Object.freeze({
  PARSED: 'PARSED',
  LEXICAL: 'LEXICAL',
  GRAMMAR: 'GRAMMAR',
  ROOT_TYPE_MISMATCH: 'ROOT_TYPE_MISMATCH',
});

/**
 * Token span of every gold subtree, by head id.
 *
 * `contiguous` is false when the subtree's tokens are discontinuous — a
 * non-projective dependency. Such a subtree has no single span, so asking the
 * chart whether it built one is not a question the chart can answer.
 */
function subtreeSpans(tokens) {
  const children = new Map();
  for (const token of tokens) {
    if (!children.has(token.head)) children.set(token.head, []);
    children.get(token.head).push(token.id);
  }
  const spans = new Map();
  const visiting = new Set();

  const visit = (id) => {
    if (spans.has(id)) return spans.get(id);
    // A malformed file could cycle. Treat a re-entry as a leaf rather than
    // overflowing the stack, because a crashed runner diagnoses nothing.
    if (visiting.has(id)) return { min: id - 1, max: id - 1, size: 1, contiguous: true };
    visiting.add(id);
    let min = id - 1;
    let max = id - 1;
    let size = 1;
    for (const child of children.get(id) || []) {
      const span = visit(child);
      if (span.min < min) min = span.min;
      if (span.max > max) max = span.max;
      size += span.size;
    }
    visiting.delete(id);
    const out = { min, max, size, contiguous: max - min + 1 === size };
    spans.set(id, out);
    return out;
  };

  for (const token of tokens) visit(token.id);
  return { spans, children };
}

/**
 * The minimal unreachable subtrees: every child reachable, the subtree itself
 * not. Reporting an ancestor as well would name a site that was never going to
 * build, and reporting a descendant's parent instead of the descendant would
 * point past the actual stopping point.
 */
function minimalUnreachable(tokens, result) {
  const cells = new Set();
  for (const molecule of (result && result.molecules) || []) {
    cells.add(`${molecule.from}:${molecule.to}`);
  }
  const { spans, children } = subtreeSpans(tokens);
  const byId = new Map(tokens.map((token) => [token.id, token]));

  let nonProjective = 0;
  /** true | false | null, where null means "not a question spans can answer". */
  const reachable = new Map();
  for (const token of tokens) {
    const span = spans.get(token.id);
    if (!span.contiguous) {
      nonProjective += 1;
      reachable.set(token.id, null);
      continue;
    }
    reachable.set(token.id, cells.has(`${span.min}:${span.max}`));
  }

  const categories = [];
  for (const token of tokens) {
    if (reachable.get(token.id) !== false) continue;
    const kids = children.get(token.id) || [];
    // A non-projective child leaves this site undiagnosable, not diagnosed.
    if (!kids.every((child) => reachable.get(child) === true)) continue;
    const head = byId.get(token.head);
    const span = spans.get(token.id);
    categories.push({
      deprel: token.deprel,
      label: `${token.deprel} (${token.upos} -> ${head ? head.upos : 'ROOT'})`,
      from: span.min,
      to: span.max,
    });
  }
  return { categories, nonProjective };
}

/**
 * Classify one sentence.
 *
 * PRECEDENCE. `LEXICAL` outranks `ROOT_TYPE_MISMATCH`: if gold POS makes the
 * sentence parse, the cause is tagging by definition, and that is the more
 * actionable of the two.
 *
 * `ROOT_TYPE_MISMATCH` is read off `spanning` and `stable` directly — the chart
 * reached the top and the molecule there was not a root type. That is the
 * `(end)`-blocker shape, where sentences composed fully and failed a type
 * check, and it is a different thing from a missing construction.
 *
 * @param {object} record from `parseConllu`
 * @param {object} result `compose(tokens, realPosMap)`
 * @param {object|null} goldResult `compose(tokens, goldPosMap(record))`, or null
 *   when the ablation was not run
 * @returns {{outcome: string, overGenerated: boolean, categories: Array<{deprel: string, label: string, from: number, to: number}>, nonProjective: number}}
 */
export function diagnose(record, result, goldResult = null) {
  const tokens = (record && record.tokens) || [];
  const parsed = Boolean(result && result.stable && result.stable.length > 0);
  const goldParsed = Boolean(goldResult && goldResult.stable && goldResult.stable.length > 0);

  if (parsed) {
    return {
      outcome: OUTCOME.PARSED,
      overGenerated: Boolean(goldResult) && !goldParsed,
      categories: [],
      nonProjective: 0,
    };
  }

  const frontier = minimalUnreachable(tokens, result);

  if (goldParsed) {
    return { outcome: OUTCOME.LEXICAL, overGenerated: false, ...frontier };
  }
  if (result && result.spanning && result.spanning.length > 0) {
    return {
      outcome: OUTCOME.ROOT_TYPE_MISMATCH,
      overGenerated: false,
      categories: [],
      nonProjective: frontier.nonProjective,
    };
  }
  return { outcome: OUTCOME.GRAMMAR, overGenerated: false, ...frontier };
}

/**
 * A signature for text with NO gold tree — the Gutenberg corpus every prior
 * coverage number was measured against.
 *
 * The greedy maximal tiling is where the chart stopped, expressed as a type
 * sequence. It is deliberately NOT given a construction name here: a name is
 * earned only by matching a signature to a deprel category on the golded side.
 * The caller reports unmatched signatures as UNCLASSIFIED with a count, because
 * a classifier with an "other" bucket always achieves 100% coverage.
 *
 * Ties are broken by first appearance, which is deterministic given that
 * `compose` enumerates its chart in a fixed order.
 *
 * @param {object} result
 * @param {number} tokenCount
 * @returns {string}
 */
export function frontierSignature(result, tokenCount) {
  const widest = new Map();
  for (const molecule of (result && result.molecules) || []) {
    const current = widest.get(molecule.from);
    if (!current || molecule.to > current.to) widest.set(molecule.from, molecule);
  }
  const out = [];
  let at = 0;
  while (at < tokenCount) {
    const molecule = widest.get(at);
    if (!molecule) { out.push('?'); at += 1; continue; }
    out.push(molecule.type);
    at = molecule.to + 1;
  }
  return out.join(' ');
}
