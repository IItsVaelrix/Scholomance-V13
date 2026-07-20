import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLexicalAnalyze } from '../../../src/pages/Read/useLexicalAnalyze.js';

describe('useLexicalAnalyze', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resolution: { status: 'ambiguous' } }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not perform network work before explicit submit', () => {
    renderHook(() => useLexicalAnalyze());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('submits exactly the selected context envelope', async () => {
    const { result } = renderHook(() => useLexicalAnalyze());
    const context = {
      scope: 'line',
      surface: 'saw',
      containingLine: 'I saw the aurora',
    };

    await act(async () => {
      await result.current.submit(context);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/lexical/analyze', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context }),
    }));
    expect(result.current.result).toEqual({ resolution: { status: 'ambiguous' } });
  });

  it('refuses an empty or malformed context without issuing a request', async () => {
    const { result } = renderHook(() => useLexicalAnalyze());

    await act(async () => {
      await result.current.submit(null);
      await result.current.submit({ scope: 'word', surface: '   ' });
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
