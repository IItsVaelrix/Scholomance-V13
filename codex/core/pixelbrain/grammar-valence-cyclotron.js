/**
 * Grammar Valence Cyclotron — PB-CONSTELLATION-GRAMMAR-GAP-v1
 *
 * A diagnostic receptor for Constellation molecules that repeatedly reach an
 * unlicensed adjacency. The receptor never enters the parser chart: it turns
 * the observed frontier into sealed semantic atoms, compares the vacancy with
 * optional antigen memory cells, and reports only construction hypotheses that
 * existing Grimoire chemistry can name.
 *
 * Pure core: no filesystem, network, clock, process state, persistence, or
 * grammar mutation.
 */

import { createHash } from 'node:crypto';

import { BONDS, LIFTS } from '../constellation/compose.js';
import { buildGapSimulationSlate } from '../constellation/grimoire/gap-simulation.js';
import {
  fireability,
  observedTypes,
  productiveTypes,
} from '../constellation/grimoire/reactor.js';
import {
  createMemoryCellPacket,
  evaluateMemoryCellOsmosis,
  verifyMemoryCellPacket,
} from '../immunity/memory-cell-osmosis.js';
import { verifyInvestigationReport } from '../immunity/cleri-probe/canonical-report.js';
import { generateSemantotopographicVector } from '../semantic/semantotopography.js';
import { canonicalStringify } from './canonical-json.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from './bytecode-error.js';
import { createSemanticAtom } from './semantic-valence-cyclotron.js';

export const GRAMMAR_VALENCE_CYCLOTRON_CONTRACT = 'PB-CONSTELLATION-GRAMMAR-GAP-v1';
export const GRAMMAR_VALENCE_CYCLOTRON_SCHEMA_VERSION = '1.0.0';
export const GRAMMAR_VALENCE_CYCLOTRON_MODE = 'grammar-valence-vacancy';

const VECTOR_DIMENSIONS = 128;
const LICENSED_PAIRS = new Set(BONDS.map((bond) => `${bond[0]}+${bond[1]}`));
const DEFAULTS = Object.freeze({
  topPairs: 40,
  minCount: 2,
  candidateLimit: 128,
});

function compareText(a, b) {
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, context = {}, category = ERROR_CATEGORIES.VALUE) {
  const error = new BytecodeError(
    category,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.ARTIFACT,
    category === ERROR_CATEGORIES.RANGE
      ? ERROR_CODES.OUT_OF_BOUNDS
      : ERROR_CODES.INVALID_VALUE,
    { subsystem: 'grammar-valence-cyclotron', message, ...context },
  );
  error.message = message;
  throw error;
}

function stableClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(stableClone));
  return Object.freeze(Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, stableClone(value[key])]),
  ));
}

function stableHash(prefix, value, length = 16) {
  const canonical = canonicalStringify(stableClone(value));
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `${prefix}:${digest.slice(0, length)}`;
}

function normalizeText(value, field, max = 256) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > max) {
    fail(`${field} must contain 1..${max} characters`, { field, length: normalized.length });
  }
  return normalized;
}

function normalizeType(value, field) {
  const normalized = normalizeText(value, field, 64);
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(normalized)) {
    fail(`${field} is not a valid Constellation type`, { field, value });
  }
  return normalized;
}

function normalizeInteger(value, fallback, min, max, field) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    fail(`${field} must be an integer in ${min}..${max}`, { field, value }, ERROR_CATEGORIES.RANGE);
  }
  return parsed;
}

function normalizeRefs(values, field, max = 256) {
  if (!Array.isArray(values)) fail(`${field} must be an array`, { field });
  const refs = [...new Set(values.map((value) => normalizeText(value, field, 256)))].sort();
  if (refs.length > max) {
    fail(`${field} may contain at most ${max} values`, { field, actual: refs.length });
  }
  return refs;
}

function cleriReportRefs(reports = []) {
  if (!Array.isArray(reports)) fail('cleriReports must be an array', { field: 'cleriReports' });
  return reports.map((report, index) => {
    if (report?.contract !== 'SCHOL-CLERI-PROBE-v2' || report?.schemaVersion !== '2.0.0') {
      fail('cleriReports accepts only SCHOL-CLERI-PROBE-v2 reports', {
        index,
        contract: report?.contract || null,
        schemaVersion: report?.schemaVersion || null,
      });
    }
    const verification = verifyInvestigationReport(report);
    if (!verification.valid) {
      fail('cleriReports contains an unverified SCHOL-CLERI-PROBE-v2 report', {
        index,
        reason: verification.reason,
      });
    }
    return normalizeText(report.reportId, 'cleriReports.reportId', 256);
  });
}

