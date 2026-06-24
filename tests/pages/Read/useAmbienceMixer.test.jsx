import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAmbienceMixer } from '../../../src/hooks/useAmbienceMixer';
import {
  createAmbienceMixerService,
  AMBIENCE_STORAGE_KEY,
} from '../../../src/lib/ambient/ambienceMixer.service.js';

function fakeService() {
  return createAmbienceMixerService({
    createEngine: () => ({
      setChannelGain: vi.fn(),
      setMasterGain: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      onAvailabilityChange: vi.fn(),
    }),
  });
}

describe('useAmbienceMixer', () => {
  beforeEach(() => localStorage.clear());

  it('persists the mix to localStorage when a channel is enabled', async () => {
    const service = fakeService();
    const { result } = renderHook(() => useAmbienceMixer(service));
    await act(async () => { await result.current.setChannelEnabled('rain', true); });
    const saved = JSON.parse(localStorage.getItem(AMBIENCE_STORAGE_KEY));
    expect(saved.channels.rain.enabled).toBe(true);
  });

  it('restores a saved mix on mount without auto-running', () => {
    localStorage.setItem(
      AMBIENCE_STORAGE_KEY,
      JSON.stringify({ master: 0.25, channels: { wind: { enabled: true, volume: 0.8 } } }),
    );
    const service = fakeService();
    const { result } = renderHook(() => useAmbienceMixer(service));
    expect(result.current.state.master).toBe(0.25);
    expect(result.current.state.channels.wind.enabled).toBe(true);
    expect(result.current.state.channels.wind.volume).toBe(0.8);
    expect(result.current.state.running).toBe(false);
  });
});
