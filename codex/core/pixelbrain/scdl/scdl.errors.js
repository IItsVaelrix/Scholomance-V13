/**
 * SCDL Error System
 *
 * All SCDL compile errors are machine-readable and carry:
 *   - A human message
 *   - Source location (line, col)
 *   - A PB-ERR-v1 bytecode string
 *
 * Error codes are in the SCDL-xxx namespace. Hex values map into the
 * existing bytecode-error.js error code space: 0x1000–0x10FF reserved for SCDL.
 */

import { encodeBytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS } from '../bytecode-error.js';

// ─── SCDL Module ID ──────────────────────────────────────────────────────────
// We reuse ARTIFACT module ID from the existing registry (0x1000 range maps to SCDL).
// The SCDL code catalogue is scoped by this module label.
const SCDL_MODULE = 'ARTIFA'; // MODULE_IDS.ARTIFACT

// ─── Error Code Catalogue ────────────────────────────────────────────────────

export const SCDL_ERROR_CODES = Object.freeze({
  UNKNOWN_VERB:          0x1001, // Unknown top-level or block verb
  MISSING_ASSET:         0x1002, // No `asset` declaration found
  INVALID_CANVAS:        0x1003, // Canvas format not WxH
  INVALID_HEX_COLOR:     0x1004, // Malformed hex literal
  UNKNOWN_MATERIAL:      0x1005, // Material ID not in registry (warn)
  UNDEFINED_PALETTE_REF: 0x1006, // Named colour not in palette
  CELL_OUT_OF_BOUNDS:    0x1007, // Cell x/y outside canvas
  TRACE_INTENT:          0x1008, // trace stored as intent (info)
  DUPLICATE_PART_ID:     0x1009, // Part ID used more than once
  UNKNOWN_EXPORT_TARGET: 0x100A, // Export target not supported
  INVALID_VECTOR_OP:     0x100B, // Vector op has invalid params
  FRAME_UNKNOWN_PART:    0x100C, // Frame targets unknown part id (replace or omit)
  FRAME_INDEX_LAW:       0x100D, // Frame Index Law violation (sparse/out-of-order/duplicate/explicit 0)
  FRAME_BAD_ANCHOR:      0x100E, // Added part missing/unknown 'after' anchor, or 'after' on a replacement
  DEAD_FRAME:            0x100F, // Frame identical to base after expansion (warn)

  // SCDL v1.2 — scene graph (PR-1)
  UNKNOWN_DEF_REF:       0x1010, // instance references undeclared def
  DEF_CYCLE:             0x1011, // def reference cycle
  DEPTH_CAP:             0x1012, // graph depth exceeds cap (8)
  INVALID_TRANSFORM:     0x1013, // non-finite transform params or scale 0
  DEAD_INSTANCE:         0x1014, // instance fully clipped off-canvas (warn)
  DEAD_DEF:              0x1015, // def declared but never instanced (warn)
});

const SCDL_CODE_LABELS = Object.freeze({
  [SCDL_ERROR_CODES.UNKNOWN_VERB]:          'SCDL-001',
  [SCDL_ERROR_CODES.MISSING_ASSET]:         'SCDL-002',
  [SCDL_ERROR_CODES.INVALID_CANVAS]:        'SCDL-003',
  [SCDL_ERROR_CODES.INVALID_HEX_COLOR]:     'SCDL-004',
  [SCDL_ERROR_CODES.UNKNOWN_MATERIAL]:      'SCDL-005',
  [SCDL_ERROR_CODES.UNDEFINED_PALETTE_REF]: 'SCDL-006',
  [SCDL_ERROR_CODES.CELL_OUT_OF_BOUNDS]:    'SCDL-007',
  [SCDL_ERROR_CODES.TRACE_INTENT]:          'SCDL-008',
  [SCDL_ERROR_CODES.DUPLICATE_PART_ID]:     'SCDL-009',
  [SCDL_ERROR_CODES.UNKNOWN_EXPORT_TARGET]: 'SCDL-010',
  [SCDL_ERROR_CODES.INVALID_VECTOR_OP]:     'SCDL-011',
  [SCDL_ERROR_CODES.FRAME_UNKNOWN_PART]:    'SCDL-012',
  [SCDL_ERROR_CODES.FRAME_INDEX_LAW]:       'SCDL-013',
  [SCDL_ERROR_CODES.FRAME_BAD_ANCHOR]:      'SCDL-014',
  [SCDL_ERROR_CODES.DEAD_FRAME]:            'SCDL-015',

  // SCDL v1.2 — scene graph (PR-1)
  [SCDL_ERROR_CODES.UNKNOWN_DEF_REF]:       'SCDL-016',
  [SCDL_ERROR_CODES.DEF_CYCLE]:             'SCDL-017',
  [SCDL_ERROR_CODES.DEPTH_CAP]:             'SCDL-018',
  [SCDL_ERROR_CODES.INVALID_TRANSFORM]:     'SCDL-019',
  [SCDL_ERROR_CODES.DEAD_INSTANCE]:         'SCDL-020',
  [SCDL_ERROR_CODES.DEAD_DEF]:              'SCDL-021',
});

