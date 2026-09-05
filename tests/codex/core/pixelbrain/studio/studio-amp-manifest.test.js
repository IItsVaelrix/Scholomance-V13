import { describe, expect, it } from 'vitest';
import {
  STUDIO_AMP_KINDS,
  buildStudioAmpManifest,
  validateStudioAmpManifest,
} from '../../../../../codex/core/pixelbrain/studio/studio-amp-manifest.schema.js';
import { STUDIO_AMP_RECORDS } from '../../../../../codex/core/pixelbrain/studio/studio-amp-manifest.generated.js';
import { buildEffectCatalog } from '../../../../../scripts/pixelbrain-effect-catalog.mjs';

describe('PixelBrain Studio AMP manifest', () => {
  it('covers every catalogued AMP exactly once with no blocked records', async () => {
    const catalog = await buildEffectCatalog();
    const catalogPaths = catalog.amps.map((entry) => entry.path).sort();
    const manifestPaths = STUDIO_AMP_RECORDS.map((entry) => entry.modulePath).sort();

    expect(manifestPaths).toEqual(catalogPaths);
    expect(new Set(STUDIO_AMP_RECORDS.map((entry) => entry.ampId)).size).toBe(STUDIO_AMP_RECORDS.length);
    expect(STUDIO_AMP_RECORDS.every((entry) => STUDIO_AMP_KINDS.includes(entry.kind))).toBe(true);
    expect(STUDIO_AMP_RECORDS.some((entry) => entry.kind === 'blocked-with-reason')).toBe(false);
    expect(validateStudioAmpManifest(STUDIO_AMP_RECORDS, catalogPaths)).toEqual({ ok: true, errors: [] });
  });

  it('routes every mutating AMP to Mutation Lab and every support AMP to a consumer', async () => {
    const catalog = await buildEffectCatalog();
    const generated = buildStudioAmpManifest(catalog.amps);

    for (const record of generated) {
      if (record.kind === 'mutation') expect(record.tab).toBe('mutations');
      if (record.kind === 'support') expect(record.consumerIds.length).toBeGreaterThan(0);
    }
  });

  it('is byte-stable when catalog input order changes', async () => {
    const catalog = await buildEffectCatalog();
    expect(JSON.stringify(buildStudioAmpManifest(catalog.amps))).toBe(
      JSON.stringify(buildStudioAmpManifest([...catalog.amps].reverse())),
    );
  });
});
