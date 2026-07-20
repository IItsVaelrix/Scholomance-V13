import { assessCandidateMargin } from '../candidate-lattice/index.js';
import {
  LEMMA_RANK_FORMULA_VERSION,
  MORPHOLOGY_VERSION,
} from '../lexical-graph/types.js';
import { candidateId } from './morphology.js';
import {
  createBallisticSignature,
  scoreSenseBallistics,
} from './semanticBallistics.js';

const WEIGHTS = Object.freeze({
  word: Object.freeze({ morphology: 0.8, corpus: 0.2 }),
  contextual: Object.freeze({ morphology: 0.4, semantics: 0.4, pos: 0.15, corpus: 0.05 }),
});

const THRESHOLDS = Object.freeze({
  word: 0.2,
  selection: 0.12,
  line: 0.12,
  local: 0.1,
  document: 0.1,
});

const roundScore = (value) => Number(Math.max(0, Math.min(1, value)).toFixed(6));

function contextText(context) {
  if (context.scope === 'selection') return context.selection;
  if (context.scope === 'line') return context.containingLine;
  if (context.scope === 'local') {
    return [...context.neighboringLines, context.containingLine].join('\n');
  }
  if (context.scope === 'document') return context.documentContext;
  return '';
}

function contextSegments(context) {
  if (context.scope === 'selection') return ['selection'];
  if (context.scope === 'line') return ['line:0'];
  if (context.scope === 'local') {
    return ['line:0', ...context.neighboringLines.map((_, index) => `line:neighbor:${index}`)];
  }
  if (context.scope === 'document') return ['document'];
  return ['surface'];
}

function positionalText(context) {
  if (context.scope === 'line' || context.scope === 'local') return context.containingLine;
  return contextText(context);
}