// ─── SCDLError Class ─────────────────────────────────────────────────────────

export class SCDLError {
  /**
   * @param {object} opts
   * @param {string}  opts.message       - Human-readable description
   * @param {number}  opts.code          - SCDL_ERROR_CODES value
   * @param {string}  opts.severity      - 'ERROR' | 'WARN' | 'INFO'
   * @param {{line:number,col:number}} opts.loc - Source location
   * @param {object}  [opts.context={}]  - Extra context for bytecode string
   */
  constructor({ message, code, severity, loc, context = {} }) {
    this.message       = String(message);
    this.code          = code;
    this.label         = SCDL_CODE_LABELS[code] || `SCDL-???`;
    this.severity      = severity; // 'ERROR' | 'WARN' | 'INFO'
    this.loc           = { line: loc?.line ?? 0, col: loc?.col ?? 0 };
    this.context       = { ...context, scdlCode: this.label, line: this.loc.line, col: this.loc.col };
    this.bytecodeString = _encodeSCDLBytecode(severity, code, this.context);
  }

  isError() { return this.severity === 'ERROR'; }
  isWarn()  { return this.severity === 'WARN'; }
  isInfo()  { return this.severity === 'INFO'; }

  toJSON() {
    return {
      label:         this.label,
      severity:      this.severity,
      message:       this.message,
      loc:           this.loc,
      bytecodeString: this.bytecodeString,
      context:       this.context,
    };
  }
}

// ─── Internal encoder ────────────────────────────────────────────────────────

function _encodeSCDLBytecode(severity, code, context) {
  const cat = _sevToCategory(severity);
  const pbSev = _scdlSevToPBSev(severity);
  try {
    return encodeBytecodeError(cat, pbSev, SCDL_MODULE, code, context);
  } catch (_) {
    // Fallback: encode with ARTIFACT + WARN if code is out of PB range
    return encodeBytecodeError(ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.WARN, SCDL_MODULE, 0xF001, context);
  }
}

function _sevToCategory(severity) {
  switch (severity) {
    case 'ERROR': return ERROR_CATEGORIES.STATE;
    case 'WARN':  return ERROR_CATEGORIES.VALUE;
    default:      return ERROR_CATEGORIES.STATE;
  }
}

function _scdlSevToPBSev(severity) {
  switch (severity) {
    case 'ERROR': return ERROR_SEVERITY.CRIT;
    case 'WARN':  return ERROR_SEVERITY.WARN;
    default:      return ERROR_SEVERITY.INFO;
  }
}

// ─── Convenience factories ────────────────────────────────────────────────────

export function scdlError(message, code, loc, context) {
  return new SCDLError({ message, code, severity: 'ERROR', loc, context });
}

export function scdlWarn(message, code, loc, context) {
  return new SCDLError({ message, code, severity: 'WARN', loc, context });
}

export function scdlInfo(message, code, loc, context) {
  return new SCDLError({ message, code, severity: 'INFO', loc, context });
}
