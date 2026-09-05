/**
 * SEMANTIC-REGISTRY
 *
 * Canonical source of truth for PixelBrain authoring semantics.
 * Exposes roles, effects, and other semantic concepts used by SemQuant,
 * construction, region-fill, character systems, etc.
 *
 * This is the shared "connective tissue" for role/part/effect classification
 * so that different authoring surfaces and processing AMPS speak the same language.
 */

import { encodeBytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS } from './bytecode-error.js';

// === Core Semantic Constants (source of truth) ===
export const SemanticDomains = Object.freeze({
  GEOMETRY: 'geometry',
  CONSTRUCTION: 'construction',
  MATERIAL: 'material',
  PART: 'part',
  ROLE: 'role',
  EFFECT: 'effect',
  ANIMATION: 'animation',
  PROVENANCE: 'provenance',
});

export const CanonicalRoles = Object.freeze({
  BODY: 'body',
  RIM: 'rim',
  CORE: 'core',
  HIGHLIGHT: 'highlight',
  SHADOW: 'shadow',
  LIMB: 'limb',
  JOINT: 'joint',
  EYE: 'eye',
  MOUTH: 'mouth',
  AURA: 'aura',
  WEAPON: 'weapon',
  ARMOR: 'armor',
  CONSTRUCTION_GUIDE: 'constructionGuide',
  REFERENCE: 'reference',
});

export const SemanticDiagnosticCodes = Object.freeze({
  UNKNOWN_ROLE: 'PB-SEM-001',
  AMBIGUOUS_ROLE: 'PB-SEM-002',
  MISSING_MATERIAL_BINDING: 'PB-SEM-003',
  INVALID_EFFECT_TARGET: 'PB-SEM-004',
  PROVENANCE_LOSS: 'PB-SEM-005',
});

// PB-SEM numeric sub-range inside the ARTIFACT module space (0x1000–0x10FF).
// SCDL owns 0x1001–0x10xx from the bottom; semantics claim 0x1080–0x108F.
export const SEMANTIC_DIAGNOSTIC_BYTECODES = Object.freeze({
  'PB-SEM-000': 0x1080, // internal/unclassified semantic diagnostic
  'PB-SEM-001': 0x1081,
  'PB-SEM-002': 0x1082,
  'PB-SEM-003': 0x1083,
  'PB-SEM-004': 0x1084,
  'PB-SEM-005': 0x1085,
});

export const ROLE_ALIASES = Object.freeze({
  body: 'body',
  torso: 'body',
  hull: 'body',
  blob: 'body',
  mass: 'body',

  rim: 'rim',
  outline: 'rim',
  border: 'rim',
  edge: 'rim',

  shine: 'highlight',
  specular: 'highlight',
  glint: 'highlight',
  highlight: 'highlight',

  shade: 'shadow',
  shadow: 'shadow',
  darkside: 'shadow',

  glow: 'aura',
  aura: 'aura',
  field: 'aura',

  guide: 'constructionGuide',
  reference: 'constructionGuide',
  construction: 'constructionGuide',
  '00_reference': 'constructionGuide',
  'constructionguide': 'constructionGuide',
});

// Provide a normalized lookup for roles
export function resolveRole(raw) {
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase().replace(/[^a-z0-9_/-]/g, '');
  if (ROLE_ALIASES[normalized]) {
    return ROLE_ALIASES[normalized];
  }
  // Also allow direct canonical match
  const upper = normalized.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (CanonicalRoles[upper]) {
    return CanonicalRoles[upper];
  }
  return null;
}

// Get all known roles (canonical values)
export function getAllRoles() {
  return Object.values(CanonicalRoles);
}

// Check if a string is a known role (after alias resolution)
export function isKnownRole(raw) {
  return !!resolveRole(raw);
}

// Effect aliases (can be expanded later)
export const EFFECT_ALIASES = Object.freeze({
  glow: 'aura',
  aura: 'aura',
  field: 'aura',
  trace: 'trace',
  highlight: 'highlight',
});

export function resolveEffect(raw) {
  if (!raw) return null;
  const norm = String(raw).trim().toLowerCase();
  return EFFECT_ALIASES[norm] || norm;
}

// === PB-SEM diagnostic ↔ PB-ERR-v1 bytecode adapter ===

/**
 * Encode a semantic diagnostic (from semanticUnifierPass) as a PB-ERR-v1
 * bytecode string, so PB-SEM issues are visible to the same decode/recovery
 * tooling as every other PixelBrain error.
 */
export function semanticDiagnosticToBytecode(diag = {}) {
  const code = SEMANTIC_DIAGNOSTIC_BYTECODES[diag.code] ?? SEMANTIC_DIAGNOSTIC_BYTECODES['PB-SEM-000'];
  const severity = String(diag.severity || 'warn').toLowerCase();
  const pbSeverity = severity === 'error' ? ERROR_SEVERITY.CRIT
    : severity === 'info' ? ERROR_SEVERITY.INFO
    : ERROR_SEVERITY.WARN;
  const category = severity === 'error' ? ERROR_CATEGORIES.STATE : ERROR_CATEGORIES.VALUE;
  return encodeBytecodeError(category, pbSeverity, MODULE_IDS.ARTIFACT, code, {
    pbSemCode: diag.code || 'PB-SEM-000',
    nodeId: diag.nodeId || null,
    message: diag.message || '',
  });
}

/**
 * Wrap a semantic diagnostic in the SCDLError-compatible shape the compiler's
 * error list expects (isError/isWarn/isInfo + bytecodeString + toJSON).
 */
export function createSemanticDiagnostic(diag = {}) {
  const severity = String(diag.severity || 'warn').toLowerCase();
  return {
    message: diag.message || '',
    code: diag.code || 'PB-SEM-000',
    label: diag.code || 'PB-SEM-000',
    severity,
    loc: diag.loc || { line: 0, col: 0 },
    nodeId: diag.nodeId || null,
    semantic: true,
    bytecodeString: semanticDiagnosticToBytecode(diag),
    isError() { return severity === 'error'; },
    isWarn() { return severity === 'warn'; },
    isInfo() { return severity === 'info'; },
    toJSON() {
      return {
        label: this.label,
        severity: this.severity,
        message: this.message,
        loc: this.loc,
        nodeId: this.nodeId,
        bytecodeString: this.bytecodeString,
      };
    },
  };
}

// Convenience: get a semantic metadata object for a coordinate or node
export function getSemanticMeta(item = {}) {
  const role = item.role || item.semanticRole || resolveRole(item.payload?.role || item.layerName);
  const part = item.partId || item.payload?.partId;
  const effect = resolveEffect(item.effect || item.payload?.effect || item.payload?.op);

  return {
    role: role || 'unknown',
    partId: part || null,
    effect: effect || null,
    isConstructionGuide: role === CanonicalRoles.CONSTRUCTION_GUIDE,
    isRim: role === CanonicalRoles.RIM,
    isBody: role === CanonicalRoles.BODY,
    isAura: effect === 'aura' || role === CanonicalRoles.AURA,
  };
}

export default {
  SemanticDomains,
  CanonicalRoles,
  SemanticDiagnosticCodes,
  ROLE_ALIASES,
  resolveRole,
  getAllRoles,
  isKnownRole,
  resolveEffect,
  getSemanticMeta,
};
