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

  it('passes the server packet verbatim on success (ambiguous bright-wound)', async () => {
    // The bright-wound sample now travels the LIVE path, not the error path:
    // a rich packet is something the engine returned, never a fallback costume.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => SAMPLE_BRIGHT_WOUND_PACKET,
    })));
    const { result } = renderHook(() =>
      useConstellationPage('  The Bright Wound of Morning  '),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.pageBytecode).toBe(SAMPLE_BRIGHT_WOUND_PACKET.pageBytecode);
    expect(result.current.packet.leximancy.status).toBe('ambiguous');
    expect(result.current.packet.leximancy.selectedInterpretationId).toBeNull();
    vi.unstubAllGlobals();
  });

  it('returns an explicit engine-unreachable packet — no invented senses, no rich sample', async () => {
    // Feedback 2026-08-19: on network failure the page must say "engine
    // unreachable", not wear a sample's clothes. Empty channels, honest
    // diagnostics, and none of the bright-wound sample's rich semantics.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => useConstellationPage('gravity'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const p = result.current.packet;
    expect(p.query.raw).toBe('gravity');
    expect(p.leximancy.status).toBe('unsupported');
    expect(p.leximancy.interpretations).toEqual([]);
    expect(p.leximancy.etymology).toBeNull();
    expect(p.rhymeAstrology).toBeNull();
    expect(p.diagnostics.degradedChannels).toContain('live engine');
    expect(p.diagnostics.warnings.join(' ')).toContain('no analysis was performed');
    // The rich sample must not leak into the failure state.
    expect(p.pageBytecode).not.toBe(SAMPLE_BRIGHT_WOUND_PACKET.pageBytecode);
    vi.unstubAllGlobals();
  });

  /**
   * This used to render the hook twice with no fetch stub, so both calls took
   * the network-failure branch and it compared two invocations of a pure
   * string→object function. It could not fail: `resolveConstellationFixture` is
   * deterministic by construction, and the assertion would have held just as
   * well with the live path entirely broken. Naming the failure makes it a test
   * of the HOOK's behaviour under a known condition rather than an accident.
   */
  it('is deterministic for the same query when the engine is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const a = renderHook(() => useConstellationPage('gravity'));
    const b = renderHook(() => useConstellationPage('gravity'));
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(a.result.current.packet).toEqual(b.result.current.packet);
    // …and the thing determinism must not buy: silence about being offline.
    expect(a.result.current.packet.diagnostics.degradedChannels).toContain('live engine');
    vi.unstubAllGlobals();
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

  it('returns the explicit engine-unreachable packet when the server errors', async () => {
    // Feedback 2026-08-19: a 500 must produce "engine unreachable", never the
    // rich sample. The old fallback (fixture marked degraded) is retired.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { result } = renderHook(() => useConstellationPage('the bright wound of morning'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.pageBytecode).toBe('COS-PAGE-v1-ENGINE-UNREACHABLE');
    expect(result.current.packet.diagnostics.degradedChannels).toContain('live engine');
  });

  /**
   * THE SUBSTITUTION MUST DECLARE ITSELF. `SAMPLE_BRIGHT_WOUND_PACKET` ships
   * `degradedChannels: []` — truthful about the fixture, false about the page —
   * and the shell reads exactly that field to decide whether to raise the
   * "Partial sky" banner. Handed over verbatim on a 500, it rendered invented
   * etymology, rarity and rhymes under a packet asserting perfect health, with
   * a provenance line as the only tell. A whole-service failure is the largest
   * degradation there is and was the one that announced nothing.
   */
  it('declares the engine unreached rather than passing the fixture off as an analysis', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { result } = renderHook(() => useConstellationPage('the bright wound of morning'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const { diagnostics } = result.current.packet;
    expect(diagnostics.degradedChannels).toContain('live engine');
    expect(diagnostics.warnings.join(' ')).toMatch(/live engine unreachable/i);
    // The fixture's own diagnostics survive alongside the new ones.
    expect(SAMPLE_BRIGHT_WOUND_PACKET.diagnostics.degradedChannels).toEqual([]);
  });

  /**
   * ASKING AGAIN IS A NEW REQUEST. The query alone cannot express a retry:
   * re-submitting an identical string is a React bail-out, the effect never
   * re-runs, and a transient backend failure becomes permanent for as long as
   * the text is unchanged. `attempt` is what makes the second Enter mean
   * something.
   */
  it('refetches when the attempt counter moves, even for an identical query', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ q, n }) => useConstellationPage(q, n),
      { initialProps: { q: 'gravity', n: 1 } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ q: 'gravity', n: 2 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('does not refetch when nothing about the submission changed', async () => {
    // Guards the guard: if the effect re-ran on every render, the test above
    // would pass without `attempt` doing any work at all.
    const fetchMock = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ q, n }) => useConstellationPage(q, n),
      { initialProps: { q: 'gravity', n: 1 } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ q: 'gravity', n: 1 });
    rerender({ q: 'gravity', n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the fixture when fetch rejects (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => useConstellationPage('gravity'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.query.raw).toBe('gravity');
  });
});
