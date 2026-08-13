/**
 * Cleri Probe deterministic candidate retrieval.
 *
 * Merges nominations from literal, structural, token, prion, and optional
 * vector sources. Retrieval ranks candidates; it never assigns a verdict or
 * remediation. Only a registered structural verifier may emit verdict VERIFIED.
 */

import { createSourceSpan, normalizeRepositoryPath } from './contracts.js';
import { stableStringify } from './canonical-report.js';
import { embedFloat, cosineSimilarity } from '../../semantic/amp/runVectorAmp.js';
import {
  vectorizeHypothesis,
  buildIdfIndex,
  scanSubstrate,
  PROBE_DIMENSION
} from '../protein-probe.engine.js';
import { scanForPrion, scanForPairedCallPrion } from '../prion-detector.engine.js';
import { PRION_LIBRARY, PAIRED_CALL_PRIONS } from '../prion-library.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const NOMINATION_SOURCES = Object.freeze([
  'LITERAL',
  'STRUCTURAL',
  'TOKEN',
  'PRION',
  'VECTOR',
  // STAMP — rare-syntactic-kind fingerprint, codex/core/semantic/ast-stamp.js.
  // High precision, low recall: it covers the identifiable tail (13.4% of files
  // carry a stamp at all) and says nothing about the rest, which makes it the
  // complement of VECTOR rather than a rival. Like every other source here it
  // only NOMINATES — the largest stamp bucket measured held 35 files.
  'STAMP'
]);

const SOURCE_SET = new Set(NOMINATION_SOURCES);

