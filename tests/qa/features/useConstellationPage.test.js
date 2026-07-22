import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConstellationPage } from '../../../src/hooks/useConstellationPage.js';
import { SAMPLE_BRIGHT_WOUND_PACKET } from '../../../src/pages/Constellation/fixtures/samplePagePacket.js';

describe('useConstellationPage', () => {
  it('stays idle when query is null', () => {
    const { result } = renderHook(() => useConstellationPage(null));
    expect(result.current.status).toBe('idle');
    expect(result.current.packet).toBeNull();
  });

  it('returns the bright-wound fixture for that query (case-insensitive trim)', () => {
    const { result } = renderHook(() =>
      useConstellationPage('  The Bright Wound of Morning  '),
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.packet.pageBytecode).toBe(SAMPLE_BRIGHT_WOUND_PACKET.pageBytecode);
    expect(result.current.packet.leximancy.status).toBe('ambiguous');
    expect(result.current.packet.leximancy.selectedInterpretationId).toBeNull();
  });

  it('returns an awaiting packet for unknown queries without inventing senses', () => {
    const { result } = renderHook(() => useConstellationPage('gravity'));
    expect(result.current.status).toBe('ready');
    expect(result.current.packet.query.raw).toBe('gravity');
    expect(result.current.packet.leximancy.status).toBe('unsupported');
    expect(result.current.packet.leximancy.interpretations).toEqual([]);
    expect(result.current.packet.rhymeAstrology).toBeNull();
    expect(result.current.packet.diagnostics.degradedChannels).toContain('leximancy');
  });

  it('is deterministic for the same query', () => {
    const a = renderHook(() => useConstellationPage('gravity'));
    const b = renderHook(() => useConstellationPage('gravity'));
    expect(a.result.current.packet).toEqual(b.result.current.packet);
  });
});
