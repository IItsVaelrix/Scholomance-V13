// @vitest-environment jsdom
//
// The karaoke highlight is only as precise as the clock that drives it.
//
// MEASURED (headed Chromium, 6s of real playback): `timeupdate` fires at 3.8 Hz
// (median 265.6ms) while the display runs at 74.1 Hz. Against the real alignment
// artifacts in public/data/alignment/, 682/1118 words (61.0%) are sung for less
// than one 265.6ms tick — so a highlight driven by `timeupdate` alone cannot
// render the majority of words at all, on a machine of any speed.
//
// These tests pin the clock, not the render.
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAlbumAudioEngine } from '../../src/pages/Visualiser/hooks/useAlbumAudioEngine';

/**
 * A stand-in for HTMLMediaElement. jsdom does not implement playback, and the
 * point here is to advance the audio clock WITHOUT firing `timeupdate` — which a
 * real element will not let us do.
 */
function makeFakeAudio() {
  const et = new EventTarget();
  return {
    currentTime: 0,
    duration: 180,
    crossOrigin: '',
    src: '',
    error: null,
    load() {},
    async play() {},
    pause() {},
    addEventListener: et.addEventListener.bind(et),
    removeEventListener: et.removeEventListener.bind(et),
    dispatchEvent: et.dispatchEvent.bind(et),
  };
}

const TRACK = {
  albumTrack: {},
  grimoireTrack: { id: 't1' },
  title: 'Test',
  audioUrl: '/a.mp3',
  coverUrl: '/c.png',
  duration: 180,
  available: true,
  lyrics: ['one two three'],
  annotations: [],
};

const mount = (el) => {
  // Stable ref object — the hook lists audioRef in useEffect deps, so a new
  // object identity per render would re-run the "setStatus('idle')" effect
  // and clobber event-handler state.
  const audioRef = { current: el };
  return renderHook(() =>
    useAlbumAudioEngine({
      audioRef,
      activeTrack: TRACK,
      autoplayIntent: false,
      onEnded: () => {},
    }),
  );
};

/** Let at least one animation frame land. */
const frame = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r())); });

describe('useAlbumAudioEngine — the karaoke clock', () => {
  it('tracks currentTime BETWEEN timeupdate events while playing', async () => {
    const el = makeFakeAudio();
    const { result } = mount(el);

    // A tick lands at 10.0s. This is the last thing `timeupdate` will say.
    el.currentTime = 10.0;
    act(() => { el.dispatchEvent(new Event('playing')); });
    act(() => { el.dispatchEvent(new Event('timeupdate')); });
    expect(result.current.currentTime).toBe(10.0);

    // The song keeps playing. 100ms of audio elapses — roughly half a tick, and
    // longer than the median word (207ms) is... well, half of it. No `timeupdate`
    // fires, because the browser only offers one every ~265ms.
    el.currentTime = 10.1;
    await frame();

    // The clock must have moved. Under a timeupdate-driven clock it is still 10.0
    // and every word sung in this window is skipped.
    await waitFor(() => expect(result.current.currentTime).toBeCloseTo(10.1, 5));
  });

  it('stops the frame loop when playback is not playing', async () => {
    const el = makeFakeAudio();
    const { result } = mount(el);

    act(() => { el.dispatchEvent(new Event('playing')); });
    el.currentTime = 5.0;
    await waitFor(() => expect(result.current.currentTime).toBeCloseTo(5.0, 5));

    act(() => { el.dispatchEvent(new Event('pause')); });
    await frame();

    // A paused element's clock does not advance, but a loop that keeps polling it
    // burns a frame callback forever. Seeking while paused is what moves it.
    el.currentTime = 99.0;
    await frame();
    expect(result.current.currentTime).toBeCloseTo(5.0, 5);
  });

  it('cancels the frame loop on unmount', async () => {
    const el = makeFakeAudio();
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const { unmount } = mount(el);
    act(() => { el.dispatchEvent(new Event('playing')); });
    await frame();
    unmount();
    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
  });
});
