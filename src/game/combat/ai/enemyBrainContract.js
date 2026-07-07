/**
 * Lightweight consumes-contract for council mini-brains — ported from the
 * consumes-check half of pixelbrain seam-contract.js. Brains are read-only
 * scorers, so there is deliberately no emits/mutates half.
 */

export const AI_DIAGNOSTIC_CODES = Object.freeze({
  CONTEXT_MISSING: 'AI_BRAIN_CONTEXT_MISSING',
});

function resolvePath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * @param {{ id: string, consumes?: string[] }} brain
 * @param {object} probe - merged context, e.g. { ...context, candidate }
 * @returns {{ ok: boolean, failures: Array<{code:string,selector:string,message:string,fatal:boolean}> }}
 */
export function validateBrainContext(brain, probe) {
  const failures = [];
  for (const selector of brain.consumes || []) {
    if (resolvePath(probe, selector) === undefined) {
      failures.push({
        code: AI_DIAGNOSTIC_CODES.CONTEXT_MISSING,
        selector,
        message: `${brain.id} consumes '${selector}' which the context does not provide.`,
        fatal: true,
      });
    }
  }
  return { ok: failures.length === 0, failures };
}