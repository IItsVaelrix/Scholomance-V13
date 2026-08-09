/**
 * GAP-TARGETED GRAMMAR SIMULATION
 *
 * Mines coverage failures for adjacent chart categories that current BONDS
 * cannot combine, then proposes construction-chemistry candidates aimed at
 * clause / nominal closure — not free-C search.
 *
 * Every proposal is either:
 *   - licensed by Result Conservation (pair affinity + projection), or
 *   - an explicit special construction (named, approximation by default)
 *
 * PURE proposal generation. The reactor scores them.
 *
 * @module codex/core/constellation/grimoire/gap-simulation
 */

import { BONDS } from '../compose.js';
import { composePacked } from '../compose-packed.js';
import {
  pairOperation,
  projectResult,
  conservesResult,
  CONSTRUCTION_SCHEMAS,
} from './projection-laws.js';

/**
 * Closure-neighborhood construction proposals (named chemistry).
 * These are hypotheses about gap pairs — not yet Grimoire law.
 */
export const GAP_CONSTRUCTION_PROPOSALS = Object.freeze([
  // Asyndetic / juxtaposed clauses — autopsy S+S cluster
  {
    left: 'S', right: 'S', result: 'S', head: 0,
    construction: 'asyndetic-clause-sequence',
    status: 'approximation',
    rationale: 'Adjacent full clauses without coordinator; first clause technical head (UD conj-like).',
  },
  // Left nominal fringe outside partial S — autopsy NP+S
  {
    left: 'NP', right: 'S', result: 'S', head: 1,
    construction: 'left-nominal-plus-clause',
    status: 'approximation',
    rationale: 'Subject/topic NP immediately left of an already-built S; matrix is the S.',
  },
  // Right nominal fringe — autopsy S+NP
  {
    left: 'S', right: 'NP', result: 'S', head: 0,
    construction: 'clause-plus-right-nominal',
    status: 'approximation',
    rationale: 'Trailing NP after a complete S (titles, appositions, fringe).',
  },
  // Nominal juxtaposition / compounds
  {
    left: 'NP', right: 'NP', result: 'NP', head: 0,
    construction: 'nominal-juxtaposition',
    status: 'approximation',
    rationale: 'Adjacent NPs (names, titles, flat multiword nominals).',
  },
  {
    left: 'N', right: 'N', result: 'N', head: 0,
    construction: 'noun-noun-compound',
    status: 'approximation',
    rationale: 'English N-N compound; left technical head (UD compound).',
  },
  {
    left: 'PROPN', right: 'PROPN', result: 'N', head: 0,
    construction: 'proper-name-sequence',
    status: 'approximation',
    rationale: 'Multi-token proper names before NP lift.',
  },
  {
    left: 'PROPN', right: 'N', result: 'N', head: 0,
    construction: 'proper-plus-noun',
    status: 'approximation',
    rationale: 'Name + common noun sequence.',
  },
  {
    left: 'N', right: 'PROPN', result: 'N', head: 1,
    construction: 'noun-plus-proper',
    status: 'approximation',
    rationale: 'Common noun + name.',
  },
  // Determiner on already-built NP (stacked determination)
  {
    left: 'DET', right: 'NP', result: 'NP', head: 1,
    construction: 'determiner-on-np',
    status: 'approximation',
    rationale: 'DET attaching to a completed NP (residual after ADJ+N stacks).',
  },
  // N adjacent to S (subject atom not lifted)
  {
    left: 'N', right: 'S', result: 'S', head: 1,
    construction: 'bare-noun-plus-clause',
    status: 'approximation',
    rationale: 'Bare N left of S when NP lift did not feed subject position.',
  },
  {
    left: 'PROPN', right: 'S', result: 'S', head: 1,
    construction: 'proper-plus-clause',
    status: 'approximation',
    rationale: 'Proper name left of S.',
  },
  // VP + trailing S / S + VP fringe
  {
    left: 'VP', right: 'S', result: 'S', head: 1,
    construction: 'vp-plus-clause',
    status: 'approximation',
    rationale: 'VP adjacent to S (imperative/control-ish residual).',
  },
  {
    left: 'S', right: 'VP', result: 'S', head: 0,
    construction: 'clause-plus-vp',
    status: 'approximation',
    rationale: 'S followed by VP fragment.',
  },
  // Comma-led clause (list / afterthought)
  {
    left: 'COMMA', right: 'S', result: 'S', head: 1,
    construction: 'comma-led-clause',
    status: 'scaffold',
    rationale: 'Leading comma before S in list/afterthought shapes.',
  },
  // ADJ terminal punct (fragment roots)
  {
    left: 'ADJ', right: 'PUNCT', result: 'ADJ', head: 0,
    construction: 'adj-punct-absorb',
    status: 'grammar',
    rationale: 'Seatbelt: adjectival fragments with terminal punct.',
  },
  // APPOS + NP continuation
  {
    left: 'APPOS', right: 'NP', result: 'APPOS', head: 0,
    construction: 'appos-extend',
    status: 'scaffold',
    rationale: 'Extend apposition chain.',
  },
  // S + CONJ incomplete right (needs right clause later — still may help packing)
  {
    left: 'S', right: 'CONJ', result: 'SCOMMA', head: 0,
    construction: 's-conj-bridge',
    status: 'scaffold',
    rationale: 'Clause then coordinator before right conjunct arrives.',
  },
]);

function licensedPairs() {
  return new Set(BONDS.map((b) => `${b[0]}+${b[1]}`));
}

/**
 * Mine unlicensed adjacent maximal-node pairs on sentences without spanning S.
 *
 * @param {object[]} records conllu records
 * @param {Map} posMap
 * @param {{limit?: number}} [options]
 */
