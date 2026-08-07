export const SUBTLETY_OBSERVATION_CONTEXT_SCHEMA = 'SUBTLETY-OBSERVATION-CONTEXT-v1';

const LIMITS = Object.freeze({
  runtime: 128,
  errorType: 256,
  message: 2048,
  topFrame: 1024,
  thread: 256,
});

function redact(value) {
  return value
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@([^\s/]+)/giu,
      '$1[REDACTED]@$2',
    )
    .replace(/\bBearer\s+[^\s]+/giu, 'Bearer [REDACTED]')
    .replace(
      /\b(api-key|api_key|apikey|token|password|secret)(\s*[:=]\s*)[^\s]+/giu,
      '$1$2[REDACTED]',
    );
}

function normalizeField(raw, name, fallback) {
  const normalized = redact(
    String(raw?.[name] ?? fallback)
      .replace(/\r\n?/gu, '\n')
      .replace(/\0/gu, ''),
  );
  const bounded = [...normalized].slice(0, LIMITS[name]).join('');
  return bounded || fallback;
}

export function normalizeObservationContext(raw = {}) {
  return {
    schema: SUBTLETY_OBSERVATION_CONTEXT_SCHEMA,
    runtime: normalizeField(raw, 'runtime', 'unknown'),
    errorType: normalizeField(raw, 'errorType', 'unknown'),
    message: normalizeField(raw, 'message', ''),
    topFrame: normalizeField(raw, 'topFrame', 'unknown'),
    thread: normalizeField(raw, 'thread', ''),
  };
}

export function legacyObservationContext(payload = {}) {
  const emits = payload.fingerprint?.emits || [];
  const crashEmit = emits.find((value) => String(value).startsWith('thread.crash.'));
  return normalizeObservationContext({
    runtime: payload.identity?.runtimeProfile
      || payload.execution?.runtimeProfile
      || 'unknown',
    errorType: crashEmit
      ? String(crashEmit).slice('thread.crash.'.length)
      : 'unknown',
    topFrame: 'unknown',
  });
}
