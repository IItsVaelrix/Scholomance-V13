import crypto from 'node:crypto';
import { quantizeVectorJS, estimateInnerProduct } from '../quantization/turboquant.js';
import { bugToVector } from './clerical-raid.vector.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../pixelbrain/bytecode-error.js';
import { SpeculativeContextBuffer } from './speculative-context-buffer.js';

export const defaultSpeculativeBuffer = new SpeculativeContextBuffer();

export const MEMORY_CELL_CONTRACT = 'SCHOL-MEMCELL-v1';
export const MEMORY_CELL_OSMOSIS_CONTRACT = 'SCHOL-MEMCELL-OSMOSIS-v1';
export const MEMORY_CELL_SCHEMA_VERSION = '0.1.0';
export const MEMORY_CELL_VECTOR_DIMENSIONS = 128;
export const MEMORY_CELL_VECTOR_ALGORITHM = 'turboquant-js';

export const MEMORY_CELL_FAMILIES = Object.freeze([
  'health',
  'error',
  'runtime',
  'schema',
  'render',
  'qa',
  'immunity',
]);

export const MEMORY_CELL_MODES = Object.freeze([
  'baseline',
  'antigen',
]);

export const DEFAULT_MEMORY_CELL_MEMBRANE = Object.freeze({
  similarityFloor: 0.98,
  driftCeiling: 0.03,
  concentrationLimit: 0.99,
});

export const IDE_WHITESPACE_CELL_ID = 'ide.truesight.whitespace.baseline';
export const DEFAULT_IDE_WHITESPACE_TOLERANCE_PX = 0.5;

export function createMemoryCellPacket({
  id,
  family,
  mode = 'baseline',
  vector,
  membrane = {},
  sourceBytecode = null,
  stableContext = {},
  seed = 42,
} = {}) {
  const normalizedId = normalizeRequiredString(id, 'id');
  const normalizedFamily = normalizeEnum(family, MEMORY_CELL_FAMILIES, 'family');
  const normalizedMode = normalizeEnum(mode, MEMORY_CELL_MODES, 'mode');
  const normalizedMembrane = normalizeMembrane(membrane);
  const safeContext = normalizeStableContext(stableContext);
  const vectorPacket = buildVectorPacket(vector, seed);

  const stable = {
    contract: MEMORY_CELL_CONTRACT,
    schemaVersion: MEMORY_CELL_SCHEMA_VERSION,
    id: normalizedId,
    family: normalizedFamily,
    mode: normalizedMode,
    vector: vectorPacket,
    membrane: normalizedMembrane,
    sourceBytecode: normalizeNullableString(sourceBytecode),
    stableContext: safeContext,
  };

  return stableClone({
    ...stable,
    checksum: checksumMemoryCellPacket(stable),
  });
}

export function verifyMemoryCellPacket(packet) {
  try {
    assertMemoryCellPacket(packet);
    return true;
  } catch {
    return false;
  }
}

export function checksumMemoryCellPacket(packet) {
  const stable = {
    contract: packet.contract,
    schemaVersion: packet.schemaVersion,
    id: packet.id,
    family: packet.family,
    mode: packet.mode,
    vector: normalizeVectorPacket(packet.vector),
    membrane: normalizeMembrane(packet.membrane),
    sourceBytecode: normalizeNullableString(packet.sourceBytecode),
    stableContext: normalizeStableContext(packet.stableContext || {}),
  };
  return sha256Hex(stableJson(stable)).slice(0, 12);
}

