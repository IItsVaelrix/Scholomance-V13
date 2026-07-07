import { describe, it, expect } from 'vitest';
import { forgePacket } from '../../../../codex/core/pixelbrain/semantic-bridge.js';
import { createPixelBrainAssetPacket } from '../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';
import { templateGridToPixelBrainAssetPacket } from '../../../../codex/core/pixelbrain/template-grid-asset-bridge.js';

const INPUT = {
  source: { kind: 'procedural', id: 'test-asset', label: 'Test Asset' },
  canvas: { width: 8, height: 8 },
  coordinates: [
    { x: 1, y: 1, color: '#FF0000' },
    { x: 2, y: 1, color: '#00FF00' },
  ],
  material: 'source',
};

describe('forgePacket (packet-creation enrichment seam)', () => {
  it('without an authoring source behaves exactly like createPixelBrainAssetPacket', () => {
    expect(forgePacket(INPUT)).toEqual(createPixelBrainAssetPacket(INPUT));
  });

  it('enrichment never changes the packet id (additive-semantics policy, §5.6)', () => {
    const bare = createPixelBrainAssetPacket(INPUT);
    const enriched = forgePacket(INPUT, { id: 'spec', parts: [{ id: 'rim' }, { id: 'body' }] });
    expect(enriched.id).toBe(bare.id);
  });

  it('enrichment never mutates render-authoritative coordinate fields', () => {
    const bare = createPixelBrainAssetPacket(INPUT);
    const enriched = forgePacket(INPUT, { id: 'spec', parts: [{ id: 'rim' }] });
    expect(
      enriched.geometry.coordinates.map(({ x, y, color }) => ({ x, y, color }))
    ).toEqual(
      bare.geometry.coordinates.map(({ x, y, color }) => ({ x, y, color }))
    );
  });

  it('attaches a semantic summary with canonical roles inferred from part ids', () => {
    const enriched = forgePacket(INPUT, {
      id: 'spec',
      parts: [{ id: 'rim', material: 'gold' }, { id: 'body' }],
    }, { sourceKind: 'item-foundry' });
    expect(enriched.semantic).toBeDefined();
    expect(enriched.semantic.roles).toEqual(expect.arrayContaining(['rim', 'body']));
    expect(enriched.semantic.sourceKind).toBe('item-foundry');
  });

  it('template-grid bridge packets now carry semantics from layer names', () => {
    const packet = templateGridToPixelBrainAssetPacket({
      width: 4,
      height: 4,
      layers: [
        { name: 'body', cells: [{ x: 0, y: 0, color: '#111111' }] },
        { name: 'rim', cells: [{ x: 1, y: 0, color: '#222222' }] },
      ],
    });
    expect(packet.semantic).toBeDefined();
    expect(packet.semantic.roles).toEqual(expect.arrayContaining(['body', 'rim']));
  });
});