function normalizeDependencyEvidence(values = []) {
  if (!Array.isArray(values)) {
    fail('dependencyEvidence must be an array', { field: 'dependencyEvidence' });
  }
  const byKey = new Map();
  for (const value of values) {
    const deprel = normalizeText(value?.deprel, 'dependencyEvidence.deprel', 64);
    const label = normalizeText(value?.label || deprel, 'dependencyEvidence.label', 160);
    const count = normalizeInteger(value?.count, 1, 1, 1_000_000, 'dependencyEvidence.count');
    const key = `${deprel}|${label}`;
    const prior = byKey.get(key);
    byKey.set(key, { deprel, label, count: (prior?.count || 0) + count });
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count
      || compareText(a.deprel, b.deprel)
      || compareText(a.label, b.label),
  );
}

function slug(value) {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '').slice(0, 32) || 'unknown';
}

function grammarGapDescriptor(left, right, dependencyEvidence = []) {
  const relations = normalizeDependencyEvidence(dependencyEvidence)
    .map((row) => `${row.deprel}:${row.count}`)
    .join(' ');
  return `constellation grammar gap ${left} ${right} unlicensed adjacency ${relations}`.trim();
}

function grammarGapVector(left, right, dependencyEvidence = []) {
  return generateSemantotopographicVector(
    grammarGapDescriptor(left, right, dependencyEvidence),
    VECTOR_DIMENSIONS,
  );
}

/**
 * Seal a known grammar-gap shape as an existing SCHOL-MEMCELL-v1 antigen.
 * The antigen remains a recurrence receptor; it cannot promote a bond.
 */
export function createGrammarGapAntigenCell(input = {}) {
  const left = normalizeType(input.left, 'left');
  const right = normalizeType(input.right, 'right');
  const dependencyEvidence = normalizeDependencyEvidence(input.dependencyEvidence || []);
  return createMemoryCellPacket({
    id: normalizeText(input.id, 'id', 128),
    family: 'immunity',
    mode: 'antigen',
    vector: grammarGapVector(left, right, dependencyEvidence),
    membrane: {
      similarityFloor: input.membrane?.similarityFloor ?? 0.95,
      driftCeiling: input.membrane?.driftCeiling ?? 0.05,
      concentrationLimit: input.membrane?.concentrationLimit ?? 0.99,
    },
    sourceBytecode: input.sourceBytecode ?? null,
    stableContext: {
      detector: 'grammar-valence-cyclotron',
      pair: `${left}+${right}`,
      dependencyRelations: dependencyEvidence.map((row) => row.deprel),
    },
    seed: input.seed ?? 42,
  });
}

function gapAtoms(gap, maxOccurrences) {
  const left = normalizeType(gap.left, 'gap.left');
  const right = normalizeType(gap.right, 'gap.right');
  const dependencyEvidence = normalizeDependencyEvidence(gap.dependencyEvidence || []);
  const occurrence = normalizeInteger(gap.n, 1, 1, 1_000_000, 'gap.n');
  const grounding = Math.round((Math.log1p(occurrence) / Math.log1p(maxOccurrences)) * 1e6) / 1e6;
  const pairDigest = stableHash('gapatom1', { left, right }, 10).slice('gapatom1:'.length);
  const evidence = [
    `unlicensed adjacency ${left}+${right}`,
    `observed occurrences ${occurrence}`,
    ...dependencyEvidence.slice(0, 12).map((row) => `gold frontier ${row.label} x${row.count}`),
  ];

  return {
    left: createSemanticAtom({
      id: `grammar.left.${slug(left)}.${pairDigest}`,
      label: `${left} left frontier molecule`,
      domain: 'constellation',
      offers: [`frontier.${slug(left)}`],
      seeks: ['grammar.bond'],
      traits: ['left.frontier', 'maximal.molecule'],
      inhibits: [],
      grounding,
      evidence,
    }),
    right: createSemanticAtom({
      id: `grammar.right.${slug(right)}.${pairDigest}`,
      label: `${right} right frontier molecule`,
      domain: 'constellation',
      offers: [`frontier.${slug(right)}`],
      seeks: ['grammar.bond'],
      traits: ['maximal.molecule', 'right.frontier'],
      inhibits: [],
      grounding,
      evidence,
    }),
    vacancy: createSemanticAtom({
      id: `grammar.vacancy.${pairDigest}`,
      label: `${left} plus ${right} grammar valence vacancy`,
      domain: 'grammar-diagnostic',
      offers: ['grammar.vacancy'],
      seeks: ['grammar.bond'],
      traits: ['diagnostic.only', 'unlicensed.adjacency'],
      inhibits: ['parser-chart'],
      grounding,
      evidence,
    }),
  };
}