export function evaluateMemoryCellOsmosis(packet, observation = {}) {
  const cell = assertMemoryCellPacket(packet);
  const observed = normalizeObservation(observation);
  const similarity = compareVectorPackets(cell.vector, observed.quantized);
  const drift = clamp01(1 - similarity);
  const concentration = clamp01(observed.concentration);

  let anomalyKind = 'none';
  if (concentration >= cell.membrane.concentrationLimit) {
    anomalyKind = 'concentration';
  } else if (cell.mode === 'antigen' && similarity >= cell.membrane.similarityFloor) {
    anomalyKind = 'antigen_match';
  } else if (
    cell.mode === 'baseline' &&
    (similarity < cell.membrane.similarityFloor || drift > cell.membrane.driftCeiling)
  ) {
    anomalyKind = 'baseline_drift';
  }

  const confidence = deriveConfidence({
    anomalyKind,
    similarity,
    drift,
    concentration,
    membrane: cell.membrane,
  });

  const stable = {
    contract: MEMORY_CELL_OSMOSIS_CONTRACT,
    schemaVersion: MEMORY_CELL_SCHEMA_VERSION,
    cellId: cell.id,
    status: anomalyKind === 'none' ? 'silent' : 'anomaly',
    anomalyKind,
    similarity: roundUnit(similarity),
    drift: roundUnit(drift),
    concentration: roundUnit(concentration),
    confidence: roundUnit(confidence),
  };

  return stableClone({
    ...stable,
    checksum: checksumOsmosisResult(stable),
  });
}

export function scanMemoryCells(cells, observation, { includeSilent = false, buffer = defaultSpeculativeBuffer } = {}) {
  const results = [];
  const normalizedObs = normalizeObservation(observation);
  for (const cell of cells || []) {
    const result = evaluateMemoryCellOsmosis(cell, normalizedObs);
    if (includeSilent || result.status === 'anomaly') {
      results.push(result);
      if (buffer) {
        buffer.stage({
          id: crypto.randomUUID(),
          cellId: result.cellId,
          anomalyKind: result.anomalyKind,
          similarity: result.similarity,
          drift: result.drift,
        }, normalizedObs.quantized);
      }
    }
  }
  return Object.freeze(results.map(stableClone));
}

export function checksumOsmosisResult(result) {
  const stable = {
    contract: result.contract,
    schemaVersion: result.schemaVersion,
    cellId: result.cellId,
    status: result.status,
    anomalyKind: result.anomalyKind,
    similarity: roundUnit(result.similarity),
    drift: roundUnit(result.drift),
    concentration: roundUnit(result.concentration),
    confidence: roundUnit(result.confidence),
  };
  return sha256Hex(stableJson(stable)).slice(0, 12);
}

export function buildIdeWhitespaceVector(metrics = {}) {
  const tolerancePx = normalizePositiveNumber(
    metrics.tolerancePx,
    DEFAULT_IDE_WHITESPACE_TOLERANCE_PX,
  );
  const wordDrifts = Array.isArray(metrics.wordDriftsPx) ? metrics.wordDriftsPx : [];
  const maxWordDriftPx = Number.isFinite(Number(metrics.maxWordDriftPx))
    ? Number(metrics.maxWordDriftPx)
    : maxAbs(wordDrifts);
  const meanWordDriftPx = Number.isFinite(Number(metrics.meanWordDriftPx))
    ? Number(metrics.meanWordDriftPx)
    : meanAbs(wordDrifts);
  const totalDeltaPx = Number(metrics.totalDeltaPx) || 0;
  const plainTotalPx = Math.max(1, Number(metrics.plainTotalPx) || 1);
  const styledTotalPx = Number(metrics.styledTotalPx) || plainTotalPx + totalDeltaPx;

  const vec = new Float32Array(MEMORY_CELL_VECTOR_DIMENSIONS);
  vec[0] = 1;
  vec[1] = clampSigned(totalDeltaPx / tolerancePx);
  vec[2] = clamp01(Math.abs(totalDeltaPx) / tolerancePx);
  vec[3] = clamp01(Math.abs(maxWordDriftPx) / tolerancePx);
  vec[4] = clamp01(Math.abs(meanWordDriftPx) / tolerancePx);
  vec[5] = clampSigned((styledTotalPx - plainTotalPx) / Math.max(tolerancePx, plainTotalPx));
  vec[6] = clamp01(Math.abs(styledTotalPx - plainTotalPx) / Math.max(tolerancePx, plainTotalPx));
  vec[7] = clamp01((Number(metrics.wordCount) || wordDrifts.length || 0) / 64);

  const limit = Math.min(48, wordDrifts.length);
  for (let i = 0; i < limit; i += 1) {
    vec[16 + i] = clampSigned((Number(wordDrifts[i]) || 0) / tolerancePx);
    vec[64 + i] = clamp01(Math.abs(Number(wordDrifts[i]) || 0) / tolerancePx);
  }

  return vec;
}

