/**
 * Freeze a complete adjudication case packet.
 *
 * Stores Ballistics scores and split. Does not mint a winner.
 *
 * @module codex/research/semantic-adjudication/freeze-case
 */

import { classifyInquiryCoverage } from '../../core/constellation/inquiry-coverage.js';
import { CONSTELLATION_SENSE_PROBE } from '../../core/constellation/semanticInquiry.js';
import { evalPredicate } from '../../core/semantic-calculus/hypothesisStatus.js';
import { BALLISTIC_EMBEDDING } from '../../core/lexical-analysis/semanticBallistics.js';
import { ADJUDICATION_CONTRACT } from './adjudication-schema.js';
import { caseIdOf } from './util.js';

function candidatesFromDrafts(drafts) {
  const draft = (drafts || []).find((d) => d.observationId === 'obs.lex.sense_candidates');
  const list = draft?.result?.candidates;
  if (!Array.isArray(list)) return [];
  return list.map((c) => ({
    senseId: String(c.senseId ?? ''),
    gloss: String(c.gloss ?? ''),
    lemma: String(c.lemma ?? ''),
    pos: String(c.pos ?? ''),
  })).filter((c) => c.senseId && c.gloss);
}

function splitOf(scores) {
  const finite = (scores || [])
    .map((row) => row && row.semanticScore)
    .filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (finite.length < 2) return null;
  return Math.max(...finite) - Math.min(...finite);
}

function draftFor(drafts, id) {
  return (drafts || []).find((d) => d.observationId === id) || null;
}

function predicateOutcome(spec, drafts) {
  const rec = draftFor(drafts, spec.observationId);
  if (!rec) return 'missing';
  if (rec.status !== 'observed') return rec.status;
  if (!spec.predicate) return true;
  return evalPredicate(spec.predicate, rec.result);
}

function probeSnapshot(inquiry, drafts) {
  const sense = CONSTELLATION_SENSE_PROBE.hypotheses.find((h) => h.id === 'h_sense_by_gloss_overlap');
  const predictions = (sense?.predictions || []).map((p) => Object.freeze({
    id: p.id,
    description: p.description,
    holds: predicateOutcome(p, drafts),
  }));
  const falsifiers = (sense?.falsifiers || []).map((f) => {
    const outcome = predicateOutcome(f, drafts);
    return Object.freeze({
      id: f.id,
      description: f.description,
      triggered: outcome === true,
      outcome,
    });
  });
  const observations = (drafts || []).map((d) => Object.freeze({
    observationId: d.observationId,
    status: d.status,
    result: summarizeObservation(d),
  }));
  return Object.freeze({
    status: inquiry?.selection?.reason ?? null,
    hypotheses: inquiry?.hypotheses ?? null,
    predictions: Object.freeze(predictions),
    falsifiers: Object.freeze(falsifiers),
    observations: Object.freeze(observations),
    receiptDigests: Object.freeze([...(inquiry?.receiptDigests || [])]),
  });
}

function summarizeObservation(draft) {
  if (!draft?.result || typeof draft.result !== 'object') return draft?.result ?? null;
  if (draft.observationId === 'obs.lex.sense_candidates') {
    return Object.freeze({
      candidateCount: draft.result.candidates?.length ?? 0,
      queryTokens: Object.freeze([...(draft.result.queryTokens || [])]),
    });
  }
  if (draft.observationId === 'obs.lex.relation_paths') {
    return Object.freeze({
      edgeCount: draft.result.edges?.length ?? 0,
      kinCount: draft.result.kin?.length ?? 0,
    });
  }
  if (draft.observationId === 'obs.lex.lexical_entries') {
    return Object.freeze({
      framePos: draft.result.framePos ?? null,
      frameCue: draft.result.frameCue ?? null,
      viableWordCount: draft.result.viableWordCount ?? null,
      distinctPronunciations: draft.result.distinctPronunciations ?? null,
      entryCount: draft.result.entries?.length ?? 0,
    });
  }
  if (draft.observationId === 'obs.phon.neighbours') {
    const winner = draft.result.winner || {};
    return Object.freeze({
      sameLemma: winner.sameLemma ?? null,
      crossLemmaCosine: winner.crossLemmaCosine ?? null,
    });
  }
  return Object.freeze({ ...draft.result });
}

export function freezeCase({
  query,
  identity,
  inquiry,
  drafts,
  leximancy,
  versions = {},
} = {}) {
  const coverage = classifyInquiryCoverage(inquiry);
  const candidateSenses = candidatesFromDrafts(drafts);
  const scores = Array.isArray(inquiry?.ballistics?.scores)
    ? inquiry.ballistics.scores.map((s) => Object.freeze({
      senseId: s.senseId,
      semanticScore: s.semanticScore,
    }))
    : [];
  const split = splitOf(scores) ?? coverage.split;
  const caseId = caseIdOf({
    query,
    senseIds: candidateSenses.map((c) => c.senseId),
    contract: ADJUDICATION_CONTRACT,
  });

  return Object.freeze({
    caseId,
    query: String(query ?? ''),
    candidateSenses: Object.freeze(candidateSenses.map((c) => Object.freeze(c))),
    probe: probeSnapshot(inquiry, drafts),
    frameEvidence: Object.freeze({
      headToken: inquiry?.headToken ?? identity?.primaryContentToken ?? null,
      framePos: inquiry?.framePos ?? null,
      frameCue: inquiry?.frameCue ?? null,
      viableWordCount: inquiry?.viableWordCount ?? null,
      isHeteronym: Boolean(inquiry?.isHeteronym),
      distinctPronunciations: inquiry?.distinctPronunciations ?? null,
    }),
    lexicalEvidence: Object.freeze({
      lexicalEntries: Object.freeze([...(inquiry?.lexicalEntries || [])]),
      candidateCount: inquiry?.evidence?.candidateCount ?? candidateSenses.length,
      edgeCount: inquiry?.evidence?.edgeCount ?? 0,
      interpretations: Object.freeze([...(leximancy?.interpretations || [])].map((i) => Object.freeze({
        id: i.id,
        gloss: i.gloss,
      }))),
    }),
    ballistics: Object.freeze({
      status: inquiry?.ballistics?.status ?? null,
      embedding: inquiry?.ballistics?.embedding
        ? Object.freeze({ ...inquiry.ballistics.embedding })
        : null,
      scores: Object.freeze(scores),
      split,
    }),
    identity: identity ? Object.freeze({ ...identity }) : null,
    coverage: Object.freeze({
      kind: coverage.kind,
      semantic: coverage.semantic,
      instrumentation: coverage.instrumentation,
      opportunity: coverage.opportunity,
      reason: coverage.reason,
    }),
    versions: Object.freeze({
      packetContract: ADJUDICATION_CONTRACT,
      probeVersion: CONSTELLATION_SENSE_PROBE.version,
      ballisticsVersion: versions.ballisticsVersion ?? 'sem-inquiry-2',
      embeddingVersion: inquiry?.ballistics?.embedding?.version ?? BALLISTIC_EMBEDDING.version,
      corpusVersion: versions.corpusVersion ?? null,
    }),
  });
}
