import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhenotypicIdealPacket } from '../../../scripts/lib/phenotypic-ideal-packet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HITS = path.join(ROOT, 'tests/qa/features/fixtures/phenotypic-hits.json');
const HITS_DIVTUBE = path.join(ROOT, 'tests/qa/features/fixtures/phenotypic-hits-divtube.json');

function composeCli(query, extraArgs) {
  return spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts/phenotypic-ideal.mjs'), query, ...extraArgs],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
}

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

  // Boon 2: scope=divtube must bias EVIDENCE, not just the observed phenotype.
  // Given mixed divtube + collab-noise hits, the divtube-cockpit capability must
  // be matched (proving divtube hits reached evidence attach) and the collab
  // noise must be dropped from search.hits / observed.
  it('scope=divtube filters hits and matches the divtube-cockpit capability', () => {
    const proc = composeCli('tool dispatch and vectorizer', [
      '--scope',
      'divtube',
      '--hits-json',
      HITS_DIVTUBE,
    ]);
    expect(proc.status).toBe(0);
    const packet = JSON.parse(proc.stdout);
    expect(packet.scope).toBe('divtube');
    expect(validatePhenotypicIdealPacket(packet)).toEqual([]);
    // Collab noise dropped; only divtube hits survive.
    for (const hit of packet.search.hits) {
      expect(hit.path.startsWith('divtube_downloader/')).toBe(true);
    }
    expect(packet.search.hits.map((h) => h.path)).toContain(
      'divtube_downloader/tui/services/tool_service.py',
    );
    expect(packet.search.hits.map((h) => h.path)).not.toContain('codex/server/collab/oauth.py');
    // Boon 1's curated packet is the archaeology for the harness subtree.
    expect(packet.evidence.capabilities.some((c) => c.domain === 'divtube-cockpit')).toBe(true);
  });

  // Regression guard: default scope=repo leaves hits unfiltered (the collab
  // noise is retained), so the pre-evidence divtube filter never fires.
  it('scope=repo (default) does not drop non-divtube hits', () => {
    const proc = composeCli('tool dispatch and vectorizer', ['--hits-json', HITS_DIVTUBE]);
    expect(proc.status).toBe(0);
    const packet = JSON.parse(proc.stdout);
    expect(packet.scope).toBe('repo');
    expect(packet.search.hits.map((h) => h.path)).toContain('codex/server/collab/oauth.py');
  });
});
