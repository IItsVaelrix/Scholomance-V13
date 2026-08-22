/**
 * Deterministic identity for an OFFLINE Constellation parser evaluation.
 *
 * This adapter consumes the already-scored output of `runTreebank`. It does
 * not parse text, read files, observe a clock, or participate in the page
 * request path. Only whitelisted aggregate and row fields cross the boundary.
 */
import { createHash } from 'node:crypto';

export const CONSTELLATION_EVALUATION_EVIDENCE_CONTRACT =
  'SCHOL-CONSTELLATION-EVALUATION-EVIDENCE-v1';

const SHA256 = /^[0-9a-f]{64}$/;
const PARSERS = new Set(['classic', 'packed']);

function invalid(message) {
  throw new TypeError(message);
}

function finiteNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${field} must be a finite number`);
  return value;
}

function count(value, field) {
  const number = finiteNumber(value, field);
  if (!Number.isInteger(number) || number < 0) invalid(`${field} must be a non-negative integer`);
  return number;
}

function string(value, field) {
  if (typeof value !== 'string') invalid(`${field} must be a string`);
  return value;
}

function boolean(value, field) {
  if (typeof value !== 'boolean') invalid(`${field} must be a boolean`);
  return value;
}

function nullableBoolean(value, field) {
  if (value !== null && typeof value !== 'boolean') invalid(`${field} must be boolean or null`);
  return value;
}

function category(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${field} must be an object`);
  const normalized = {
    deprel: string(value.deprel, `${field}.deprel`),
    label: string(value.label, `${field}.label`),
  };
  if ('failures' in value) normalized.failures = count(value.failures, `${field}.failures`);
  if ('soleCause' in value) normalized.soleCause = count(value.soleCause, `${field}.soleCause`);
  return normalized;
}

function metrics(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) invalid('run.report must be an object');
  if (!Array.isArray(report.byRootUpos)) invalid('run.report.byRootUpos must be an array');
  if (!Array.isArray(report.categories)) invalid('run.report.categories must be an array');
  if (!report.ablation || typeof report.ablation !== 'object') invalid('run.report.ablation must be an object');
  if (!report.classifier || typeof report.classifier !== 'object') invalid('run.report.classifier must be an object');

  return {
    ablation: {
      bothFine: count(report.ablation.bothFine, 'run.report.ablation.bothFine'),
      grammar: count(report.ablation.grammar, 'run.report.ablation.grammar'),
      overGenerated: count(report.ablation.overGenerated, 'run.report.ablation.overGenerated'),
      tagging: count(report.ablation.tagging, 'run.report.ablation.tagging'),
    },
    byRootUpos: report.byRootUpos.map((entry, index) => ({
      containment: finiteNumber(entry?.containment, `run.report.byRootUpos[${index}].containment`),
      coverage: finiteNumber(entry?.coverage, `run.report.byRootUpos[${index}].coverage`),
      n: count(entry?.n, `run.report.byRootUpos[${index}].n`),
      upos: string(entry?.upos, `run.report.byRootUpos[${index}].upos`),
    })),
    categories: report.categories.map((entry, index) => category(entry, `run.report.categories[${index}]`)),
    classifier: {
      failures: count(report.classifier.failures, 'run.report.classifier.failures'),
      meanCauses: finiteNumber(report.classifier.meanCauses, 'run.report.classifier.meanCauses'),
      withCategory: count(report.classifier.withCategory, 'run.report.classifier.withCategory'),
    },
    containment: finiteNumber(report.containment, 'run.report.containment'),
    coverage: finiteNumber(report.coverage, 'run.report.coverage'),
    decision: report.decision === null
      ? null
      : finiteNumber(report.decision, 'run.report.decision'),
    n: count(report.n, 'run.report.n'),
    nonProjective: count(report.nonProjective, 'run.report.nonProjective'),
  };
}

function rows(runRows) {
  if (!Array.isArray(runRows)) invalid('run.rows must be an array');
  return runRows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid(`run.rows[${index}] must be an object`);
    if (!Array.isArray(row.categories)) invalid(`run.rows[${index}].categories must be an array`);
    return {
      categories: row.categories.map((entry, categoryIndex) =>
        category(entry, `run.rows[${index}].categories[${categoryIndex}]`)),
      contained: boolean(row.contained, `run.rows[${index}].contained`),
      decided: nullableBoolean(row.decided, `run.rows[${index}].decided`),
      index,
      nonProjective: count(row.nonProjective, `run.rows[${index}].nonProjective`),
      outcome: string(row.outcome, `run.rows[${index}].outcome`),
      overGenerated: boolean(row.overGenerated, `run.rows[${index}].overGenerated`),
      rootUpos: string(row.rootUpos, `run.rows[${index}].rootUpos`),
    };
  });
}

function signatureRows(signatures) {
  if (!(signatures instanceof Map)) invalid('run.signatures must be a Map');
  return [...signatures.entries()]
    .map(([signature, value]) => ({
      count: count(value, `run.signatures[${String(signature)}]`),
      signature: string(signature, 'run.signatures key'),
    }))
    .sort((a, b) => a.signature.localeCompare(b.signature));
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finiteNumber(value, 'canonical value');
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') invalid('Evidence contains a non-serializable value');
  const normalized = {};
  for (const key of Object.keys(value).sort()) normalized[key] = canonicalize(value[key]);
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function checksum(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

/**
 * @param {object} input
 * @param {ReturnType<import('./treebank-run.js').runTreebank>} input.run
 * @param {'classic'|'packed'} input.parser
 * @param {number} input.maxTokens
 * @param {{corpusSha256:string, lexiconSha256:string}} input.fixture
 */
export function buildConstellationEvaluationEvidence({ run, parser, maxTokens, fixture } = {}) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) invalid('run must be an object');
  if (!PARSERS.has(parser)) invalid('parser must be classic or packed');
  const boundedMaxTokens = count(maxTokens, 'maxTokens');
  if (boundedMaxTokens === 0) invalid('maxTokens must be greater than zero');
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) invalid('fixture must be an object');
  if (!SHA256.test(fixture.corpusSha256)) invalid('fixture.corpusSha256 must be a lowercase SHA-256');
  if (!SHA256.test(fixture.lexiconSha256)) invalid('fixture.lexiconSha256 must be a lowercase SHA-256');

  const normalizedMetrics = metrics(run.report);
  const payload = {
    accounting: {
      analyzed: normalizedMetrics.n,
      droppedThrew: count(run.droppedThrew, 'run.droppedThrew'),
      oracleLeaks: count(run.oracleLeaks, 'run.oracleLeaks'),
      oracleTokens: count(run.oracleTokens, 'run.oracleTokens'),
      sampled: count(run.sampled, 'run.sampled'),
      skippedTooLong: count(run.skippedTooLong, 'run.skippedTooLong'),
      tokenizerAgree: count(run.tokenizerAgree, 'run.tokenizerAgree'),
      tokenizerTotal: count(run.tokenizerTotal, 'run.tokenizerTotal'),
    },
    contract: CONSTELLATION_EVALUATION_EVIDENCE_CONTRACT,
    fixture: {
      corpusSha256: fixture.corpusSha256,
      lexiconSha256: fixture.lexiconSha256,
    },
    metrics: normalizedMetrics,
    mode: 'offline-evaluation',
    parser: { id: parser, maxTokens: boundedMaxTokens },
    rows: rows(run.rows),
    schemaVersion: '1.0.0',
    signatures: signatureRows(run.signatures),
  };

  return deepFreeze({
    ...payload,
    checksum: `constellation-evidence1:sha256:${checksum(payload)}`,
  });
}
