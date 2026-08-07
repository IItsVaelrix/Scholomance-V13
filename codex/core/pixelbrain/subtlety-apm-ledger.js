import { canonicalStringify } from './canonical-json.js';
import { sha256Hex } from './sha256.js';
import {
  legacyObservationContext,
  normalizeObservationContext,
} from './subtlety-observation-context.js';

const SUPPORTED_SCHEMAS = new Set([
  'SUBTLETY-RESONANCE-RECORD-v1',
  'SUBTLETY-RESONANCE-RECORD-v2',
]);
const SUPPORTED_KINDS = new Set(['fingerprint', 'assessment']);

function withoutChecksum({ checksum: _checksum, ...body }) {
  return body;
}

function validChecksum(value) {
  return /^[0-9a-f]{64}$/u.test(value?.checksum || '')
    && sha256Hex(canonicalStringify(withoutChecksum(value))) === value.checksum;
}

function warning(code, source, detail) {
  return {
    code,
    checksum: sha256Hex(source),
    detail,
  };
}

export function stableEventKey({ runtime, unitId, errorType, topFrame }) {
  return sha256Hex(`${runtime} | ${unitId} | ${errorType} | ${topFrame}`);
}

export function parseResonanceSnapshot({ ledgerText, cutoffMs }) {
  const text = String(ledgerText);
  const completeLines = text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n').slice(0, -1);
  const warnings = [];
  if (text && !text.endsWith('\n')) {
    const tail = text.split('\n').at(-1);
    warnings.push(warning(
      'INCOMPLETE_TRAILING_ROW',
      tail,
      'deferred until the next snapshot',
    ));
  }
  const records = [];

  for (const line of completeLines.filter((value) => value.length > 0)) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      warnings.push(warning(
        'MALFORMED_ROW',
        line,
        'complete JSONL row could not be parsed',
      ));
      continue;
    }
    if (!SUPPORTED_SCHEMAS.has(record.schema)) {
      warnings.push(warning('UNSUPPORTED_SCHEMA', line, String(record.schema)));
      continue;
    }
    if (!SUPPORTED_KINDS.has(record.kind)) {
      warnings.push(warning('UNSUPPORTED_KIND', line, String(record.kind)));
      continue;
    }
    if (!validChecksum(record)) {
      warnings.push(warning(
        'INVALID_OUTER_CHECKSUM',
        line,
        record.checksum || 'missing',
      ));
      continue;
    }
    const atMs = Date.parse(record.recordedAt);
    if (!Number.isFinite(atMs)) {
      warnings.push(warning('INVALID_TIMESTAMP', line, String(record.recordedAt)));
      continue;
    }
    if (atMs > cutoffMs) {
      warnings.push(warning('FUTURE_TIMESTAMP', line, record.recordedAt));
      continue;
    }
    if (record.kind === 'fingerprint') {
      if (record.payload?.schema !== 'SUBTLETY-FINGERPRINT-v1') {
        warnings.push(warning(
          'UNSUPPORTED_FINGERPRINT_SCHEMA',
          line,
          String(record.payload?.schema),
        ));
        continue;
      }
      if (!validChecksum(record.payload)) {
        warnings.push(warning(
          'INVALID_FINGERPRINT_CHECKSUM',
          line,
          record.checksum,
        ));
        continue;
      }
      if (
        record.context
        && record.context.schema !== 'SUBTLETY-OBSERVATION-CONTEXT-v1'
      ) {
        warnings.push(warning(
          'UNSUPPORTED_CONTEXT_SCHEMA',
          line,
          String(record.context.schema),
        ));
        continue;
      }
    }
    records.push({
      ...record,
      atMs,
      rawLineChecksum: sha256Hex(line),
    });
  }

  records.sort((left, right) => (
    left.atMs - right.atMs
    || left.checksum.localeCompare(right.checksum)
  ));
  const fingerprints = records
    .filter((record) => record.kind === 'fingerprint')
    .map((record) => {
      const hasObservationContext = record.schema === 'SUBTLETY-RESONANCE-RECORD-v2'
        && Boolean(record.context);
      return {
        ...record,
        unitId: record.payload.identity?.unitId || 'unknown',
        context: hasObservationContext
          ? normalizeObservationContext(record.context)
          : legacyObservationContext(record.payload),
        hasObservationContext,
      };
    });
  for (const record of fingerprints.filter((entry) => !entry.hasObservationContext)) {
    warnings.push(warning(
      'LEGACY_CONTEXT',
      record.checksum,
      `reduced identity precision for ${record.unitId}`,
    ));
  }
  warnings.sort((left, right) => (
    left.code.localeCompare(right.code)
    || left.checksum.localeCompare(right.checksum)
  ));
  const sourceRecordSetChecksum = sha256Hex([
    ...records.map((record) => record.checksum),
    ...warnings.map((entry) => entry.checksum),
  ].sort().join('\n'));

  return {
    records,
    fingerprints,
    warnings,
    sourceRecordSetChecksum,
  };
}

export function buildEventChronicle(parsed) {
  const fingerprintByChecksum = new Map(
    parsed.fingerprints.map((record) => [record.checksum, record]),
  );
  const latestByUnit = new Map();
  const occurrences = [];

  for (const record of parsed.records) {
    if (record.kind === 'fingerprint') {
      const fingerprint = fingerprintByChecksum.get(record.checksum);
      const occurrence = { ...fingerprint, assessment: null };
      occurrences.push(occurrence);
      latestByUnit.set(fingerprint.unitId, occurrence);
    } else if (record.kind === 'assessment') {
      const occurrence = latestByUnit.get(record.payload?.unitId);
      if (occurrence) occurrence.assessment = record;
    }
  }

  const grouped = new Map();
  for (const occurrence of occurrences) {
    const key = stableEventKey({
      ...occurrence.context,
      unitId: occurrence.unitId,
    });
    const event = grouped.get(key) || {
      key,
      runtime: occurrence.context.runtime,
      unitId: occurrence.unitId,
      errorType: occurrence.context.errorType,
      topFrame: occurrence.context.topFrame,
      occurrences: [],
    };
    event.occurrences.push(occurrence);
    grouped.set(key, event);
  }

  return {
    events: [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key)),
    warnings: parsed.warnings,
  };
}
