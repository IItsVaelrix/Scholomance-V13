import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhenotypicIdealPacket } from '../../../scripts/lib/phenotypic-ideal-packet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HITS = path.join(ROOT, 'tests/qa/features/fixtures/phenotypic-hits.json');

describe('phenotypic:ideal compose (golden)', () => {
  it('emits a valid PHENOTYPIC-IDEAL-v1 packet from injected hits', () => {
    const proc = spawnSync(
      process.execPath,
      [
        path.join(ROOT, 'scripts/phenotypic-ideal.mjs'),
        'phoneme duration',
        '--hits-json',
        HITS,
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    expect(proc.status).toBe(0);
    const packet = JSON.parse(proc.stdout);
    expect(packet.contract).toBe('PHENOTYPIC-IDEAL-v1');
    expect(validatePhenotypicIdealPacket(packet)).toEqual([]);
    expect(packet.boonSeeds.length).toBeGreaterThan(0);
    expect(packet.evidence.capabilities.some((c) => c.domain === 'phonology')).toBe(true);
  });

  it('bridge phenotypic-ideal returns the same contract', () => {
    const bridge = path.join(ROOT, 'divtube_downloader/scripts/scholomance-bridge.mjs');
    const proc = spawnSync(
      process.execPath,
      [
        bridge,
        'phenotypic-ideal',
        'phoneme duration',
        '--hits-json',
        HITS,
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    expect(proc.status).toBe(0);
    const packet = JSON.parse(proc.stdout);
    expect(packet.contract).toBe('PHENOTYPIC-IDEAL-v1');
    expect(validatePhenotypicIdealPacket(packet)).toEqual([]);
  });
});