function antigenMatches(gap, antigenCells) {
  const vector = grammarGapVector(gap.left, gap.right, gap.dependencyEvidence || []);
  const matches = [];
  for (const cell of antigenCells) {
    if (!verifyMemoryCellPacket(cell)) {
      fail('antigenCells contains an invalid SCHOL-MEMCELL-v1 packet', {
        cellId: cell?.id || null,
      });
    }
    if (cell.mode !== 'antigen') {
      fail('grammar gap receptors accept only antigen-mode memory cells', {
        cellId: cell.id,
        mode: cell.mode,
      });
    }
    const result = evaluateMemoryCellOsmosis(cell, {
      vector,
      concentration: 0,
      seed: cell.vector.seed,
    });
    if (result.anomalyKind !== 'antigen_match') continue;
    matches.push({
      cellId: result.cellId,
      anomalyKind: result.anomalyKind,
      similarity: result.similarity,
      confidence: result.confidence,
      checksum: result.checksum,
    });
  }
  return matches.sort(
    (a, b) => b.similarity - a.similarity || compareText(a.cellId, b.cellId),
  );
}

function recordIdentity(record) {
  return {
    sentId: record.sentId ?? null,
    tokens: (record.tokens || []).map((token) => ({
      id: token.id,
      form: token.form,
      lemma: token.lemma,
      upos: token.upos,
      head: token.head,
      deprel: token.deprel,
    })),
  };
}

function normalizeRecords(records, limit) {
  if (!Array.isArray(records)) fail('records must be an array', { field: 'records' });
  const selected = records.slice(0, limit ?? records.length);
  for (const [index, record] of selected.entries()) {
    if (!record || !Array.isArray(record.tokens) || record.tokens.length === 0) {
      fail('each record must contain a non-empty tokens array', { index });
    }
  }
  return selected;
}

function normalizeConfiguration(options = {}) {
  const limit = options.limit === undefined || options.limit === null
    ? null
    : normalizeInteger(options.limit, undefined, 1, 1_000_000, 'limit');
  return {
    limit,
    topPairs: normalizeInteger(options.topPairs, DEFAULTS.topPairs, 1, 256, 'topPairs'),
    minCount: normalizeInteger(options.minCount, DEFAULTS.minCount, 1, 1_000_000, 'minCount'),
    candidateLimit: normalizeInteger(
      options.candidateLimit,
      DEFAULTS.candidateLimit,
      1,
      1024,
      'candidateLimit',
    ),
    grammarOnly: true,
  };
}

function normalizeObservedTypes(values) {
  if (values instanceof Set) return new Set([...values].map((value) => normalizeType(value, 'observedTypes')));
  if (!Array.isArray(values)) fail('observedTypes must be an array or Set', { field: 'observedTypes' });
  return new Set(values.map((value) => normalizeType(value, 'observedTypes')));
}

function candidateForGap(candidate, gap, observed, allCandidates, productive, antigenRefs) {
  const left = normalizeType(candidate.left, 'candidate.left');
  const right = normalizeType(candidate.right, 'candidate.right');
  const result = normalizeType(candidate.result, 'candidate.result');
  const head = Number(candidate.head);
  if (head !== 0 && head !== 1) fail('candidate.head must be 0 or 1', { head: candidate.head });
  const fire = fireability({ left, right }, observed, allCandidates);
  const companions = allCandidates
    .filter((row) => fire.missing.includes(row.result))
    .map((row) => row.signature)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort();
  const canReachRoot = productive.has(result);
  let verdict = 'CANDIDATE_ONLY';
  let reason = 'Observed inputs can fire and the candidate result remains productive toward S.';
  if (!canReachRoot) {
    verdict = 'REFUSED';
    reason = 'Candidate result has no productive path to a spanning root.';
  } else if (!fire.fireable && !fire.pairedOnly) {
    verdict = 'REFUSED';
    reason = 'Candidate consumes a type the observed base chart never builds.';
  } else if (fire.pairedOnly) {
    reason = 'Candidate requires the listed companion construction signatures to become fireable.';
  }

  return {
    signature: normalizeText(candidate.signature, 'candidate.signature', 192),
    bonds: [{
      left,
      right,
      result,
      head,
      law: normalizeText(candidate.law, 'candidate.law', 192),
      source: normalizeText(candidate.source, 'candidate.source', 96),
      status: normalizeText(candidate.status || 'hypothesis', 'candidate.status', 64),
    }],
    companionSignatures: companions,
    fireability: {
      fireable: fire.fireable,
      missing: [...fire.missing].sort(),
      suppliedBySlate: [...fire.suppliedBySlate].sort(),
      pairedOnly: fire.pairedOnly,
    },
    productive: canReachRoot,
    evidence: {
      occurrences: gap.n,
      deprels: normalizeDependencyEvidence(gap.dependencyEvidence || [])
        .map((row) => row.deprel)
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort(),
      antigenRefs,
    },
    verdict,
    reason,
  };
}

