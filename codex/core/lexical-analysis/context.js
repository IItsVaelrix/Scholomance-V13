import { createHash } from 'node:crypto';
import {
  ANALYSIS_CONTEXT_VERSION,
  CONTEXT_HASH_ALGORITHM,
} from '../lexical-graph/types.js';

const LIMITS = Object.freeze({
  surface: 80,
  selection: 1_000,
  containingLine: 2_000,
  neighboringLine: 2_000,
  documentContext: 20_000,
});

const FIELDS = Object.freeze({
  word: Object.freeze(['scope', 'surface']),
  selection: Object.freeze(['scope', 'surface', 'selection']),
  line: Object.freeze(['scope', 'surface', 'containingLine']),
  local: Object.freeze(['scope', 'surface', 'containingLine', 'neighboringLines']),
  document: Object.freeze(['scope', 'surface', 'documentContext']),
});

const normalizeText = (value) => String(value).normalize('NFC').replace(/\r\n?/g, '\n');

function fail(message) {
  throw new Error(`PB-ERR-v1-VALUE: ${message}`);
}

function requireText(value, field, limit, { trim = false } = {}) {
  if (typeof value !== 'string') fail(`${field} must be text`);
  const normalized = normalizeText(value);
  const effective = trim ? normalized.trim() : normalized;
  if (!effective.trim() || effective.length > limit) fail(`${field} length`);
  return effective;
}

function canonicalBody(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('analysis context must be an object');
  }

  const lawfulFields = FIELDS[input.scope];
  if (!lawfulFields) fail('invalid analysis scope');

  const allowed = new Set(lawfulFields);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail(`field ${key} forbidden for ${input.scope}`);
  }

  const body = {
    version: ANALYSIS_CONTEXT_VERSION,
    scope: input.scope,
    surface: requireText(input.surface, 'surface', LIMITS.surface, { trim: true }),
  };

  if (input.scope === 'selection') {
    body.selection = requireText(input.selection, 'selection', LIMITS.selection);
  } else if (input.scope === 'line') {
    body.containingLine = requireText(input.containingLine, 'containingLine', LIMITS.containingLine);
  } else if (input.scope === 'local') {
    body.containingLine = requireText(input.containingLine, 'containingLine', LIMITS.containingLine);
    if (!Array.isArray(input.neighboringLines)
      || input.neighboringLines.length < 1
      || input.neighboringLines.length > 4) {
      fail('neighboringLines length');
    }
    body.neighboringLines = Object.freeze(input.neighboringLines.map((line) => (
      requireText(line, 'neighboring line', LIMITS.neighboringLine)
    )));
  } else if (input.scope === 'document') {
    body.documentContext = requireText(
      input.documentContext,
      'documentContext',
      LIMITS.documentContext,
    );
  }

  return body;
}

export function canonicalContextBytes(input) {
  return JSON.stringify(canonicalBody(input));
}

export function resolveAnalysisContext(input) {
  const body = canonicalBody(input);
  const canonical = JSON.stringify(body);
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return Object.freeze({
    ...body,
    contextHash: `${CONTEXT_HASH_ALGORITHM}:${digest}`,
  });
}
