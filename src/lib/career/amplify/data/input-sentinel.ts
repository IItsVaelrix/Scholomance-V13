/**
 * U+241F SYMBOL FOR UNIT SEPARATOR — a sentinel that cannot occur in résumé prose,
 * so "this blank is still unfilled" is unambiguous.
 *
 * Single source of truth: the apply-engine guard, the metric templates, and the
 * review panel all import this. A second copy that drifted would disarm the guard.
 */
export const INPUT_SENTINEL = '␟';