/**
 * Build a sealed report from precomputed gap evidence. This is exported so
 * offline reactors and tests can bind their own frozen corpus substrate without
 * reaching into parser internals.
 */
export function buildGrammarValenceGapReport(input = {}) {
  const configuration = normalizeConfiguration(input.configuration || {});
  const records = normalizeRecords(input.records || [], configuration.limit);
  const gaps = Array.isArray(input.gaps) ? input.gaps : fail('gaps must be an array');
  const rawCandidates = Array.isArray(input.candidates)
    ? input.candidates
    : fail('candidates must be an array');
  const rejectedPairs = Array.isArray(input.rejectedPairs)
    ? input.rejectedPairs
    : fail('rejectedPairs must be an array');
  const antigenCells = Array.isArray(input.antigenCells || [])
    ? input.antigenCells || []
    : fail('antigenCells must be an array');
  const rawCleriRefs = input.cleriEvidenceRefs || [];
  if (!Array.isArray(rawCleriRefs)) {
    fail('cleriEvidenceRefs must be an array', { field: 'cleriEvidenceRefs' });
  }
  const cleriEvidenceRefs = normalizeRefs(
    [...rawCleriRefs, ...cleriReportRefs(input.cleriReports || [])],
    'cleriEvidenceRefs',
    64,
  );
  const observed = normalizeObservedTypes(input.observedTypes || []);
  const activeCandidates = rawCandidates
    .filter((candidate) => Number(candidate.gapCount || 0) > 0)
    .sort((a, b) => (Number(b.gapCount || 0) - Number(a.gapCount || 0))
      || compareText(a.signature, b.signature)
      || Number(a.head) - Number(b.head))
    .slice(0, configuration.candidateLimit);
  const candidateBonds = activeCandidates.map((candidate) => [
    candidate.left,
    candidate.right,
    candidate.result,
    candidate.head,
  ]);
  const productive = productiveTypes([...BONDS, ...candidateBonds], LIFTS);
  const maxOccurrences = Math.max(1, ...gaps.map((gap) => Number(gap.n) || 0));

  const reportGaps = gaps.map((rawGap) => {
    const gap = {
      pair: normalizeText(rawGap.pair, 'gap.pair', 160),
      left: normalizeType(rawGap.left, 'gap.left'),
      right: normalizeType(rawGap.right, 'gap.right'),
      n: normalizeInteger(rawGap.n, 1, 1, 1_000_000, 'gap.n'),
      corpusRefs: normalizeRefs(rawGap.corpusRefs || [], 'gap.corpusRefs', 16),
      dependencyEvidence: normalizeDependencyEvidence(rawGap.dependencyEvidence || []),
    };
    if (gap.pair !== `${gap.left}+${gap.right}`) {
      fail('gap.pair must equal gap.left+gap.right', {
        pair: gap.pair,
        expected: `${gap.left}+${gap.right}`,
      });
    }
    if (LICENSED_PAIRS.has(gap.pair)) {
      fail('a licensed grammar pair cannot be reported as a valence vacancy', {
        pair: gap.pair,
      });
    }
    const matches = antigenMatches(gap, antigenCells);
    const antigenRefs = matches.map((match) => match.cellId);
    const candidates = activeCandidates
      .filter((candidate) => candidate.left === gap.left && candidate.right === gap.right)
      .map((candidate) => candidateForGap(
        candidate,
        gap,
        observed,
        activeCandidates,
        productive,
        antigenRefs,
      ))
      .sort((a, b) => compareText(a.signature, b.signature));
    const hasCandidate = candidates.some((candidate) => candidate.verdict === 'CANDIDATE_ONLY');
    const verdict = hasCandidate
      ? 'CANDIDATE_ONLY'
      : candidates.length > 0
        ? 'REFUSED'
        : 'MISSING_STRUCTURE_UNRESOLVED';
    const gapIdentity = {
      pair: gap.pair,
      occurrences: gap.n,
      corpusRefs: gap.corpusRefs,
      dependencyEvidence: gap.dependencyEvidence,
    };
    return {
      gapId: stableHash('grammar-gap1', gapIdentity),
      pair: gap.pair,
      left: gap.left,
      right: gap.right,
      occurrences: gap.n,
      corpusRefs: gap.corpusRefs,
      dependencyEvidence: gap.dependencyEvidence,
      atoms: gapAtoms(gap, maxOccurrences),
      unmetValence: 'grammar.bond',
      existingLaw: { checked: true, found: false },
      antigenMatches: matches,
      candidates,
      verdict,
    };
  }).sort((a, b) => b.occurrences - a.occurrences || compareText(a.pair, b.pair));

  const normalizedRejected = rejectedPairs.map((row) => ({
    pair: normalizeText(row.pair, 'rejectedPairs.pair', 160),
    occurrences: normalizeInteger(
      row.occurrences ?? row.n,
      1,
      1,
      1_000_000,
      'rejectedPairs.occurrences',
    ),
    reason: normalizeText(row.reason, 'rejectedPairs.reason', 256),
  })).sort((a, b) => b.occurrences - a.occurrences || compareText(a.pair, b.pair));

  const grammarChecksum = stableHash('grammar1', { bonds: BONDS, lifts: LIFTS });
  const recordsChecksum = stableHash('records1', records.map(recordIdentity));
  const counts = {
    recordsInput: records.length,
    observedGapTypes: reportGaps.length,
    occurrences: reportGaps.reduce((sum, gap) => sum + gap.occurrences, 0),
    candidates: reportGaps.reduce((sum, gap) => sum + gap.candidates.length, 0),
    rejectedPairs: normalizedRejected.length,
    antigenMatches: reportGaps.reduce((sum, gap) => sum + gap.antigenMatches.length, 0),
  };
  const body = {
    contract: GRAMMAR_VALENCE_CYCLOTRON_CONTRACT,
    schemaVersion: GRAMMAR_VALENCE_CYCLOTRON_SCHEMA_VERSION,
    mode: GRAMMAR_VALENCE_CYCLOTRON_MODE,
    configuration,
    substrate: { grammarChecksum, recordsChecksum },
    counts,
    gaps: reportGaps,
    rejectedPairs: normalizedRejected,
    cleriEvidenceRefs,
    verdict: reportGaps.length > 0 ? 'GAPS_DETECTED' : 'NO_GAPS',
  };
  return stableClone({ ...body, checksum: stableHash('grammar-cyclotron1', body) });
}

