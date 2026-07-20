import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { compileKaraokeProgram, evalKaraoke } from './karaokeBytecode';

export type UseKaraokeMotionOpts = {
  seed: number;
  bpm: number;
  /** Audio clock seconds when playing; falls back to performance clock. */
  timeSeconds?: number;
  /** Prefer over timeSeconds — stable RAF, no effect restart on playhead ticks. */
  getTimeSeconds?: () => number | undefined;
  reducedMotion?: boolean;
  rootRef: RefObject<HTMLElement | null>;
};

/**
 * BPM + bytecode IR → CSS vars on lyrics root (~12.5 Hz). No text-shadow.
 */
export function useKaraokeMotion({
  seed,
  bpm,
  timeSeconds,
  getTimeSeconds,
  reducedMotion = false,
  rootRef,
}: UseKaraokeMotionOpts): void {
  const program = useMemo(() => compileKaraokeProgram(seed, bpm), [seed, bpm]);
  const timeRef = useRef(timeSeconds);
  timeRef.current = timeSeconds;
  const getTimeRef = useRef(getTimeSeconds);
  getTimeRef.current = getTimeSeconds;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    let last = 0;
    const intervalMs = reducedMotion ? 1e9 : 80;
    const t0 = performance.now();

    const apply = (pose: ReturnType<typeof evalKaraoke>) => {
      root.style.setProperty('--k-line-pulse', String(pose.linePulse));
      root.style.setProperty('--k-word-scale', String(pose.wordScale));
      root.style.setProperty('--k-word-glow', String(pose.wordGlow));
    };

    const readClock = (now: number) => {
      const fromGetter = getTimeRef.current?.();
      if (typeof fromGetter === 'number' && Number.isFinite(fromGetter)) return fromGetter;
      const clock = timeRef.current;
      if (typeof clock === 'number' && Number.isFinite(clock)) return clock;
      return (now - t0) / 1000;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!reducedMotion && now - last < intervalMs) {
        raf = requestAnimationFrame(tick);
        return;
      }
      last = now;

      const t = readClock(now);
      apply(reducedMotion ? evalKaraoke(program, 0) : evalKaraoke(program, t));
      if (!reducedMotion) raf = requestAnimationFrame(tick);
    };

    if (reducedMotion) apply(evalKaraoke(program, 0));
    else raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [program, reducedMotion, rootRef]);
}
