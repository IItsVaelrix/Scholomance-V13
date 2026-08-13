import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerAmp, getAmp, listAmps } from '../../../../codex/core/pixelbrain/amp-registry.js';
// Side-effect import: the only external registrant in the repo (audit 2026-08-11).
import '../../../../codex/core/pixelbrain/scholomance-character-motif-amp.js';

/**
 * AMP REGISTRY TRUTH TEST (audit follow-up 2026-08-12)
 *
 * The PixelBrain suite audit found the AMP registry to be a ghost town:
 * registrations exist but getAmp/listAmps have ZERO consumers repo-wide.
 * This test PINS the truth instead of letting it drift:
 *
 *   1. listAmps() reflects EXACTLY the two real registrants (no more, no less).
 *   2. Both registrations are reachable and callable (write-only ≠ broken).
 *   3. The registry source declares its EXPERIMENTAL status, so no future
 *      session can silently promote it to a product API without updating
 *      this test's expected marker.
 *
 * If you add a real consumer of getAmp/listAmps, update EXPECTED_AMPS and
 * delete the write-only claim from the registry header in the same commit.
 */

const REGISTRY_SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../codex/core/pixelbrain/amp-registry.js',
);

const EXPECTED_AMPS = ['scholomance.character.motif', 'semantic-unifier'].sort();

describe('amp-registry truth pass', () => {
  it('listAmps() reflects exactly the two real registrants', () => {
    expect([...listAmps()].sort()).toEqual(EXPECTED_AMPS);
  });

  it('semantic-unifier registration is reachable (lazy bridge wrapper present)', () => {
    const entry = getAmp('semantic-unifier');
    expect(entry).not.toBeNull();
    expect(typeof entry.impl.applyAuthoringSemantics).toBe('function');
    expect(typeof entry.impl.enrichPacketWithSemantics).toBe('function');
    expect(entry.meta.version).toBe('PB-SEM-v1');
  });

  it('scholomance.character.motif registration is callable', () => {
    const entry = getAmp('scholomance.character.motif');
    expect(entry).not.toBeNull();
    expect(typeof entry.impl).toBe('function');
    // Smoke: the motif amp applies rune cells deterministically.
    const cells = Array.from({ length: 20 }, (_, i) => ({ x: i % 5, y: i % 7, color: '#000', alpha: 1 }));
    const out = entry.impl(cells, { school: 'frost', intensity: 0.5 });
    expect(out.some((c) => c.color === '#7EC8FF')).toBe(true);
  });

  it('getAmp() returns null for unknown ids (no phantom amps)', () => {
    expect(getAmp('does-not-exist')).toBeNull();
  });

  it('registerAmp() still works for future registrants (registry is alive, just quiet)', () => {
    registerAmp('__truth-test.probe', () => 42, { version: 'PROBE-v1' });
    try {
      expect(getAmp('__truth-test.probe').impl()).toBe(42);
      expect(listAmps()).toContain('__truth-test.probe');
    } finally {
      // Registry has no unregister (by design: it is a stub). Clean up by
      // re-importing is impossible in-ESM, so we assert the probe is the
      // ONLY extra entry beyond the pinned truth.
      const extras = listAmps().filter((id) => !EXPECTED_AMPS.includes(id));
      expect(extras).toEqual(['__truth-test.probe']);
    }
  });

  it('registry source declares EXPERIMENTAL + WRITE-ONLY status', () => {
    const src = readFileSync(REGISTRY_SRC, 'utf8');
    expect(src).toContain('STATUS: EXPERIMENTAL');
    expect(src).toContain('WRITE-ONLY');
    expect(src).toContain('NOT a product API');
  });

  it('lazy semantic-bridge wrapper actually resolves (reachability, not just shape)', async () => {
    const entry = getAmp('semantic-unifier');
    // applyAuthoringSemantics on unrecognized input returns the documented
    // empty branch without throwing — proves the lazy import chain loads.
    const result = await entry.impl.applyAuthoringSemantics({ unrecognized: true });
    expect(result).toEqual({ nodes: [], diagnostics: [], annotations: [] });
  }, 20000);
});
