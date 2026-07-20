function topStackFrame(stack) {
  if (!stack) return 'unknown';
  const line = String(stack).split('\n').map((l) => l.trim()).find((l) => /File "|at /.test(l));
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
