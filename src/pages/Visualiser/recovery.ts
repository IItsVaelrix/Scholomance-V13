/**
 * Cleri-approved UI recovery adapters.
 * Catch bodies must call one of these (name matches degrade|fallback|recover)
 * or return `{ ok:false, error, reason }` — logging alone is still swallowed.
 */

export function degradeWithFallback(error: unknown, reason: string) {
  return {
    ok: false as const,
    error,
    reason,
    fallback: true,
    failed: true,
  };
}
