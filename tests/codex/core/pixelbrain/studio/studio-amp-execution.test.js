import { describe, expect, test } from 'vitest';

import { GrassAMP } from '../../../../../codex/core/pixelbrain/grass-amp.js';
import { STUDIO_AMP_RECORDS } from '../../../../../codex/core/pixelbrain/studio/studio-amp-manifest.generated.js';
import { resolveStudioAmpAdapter } from '../../../../../codex/core/pixelbrain/studio/studio-amp-adapter-registry.js';
import {
  acceptStudioMutation,
  commitStudioAmp,
  getStudioAdapterCoverage,
  inspectStudioSupport,
  previewStudioAmp,
  proposeStudioMutation,
  rejectStudioMutation,
} from '../../../../../codex/core/pixelbrain/studio/studio-amp-execution.js';

describe('Studio AMP execution registry', () => {
  test('has one static adapter for every manifest record', () => {
    const coverage = getStudioAdapterCoverage(STUDIO_AMP_RECORDS);
    expect(coverage.missing).toEqual([]);
    expect(coverage.extra).toEqual([]);
    expect(coverage.adapters).toHaveLength(STUDIO_AMP_RECORDS.length);
    expect(coverage.adapters.filter((entry) => entry.kind === 'support').every((entry) => entry.consumerIds.length > 0)).toBe(true);
  });

  test('loads the declared real entrypoint for all 54 adapters', async () => {
    for (const record of STUDIO_AMP_RECORDS) {
      const adapter = await resolveStudioAmpAdapter(record.adapterId);
      expect(adapter.entrypoint, record.adapterId).toBeDefined();
      if (record.kind !== 'support') {
        expect(typeof adapter.entrypoint, record.adapterId).toBe('function');
      }
    }
  });

  test('executes a deterministic default witness for every non-support adapter', async () => {
    const snapshot = {
      checksum: 'asset:all-adapter-witness',
      width: 8,
      height: 8,
      seed: 17,
      layers: [{ name: 'Ink', cells: [{ x: 2, y: 2, color: '#446633', partId: 'body', slot: 1 }] }],
    };
    const baseline = JSON.stringify(snapshot);
    for (const record of STUDIO_AMP_RECORDS.filter((entry) => entry.kind !== 'support')) {
      const first = await previewStudioAmp({ ampId: record.ampId, snapshot });
      const second = await previewStudioAmp({ ampId: record.ampId, snapshot });
      expect(first.receipt.outputChecksum, record.ampId).toBe(second.receipt.outputChecksum);
      expect(first.receipt.adapterId, record.ampId).toBe(record.adapterId);
      expect(first.receipt.mode, record.ampId).toBe('preview');
    }
    expect(JSON.stringify(snapshot)).toBe(baseline);
  });

  test('proves every support substrate through its named Studio consumer', async () => {
    const snapshot = { checksum: 'asset:support-witness', width: 8, height: 8, seed: 3, layers: [] };
    for (const support of STUDIO_AMP_RECORDS.filter((entry) => entry.kind === 'support')) {
      for (const consumerId of support.consumerIds) {
        if (consumerId === 'studio-support-inspector') {
          const evidence = await inspectStudioSupport(support.ampId);
          expect(evidence.consumerId).toBe('studio-support-inspector');
          expect(evidence.outputChecksum).toMatch(/^studio-output1:/);
          continue;
        }
        const consumer = STUDIO_AMP_RECORDS.find((entry) => entry.adapterId === consumerId || entry.ampId === consumerId);
        expect(consumer, `${support.ampId} consumer ${consumerId}`).toBeDefined();
        const result = await previewStudioAmp({ ampId: consumer.ampId, snapshot });
        expect(result.receipt.outputChecksum).toMatch(/^studio-output1:/);
      }
    }
  });

  test('previews and commits a real generator with a provenance receipt', async () => {
    const snapshot = { checksum: 'asset:grass-base', width: 16, height: 16, seed: 42 };
    const preview = await previewStudioAmp({
      ampId: 'grass',
      snapshot,
      options: { arguments: [{ width: 16, height: 16, seed: 42 }] },
    });

    expect(preview.output).toEqual(GrassAMP({ width: 16, height: 16, seed: 42 }));
    expect(preview.receipt.ampId).toBe('grass');
    expect(preview.receipt.mode).toBe('preview');
    expect(preview.receipt.baseChecksum).toBe(snapshot.checksum);
    expect(preview.receipt.outputChecksum).toMatch(/^studio-output1:/);

    const committed = await commitStudioAmp({
      ampId: 'grass',
      snapshot,
      options: { arguments: [{ width: 16, height: 16, seed: 42 }] },
    });
    expect(committed.receipt.mode).toBe('commit');
    expect(committed.receipt.outputChecksum).toBe(preview.receipt.outputChecksum);
  });

  test('routes a mutation through a diffable transaction and preserves rejection identity', async () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
      255, 0, 0, 255,
    ]);
    const baseline = { checksum: 'asset:pixel-scale-base', rgba, width: 2, height: 2 };
    const before = [...rgba];
    const proposed = await proposeStudioMutation({
      ampId: 'pixel-scale-amp',
      snapshot: baseline,
      options: { arguments: [rgba, 2, 2] },
    });

    expect([...baseline.rgba]).toEqual(before);
    expect(proposed.transaction.baseChecksum).toBe(baseline.checksum);
    expect(proposed.transaction.candidate.checksum).toMatch(/^studio-output1:/);
    expect(proposed.diff.afterBytes).toBe(64);
    expect(proposed.diff.changed).toBe(true);
    expect(rejectStudioMutation(baseline, proposed.transaction)).toBe(baseline);

    const accepted = acceptStudioMutation(baseline, proposed.transaction);
    expect(accepted.parentChecksum).toBe(baseline.checksum);
    expect(accepted.mutationAmpId).toBe('pixel-scale-amp');
  });

  test('gives every mutation AMP baseline, accept, reject, and stale-base protection', async () => {
    const mutations = STUDIO_AMP_RECORDS.filter((entry) => entry.kind === 'mutation');
    expect(mutations).toHaveLength(10);

    for (const record of mutations) {
      const baseline = {
        checksum: `asset:mutation-witness:${record.ampId}`,
        width: 8,
        height: 8,
        seed: 29,
        layers: [{ name: 'Ink', cells: [{ x: 2, y: 2, color: '#446633', partId: 'body', slot: 1 }] }],
      };
      const before = JSON.stringify(baseline);
      const proposal = await proposeStudioMutation({ ampId: record.ampId, snapshot: baseline });

      expect(JSON.stringify(baseline), record.ampId).toBe(before);
      expect(proposal.transaction.ampId, record.ampId).toBe(record.ampId);
      expect(rejectStudioMutation(baseline, proposal.transaction), record.ampId).toBe(baseline);
      expect(acceptStudioMutation(baseline, proposal.transaction), record.ampId).toMatchObject({
        parentChecksum: baseline.checksum,
        mutationAmpId: record.ampId,
      });
      expect(
        () => acceptStudioMutation({ ...baseline, checksum: `${baseline.checksum}:stale` }, proposal.transaction),
        record.ampId,
      ).toThrow('PB-STUDIO-STALE-BASELINE');
    }
  });

  test('fails closed for unknown, support, and wrong-vehicle execution', async () => {
    await expect(previewStudioAmp({ ampId: 'not-an-amp', snapshot: { checksum: 'x' } })).rejects.toThrow('PB-STUDIO-UNKNOWN-AMP');
    await expect(previewStudioAmp({ ampId: 'material-resolver', snapshot: { checksum: 'x' } })).rejects.toThrow('PB-STUDIO-SUPPORT-NOT-EXECUTABLE');
    await expect(commitStudioAmp({ ampId: 'pixel-scale-amp', snapshot: { checksum: 'x' } })).rejects.toThrow('PB-STUDIO-MUTATION-VEHICLE-REQUIRED');
    await expect(proposeStudioMutation({ ampId: 'grass', snapshot: { checksum: 'x' } })).rejects.toThrow('PB-STUDIO-NOT-A-MUTATION');
  });
});
