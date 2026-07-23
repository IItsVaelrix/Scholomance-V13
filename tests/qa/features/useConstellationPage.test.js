import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useConstellationPage } from '../../../src/hooks/useConstellationPage.js';
import { SAMPLE_BRIGHT_WOUND_PACKET } from '../../../src/pages/Constellation/fixtures/samplePagePacket.js';

describe('useConstellationPage', () => {
  it('stays idle when query is null', () => {
    const { result } = renderHook(() => useConstellationPage(null));
    expect(result.current.status).toBe('idle');
    expect(result.current.packet).toBeNull();
  });

  it('returns the bright-wound fixture for that query (case-insensitive trim)', async () => {
    const { result } = renderHook(() =>
      useConstellationPage('  The Bright Wound of Morning  '),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.pageBytecode).toBe(SAMPLE_BRIGHT_WOUND_PACKET.pageBytecode);
    expect(result.current.packet.leximancy.status).toBe('ambiguous');
    expect(result.current.packet.leximancy.selectedInterpretationId).toBeNull();
  });

  it('returns an awaiting packet for unknown queries without inventing senses', async () => {
    const { result } = renderHook(() => useConstellationPage('gravity'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.query.raw).toBe('gravity');
    expect(result.current.packet.leximancy.status).toBe('unsupported');
    expect(result.current.packet.leximancy.interpretations).toEqual([]);
    expect(result.current.packet.rhymeAstrology).toBeNull();
    expect(result.current.packet.diagnostics.degradedChannels).toContain('leximancy');
  });

  it('is deterministic for the same query', async () => {
    const a = renderHook(() => useConstellationPage('gravity'));
    const b = renderHook(() => useConstellationPage('gravity'));
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(a.result.current.packet).toEqual(b.result.current.packet);
  });
});

describe('useConstellationPage live fetch', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the server packet on success', async () => {
    const serverPacket = {
      version: 1,
      schema_id: 'scholomance/constellation-os-page-phase1',
      pageBytecode: 'COS-PAGE-v1-DEADBEEF',
      query: { raw: 'morning', normalized: 'morning', kind: 'word', tokenCount: 1, graphemeCount: 7 },
      leximancy: { status: 'resolved', selectedInterpretationId: 'morning.noun.0', interpretations: [{ id: 'morning.noun.0', gloss: 'dawn', confidence: 1 }], warnings: [] },
      rhymeAstrology: { phonemes: ['M', 'AO1'], stress: 'x /', cadenceFamily: 'iambic-adjacent', exactRhymes: ['warning'], slantRhymes: ['mourning'] },
      phraseGenome: { syllables: 2, devicesHint: [], schoolHint: 'PSYCHIC' },
      diagnostics: { degradedChannels: [], warnings: [] },
      provenance: { engineVersions: {} },
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => serverPacket })));
    const { result } = renderHook(() => useConstellationPage('morning'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.pageBytecode).toBe('COS-PAGE-v1-DEADBEEF');
  });

  it('falls back to the fixture when the server errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { result } = renderHook(() => useConstellationPage('the bright wound of morning'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.pageBytecode).toBe(SAMPLE_BRIGHT_WOUND_PACKET.pageBytecode);
  });

  it('falls back to the fixture when fetch rejects (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => useConstellationPage('gravity'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.query.raw).toBe('gravity');
  });
});
