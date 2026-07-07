import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../pixelbrain/bytecode-error.js';
import {
  createEventEnvelope,
  getEventContract,
  validateEventPayload,
} from './scholomance-event-map.js';

function isBytecodeErrorLike(error) {
  return typeof error?.bytecode === 'string' && error.bytecode.startsWith('PB-ERR-v1-');
}

/**
 * Normalizes any thrown value into a PB-ERR-v1 bytecode string.
 *
 * @param {unknown} error
 * @param {object} context
 * @returns {string}
 */
export function normalizeErrorToBytecode(error, context = {}) {
  if (typeof error === 'string' && error.startsWith('PB-ERR-v1-')) {
    return error;
  }
  if (isBytecodeErrorLike(error)) {
    return error.bytecode;
  }

  const message = error instanceof Error
    ? error.message
    : String(error ?? 'Unknown error');

  return new BytecodeError(
    ERROR_CATEGORIES.STATE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.SHARED,
    ERROR_CODES.INVALID_STATE,
    {
      message,
      ...context,
    }
  ).bytecode;
}

/**
 * Validates a known event payload and returns either an event envelope or a
 * bytecode diagnostic. It does not throw.
 *
 * @param {string} eventName
 * @param {object} payload
 * @param {object} options
 */
export function createEventDiagnostic(eventName, payload = {}, options = {}) {
  const validation = validateEventPayload(eventName, payload);
  const contract = getEventContract(eventName);

  if (!validation.ok) {
    const code = validation.code === 'UNKNOWN_EVENT'
      ? ERROR_CODES.INVALID_ENUM
      : ERROR_CODES.MISSING_REQUIRED;

    const bytecode = new BytecodeError(
      ERROR_CATEGORIES.VALUE,
      ERROR_SEVERITY.WARN,
      MODULE_IDS.SHARED,
      code,
      {
        eventName: String(eventName || ''),
        domain: contract?.domain || 'unknown',
        missing: validation.missing,
        payloadKeys: Object.keys(payload && typeof payload === 'object' ? payload : {}),
      }
    ).bytecode;

    return Object.freeze({
      ok: false,
      contract,
      validation,
      bytecode,
    });
  }

  return Object.freeze({
    ok: true,
    contract,
    validation,
    envelope: createEventEnvelope(eventName, payload, options),
  });
}

/**
 * Throws a BytecodeError when an event payload violates the canonical map.
 *
 * @param {string} eventName
 * @param {object} payload
 */
export function assertEventPayload(eventName, payload = {}) {
  const diagnostic = createEventDiagnostic(eventName, payload);
  if (diagnostic.ok) return diagnostic.envelope;

  throw new BytecodeError(
    ERROR_CATEGORIES.VALUE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.SHARED,
    diagnostic.validation.code === 'UNKNOWN_EVENT'
      ? ERROR_CODES.INVALID_ENUM
      : ERROR_CODES.MISSING_REQUIRED,
    {
      eventName: String(eventName || ''),
      missing: diagnostic.validation.missing,
    }
  );
}