export function buildIdeWhitespaceBaselineCell(options = {}) {
  return createMemoryCellPacket({
    id: options.id || IDE_WHITESPACE_CELL_ID,
    family: 'immunity',
    mode: 'baseline',
    vector: buildIdeWhitespaceVector({
      tolerancePx: options.tolerancePx ?? DEFAULT_IDE_WHITESPACE_TOLERANCE_PX,
    }),
    membrane: {
      ...DEFAULT_MEMORY_CELL_MEMBRANE,
      ...(options.membrane || {}),
    },
    sourceBytecode: options.sourceBytecode || null,
    stableContext: {
      detector: 'ide-truesight-whitespace',
      tolerancePx: options.tolerancePx ?? DEFAULT_IDE_WHITESPACE_TOLERANCE_PX,
      ...(options.stableContext || {}),
    },
    seed: options.seed ?? 42,
  });
}

export function evaluateIdeWhitespaceOsmosis(metrics, cell = buildIdeWhitespaceBaselineCell()) {
  const vector = buildIdeWhitespaceVector(metrics);
  const concentration = deriveIdeWhitespaceConcentration(metrics);
  return evaluateMemoryCellOsmosis(cell, {
    vector,
    concentration,
    sourceBytecode: metrics?.sourceBytecode || null,
  });
}

export function deriveIdeWhitespaceConcentration(metrics = {}) {
  const tolerancePx = normalizePositiveNumber(
    metrics.tolerancePx,
    DEFAULT_IDE_WHITESPACE_TOLERANCE_PX,
  );
  const wordDrifts = Array.isArray(metrics.wordDriftsPx) ? metrics.wordDriftsPx : [];
  const maxWordDriftPx = Number.isFinite(Number(metrics.maxWordDriftPx))
    ? Number(metrics.maxWordDriftPx)
    : maxAbs(wordDrifts);
  const meanWordDriftPx = Number.isFinite(Number(metrics.meanWordDriftPx))
    ? Number(metrics.meanWordDriftPx)
    : meanAbs(wordDrifts);
  const totalDeltaPx = Number(metrics.totalDeltaPx) || 0;
  return clamp01(Math.max(
    Math.abs(totalDeltaPx),
    Math.abs(maxWordDriftPx),
    Math.abs(meanWordDriftPx),
  ) / tolerancePx);
}

function buildVectorPacket(vector, seed = 42) {
  const normalizedVector = normalizeVector(vector);
  const normalizedSeed = normalizeSeed(seed);
  const quantized = quantizeVectorJS(normalizedVector, normalizedSeed);
  const stable = {
    algorithm: MEMORY_CELL_VECTOR_ALGORITHM,
    dimensions: MEMORY_CELL_VECTOR_DIMENSIONS,
    seed: normalizedSeed,
    dataB64: bytesToBase64(quantized.data),
    norm: normalizeUnitFloat(quantized.norm),
  };
  return stableClone({
    ...stable,
    checksum: checksumVectorPacket(stable),
  });
}

function normalizeObservation(observation = {}) {
  if (observation.quantized) {
    return stableClone({
      quantized: normalizeVectorPacket(observation.quantized),
      concentration: observation.concentration ?? 0,
      sourceBytecode: normalizeNullableString(observation.sourceBytecode),
    });
  }

  if (observation.vector) {
    return stableClone({
      quantized: buildVectorPacket(observation.vector, observation.seed ?? 42),
      concentration: observation.concentration ?? 0,
      sourceBytecode: normalizeNullableString(observation.sourceBytecode),
    });
  }

  if (observation.bugReport) {
    return stableClone({
      quantized: buildVectorPacket(bugToVector(observation.bugReport, observation.seed ?? 42), observation.seed ?? 42),
      concentration: observation.concentration ?? 0,
      sourceBytecode: normalizeNullableString(observation.sourceBytecode),
    });
  }

  throw createMemoryCellError('Observation requires vector, quantized, or bugReport input', {
    field: 'observation',
  });
}

