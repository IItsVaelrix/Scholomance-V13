import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../bytecode-error.js';

const CODE_BY_CATEGORY = Object.freeze({
  [ERROR_CATEGORIES.VALUE]: ERROR_CODES.INVALID_VALUE,
  [ERROR_CATEGORIES.RANGE]: ERROR_CODES.OUT_OF_BOUNDS,
  [ERROR_CATEGORIES.STATE]: ERROR_CODES.INVALID_STATE,
  [ERROR_CATEGORIES.FORMULA]: ERROR_CODES.FORMULA_EVAL_FAIL,
  [ERROR_CATEGORIES.COORD]: ERROR_CODES.COORD_INVALID,
});

export function constructionError(category, reason, context = {}) {
  const errorCode = CODE_BY_CATEGORY[category];
  if (errorCode === undefined) {
    throw new TypeError(`Unsupported construction error category "${category}"`);
  }
  return new BytecodeError(
    category,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.COORD_MAP,
    errorCode,
    {
      contract: 'PB-GEOMETRY-CONSTRUCTION-v1',
      reason,
      ...context,
    },
  );
}
