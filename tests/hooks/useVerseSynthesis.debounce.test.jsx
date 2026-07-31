/**
 * When TrueSight re-colours, and how often it is allowed to ask.
 *
 * There used to be a flat 4000ms debounce on every content change. ReadPage
 * feeds this hook `activeScrollContent` when the user is only READING, and that
 * changes exactly once — so a scroll load spent 4s showing grey text with no
 * keystrokes to absorb. Measured analysis cost: 8-176ms. It is gone.
 *
 * What bounds the request rate instead is a token-batch gate: colour re-morphs
 * only once the word multiset has moved by `minTokenDelta` (50) from the batch
 * last SENT. Because the baseline advances synchronously on issue, crossing the
 * threshold fires once and re-closes the gate — measured at 5 requests for 201
 * words typed one keystroke at a time, against a 60/min route ceiling.
 *
 * TrueSight Blink is the deliberate override for smaller edits, and carries its
 * own 30s cooldown: an override that can be held down is the request storm the
 * gate exists to prevent.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const analyzePanels = vi.fn(async () => ({ data: { analysis: { allConnections: [] } } }));

vi.mock('../../src/lib/scholomanceDictionary.api.js', () => ({
  ScholomanceDictionaryAPI: {
    isEnabled: () => true,
    analyzePanels: (...args) => analyzePanels(...args),
  },
}));

const { useVerseSynthesis } = await import('../../src/hooks/useVerseSynthesis.js');

describe('useVerseSynthesis debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    analyzePanels.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not delay the first paint by default', () => {
    renderHook(() => useVerseSynthesis('the night ignites the light'));

    // There was a flat 4000ms debounce here. It cost 4s of grey text on every
    // scroll load and protected nothing: analysis measures 8-176ms and the
    // token-batch gate is what bounds the request rate. Deleted deliberately —
    // if a default delay ever returns, first paint regresses again.
    vi.advanceTimersByTime(0);
    expect(analyzePanels).toHaveBeenCalledTimes(1);
  });

  it('honours a caller-supplied debounce so a read-only load paints promptly', () => {
    renderHook(() =>
      useVerseSynthesis('the night ignites the light', { debounceMs: 0 }),
    );

    // The whole point: no 4s wait when there is no typing to absorb.
    vi.advanceTimersByTime(0);
    expect(analyzePanels).toHaveBeenCalledTimes(1);
  });

  // Rate-limit protection is a TOKEN-DELTA gate, not a clock. The route allows
  // 60 req/min in production, so re-analysing on every keystroke is what invites
  // 429 (which blanks the gate). Colour re-morphs only once the token set has
  // moved by a whole batch from the one last analysed.
  describe('token-delta gate', () => {
    const words = (n, prefix = 'w') =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');

    it('always analyses the first batch, however small', () => {
      renderHook(() => useVerseSynthesis('just five little words here', { debounceMs: 0 }));
      vi.advanceTimersByTime(0);
      // No previous batch to diff against: a loaded scroll must always paint.
      expect(analyzePanels).toHaveBeenCalledTimes(1);
    });

    it('does not re-analyse for a sub-batch edit', () => {
      const { rerender } = renderHook(
        ({ text }) => useVerseSynthesis(text, { debounceMs: 0 }),
        { initialProps: { text: words(60) } },
      );
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      // 10 words added — under the 50-word batch, so no second request.
      rerender({ text: `${words(60)} ${words(10, 'x')}` });
      vi.advanceTimersByTime(5000);
      expect(analyzePanels).toHaveBeenCalledTimes(1);
    });

    it('re-analyses once a full batch of tokens has changed', () => {
      const { rerender } = renderHook(
        ({ text }) => useVerseSynthesis(text, { debounceMs: 0 }),
        { initialProps: { text: words(60) } },
      );
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      rerender({ text: `${words(60)} ${words(50, 'x')}` });
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(2);
    });

    it('counts removals too, so deleting a batch re-analyses', () => {
      const { rerender } = renderHook(
        ({ text }) => useVerseSynthesis(text, { debounceMs: 0 }),
        { initialProps: { text: words(120) } },
      );
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      // Deleting 50 words changes resonance as much as adding 50.
      rerender({ text: words(70) });
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(2);
    });

    it('accumulates small edits until they add up to a batch', () => {
      const { rerender } = renderHook(
        ({ text }) => useVerseSynthesis(text, { debounceMs: 0 }),
        { initialProps: { text: words(60) } },
      );
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      // Five edits of 12 words each: 12, 24, 36, 48 stay quiet; 60 crosses.
      for (const n of [12, 24, 36, 48]) {
        rerender({ text: `${words(60)} ${words(n, 'x')}` });
        vi.advanceTimersByTime(0);
        expect(analyzePanels).toHaveBeenCalledTimes(1);
      }
      rerender({ text: `${words(60)} ${words(60, 'x')}` });
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(2);
    });

    it('honours a caller-supplied batch size', () => {
      const { rerender } = renderHook(
        ({ text }) => useVerseSynthesis(text, { debounceMs: 0, minTokenDelta: 5 }),
        { initialProps: { text: words(60) } },
      );
      vi.advanceTimersByTime(0);
      rerender({ text: `${words(60)} ${words(5, 'x')}` });
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(2);
    });
  });

  // The escape hatch for the gate above: TrueSight Blink (Color Refresh) on the
  // hex tools console. Without it a sub-50-word edit could never re-colour.
  describe('blink (forced refresh)', () => {
    it('re-analyses immediately even when the delta gate would block', async () => {
      const { result, rerender } = renderHook(
        ({ text }) => useVerseSynthesis(text, { debounceMs: 0 }),
        { initialProps: { text: 'sixty words of verse here about the night and light' } },
      );
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      // A one-word edit: the batch gate blocks it.
      rerender({ text: 'sixty words of verse here about the night and lights' });
      vi.advanceTimersByTime(5000);
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      // Blink forces the current content through regardless.
      await result.current.blink();
      expect(analyzePanels).toHaveBeenCalledTimes(2);
      expect(analyzePanels).toHaveBeenLastCalledWith(
        'sixty words of verse here about the night and lights',
        expect.any(Object),
      );
    });

    it('re-analyses identical content, bypassing the dedupe guard', async () => {
      const { result } = renderHook(() =>
        useVerseSynthesis('the night ignites the light', { debounceMs: 0 }),
      );
      vi.advanceTimersByTime(0);
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      await result.current.blink();
      expect(analyzePanels).toHaveBeenCalledTimes(2);
    });

    // A refresh button that can be held down defeats its own purpose: it becomes
    // the per-keystroke request storm the batch gate exists to prevent.
    it('refuses a second blink inside the cooldown', async () => {
      const { result } = renderHook(() =>
        useVerseSynthesis('the night ignites the light', { debounceMs: 0 }),
      );
      vi.advanceTimersByTime(0);
      analyzePanels.mockClear();

      await result.current.blink();
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      await result.current.blink();
      await result.current.blink();
      vi.advanceTimersByTime(29_999);
      await result.current.blink();
      expect(analyzePanels).toHaveBeenCalledTimes(1);
    });

    it('allows another blink once the cooldown elapses', async () => {
      const { result } = renderHook(() =>
        useVerseSynthesis('the night ignites the light', { debounceMs: 0 }),
      );
      vi.advanceTimersByTime(0);
      analyzePanels.mockClear();

      await result.current.blink();
      expect(analyzePanels).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30_000);
      await result.current.blink();
      expect(analyzePanels).toHaveBeenCalledTimes(2);
    });

    it('reports cooldown state so the control can show it', async () => {
      const { result } = renderHook(() =>
        useVerseSynthesis('the night ignites the light', { debounceMs: 0 }),
      );
      vi.advanceTimersByTime(0);
      expect(result.current.canBlink).toBe(true);

      // act() so the setCanBlink re-render lands before we read result.current.
      await act(async () => { await result.current.blink(); });
      expect(result.current.canBlink).toBe(false);

      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(result.current.canBlink).toBe(true);
    });

    it('honours a caller-supplied cooldown', async () => {
      const { result } = renderHook(() =>
        useVerseSynthesis('the night ignites the light', {
          debounceMs: 0,
          blinkCooldownMs: 1000,
        }),
      );
      vi.advanceTimersByTime(0);
      analyzePanels.mockClear();

      await result.current.blink();
      vi.advanceTimersByTime(1000);
      await result.current.blink();
      expect(analyzePanels).toHaveBeenCalledTimes(2);
    });

    it('is a no-op with no content to analyse', async () => {
      const { result } = renderHook(() => useVerseSynthesis('', { debounceMs: 0 }));
      vi.advanceTimersByTime(0);
      analyzePanels.mockClear();

      await result.current.blink();
      expect(analyzePanels).not.toHaveBeenCalled();
    });
  });

  // Why there is no time-based debounce on the typing path any more: the batch
  // gate already bounds the request rate, because the baseline advances
  // synchronously when a request is ISSUED. Crossing the threshold fires once and
  // immediately re-closes the gate for the next ~50 words. This test is the
  // evidence for that claim — if it ever regresses to one request per keystroke,
  // the gate stopped bounding the rate and a debounce is needed again.
  it('bounds the request rate while typing with no time debounce', () => {
    const { rerender } = renderHook(
      ({ text }) => useVerseSynthesis(text, { debounceMs: 0, minTokenDelta: 50 }),
      { initialProps: { text: 'w0' } },
    );
    vi.advanceTimersByTime(0);
    expect(analyzePanels).toHaveBeenCalledTimes(1); // first batch always paints

    // 200 more words, one "keystroke" at a time.
    let text = 'w0';
    for (let i = 1; i <= 200; i += 1) {
      text += ` w${i}`;
      rerender({ text });
      vi.advanceTimersByTime(0);
    }

    // 200 words / 50-word batches = 4 further requests, not 200.
    expect(analyzePanels).toHaveBeenCalledTimes(5);
  });

  it('still coalesces rapid changes at the caller-supplied delay', () => {
    const { rerender } = renderHook(
      ({ text }) => useVerseSynthesis(text, { debounceMs: 200 }),
      { initialProps: { text: 'a' } },
    );

    rerender({ text: 'ab' });
    rerender({ text: 'abc' });
    vi.advanceTimersByTime(199);
    expect(analyzePanels).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(analyzePanels).toHaveBeenCalledTimes(1);
    expect(analyzePanels).toHaveBeenCalledWith('abc', expect.any(Object));
  });
});