export function mineCoverageGapPairs(records, posMap, options = {}) {
  const limit = options.limit || Infinity;
  const licensed = licensedPairs();
  const counts = new Map();

  let n = 0;
  for (const rec of records) {
    if (n >= limit) break;
    n += 1;
    const tokens = rec.tokens.map((t) => t.form);
    const chart = composePacked(tokens, posMap);
    const hasStableS = chart.stable.some((s) => s.type === 'S');
    if (hasStableS) continue;

    const nodes = chart.molecules;
    const maximal = nodes.filter(
      (m) => !nodes.some(
        (o) => o !== m
          && o.from <= m.from
          && o.to >= m.to
          && (o.to - o.from) > (m.to - m.from),
      ),
    );

    for (const a of maximal) {
      for (const b of maximal) {
        if (a.to + 1 !== b.from) continue;
        const pair = `${a.type}+${b.type}`;
        if (licensed.has(pair)) continue;
        if (!counts.has(pair)) {
          counts.set(pair, { pair, left: a.type, right: b.type, n: 0, examples: [] });
        }
        const row = counts.get(pair);
        row.n += 1;
        if (row.examples.length < 3) {
          row.examples.push((rec.text || tokens.join(' ')).slice(0, 100));
        }
      }
    }
  }

  return [...counts.values()].sort((a, b) => b.n - a.n);
}

/**
 * Propose a bond for a gap pair under Result Conservation or named gap schema.
 *
 * @returns {{ok: boolean, candidates?: object[], reason?: string}}
 */
export function proposeForGapPair(left, right) {
  const candidates = [];

  // 1) Generic projection if affinity exists
  const aff = pairOperation(left, right);
  if (aff) {
    const headType = aff.head === 1 ? right : left;
    for (const result of projectResult(headType, aff.operation)) {
      const c = {
        left, right, result, head: aff.head,
        operation: aff.operation,
        law: `project:${aff.operation}`,
        signature: `${left}|${right}|${result}`,
        special: false,
        source: 'projection',
      };
      const check = conservesResult(c);
      if (check.ok) candidates.push(c);
    }
  }

  // 2) Named gap constructions matching this pair
  for (const g of GAP_CONSTRUCTION_PROPOSALS) {
    if (g.left !== left || g.right !== right) continue;
    candidates.push({
      left: g.left,
      right: g.right,
      result: g.result,
      head: g.head,
      operation: `special:${g.construction}`,
      law: `gap:${g.construction}`,
      signature: `${g.left}|${g.right}|${g.result}`,
      special: true,
      status: g.status,
      rationale: g.rationale,
      source: 'gap-construction',
    });
  }

  // 3) Existing construction schemas (should rarely fire if pair unlicensed)
  for (const s of CONSTRUCTION_SCHEMAS) {
    if (s.left !== left || s.right !== right) continue;
    candidates.push({
      left: s.left,
      right: s.right,
      result: s.result,
      head: s.head,
      operation: `special:${s.construction}`,
      law: `construction:${s.construction}`,
      signature: `${s.left}|${s.right}|${s.result}`,
      special: true,
      source: 'construction-schema',
    });
  }

  // Dedupe by signature+head
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    const k = `${c.signature}|${c.head}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(c);
  }

  if (uniq.length === 0) {
    return { ok: false, reason: 'no-licensed-or-named-proposal' };
  }
  return { ok: true, candidates: uniq };
}

/**
 * Build ranked simulation slate: mine gaps → propose → unique candidates.
 *
 * @param {object[]} records
 * @param {Map} posMap
 * @param {{topPairs?: number, minCount?: number}} [options]
 */
export function buildGapSimulationSlate(records, posMap, options = {}) {
  const topPairs = options.topPairs ?? 40;
  const minCount = options.minCount ?? 10;

  const gaps = mineCoverageGapPairs(records, posMap)
    .filter((g) => g.n >= minCount)
    .slice(0, topPairs);

  const slate = [];
  const rejectedPairs = [];

  for (const gap of gaps) {
    const prop = proposeForGapPair(gap.left, gap.right);
    if (!prop.ok) {
      rejectedPairs.push({ pair: gap.pair, n: gap.n, reason: prop.reason });
      continue;
    }
    for (const c of prop.candidates) {
      slate.push({
        ...c,
        gapCount: gap.n,
        gapExamples: gap.examples,
      });
    }
  }

  // Always include explicit gap proposals even if pair mining missed them
  for (const g of GAP_CONSTRUCTION_PROPOSALS) {
    const signature = `${g.left}|${g.right}|${g.result}`;
    if (slate.some((s) => s.signature === signature && s.head === g.head)) continue;
    const gap = gaps.find((x) => x.left === g.left && x.right === g.right);
    slate.push({
      left: g.left,
      right: g.right,
      result: g.result,
      head: g.head,
      operation: `special:${g.construction}`,
      law: `gap:${g.construction}`,
      signature,
      special: true,
      status: g.status,
      rationale: g.rationale,
      source: 'gap-construction-forced',
      gapCount: gap ? gap.n : 0,
      gapExamples: gap ? gap.examples : [],
    });
  }

  // Dedupe signatures preferring higher gapCount
  const bySig = new Map();
  for (const c of slate) {
    const k = `${c.signature}|${c.head}`;
    const prev = bySig.get(k);
    if (!prev || (c.gapCount || 0) > (prev.gapCount || 0)) bySig.set(k, c);
  }

  const candidates = [...bySig.values()].sort(
    (a, b) => (b.gapCount || 0) - (a.gapCount || 0) || a.signature.localeCompare(b.signature),
  );

  return {
    gaps,
    rejectedPairs,
    candidates,
  };
}
