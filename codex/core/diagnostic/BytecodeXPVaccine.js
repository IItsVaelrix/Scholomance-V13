// `node:crypto` is externalised under Vite's browser bundle (throws on call,
// not on import — see codex/core/pixelbrain/sha256.js's own header for why).
// This module is reached from the browser via pixelbrain.adapter.js ->
// forge-craft-gate.js -> encodeBytecodeXPVaccineFromHealth() on every gate
// PASS, so it needs the same isomorphic hash the rest of the codebase already
// standardised on for exactly this reason.
import { sha256Hex as isomorphicSha256Hex } from '../pixelbrain/sha256.js';
import { deriveSemanticSlug, parseCccbId } from './cccbEncoder.js';

export const BYTECODE_XP_VERSION = 'v1';
export const BYTECODE_XP_PREFIX = `PB-XP-${BYTECODE_XP_VERSION}`;
export const BYTECODE_XP_SOURCE_KINDS = Object.freeze({
  ERROR: 'error',
  HEALTH: 'health',
  CCCB: 'cccb',
  TOOLCALL: 'toolcall',
});

const BYTECODE_SOURCE_SEGMENTS = Object.freeze({
  error: 'ERR',
  health: 'HLTH',
  cccb: 'CCCB',
  toolcall: 'TCL',
});

const BYTECODE_PATTERN = /^PB-XP-v1-(ERR|HLTH|CCCB|TCL)-([A-Z0-9]{4,8})-([0-9a-f]{12})-([0-9a-f]{12})$/;

export class BytecodeXPVaccine {
  constructor({ sourceKind, sourceBytecode = null, semanticSlug, fingerprint, recoveryKey = null, stableContext = {} }) {
    const normalizedSourceKind = normalizeSourceKind(sourceKind);
    const normalizedSlug = normalizeSemanticSlug(semanticSlug);
    const normalizedContext = stableClone(stableContext);
    const normalizedFingerprint = fingerprint || checksumVaccineFingerprint({
      sourceKind: normalizedSourceKind,
      sourceBytecode,
      semanticSlug: normalizedSlug,
      recoveryKey,
      stableContext: normalizedContext,
    });

    this.version = BYTECODE_XP_VERSION;
    this.sourceKind = normalizedSourceKind;
    this.sourceBytecode = sourceBytecode;
    this.semanticSlug = normalizedSlug;
    this.fingerprint = normalizedFingerprint;
    this.recoveryKey = recoveryKey;
    this.stableContext = normalizedContext;
    this.checksum = checksumVaccine({
      version: this.version,
      sourceKind: this.sourceKind,
      sourceBytecode: this.sourceBytecode,
      semanticSlug: this.semanticSlug,
      fingerprint: this.fingerprint,
      recoveryKey: this.recoveryKey,
      stableContext: this.stableContext,
    });
    this.vaccineId = `${BYTECODE_XP_PREFIX}-${BYTECODE_SOURCE_SEGMENTS[this.sourceKind]}-${this.semanticSlug}-${this.fingerprint}`;
    this.bytecode = `${this.vaccineId}-${this.checksum}`;

    Object.freeze(this.stableContext);
    Object.freeze(this);
  }

  toJSON() {
    return {
      version: this.version,
      bytecode: this.bytecode,
      vaccineId: this.vaccineId,
      sourceKind: this.sourceKind,
      sourceBytecode: this.sourceBytecode,
      semanticSlug: this.semanticSlug,
      fingerprint: this.fingerprint,
      recoveryKey: this.recoveryKey,
      stableContext: this.stableContext,
      checksum: this.checksum,
    };
  }

  toString() {
    return this.bytecode;
  }
}

export function encodeBytecodeXPVaccineFromError(error, options = {}) {
  const source = error?.toJSON ? error.toJSON() : error;
  const context = source?.context || {};
  const code = source?.code || source?.bytecode || source?.errorCodeHex || source?.errorCode || 'ERROR';
  const path = context.path || context.sourceFile || null;
  const title = options.title || [
    source?.category || 'error',
    source?.severity || 'state',
    source?.moduleId || 'module',
    code,
    path || '',
  ].join(' ');

  return new BytecodeXPVaccine({
    sourceKind: BYTECODE_XP_SOURCE_KINDS.ERROR,
    sourceBytecode: source?.bytecode || null,
    semanticSlug: options.semanticSlug || safeSemanticSlug(title),
    recoveryKey: options.recoveryKey || context.ruleId || context.layer || null,
    stableContext: pickStableKeys({
      category: source?.category || null,
      severity: source?.severity || null,
      moduleId: source?.moduleId || null,
      errorCode: source?.errorCode ?? null,
      errorCodeHex: source?.errorCodeHex || null,
      code: source?.code || null,
      path,
      sourceFile: context.sourceFile || null,
      layer: context.layer || null,
      ruleId: context.ruleId || null,
      checkId: context.checkId || null,
      ...options.stableContext,
    }),
  });
}

export function encodeBytecodeXPVaccineFromHealth(health, options = {}) {
  const source = health?.toJSON ? health.toJSON() : health;
  const context = source?.context || {};
  const modulePath = source?.moduleId || context.moduleId || context.path || null;
  const title = options.title || [
    source?.cellId || 'health',
    source?.checkId || 'check',
    source?.code || source?.bytecode || '',
    modulePath || '',
  ].join(' ');

  return new BytecodeXPVaccine({
    sourceKind: BYTECODE_XP_SOURCE_KINDS.HEALTH,
    sourceBytecode: source?.bytecode || null,
    semanticSlug: options.semanticSlug || safeSemanticSlug(title),
    recoveryKey: options.recoveryKey || source?.checkId || null,
    stableContext: pickStableKeys({
      code: source?.code || null,
      cellId: source?.cellId || null,
      checkId: source?.checkId || null,
      ...options.stableContext,
      moduleId: source?.moduleId || null,
      contextModuleId: context.moduleId || null,
      path: context.path || null,
      checksum: source?.checksum || null,
    }),
  });
}

