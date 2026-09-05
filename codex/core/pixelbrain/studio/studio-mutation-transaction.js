function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  // Typed-array views with elements cannot be frozen in current JavaScript
  // engines. They are already isolated by clone(); freeze the owning records.
  if (ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function createMutationCandidate(base, result, ampId) {
  if (!base?.checksum) throw new Error('PB-STUDIO-BASELINE-CHECKSUM-REQUIRED');
  if (!result?.checksum) throw new Error('PB-STUDIO-CANDIDATE-CHECKSUM-REQUIRED');
  if (typeof ampId !== 'string' || ampId.length === 0) throw new Error('PB-STUDIO-MUTATION-AMP-REQUIRED');
  return deepFreeze({
    contract: 'PB-STUDIO-MUTATION-v1',
    baseChecksum: base.checksum,
    ampId,
    candidate: clone(result),
    accepted: false,
  });
}

export function acceptMutation(current, transaction) {
  if (current?.checksum !== transaction?.baseChecksum) throw new Error('PB-STUDIO-STALE-BASELINE');
  return deepFreeze({
    ...clone(transaction.candidate),
    parentChecksum: current.checksum,
    mutationAmpId: transaction.ampId,
  });
}

export function rejectMutation(current, transaction) {
  if (current?.checksum !== transaction?.baseChecksum) throw new Error('PB-STUDIO-STALE-BASELINE');
  return current;
}
