/**
 * ANTIGEN LOOP — the join between mechanical discovery and mechanical admission.
 *
 * Two halves existed and neither closed on its own:
 *
 *   antigen-witness  breaks a line and reports the tests did not notice. That
 *                    proves the line is UNPROTECTED. It does not prove anything
 *                    is BROKEN — a surviving mutant can be semantically
 *                    equivalent, and the first one examined nearly was.
 *
 *   gene-compile     admits a rule only if its witnesses flip. But somebody had
 *                    to hand-write those witnesses, so authorship survived.
 *
 * This closes the gap: given a shipped implementation and its surviving mutant,
 * find inputs on which the two actually DISAGREE, and emit them as the
 * `witness:` clauses of a gene skeleton. Discovery becomes mechanical, and what
 * it produces is exactly the artifact admission requires.
 *
 * The one thing it must never do is decide which behaviour is right. It has no
 * meaning to reason with, and a probe that judged would be an author again. It
 * records both behaviours, writes NO required check, and hands the skeleton over
 * as raw material — theorized, never injected.
 *
 * `EQUIVALENT_AS_PROBED` is never shortened to `EQUIVALENT`. The corpus is
 * finite; absence of a distinguishing input is absence of evidence.
 */

import { pathToFileURL } from 'node:url';

export const PROBE = { RETURNED: 'RETURNED', THREW: 'THREW' };

/**
 * Fixed and deliberately boring. A corpus that varies per run cannot be
 * reproduced, and every entry here is a shape that has actually broken something
 * in this repo: the null that made a verifier throw instead of returning false,
 * the array that made a Python enum check raise `unhashable type`, the empty
 * object that satisfied a truthiness test while carrying nothing.
 */
export const HOSTILE_CORPUS = [
  { label: 'null', value: null },
  { label: 'undefined', value: undefined },
  { label: 'zero', value: 0 },
  { label: 'empty string', value: '' },
  { label: 'empty array', value: [] },
  { label: 'empty object', value: {} },
  { label: 'wrong scalar', value: 42 },
  { label: 'boolean', value: true },
  { label: 'array of string', value: ['X'] },
  { label: 'nested object', value: { a: { b: 1 } } },
];

/** One call, one outcome. Never an opinion about the outcome. */
export function classify(thunk) {
  try {
    const value = thunk();
    return { outcome: PROBE.RETURNED, detail: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value) };
  } catch (error) {
    return { outcome: PROBE.THREW, detail: error?.constructor?.name ?? 'Error' };
  }
}

const same = (a, b) => a.outcome === b.outcome && a.detail === b.detail;

/** Inputs on which shipped and mutant disagree, with both behaviours recorded. */
export function distinguish(shipped, mutant, corpus = HOSTILE_CORPUS) {
  const distinguishing = [];
  for (const { label, value } of corpus) {
    const s = classify(() => shipped(value));
    const m = classify(() => mutant(value));
    if (!same(s, m)) distinguishing.push({ label, input: value, shipped: s, mutant: m });
  }
  return {
    verdict: distinguishing.length > 0 ? 'DISTINGUISHED' : 'EQUIVALENT_AS_PROBED',
    probed: corpus.length,
    distinguishing,
  };
}

const describeOutcome = (o) => (o.outcome === PROBE.THREW ? `threw ${o.detail}` : `returned ${o.detail}`);

/**
 * A gene skeleton with real witnesses and NO required check. The check is the
 * one part a human or agent writes, and it is the part the witness gate can
 * catch being wrong.
 */
export function toGeneSkeleton(finding, distinguished) {
  if (!distinguished?.distinguishing?.length) return null;
  const fn = finding.symbol ?? 'unknown';
  const id = `AUTO_${String(fn).replace(/\W+/g, '_').toUpperCase()}_L${finding.line}`;

  const drift = distinguished.distinguishing.map(({ label, input, shipped, mutant }) => {
    const witness = JSON.stringify({ fn, input: input === undefined ? null : input, inputLabel: label });
    return `- On ${label}, shipped ${describeOutcome(shipped)} and the unguarded form ${describeOutcome(mutant)} — witness: ${witness}`;
  }).join('\n');

  return `### ${id}  (auto · conf 0.00)
**Do:** UNWRITTEN — derived from a surviving mutant at ${finding.path}:${finding.line}. State the invariant this line holds, then let the witnesses below decide whether the rule bites.
**Required checks:**
- TODO write one check in a lexicon form; an unbound line compiles to Theory and is never executable
**Forbidden drift:**
${drift}
`;
}

/** Load a module twice, once with a line replaced, and hand back both exports. */
export async function loadPair(absPath, line, mutatedLine, { readFileSync, writeFileSync: write } = {}) {
  const fs = await import('node:fs');
  const read = readFileSync ?? fs.readFileSync;
  const put = write ?? fs.writeFileSync;
  const original = read(absPath, 'utf8');
  const shipped = await import(`${pathToFileURL(absPath).href}?shipped=${Date.now()}`);
  const lines = original.split('\n');
  lines[line - 1] = mutatedLine;
  put(absPath, lines.join('\n'));
  try {
    const mutant = await import(`${pathToFileURL(absPath).href}?mutant=${Date.now()}`);
    return { shipped, mutant };
  } finally {
    put(absPath, original);
  }
}