const PATHOLOGY_RETRIEVAL_PROFILES = Object.freeze({
  LEAKED_LISTENER_SUBSCRIPTION: Object.freeze({
    terms: Object.freeze(['addEventListener', 'removeEventListener', 'socket.on', 'socket.off', 'listener']),
    patterns: Object.freeze([/\baddEventListener\s*\(/, /\.\s*on\s*\(/, /\.\s*off\s*\(/]),
    prion: 'listener-without-cleanup'
  }),
  SWALLOWED_ERROR: Object.freeze({
    terms: Object.freeze(['catch', 'console.error', 'swallow']),
    patterns: Object.freeze([/\bcatch\s*\(/]),
    prion: 'silent-failure-swallowed-error'
  }),
  UNSEEDED_RANDOMNESS: Object.freeze({
    terms: Object.freeze(['Math.random', 'random', 'seed']),
    patterns: Object.freeze([/\bMath\s*\.\s*random\s*\(/]),
    prion: 'unseeded-rng-in-deterministic-path'
  }),
  CONCURRENT_SHARED_STATE_MUTATION: Object.freeze({
    terms: Object.freeze(['Promise.all', 'shared', 'mutation', 'concurrent']),
    patterns: Object.freeze([/\bPromise\s*\.\s*all\s*\(/])
  }),
  UNSAFE_EXTERNAL_RESPONSE_ACCESS: Object.freeze({
    terms: Object.freeze(['response.data', 'res.data', 'fetch', 'axios', 'json']),
    patterns: Object.freeze([/\.\s*data\s*[.[]/, /\bfetch\s*\(/, /\baxios\s*\./])
  }),
  EMPTY_COLLECTION_TRUTHINESS: Object.freeze({
    terms: Object.freeze(['length', 'size', 'empty']),
    // A bare negation of an identifier: the shape that cannot see an empty
    // collection. The length-aware sibling test is what the verifier proves.
    patterns: Object.freeze([/!\s*[A-Za-z_$][\w$]*\s*(?:&&|\|\||\)|\?)/, /\.\s*length\b/, /\.\s*size\b/])
  })
});

// ─── Internal helpers ────────────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolvePlan(plan) {
  if (typeof plan === 'string') {
    return { hypothesis: plan, pathologyClass: null };
  }
  if (!plan || typeof plan !== 'object') {
    return { hypothesis: '', pathologyClass: null };
  }
  return {
    hypothesis: String(plan.hypothesis || ''),
    pathologyClass: plan.pathologyClass == null ? null : String(plan.pathologyClass)
  };
}

function getProfile(pathologyClass) {
  if (!pathologyClass) return null;
  return PATHOLOGY_RETRIEVAL_PROFILES[pathologyClass] || null;
}

function defaultSpan(path) {
  return createSourceSpan({
    path,
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  });
}

function lineMatches(content, predicate) {
  const lines = String(content || '').split('\n');
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (predicate(lines[i])) {
      matches.push(i + 1);
    }
  }
  return matches;
}

function tokenizeLine(text) {
  return new Set(
    String(text || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
}

function makeCandidateKey(path, factId, pathologyClass) {
  // Arrays participating in identity are sorted before hashing.
  return stableStringify({
    path: normalizeRepositoryPath(path),
    factId: factId == null ? null : String(factId),
    pathologyClass: pathologyClass == null ? null : String(pathologyClass)
  });
}

function normalizeNomination(input) {
  return {
    path: normalizeRepositoryPath(input.path),
    factId: input.factId == null ? null : String(input.factId),
    pathologyClass: input.pathologyClass == null ? null : String(input.pathologyClass),
    source: String(input.source),
    score: Number.isFinite(Number(input.score)) ? Number(input.score) : 0,
    span: input.span || null
  };
}

function nomination(path, factId, pathologyClass, source, score, lineOrSpan) {
  let span;
  if (lineOrSpan && typeof lineOrSpan === 'object') {
    span = createSourceSpan({ path, ...lineOrSpan });
  } else if (lineOrSpan && Number.isFinite(lineOrSpan) && lineOrSpan >= 1) {
    span = createSourceSpan({
      path,
      startLine: lineOrSpan,
      startColumn: 1,
      endLine: lineOrSpan,
      endColumn: 1
    });
  } else {
    span = defaultSpan(path);
  }
  return {
    path,
    factId,
    pathologyClass,
    source,
    score: clamp(score, 0, 1),
    span
  };
}

const VECTOR_CHUNK_SIZE = 500;

function lineColumnAtOffset(content, offset) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i += 1) {
    if (content[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function spanForChunk(content, offset, length) {
  const text = String(content || '');
  const startOffset = Math.max(0, Math.min(text.length, offset));
  const endOffset = Math.max(startOffset, Math.min(text.length, offset + length));
  const start = lineColumnAtOffset(text, startOffset);
  const end = lineColumnAtOffset(text, endOffset);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column
  };
}

function bestVectorChunkSpan(content, proteinVector, cfg, minResonance) {
  const text = String(content || '');
  if (text.length < 50) return null;

  let bestOffset = 0;
  let bestResonance = -Infinity;
  for (let i = 0; i < text.length; i += VECTOR_CHUNK_SIZE / 2) {
    const chunk = text.slice(i, i + VECTOR_CHUNK_SIZE);
    const chunkVec = embedFloat(chunk, cfg).vector;
    if (!chunkVec) continue;
    const res = cosineSimilarity(chunkVec, proteinVector);
    if (res > bestResonance) {
      bestResonance = res;
      bestOffset = i;
    }
  }

  if (bestResonance < minResonance) return null;
  return spanForChunk(text, bestOffset, VECTOR_CHUNK_SIZE);
}

// ─── Source-specific retrieval ───────────────────────────────────────────────

export function retrieveLiteralNominations(files, plan, options = {}) {
  void options;
  const { pathologyClass } = resolvePlan(plan);
  const profile = getProfile(pathologyClass);
  if (!profile) return [];

  const nominations = [];
  for (const file of files) {
    const path = normalizeRepositoryPath(file.path);
    const content = file.content || '';
    for (const term of profile.terms) {
      const lowerTerm = term.toLowerCase();
      const lines = lineMatches(content, line => line.toLowerCase().includes(lowerTerm));
      for (const line of lines) {
        nominations.push(nomination(path, null, pathologyClass, 'LITERAL', 1, line));
      }
    }
  }
  return nominations;
}

export function retrieveStructuralNominations(files, plan, options = {}) {
  void options;
  const { pathologyClass } = resolvePlan(plan);
  const profile = getProfile(pathologyClass);
  if (!profile) return [];

  const nominations = [];
  for (const file of files) {
    const path = normalizeRepositoryPath(file.path);
    const content = file.content || '';
    for (const pattern of profile.patterns) {
      // Fresh regex per file: /g regexes carry lastIndex across calls.
      const re = new RegExp(pattern.source, pattern.flags);
      const lines = lineMatches(content, line => {
        re.lastIndex = 0;
        return re.test(line);
      });
      for (const line of lines) {
        nominations.push(nomination(path, null, pathologyClass, 'STRUCTURAL', 1, line));
      }
    }
  }
  return nominations;
}

export function retrieveTokenNominations(files, plan, options = {}) {
  void options;
  const { pathologyClass } = resolvePlan(plan);
  const profile = getProfile(pathologyClass);
  if (!profile) return [];

  const tokenTerms = profile.terms
    .flatMap(t => String(t).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length > 1);
  const nominations = [];
  for (const file of files) {
    const path = normalizeRepositoryPath(file.path);
    const content = file.content || '';
    const lines = lineMatches(content, (line) => {
      const tokens = tokenizeLine(line);
      return tokenTerms.some(term => tokens.has(term));
    });
    for (const line of lines) {
      nominations.push(nomination(path, null, pathologyClass, 'TOKEN', 0.9, line));
    }
  }
  return nominations;
}

export function retrievePrionNominations(files, plan, options = {}) {
  void options;
  const { pathologyClass } = resolvePlan(plan);
  const profile = getProfile(pathologyClass);
  if (!profile) return [];

  const nominations = [];

  // Paired-call prions.
  if (profile.prion && PAIRED_CALL_PRIONS[profile.prion]) {
    const prion = PAIRED_CALL_PRIONS[profile.prion];
    const hits = scanForPairedCallPrion(files, prion);
    for (const hit of hits) {
      nominations.push(nomination(
        hit.path,
        hit.key,
        pathologyClass,
        'PRION',
        clamp(hit.confidence, 0, 1),
        hit.line
      ));
    }
  }

  // Token-set prions.
  if (profile.prion && PRION_LIBRARY[profile.prion]) {
    const prion = PRION_LIBRARY[profile.prion];
    const hits = scanForPrion(files, prion, { minConfidence: 1 });
    for (const hit of hits) {
      nominations.push(nomination(
        hit.path,
        null,
        pathologyClass,
        'PRION',
        clamp(hit.confidence, 0, 1),
        hit.line
      ));
    }
  }

  return nominations;
}

export function retrieveVectorNominations(files, plan, options = {}) {
  const { hypothesis, pathologyClass } = resolvePlan(plan);
  if (!hypothesis || files.length === 0) return [];

  const idf = options.idf instanceof Map ? options.idf : buildIdfIndex(files);
  const searchProtein = vectorizeHypothesis(hypothesis, { idf });
  const minResonance = Number.isFinite(options.minResonance) ? options.minResonance : 0.7;
  const heatmap = scanSubstrate(files, searchProtein, { minResonance, idf });
  const cfg = { dimension: PROBE_DIMENSION, idf, center: true };

  const nominations = [];
  for (const hit of heatmap) {
    const file = files.find(f => normalizeRepositoryPath(f.path) === normalizeRepositoryPath(hit.path));
    const span = file
      ? bestVectorChunkSpan(file.content, searchProtein.vector, cfg, minResonance)
      : null;
    nominations.push(nomination(
      hit.path,
      null,
      pathologyClass,
      'VECTOR',
      clamp(hit.resonance, 0, 1),
      span || { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }
    ));
  }
  return nominations;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

export function retrieveCandidates(files, plan, options = {}) {
  const resolved = resolvePlan(plan);
  const nominations = [
    ...retrieveLiteralNominations(files, resolved, options),
    ...retrieveStructuralNominations(files, resolved, options),
    ...retrieveTokenNominations(files, resolved, options),
    ...retrievePrionNominations(files, resolved, options),
    ...(options.includeVector ? retrieveVectorNominations(files, resolved, options) : [])
  ];
  return mergeCandidates(nominations, options);
}

// ─── Candidate merging ───────────────────────────────────────────────────────

export function mergeCandidates(nominations, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : 10;

  // Group nominations by canonical identity: path + factId + pathologyClass.
  const groups = new Map();
  for (const raw of nominations || []) {
    const n = normalizeNomination(raw);
    if (!SOURCE_SET.has(n.source)) continue;
    const key = makeCandidateKey(n.path, n.factId, n.pathologyClass);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(n);
  }

  const enriched = [];
  for (const group of groups.values()) {
    const path = group[0].path;
    const factId = group[0].factId;
    const pathologyClass = group[0].pathologyClass;

    const nominators = [...new Set(group.map(n => n.source))].sort();
    const score = clamp(Math.max(...group.map(n => n.score)), 0, 1);
    const hasStructural = nominators.includes('STRUCTURAL') ? 1 : 0;
    const hasLiteral = nominators.includes('LITERAL') ? 1 : 0;

    // Choose a deterministic representative span: lowest start line, then lowest end line.
    const spans = group
      .map(n => n.span)
      .filter(Boolean)
      .sort((a, b) => (a.startLine - b.startLine) || (a.endLine - b.endLine));
    const span = spans.length > 0 ? spans[0] : defaultSpan(path);

    enriched.push({
      path,
      factId,
      pathologyClass,
      retrievalReason: `Candidate nominated by ${nominators.join(', ')}`,
      nominators,
      score,
      hasStructural,
      hasLiteral,
      span,
      startLine: Number(span.startLine) || 1
    });
  }

  // Sort by:
  //   1. structural nomination descending
  //   2. literal nomination descending
  //   3. number of independent nominators descending
  //   4. bounded candidate score descending
  //   5. path ascending
  //   6. start line ascending
  //   7. fact id ascending
  enriched.sort((a, b) => {
    if (b.hasStructural !== a.hasStructural) return b.hasStructural - a.hasStructural;
    if (b.hasLiteral !== a.hasLiteral) return b.hasLiteral - a.hasLiteral;
    if (b.nominators.length !== a.nominators.length) return b.nominators.length - a.nominators.length;
    if (b.score !== a.score) return b.score - a.score;
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return (a.factId || '').localeCompare(b.factId || '');
  });

  // Apply limit and strip internal sorting keys.
  return enriched.slice(0, limit).map(c => ({
    path: c.path,
    factId: c.factId,
    pathologyClass: c.pathologyClass,
    retrievalReason: c.retrievalReason,
    nominators: c.nominators,
    score: c.score,
    span: c.span
  }));
}
