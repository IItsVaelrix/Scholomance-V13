/**
 * Score treebank records and keep atlas cases.
 *
 * PURE except for the injected composer. Default composer is packed.
 *
 * @module codex/research/parser-failure-atlas/collect-failures
 */

import { composePacked, projectAnswers } from '../../core/constellation/compose-packed.js';
import { diagnose } from '../../core/constellation/failure-diagnosis.js';
import { goldAnswer, goldPosMap } from '../../core/constellation/treebank.js';
import { isAtlasCase, plateOf } from './atlas-schema.js';
import { freezeFailure } from './freeze-case.js';

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function answersOf(result) {
  const stable = result?.stable || [];
  return stable.flatMap((s) => {
    try {
      return projectAnswers(s);
    } catch {
      return [];
    }
  });
}

/**
 * Score one CoNLL-U record. Does not mutate the composer.
 */
export function scoreRecord(record, posMap, {
  split = 'dev',
  compose = composePacked,
  maxTokens = 28,
  options = {},
} = {}) {
  const tokens = (record?.tokens || []).map((t) => t.form);
  if (tokens.length > maxTokens) {
    return Object.freeze({ skip: 'too-long', record, split });
  }
  const gold = goldAnswer(record);
  const rootToken = (record?.tokens || []).find((t) => t.head === 0);
  const goldMap = goldPosMap(record);
  const result = compose(tokens, posMap, options);
  const goldResult = compose(tokens, goldMap, options);
  const answers = answersOf(result);
  const contained = answers.some((a) => same(a.subject, gold.subject) && same(a.verb, gold.verb));
  const diagnosis = diagnose(record, result, goldResult);
  return Object.freeze({
    record,
    split,
    gold: Object.freeze({
      subject: gold.subject,
      verb: gold.verb,
      rootUpos: rootToken ? rootToken.upos : 'NONE',
    }),
    diagnosis,
    contained,
    decided: null,
    chart: Object.freeze({
      spanning: result?.spanning || [],
      stable: result?.stable || [],
      molecules: result?.molecules || [],
    }),
  });
}

export function selectAtlasCases(rows) {
  return (rows || []).filter((row) => !row.skip && isAtlasCase(row));
}

export function collectFailures(records, posMap, opts = {}) {
  const cases = [];
  const skipped = { tooLong: 0, threw: 0 };
  const plates = Object.create(null);
  let scored = 0;
  for (const record of records || []) {
    try {
      const row = scoreRecord(record, posMap, opts);
      if (row.skip === 'too-long') {
        skipped.tooLong += 1;
        continue;
      }
      scored += 1;
      const plate = plateOf(row);
      if (plate) plates[plate] = (plates[plate] || 0) + 1;
      if (isAtlasCase(row)) cases.push(freezeFailure(row));
    } catch {
      skipped.threw += 1;
    }
  }
  return Object.freeze({
    scored,
    cases: Object.freeze(cases),
    skipped: Object.freeze(skipped),
    plates: Object.freeze(plates),
  });
}