export function encodeBytecodeXPVaccineFromCccb(blockOrId, options = {}) {
  const id = typeof blockOrId === 'string' ? blockOrId : blockOrId?.ID;
  const parsed = parseCccbId(id);
  if (!parsed.checksumVerified) {
    throw new Error(`BytecodeXP vaccine rejects CCCB id with drifted checksum: ${id}`);
  }
  const stableContext = pickStableKeys({
    id,
    domain: parsed.domain,
    phaseId: parsed.phaseId,
    stepNum: parsed.stepNum,
    title: typeof blockOrId === 'object' ? blockOrId.TITLE || null : null,
    next: typeof blockOrId === 'object' ? blockOrId.NEXT || null : null,
  });

  return new BytecodeXPVaccine({
    sourceKind: BYTECODE_XP_SOURCE_KINDS.CCCB,
    sourceBytecode: id,
    semanticSlug: options.semanticSlug || parsed.semanticSlug,
    recoveryKey: options.recoveryKey || `PDR_CCCB_${parsed.domain}_${parsed.phaseId}_${parsed.stepNum}`,
    stableContext,
  });
}

/**
 * A navigation tool call is an EPISODE, not a diagnosis: it records that the
 * agent looked, at what, and why. The vaccine gives that record a tamper-evident
 * identity on the same wire as errors and health checks.
 *
 * `createdAt` is deliberately NOT in stableContext. Two identical looks at an
 * identical target must produce an identical fingerprint, or repeat detection
 * (the whole point) cannot work.
 */
export function encodeBytecodeXPVaccineFromToolCall(episode, options = {}) {
  const title = options.title || [
    'toolcall',
    episode?.toolName || 'tool',
    episode?.whyFamily || 'NAV',
    episode?.targetPath || '',
    episode?.targetSymbol || '',
  ].join(' ');

  return new BytecodeXPVaccine({
    sourceKind: BYTECODE_XP_SOURCE_KINDS.TOOLCALL,
    sourceBytecode: null,
    semanticSlug: options.semanticSlug || safeSemanticSlug(title),
    recoveryKey: options.recoveryKey || episode?.whyFamily || null,
    stableContext: pickStableKeys({
      toolName: episode?.toolName || null,
      targetPath: episode?.targetPath || null,
      targetSymbol: episode?.targetSymbol || null,
      argsHash: episode?.argsHash || null,
      whyFamily: episode?.whyFamily || null,
      whyHex: episode?.whyHex || null,
      stalenessKind: episode?.stalenessKind || null,
      stalenessKey: episode?.stalenessKey || null,
      ...options.stableContext,
    }),
  });
}

export function parseBytecodeXPVaccineBytecode(bytecode) {
  const match = BYTECODE_PATTERN.exec(String(bytecode || '').trim());
  if (!match) {
    return {
      valid: false,
      error: 'MALFORMED_PB_XP',
      bytecode,
    };
  }

  const [, sourceSegment, semanticSlug, fingerprint, checksum] = match;
  const sourceKind = Object.entries(BYTECODE_SOURCE_SEGMENTS)
    .find(([, segment]) => segment === sourceSegment)?.[0] || null;

  return {
    valid: true,
    bytecode,
    version: BYTECODE_XP_VERSION,
    sourceKind,
    semanticSlug,
    fingerprint,
    checksum,
    vaccineId: `${BYTECODE_XP_PREFIX}-${sourceSegment}-${semanticSlug}-${fingerprint}`,
  };
}

export function checksumVaccine(stable) {
  return sha256Hex(stableJson(stable)).slice(0, 12);
}

export function checksumVaccineFingerprint(stable) {
  return sha256Hex(stableJson(stable)).slice(0, 12);
}

/**
 * Derives a semantic slug, falling back to a deterministic sha256-derived slug
 * when the title collapses below the 4-char minimum after vowel/non-alnum
 * stripping. Keeps best-effort encoders (error/health) from throwing on sparse
 * or vowel-heavy diagnostic identities.
 */
function safeSemanticSlug(title) {
  try {
    return deriveSemanticSlug(title);
  } catch {
    return sha256Hex(String(title || 'vaccine')).slice(0, 8).toUpperCase();
  }
}

function normalizeSourceKind(sourceKind) {
  const normalized = String(sourceKind || '').toLowerCase();
  if (!Object.values(BYTECODE_XP_SOURCE_KINDS).includes(normalized)) {
    throw new Error(`Invalid BytecodeXP sourceKind: ${sourceKind}`);
  }
  return normalized;
}

function normalizeSemanticSlug(slug) {
  const normalized = String(slug || '').toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(normalized)) {
    throw new Error(`Invalid BytecodeXP semanticSlug: ${slug}`);
  }
  return normalized;
}

function pickStableKeys(input) {
  const out = {};
  for (const key of Object.keys(input).sort((a, b) => a.localeCompare(b))) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return stableClone(out);
}

function stableClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(stableClone));
  return Object.freeze(Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map(key => [key, stableClone(value[key])]),
  ));
}

function stableJson(value) {
  return JSON.stringify(stableClone(value));
}

function sha256Hex(value) {
  return isomorphicSha256Hex(value);
}
