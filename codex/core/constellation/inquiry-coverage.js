/**
 * Probe-blind coverage on the sem-inquiry-2 substrate.
 *
 * Two independent maps — do not merge them:
 *
 *   semantic         probe incompleteness. The judge refused, and an
 *                    exposed axis still distinguished the candidates.
 *                    This says "investigate this region". It does not
 *                    say the Ballistics preference is correct, and it
 *                    never promotes a winner.
 *
 *   instrumentation  whether the inquiry packet faithfully exposes the
 *                    axis. A raw split that arrives as null scores is
 *                    unexposed, not flat.
 *
 * MIN_COVERAGE_SPLIT is a detection threshold (numerically different
 * vs operationally distinct). It is not evidence of semantic
 * significance and can be swept later without changing the lattice.
 *
 * PURE AND ZERO-I/O. Reads a packet. Emits a diagnosis. Cannot
 * mutate selection.
 *
 * @module codex/core/constellation/inquiry-coverage
 */

export const MIN_COVERAGE_SPLIT = 0.01;

function declaredScores(ballistics) {
  return Array.isArray(ballistics?.scores) ? ballistics.scores : [];
}

function finiteScores(ballistics) {
  return declaredScores(ballistics)
    .map((row) => row && row.semanticScore)
    .filter((n) => typeof n === 'number' && Number.isFinite(n));
}

function splitOf(scores) {
  if (scores.length < 2) return null;
  return Math.max(...scores) - Math.min(...scores);
}

/**
 * Pipeline map. Independent of whether the probe warranted a sense.
 *
 * @returns {'not-applicable' | 'unavailable' | 'exposed' | 'unexposed'}
 */
export function classifyInstrumentationCoverage(result) {
  if (!result || result.bound === false) return 'not-applicable';
  const axis = result.ballistics;
  if (!axis) return 'not-applicable';
  if (axis.status === 'unavailable') return 'unavailable';
  if (axis.status !== 'measured') return 'not-applicable';
  return finiteScores(axis).length >= 2 ? 'exposed' : 'unexposed';
}

/**
 * Judge map. Completes only when the axis is inspectable, or when the
 * probe already resolved, or when there is no inquiry to make.
 *
 * @returns {string|null}
 */
export function classifySemanticInquiryCoverage(result, instrumentation) {
  if (!result || result.bound === false) return 'unbound';
  if (result.selection?.warranted) return 'warranted';
  const pipe = instrumentation ?? classifyInstrumentationCoverage(result);
  if (pipe === 'unavailable' || pipe === 'unexposed') return null;
  if (pipe === 'not-applicable') return 'dark';
  const split = splitOf(finiteScores(result.ballistics));
  if (split !== null && split >= MIN_COVERAGE_SPLIT) return 'measured-unwarranted';
  return 'flat-unwarranted';
}

function diagnosticKind(semantic, instrumentation) {
  if (instrumentation === 'unexposed') return 'unexposed-measurement';
  if (instrumentation === 'unavailable') return 'unavailable';
  return semantic;
}

function reasonOf(result, instrumentation) {
  if (instrumentation === 'unavailable') {
    return result.ballistics?.reason ?? result.selection?.reason ?? null;
  }
  return result?.selection?.reason ?? null;
}

/**
 * @param {{
 *   bound?: boolean,
 *   selection?: { warranted?: boolean, reason?: string },
 *   ballistics?: { status?: string, reason?: string, scores?: { semanticScore?: number }[] } | null,
 *   receiptDigests?: string[],
 * }} result
 */
export function classifyInquiryCoverage(result) {
  const scores = finiteScores(result?.ballistics);
  const instrumentation = classifyInstrumentationCoverage(result);
  const semantic = classifySemanticInquiryCoverage(result, instrumentation);
  const kind = diagnosticKind(semantic, instrumentation);
  return Object.freeze({
    kind,
    opportunity: semantic === 'measured-unwarranted',
    semantic,
    instrumentation,
    reason: reasonOf(result, instrumentation),
    split: splitOf(scores),
    scoreCount: scores.length,
    receiptCount: Array.isArray(result?.receiptDigests) ? result.receiptDigests.length : 0,
    warranted: Boolean(result?.selection?.warranted),
  });
}
