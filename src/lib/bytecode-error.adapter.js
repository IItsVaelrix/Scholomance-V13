
/**
 * BYTECODE ERROR ADAPTER
 * 
 * Centralized utility for the frontend to emit and display errors 
 * in the PixelBrain Bytecode format.
 */

import { 
  BytecodeError, 
  ERROR_CATEGORIES, 
  ERROR_SEVERITY, 
  MODULE_IDS, 
  ERROR_CODES 
} from './pixelbrain.adapter.js';

/**
 * Wraps a standard frontend error or event into a PB-ERR-v1 bytecode string.
 * 
 * @param {Object} options
 * @param {string} options.category - ERROR_CATEGORIES
 * @param {string} options.moduleId - MODULE_IDS (or custom uppercase slug)
 * @param {number} options.code - ERROR_CODES
 * @param {Object} options.context - Additional error data
 * @param {string} options.severity - ERROR_SEVERITY
 * @returns {string} The encoded bytecode
 */
export function emitBytecodeError({ 
  category = ERROR_CATEGORIES.STATE,
  moduleId = 'SHARED',
  code = ERROR_CODES.INVALID_STATE,
  context = {},
  severity = ERROR_SEVERITY.CRIT
}) {
  const err = new BytecodeError(category, severity, moduleId, code, context);
  return err.bytecode;
}

/**
 * Specifically for fetch/network failures.
 */
export function emitNetworkBytecodeError(path, status, details = {}) {
  return emitBytecodeError({
    category: ERROR_CATEGORIES.STATE,
    moduleId: 'SHARED',
    code: status === 403 ? ERROR_CODES.RACE_CONDITION : ERROR_CODES.INVALID_STATE,
    severity: ERROR_SEVERITY.CRIT,
    context: {
      operation: 'fetch',
      path,
      status,
      ...details
    }
  });
}

/**
 * Specifically for UI stasis / hang detection.
 */
export function emitStasisBytecodeError(elementId, operation, duration) {
  return emitBytecodeError({
    category: 'UI_STASIS',
    moduleId: 'UISTAS',
    code: 0x0E01, // CLICK_HANDLER_STALL
    severity: ERROR_SEVERITY.CRIT,
    context: {
      elementId,
      operation,
      actualDuration: duration,
      timeoutMs: 5000
    }
  });
}

/**
 * Returns true if the string appears to be a valid PB-ERR-v1 bytecode.
 */
export function isBytecode(str) {
  return typeof str === 'string' && str.startsWith('PB-ERR-v1-');
}