function inferredPos(context) {
  const tokens = positionalText(context).toLocaleLowerCase('en-US').match(/[a-z']+/g) ?? [];
  const surface = context.surface.toLocaleLowerCase('en-US');
  const index = tokens.indexOf(surface);
  if (index < 0) return null;
  const previous = tokens[index - 1] ?? '';
  if (['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their'].includes(previous)) {
    return 'noun';
  }
  if (previous === 'to' || ['i', 'you', 'he', 'she', 'we', 'they'].includes(previous)) {
    return 'verb';
  }
  if (['am', 'is', 'are', 'was', 'were', 'be', 'been', 'seem', 'seems'].includes(previous)) {
    return 'adjective';
  }
  return null;
}

function healthyMorphologyIndex(state) {
  return state?.status === 'complete'
    && state.version === MORPHOLOGY_VERSION
    && typeof state.sourceDigest === 'string'
    && state.sourceDigest.length > 0
    && Number.isInteger(state.expectedLemmaCount)
    && state.expectedLemmaCount >= 0
    && state.indexedLemmaCount === state.expectedLemmaCount;
}

function sensesFor(sensesByCandidate, id) {
  if (sensesByCandidate instanceof Map) return sensesByCandidate.get(id) ?? [];
  return sensesByCandidate?.[id] ?? [];
}

function addDegradation(target, item) {
  if (!item) return;
  const key = `${item.code}\u0000${item.channel}\u0000${item.reason}`;
  if (!target.has(key)) target.set(key, item);
}

export function rankLemmaCandidates({
  context,
  forms,
  sensesByCandidate = new Map(),
  frequencies = new Map(),
  morphologyIndex,
}) {
  const grouped = new Map();
  for (const form of Array.isArray(forms) ? forms : []) {
    const id = candidateId(form.lemma, form.pos);
    const current = grouped.get(id) ?? {
      id,
      lemma: form.lemma,
      pos: form.pos,
      forms: [],
    };
    current.forms.push(form);
    grouped.set(id, current);
  }

  const threshold = THRESHOLDS[context.scope];
  const degradation = new Map();
  const indexHealthy = healthyMorphologyIndex(morphologyIndex);
  if (!indexHealthy) {
    addDegradation(degradation, {
      code: morphologyIndex?.status === 'unavailable'
        ? 'morphology_index_unavailable'
        : 'morphology_index_incomplete',
      channel: 'morphology',
      reason: morphologyIndex?.reason ?? 'Morphology index is not complete and source-current.',
    });
  }

  if (grouped.size === 0) {
    return Object.freeze({
      resolution: Object.freeze({
        surface: context.surface,
        status: 'unbound',
        margin: 0,
        threshold,
        formulaVersion: LEMMA_RANK_FORMULA_VERSION,
        morphologyIndex,
        candidates: Object.freeze([]),
      }),
      degradation: Object.freeze([...degradation.values()]),
    });
  }

  const isWord = context.scope === 'word';
  const weights = isWord ? WEIGHTS.word : WEIGHTS.contextual;
  const semanticContext = isWord ? null : contextText(context);
  const sharedContextSignature = semanticContext ? createBallisticSignature(semanticContext) : null;
  const posSignal = isWord ? null : inferredPos(context);
  const candidateRows = [...grouped.values()];
  const candidateFrequencies = candidateRows
    .filter((candidate) => frequencies instanceof Map && frequencies.has(candidate.lemma))
    .map((candidate) => Number(frequencies.get(candidate.lemma)) || 0);
  const maxFrequency = candidateFrequencies.length > 0 ? Math.max(...candidateFrequencies) : null;

  const scored = candidateRows.map((candidate) => {
    const evidence = candidate.forms.map((form) => ({
      channel: 'morphology',
      score: roundScore(form.morphologicalConfidence),
      available: true,
      source: form.source,
      reason: form.transformId,
      contextSegments: ['surface'],
    }));
    const channels = {
      morphology: Math.max(...candidate.forms.map((form) => form.morphologicalConfidence)),
    };

    let senses = [];
    if (!isWord) {
      const rawSenses = sensesFor(sensesByCandidate, candidate.id).map((sense) => ({
        ...sense,
        lemma: candidate.lemma,
        pos: candidate.pos,
      }));
      const ballistic = scoreSenseBallistics(semanticContext, rawSenses, {
        contextSignature: sharedContextSignature,
      });
      senses = [...ballistic.senses];
      for (const item of ballistic.degradation) addDegradation(degradation, item);
      const availableScores = senses
        .map((sense) => sense.semanticScore)
        .filter((score) => Number.isFinite(score));
      if (availableScores.length > 0) {
        channels.semantics = Math.max(...availableScores);
        evidence.push({
          channel: 'semantics',
          score: roundScore(channels.semantics),
          available: true,
          source: 'turboquant:sense',
          reason: 'strongest compatible sense',
          contextSegments: contextSegments(context),
        });
      } else {
        evidence.push({
          channel: 'semantics',
          score: 0,
          available: false,
          source: 'turboquant:sense',
          reason: 'No compatible sense embedding was available.',
          contextSegments: contextSegments(context),
        });
        addDegradation(degradation, {
          code: 'semantic_ballistics_unavailable',
          channel: 'semantics',
          reason: 'No compatible sense embedding was available for at least one candidate.',
        });
      }

      if (posSignal) {
        channels.pos = candidate.pos === posSignal ? 1 : 0;
        evidence.push({
          channel: 'pos',
          score: channels.pos,
          available: true,
          source: 'deterministic-context-trigger',
          reason: `context suggests ${posSignal}`,
          contextSegments: contextSegments(context),
        });
      } else {
        evidence.push({
          channel: 'pos',
          score: 0,
          available: false,
          source: 'deterministic-context-trigger',
          reason: 'No deterministic POS trigger fired.',
          contextSegments: contextSegments(context),
        });
      }
    }

    if (maxFrequency !== null && frequencies.has(candidate.lemma)) {
      const frequency = Math.max(0, Number(frequencies.get(candidate.lemma)) || 0);
      channels.corpus = maxFrequency === 0
        ? 0
        : Math.log1p(frequency) / Math.log1p(maxFrequency);
      evidence.push({
        channel: 'corpus',
        score: roundScore(channels.corpus),
        available: true,
        source: 'corpus-frequency',
        reason: `${frequency} attested occurrences`,
      });
    } else {
      evidence.push({
        channel: 'corpus',
        score: 0,
        available: false,
        source: 'corpus-frequency',
        reason: 'Corpus frequency is unavailable.',
      });
    }

    let numerator = 0;
    let denominator = 0;
    for (const [channel, score] of Object.entries(channels)) {
      const weight = weights[channel];
      if (weight === undefined) continue;
      numerator += score * weight;
      denominator += weight;
    }
    return {
      key: candidate.id,
      id: candidate.id,
      lemma: candidate.lemma,
      pos: candidate.pos,
      score: roundScore(denominator > 0 ? numerator / denominator : 0),
      evidence: Object.freeze(evidence),
      senses: Object.freeze(senses),
    };
  });

  const assessment = assessCandidateMargin(scored, threshold);
  const ranked = assessment.ranked.map((candidate, index) => Object.freeze({
    id: candidate.id,
    lemma: candidate.lemma,
    pos: candidate.pos,
    rank: index + 1,
    score: candidate.score,
    evidence: candidate.evidence,
    senses: candidate.senses,
  }));
  let status;
  let margin = roundScore(assessment.margin);
  if (assessment.status === 'single') {
    status = indexHealthy ? 'clear' : 'ambiguous';
    if (!indexHealthy) margin = 0;
  } else {
    status = assessment.status === 'clear' ? 'clear' : 'ambiguous';
  }

  return Object.freeze({
    resolution: Object.freeze({
      surface: context.surface,
      status,
      margin,
      threshold,
      formulaVersion: LEMMA_RANK_FORMULA_VERSION,
      morphologyIndex,
      candidates: Object.freeze(ranked),
    }),
    degradation: Object.freeze([...degradation.values()]),
  });
}