function assertMemoryCellPacket(packet) {
  if (!packet || packet.contract !== MEMORY_CELL_CONTRACT) {
    throw createMemoryCellError('Invalid memory cell contract', {
      expected: MEMORY_CELL_CONTRACT,
      actual: packet?.contract || null,
    });
  }
  const cell = {
    contract: packet.contract,
    schemaVersion: packet.schemaVersion,
    id: normalizeRequiredString(packet.id, 'id'),
    family: normalizeEnum(packet.family, MEMORY_CELL_FAMILIES, 'family'),
    mode: normalizeEnum(packet.mode, MEMORY_CELL_MODES, 'mode'),
    vector: normalizeVectorPacket(packet.vector),
    membrane: normalizeMembrane(packet.membrane),
    sourceBytecode: normalizeNullableString(packet.sourceBytecode),
    stableContext: normalizeStableContext(packet.stableContext || {}),
    checksum: normalizeRequiredString(packet.checksum, 'checksum'),
  };
  if (cell.schemaVersion !== MEMORY_CELL_SCHEMA_VERSION) {
    throw createMemoryCellError('Unsupported memory cell schemaVersion', {
      expected: MEMORY_CELL_SCHEMA_VERSION,
      actual: cell.schemaVersion,
    });
  }
  const expected = checksumMemoryCellPacket(cell);
  if (expected !== cell.checksum) {
    throw createMemoryCellError('Memory cell checksum mismatch', {
      expected,
      actual: cell.checksum,
      cellId: cell.id,
    });
  }
  return stableClone(cell);
}

function normalizeVectorPacket(packet) {
  if (!packet || packet.algorithm !== MEMORY_CELL_VECTOR_ALGORITHM) {
    throw createMemoryCellError('Invalid memory cell vector algorithm', {
      expected: MEMORY_CELL_VECTOR_ALGORITHM,
      actual: packet?.algorithm || null,
    });
  }
  const stable = {
    algorithm: MEMORY_CELL_VECTOR_ALGORITHM,
    dimensions: normalizePositiveInteger(packet.dimensions, MEMORY_CELL_VECTOR_DIMENSIONS),
    seed: normalizeSeed(packet.seed),
    dataB64: normalizeRequiredString(packet.dataB64, 'vector.dataB64'),
    norm: normalizeUnitFloat(packet.norm),
  };
  if (stable.dimensions !== MEMORY_CELL_VECTOR_DIMENSIONS) {
    throw createMemoryCellError('Invalid memory cell vector dimensions', {
      expected: MEMORY_CELL_VECTOR_DIMENSIONS,
      actual: stable.dimensions,
    });
  }
  const expected = checksumVectorPacket(stable);
  if (packet.checksum !== expected) {
    throw createMemoryCellError('Memory cell vector checksum mismatch', {
      expected,
      actual: packet.checksum || null,
    });
  }
  return stableClone({
    ...stable,
    checksum: packet.checksum,
  });
}

function checksumVectorPacket(packet) {
  const stable = {
    algorithm: packet.algorithm,
    dimensions: packet.dimensions,
    seed: packet.seed,
    dataB64: packet.dataB64,
    norm: packet.norm,
  };
  return sha256Hex(stableJson(stable)).slice(0, 12);
}

function compareVectorPackets(a, b) {
  const aBytes = base64ToBytes(a.dataB64);
  const bBytes = base64ToBytes(b.dataB64);
  if (aBytes.length === 0 || bBytes.length === 0 || aBytes.length !== bBytes.length) {
    return 0;
  }
  return clamp01(estimateInnerProduct(aBytes, bBytes, 1, 1));
}

