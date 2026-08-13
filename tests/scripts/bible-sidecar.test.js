import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildSidecarPayload } from '../../scripts/bible-synthesis.js';

const inventory = [
  { path: 'src/B.jsx', layer: 'UI', errorCodes: ['PB-ERR-v1-B'], healthCodes: [] },
  { path: 'codex/core/a.js', layer: 'Core', errorCodes: ['PB-ERR-v1-A', 'PB-ERR-v1-A'], healthCodes: ['PB-OK-v1-A'] },
];
const pathogens = [
  { code: 'PB-ERR-v1-LINGUISTIC-CRIT-IMMUNE-0F03', file: 'src/B.jsx', detail: 'breach' },
  { code: 'PB-ERR-v1-LINGUISTIC-CRIT-IMMUNE-0F08', file: 'codex/core/a.js', detail: 'layer' },
];

describe('BIBLE-JSON-v1 sidecar builder', () => {
  it('emits the schema contract', () => {
    const payload = buildSidecarPayload(inventory, pathogens, '2026-08-12');
    expect(payload.schema).toBe('BIBLE-JSON-v1');
    expect(payload.generated).toBe('2026-08-12');
  });

  it('sorts files by path and dedupes/sorts bytecodes', () => {
    const payload = buildSidecarPayload(inventory, pathogens, '2026-08-12');
    expect(payload.files.map((f) => f.path))
      .toEqual(['codex/core/a.js', 'src/B.jsx']);
    const core = payload.files[0];
    expect(core.errorCodes).toEqual(['PB-ERR-v1-A']); // deduped
    expect(core.healthCodes).toEqual(['PB-OK-v1-A']);
  });

  it('sorts pathogens by file then code', () => {
    const payload = buildSidecarPayload(inventory, pathogens, '2026-08-12');
    expect(payload.pathogens.map((p) => p.file))
      .toEqual(['codex/core/a.js', 'src/B.jsx']);
  });

  it('carries a recomputable checksum over the checksum-free payload', () => {
    const payload = buildSidecarPayload(inventory, pathogens, '2026-08-12');
    const { checksum, ...rest } = payload;
    const recomputed = crypto.createHash('sha256')
      .update(JSON.stringify(rest)).digest('hex');
    expect(checksum).toBe(recomputed);
  });

  it('is deterministic: identical inputs => identical bytes', () => {
    const a = JSON.stringify(buildSidecarPayload(inventory, pathogens, '2026-08-12'));
    const b = JSON.stringify(buildSidecarPayload(inventory, pathogens, '2026-08-12'));
    expect(a).toBe(b);
  });

  it('does not mutate its inputs', () => {
    const inv = JSON.parse(JSON.stringify(inventory));
    const pat = JSON.parse(JSON.stringify(pathogens));
    buildSidecarPayload(inv, pat, '2026-08-12');
    expect(inv).toEqual(inventory);
    expect(pat).toEqual(pathogens);
  });
});
