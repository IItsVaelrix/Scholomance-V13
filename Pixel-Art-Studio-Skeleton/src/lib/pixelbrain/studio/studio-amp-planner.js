import { sha256Hex } from '../sha256.js';

export const STUDIO_AMP_PLAN_CONTRACT = 'PB-STUDIO-AMP-PLAN-v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createStudioAmpPlan({ snapshotChecksum, records = [], selectedIds = [] } = {}) {
  if (typeof snapshotChecksum !== 'string' || snapshotChecksum.length === 0) {
    throw new Error('PB-STUDIO-SNAPSHOT-CHECKSUM-REQUIRED');
  }

  const byId = new Map(records.map((record) => [record.ampId, record]));
  const selected = new Set(selectedIds);
  for (const ampId of selected) {
    if (!byId.has(ampId)) throw new Error(`PB-STUDIO-UNKNOWN-AMP: ${ampId}`);
  }

  const steps = records
    .filter((record) => selected.has(record.ampId))
    .sort((a, b) => a.order - b.order || a.ampId.localeCompare(b.ampId))
    .map((record) => ({
      ampId: record.ampId,
      adapterId: record.adapterId || record.ampId,
      kind: record.kind,
      order: record.order,
      tab: record.tab || 'amps',
      reads: [...(record.reads || [])].sort(),
      writes: [...(record.writes || [])].sort(),
    }));

  const claims = new Map();
  for (const step of steps) {
    for (const region of step.writes) {
      if (claims.has(region)) {
        throw new Error(`PB-STUDIO-CONFLICT: ${claims.get(region)} and ${step.ampId} write ${region}`);
      }
      claims.set(region, step.ampId);
    }
  }

  const skipped = records
    .filter((record) => !selected.has(record.ampId))
    .sort((a, b) => a.ampId.localeCompare(b.ampId))
    .map((record) => ({ ampId: record.ampId, reason: 'not selected' }));

  const body = { contract: STUDIO_AMP_PLAN_CONTRACT, snapshotChecksum, steps, skipped };
  return deepFreeze({ ...body, planChecksum: `studio-plan1:${sha256Hex(JSON.stringify(body))}` });
}
