/**
 * ATLAS → CYCLOTRON FEED
 *
 * The cyclotron used to mine its own gap pairs from a raw corpus. This
 * module hands it atlas-selected failures instead, and carries the plate
 * and construction-label provenance back onto every candidate it names,
 * so the gate can ask what a bond explains rather than how much it parses.
 *
 * Direction of the arrow matters: research imports core, never the
 * reverse. The cyclotron stays pure and knows nothing about the atlas.
 *
 * @module codex/research/parser-failure-atlas/cyclotron-feed
 */

import { runGrammarValenceCyclotron } from '../../core/pixelbrain/grammar-valence-cyclotron.js';
import { SEALED_SPLIT } from './atlas-schema.js';
import { buildAtlas } from './build-atlas.js';
import { collectFailures } from './collect-failures.js';

export const CYCLOTRON_FEED_CONTRACT = 'PB-ATLAS-CYCLOTRON-FEED-v1';

function keyOf(record) {
  return record?.sentId || (record?.tokens || []).map((t) => t.form).join(' ');
}

function caseKey(row) {
  return row?.sentId || row?.text;
}

export function feedCyclotron(records, posMap, options = {}) {
  const split = options.split ?? 'dev';
  if (split === SEALED_SPLIT) {
    throw new Error('sealed test split cannot feed the cyclotron');
  }

  const collected = collectFailures(records, posMap, {
    split,
    maxTokens: options.maxTokens ?? 28,
  });
  const cases = collected.cases;
  const atlas = buildAtlas(cases);

  const platesByKey = new Map();
  const labelsByKey = new Map();
  for (const row of cases) {
    const key = caseKey(row);
    platesByKey.set(key, row.plate);
    labelsByKey.set(key, (row.diagnosis?.categories || [])
      .map((c) => c.label).filter(Boolean));
  }

  const fedRecords = (records || []).filter((r) => platesByKey.has(keyOf(r)));
  const cyclotron = runGrammarValenceCyclotron(fedRecords, posMap, {
    minCount: options.minCount ?? 2,
    topPairs: options.topPairs ?? 40,
    candidateLimit: options.candidateLimit ?? 64,
  });

  const candidates = [];
  const seen = new Set();
  for (const gap of cyclotron.gaps || []) {
    const plates = new Set();
    const labels = new Set();
    for (const ref of gap.corpusRefs || []) {
      const plate = platesByKey.get(ref);
      if (plate) plates.add(plate);
      for (const label of labelsByKey.get(ref) || []) labels.add(label);
    }
    // Span-filtered gold-frontier relations for this adjacency. Stronger
    // evidence than the sentence-level labels above: these had to cross
    // the vacancy to be counted.
    for (const row of gap.dependencyEvidence || []) {
      if (row?.label) labels.add(row.label);
    }

    for (const candidate of gap.candidates || []) {
      const bond = candidate.bonds?.[0];
      if (!bond) continue;
      if (seen.has(candidate.signature)) continue;
      seen.add(candidate.signature);
      candidates.push(Object.freeze({
        signature: candidate.signature,
        pair: gap.pair,
        occurrences: gap.occurrences ?? gap.n ?? 0,
        bonds: Object.freeze([Object.freeze([bond.left, bond.right, bond.result, bond.head])]),
        verdict: candidate.verdict,
        fireable: Boolean(candidate.fireability?.fireable),
        evidencePlates: Object.freeze([...plates].sort()),
        evidenceLabels: Object.freeze([...labels].sort()),
      }));
    }
  }

  return Object.freeze({
    contract: CYCLOTRON_FEED_CONTRACT,
    split,
    recordsIn: (records || []).length,
    atlasCases: cases.length,
    recordsFed: fedRecords.length,
    atlas,
    cyclotron,
    candidates: Object.freeze(candidates),
  });
}
