/**
 * Select measured-unwarranted + exposed opportunities.
 *
 * The live collector is research I/O. The filter itself is pure.
 *
 * @module codex/research/semantic-adjudication/collect-opportunities
 */

import { classifyInquiryCoverage } from '../../core/constellation/inquiry-coverage.js';
import { bindsConstellationInquiry } from '../../core/constellation/semanticInquiry.js';
import { resolveQueryIdentity } from '../../core/constellation/queryIdentity.js';
import { isOpportunity } from './adjudication-schema.js';

export function coverageOf(row) {
  return classifyInquiryCoverage(row?.inquiry ?? row);
}

export function selectOpportunities(rows) {
  return (rows || []).filter((row) => isOpportunity(coverageOf(row)));
}

function asQuery(item) {
  if (typeof item === 'string') return { query: item, head: null };
  return { query: String(item?.query ?? ''), head: item?.head ?? null };
}

/**
 * Run the production inquiry on a query list and keep only opportunities.
 * Research-only. Does not mutate selection.
 */
export async function collectFromQueries(queries, deps) {
  const {
    lexiconAdapter,
    phonology,
    analyzeSemanticInquiry,
    analyzeLeximancy,
    collectSenseProbeDrafts,
  } = deps;
  const kept = [];
  const rejected = {
    unbound: 0,
    notOpportunity: 0,
    byKind: Object.create(null),
  };

  for (const item of queries || []) {
    const { query, head } = asQuery(item);
    if (!query.trim()) continue;
    let identity = resolveQueryIdentity(query);
    if (head) identity = { ...identity, primaryContentToken: head };
    if (!bindsConstellationInquiry(identity)) {
      rejected.unbound += 1;
      continue;
    }
    const leximancy = analyzeLeximancy(
      lexiconAdapter,
      identity.primaryContentToken,
      { intent: identity.intent },
    );
    const inquiry = await analyzeSemanticInquiry(
      lexiconAdapter,
      identity,
      leximancy,
      phonology,
    );
    const coverage = classifyInquiryCoverage(inquiry);
    if (!isOpportunity(coverage)) {
      rejected.notOpportunity += 1;
      rejected.byKind[coverage.kind] = (rejected.byKind[coverage.kind] || 0) + 1;
      continue;
    }
    const drafts = await collectSenseProbeDrafts({
      lexiconAdapter,
      headToken: identity.primaryContentToken,
      queryTokens: identity.tokens,
      ...(phonology ? { phonology } : {}),
    });
    kept.push(Object.freeze({
      query,
      identity,
      inquiry,
      coverage,
      drafts,
      leximancy,
    }));
  }

  return Object.freeze({
    opportunities: Object.freeze(kept),
    rejected: Object.freeze(rejected),
  });
}
