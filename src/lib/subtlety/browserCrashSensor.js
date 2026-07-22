/**
 * Browser crash sensor for the Subtlety Fingerprint APM.
 *
 * Forwards window `error` and `unhandledrejection` events to the hub's
 * /subtlety/crash ingest as `runtime: browser` crash events, giving the APM
 * eyes on the arena itself (the previously invisible client-side lane).
 *
 * Dev-only wiring: the hub requires x-subtlety-token, which must never ship
 * to a client. In dev the Vite proxy injects the token server-side, so this
 * sensor posts same-origin with no secret in the page. sendBeacon first
 * (survives tab teardown — the interesting case), fetch keepalive fallback.
 *
 * The sensor must never throw and never report its own failures.
 */

const DEDUP_WINDOW_MS = 60_000;

function crashEvent(unitId, errorType, message, stack) {
  return {
    runtime: 'browser',
    unitId,
    errorType: errorType || 'Error',
    message: String(message || ''),
    stack: String(stack || ''),
  };
}

export function installBrowserCrashSensor({ endpoint = '/subtlety/crash' } = {}) {
  if (typeof window === 'undefined') return () => {};

  const recentlySent = new Map();

  function shouldSend(key) {
    const now = Date.now();
    for (const [k, at] of recentlySent) {
      if (now - at > DEDUP_WINDOW_MS) recentlySent.delete(k);
    }
    if (recentlySent.has(key)) return false;
    recentlySent.set(key, now);
    return true;
  }

  function post(event) {
    try {
      const body = JSON.stringify(event);
      const beaconOk = navigator.sendBeacon?.(
        endpoint,
        new Blob([body], { type: 'application/json' }),
      );
      if (!beaconOk) {
        void fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // sensor must never disturb the page
    }
  }

  function onError(event) {
    const err = event?.error;
    const message = err?.message || event?.message || 'window error';
    const key = `error|${message}|${event?.filename || ''}|${event?.lineno || 0}`;
    if (!shouldSend(key)) return;
    post(crashEvent(
      'crash.browser.window',
      err?.name || 'Error',
      message,
      err?.stack || `${event?.filename || ''}:${event?.lineno || 0}:${event?.colno || 0}`,
    ));
  }

  function onRejection(event) {
    const reason = event?.reason;
    const message = reason?.message || String(reason ?? 'unhandled rejection');
    const key = `rejection|${message}`;
    if (!shouldSend(key)) return;
    post(crashEvent(
      'crash.browser.unhandled-rejection',
      reason?.name || 'UnhandledRejection',
      message,
      reason?.stack || '',
    ));
  }

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
