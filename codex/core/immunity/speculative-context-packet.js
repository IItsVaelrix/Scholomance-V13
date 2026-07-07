import crypto from 'node:crypto';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../pixelbrain/bytecode-error.js';
import { MEMORY_CELL_VECTOR_ALGORITHM, MEMORY_CELL_VECTOR_DIMENSIONS } from './memory-cell-osmosis.js';

export const SPECULATIVE_CONTEXT_CONTRACT = 'SCHOL-SPEC-CTX-PACKET-v1';
export const SPECULATIVE_CONTEXT_SCHEMA_VERSION = '0.1.0';

export function createSpeculativeContextPacket({
  id,
  cellId,
  anomalyKind,
  similarity,
  drift,
  vector,
} = {}) {
  const normalizedId = normalizeRequiredString(id, 'id');
  const normalizedCellId = normalizeRequiredString(cellId, 'cellId');
  const normalizedAnomalyKind = normalizeRequiredString(anomalyKind, 'anomalyKind');
  const normalizedSimilarity = normalizeUnitFloat(similarity);
  const normalizedDrift = normalizeUnitFloat(drift);
  const normalizedVector = normalizeVectorPacket(vector);

  const stable = {
    contract: SPECULATIVE_CONTEXT_CONTRACT,
    schemaVersion: SPECULATIVE_CONTEXT_SCHEMA_VERSION,
    id: normalizedId,
    cellId: normalizedCellId,
    anomalyKind: normalizedAnomalyKind,
    similarity: normalizedSimilarity,
    drift: normalizedDrift,
    vector: normalizedVector,
  };

  return stableClone({
    ...stable,
    checksum: checksumSpeculativeContextPacket(stable),
  });
}

export function checksumSpeculativeContextPacket(packet) {
  const stable = {
    contract: packet.contract,
    schemaVersion: packet.schemaVersion,
    id: packet.id,
    cellId: packet.cellId,
    anomalyKind: packet.anomalyKind,
    similarity: packet.similarity,
    drift: packet.drift,
    vector: normalizeVectorPacket(packet.vector),
  };
  return sha256Hex(stableJson(stable)).slice(0, 12);
}

function normalizeVectorPacket(packet) {
  if (!packet || packet.algorithm !== MEMORY_CELL_VECTOR_ALGORITHM) {
    throw createSpeculativeError('Invalid vector algorithm', {
      expected: MEMORY_CELL_VECTOR_ALGORITHM,
      actual: packet?.algorithm || null,
    });
  }
  return stableClone({
    algorithm: MEMORY_CELL_VECTOR_ALGORITHM,
    dimensions: packet.dimensions,
    seed: packet.seed,
    dataB64: packet.dataB64,
    norm: packet.norm,
    checksum: packet.checksum,
  });
}

function createSpeculativeError(message, context = {}) {
  return new BytecodeError(
    ERROR_CATEGORIES.VALUE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.IMMUNITY,
    ERROR_CODES.INVALID_VALUE,
    {
      subsystem: 'speculative-context-packet',
      message,
      ...context,
    },
  );
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw createSpeculativeError(`Speculative packet requires string field`, {
      field: fieldName,
    });
  }
  return normalized;
}

function normalizeUnitFloat(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(12));
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
