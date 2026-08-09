// Python tracebacks and V8 stacks label their frames; SpiderMonkey/JSC do not,
// and the browser sensor falls back to a bare `file:line:col` when a
// cross-origin script error exposes no Error object. Marker matching runs
// across every line first so a labelled frame always outranks a location-only
// one (a V8 stack's first line is the message, not a frame).
const FRAME_MARKER = /File "|\bat /u;
const FRAME_LOCATION = /(?:@.+|):\d+:\d+\)?$/u;

function topStackFrame(stack) {
  if (!stack) return 'unknown';
  const lines = String(stack).split('\n').map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => FRAME_MARKER.test(l))
    || lines.find((l) => FRAME_LOCATION.test(l));
  return line || 'unknown';
}

function shortErrorName(errorType) {
  const s = String(errorType || 'Error');
  const parts = s.split('.');
  return parts[parts.length - 1] || 'Error';
}

export function normalizeCrashEvent(raw = {}) {
  const runtime = raw.runtime || 'node-fly';
  const errorType = raw.errorType || 'Error';
  const unitId = raw.unitId || `crash.${runtime}.unspecified`;
  const topFrame = topStackFrame(raw.stack);
  const short = shortErrorName(errorType);
  return {
    identity: {
      unitId,
      unitKind: 'path',
      contractVersion: 'crash-v1',
      implementationVersion: raw.implementationVersion || 'crash-observed-1',
      canonicalCorpusId: 'corpus-crash-v1',
      runtimeProfile: runtime,
      buildId: raw.buildId ?? null,
    },
    output: {
      ok: false,
      applied: false,
      error: {
        type: errorType,
        message: raw.message || '',
        site: topFrame,
        thread: raw.thread ?? null,
      },
      seam: `crash.${runtime}`,
    },
    seam: {
      consumes: ['process.exception'],
      emits: [`thread.crash.${short}`],
      mutates: [],
    },
    dedupKey: `${unitId}|${errorType}|${topFrame}`,
  };
}