function normalizeVector(vector) {
  if (!vector || typeof vector.length !== 'number') {
    throw createMemoryCellError('Vector input must be array-like', {
      field: 'vector',
    });
  }
  if (vector.length > MEMORY_CELL_VECTOR_DIMENSIONS) {
    throw createMemoryCellError('Vector input exceeds memory cell dimensions', {
      max: MEMORY_CELL_VECTOR_DIMENSIONS,
      actual: vector.length,
    });
  }
  const out = new Float32Array(MEMORY_CELL_VECTOR_DIMENSIONS);
  for (let i = 0; i < vector.length; i += 1) {
    const value = Number(vector[i]);
    if (!Number.isFinite(value)) {
      throw createMemoryCellError('Vector input contains non-finite value', {
        index: i,
      });
    }
    out[i] = Math.max(-1, Math.min(1, value));
  }
  return out;
}

function normalizeMembrane(membrane = {}) {
  return stableClone({
    similarityFloor: clamp01(membrane.similarityFloor ?? DEFAULT_MEMORY_CELL_MEMBRANE.similarityFloor),
    driftCeiling: clamp01(membrane.driftCeiling ?? DEFAULT_MEMORY_CELL_MEMBRANE.driftCeiling),
    concentrationLimit: clamp01(membrane.concentrationLimit ?? DEFAULT_MEMORY_CELL_MEMBRANE.concentrationLimit),
  });
}

function deriveConfidence({ anomalyKind, similarity, drift, concentration, membrane }) {
  if (anomalyKind === 'none') return 0;
  if (anomalyKind === 'antigen_match') return similarity;
  if (anomalyKind === 'concentration') {
    return membrane.concentrationLimit > 0 ? clamp01(concentration / membrane.concentrationLimit) : concentration;
  }
  const driftPressure = membrane.driftCeiling > 0 ? drift / membrane.driftCeiling : drift;
  const similarityPressure = membrane.similarityFloor > 0
    ? (membrane.similarityFloor - similarity) / membrane.similarityFloor
    : 0;
  return clamp01(Math.max(driftPressure, similarityPressure));
}

function createMemoryCellError(message, context = {}) {
  return new BytecodeError(
    ERROR_CATEGORIES.VALUE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.IMMUNITY,
    ERROR_CODES.INVALID_VALUE,
    {
      subsystem: 'memory-cell-osmosis',
      message,
      ...context,
    },
  );
}

function normalizeStableContext(context) {
  const normalized = stableClone(context || {});
  const forbiddenKeys = ['content', 'rawText', 'scrollContent', 'userText'];
  for (const key of Object.keys(normalized)) {
    if (forbiddenKeys.includes(key)) {
      throw createMemoryCellError('Memory cell stableContext may not store raw user text', {
        key,
      });
    }
  }
  return normalized;
}

function normalizeEnum(value, allowed, fieldName) {
  const normalized = normalizeNullableString(value);
  if (!allowed.includes(normalized)) {
    throw createMemoryCellError(`Invalid memory cell ${fieldName}`, {
      field: fieldName,
      providedValue: value ?? null,
      allowedValues: allowed,
    });
  }
  return normalized;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    throw createMemoryCellError('Memory cell requires string field', {
      field: fieldName,
    });
  }
  return normalized;
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 42;
  return Math.trunc(numeric);
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.trunc(numeric);
}

function normalizePositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function normalizeUnitFloat(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(12));
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function clampSigned(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-1, Math.min(1, numeric));
}

function roundUnit(value) {
  return Number(clamp01(value).toFixed(6));
}

function maxAbs(values) {
  if (!values.length) return 0;
  return Math.max(...values.map((value) => Math.abs(Number(value) || 0)));
}

function meanAbs(values) {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
  return total / values.length;
}

function stableClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(stableClone));
  return Object.freeze(Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, stableClone(value[key])]),
  ));
}

function stableJson(value) {
  return JSON.stringify(stableClone(value));
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value) {
  return Uint8Array.from(Buffer.from(String(value || ''), 'base64'));
}