/** Mine strict grammar failures and emit the sealed diagnostic report. */
export function runGrammarValenceCyclotron(records, posMap, options = {}) {
  const configuration = normalizeConfiguration(options);
  const selectedRecords = normalizeRecords(records, configuration.limit);
  if (!(posMap instanceof Map)) fail('posMap must be a Map', { field: 'posMap' });
  const slate = buildGapSimulationSlate(selectedRecords, posMap, {
    topPairs: configuration.topPairs,
    minCount: configuration.minCount,
    limit: configuration.limit ?? undefined,
    grammarOnly: true,
  });
  const observed = observedTypes(selectedRecords, posMap, BONDS, {
    limit: configuration.limit ?? undefined,
  });
  return buildGrammarValenceGapReport({
    records: selectedRecords,
    gaps: slate.gaps,
    candidates: slate.candidates,
    rejectedPairs: slate.rejectedPairs,
    observedTypes: observed,
    antigenCells: options.antigenCells || [],
    cleriEvidenceRefs: options.cleriEvidenceRefs || [],
    cleriReports: options.cleriReports || [],
    configuration,
  });
}

/** Verify contract identity and deterministic checksum without mutating input. */
export function verifyGrammarValenceGapReport(report) {
  if (!report || report.contract !== GRAMMAR_VALENCE_CYCLOTRON_CONTRACT) return false;
  if (report.schemaVersion !== GRAMMAR_VALENCE_CYCLOTRON_SCHEMA_VERSION) return false;
  if (report.mode !== GRAMMAR_VALENCE_CYCLOTRON_MODE) return false;
  if (!Array.isArray(report.gaps) || !Array.isArray(report.rejectedPairs)) return false;
  if (typeof report.checksum !== 'string') return false;
  const { checksum, ...body } = report;
  return checksum === stableHash('grammar-cyclotron1', body);
}
