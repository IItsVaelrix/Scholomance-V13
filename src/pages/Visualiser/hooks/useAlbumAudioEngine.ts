import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ResolvedAlbumTrack } from './useAlbumResolver';
import { degradeWithFallback } from '../recovery';

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "error";

export type AnalysisAvailability =
  | "uninitialized"
  | "available"
  | "cors-blocked"
  | "unsupported";

export interface AlbumAudioEngineResult {
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  analyser: AnalyserNode | null;
  analysisAvailability: AnalysisAvailability;
  error: string | null;
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;
}

interface UseAlbumAudioEngineOptions {
  audioRef: RefObject<HTMLAudioElement | null>;
  activeTrack: ResolvedAlbumTrack;
  autoplayIntent: boolean;
  onEnded: () => void;
}

export function useAlbumAudioEngine({
  audioRef,
  activeTrack,
  autoplayIntent,
  onEnded,
}: UseAlbumAudioEngineOptions): AlbumAudioEngineResult {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(activeTrack.duration);
  const [error, setError] = useState<string | null>(null);
  const [analysisAvailability, setAnalysisAvailability] = useState<AnalysisAvailability>('uninitialized');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const autoplayIntentRef = useRef(autoplayIntent);
  autoplayIntentRef.current = autoplayIntent;
  const activeTrackRef = useRef(activeTrack);
  activeTrackRef.current = activeTrack;

  const ensureGraph = useCallback(() => {
    const el = audioRef.current;
    if (!el || sourceRef.current) return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      setAnalysisAvailability('available');
    } catch (error) {
      setAnalysisAvailability('unsupported');
      degradeWithFallback(error, 'web-audio-graph-unsupported');
    }
  }, [audioRef]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    el.crossOrigin = 'anonymous';
    el.src = activeTrack.audioUrl;
    el.load();
    setCurrentTime(0);
    setDuration(activeTrack.duration);
    setError(null);

    if (autoplayIntentRef.current) {
      setStatus('loading');
    } else {
      setStatus('idle');
    }
  }, [activeTrack.audioUrl, activeTrack.duration, audioRef]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => setStatus('loading');
    const onPlaying = () => setStatus('playing');
    const onPause = () => setStatus('paused');
    const onWaiting = () => setStatus('buffering');
    const onCanPlay = () => {
      if (!autoplayIntentRef.current) setStatus('paused');
    };
    const onEndedHandler = () => {
      setStatus('ended');
      onEndedRef.current();
    };
    const onError = () => {
      setStatus('error');
      setError(el.error?.message ?? 'Audio load failed');
    };
    const onLoadedMetadata = () => setDuration(el.duration || activeTrackRef.current.duration);
    const onDurationChange = () => setDuration(el.duration || activeTrackRef.current.duration);
    const onTimeUpdate = () => setCurrentTime(el.currentTime);

    el.addEventListener('play', onPlay);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('ended', onEndedHandler);
    el.addEventListener('error', onError);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('ended', onEndedHandler);
      el.removeEventListener('error', onError);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [audioRef]);

  /**
   * The karaoke clock.
   *
   * `timeupdate` is NOT a clock — measured in headed Chromium it fires at 3.8 Hz
   * (median 265.6ms), while `el.currentTime` is continuous and the display runs at
   * 74.1 Hz. Against the real alignment artifacts, 61% of words are sung for less
   * than one 265.6ms tick, so a timeupdate-driven highlight skips the majority of
   * them outright. The event is throttled; the property is not. Poll the property.
   */
  useEffect(() => {
    if (status !== 'playing') return;
    let raf = 0;
    const tick = () => {
      const el = audioRef.current;
      if (el) setCurrentTime(el.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, audioRef]);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    ensureGraph();
    await audioCtxRef.current?.resume().catch(() => {});
    try {
      await el.play();
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Playback blocked');
      degradeWithFallback(err, 'playback-blocked');
    }
  }, [audioRef, ensureGraph]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, [audioRef]);

  const seek = useCallback((time: number) => {
    const el = audioRef.current;
    if (el) el.currentTime = time;
    setCurrentTime(time);
  }, [audioRef]);

  return {
    status,
    currentTime,
    duration,
    analyser: analyserRef.current,
    analysisAvailability,
    error,
    play,
    pause,
    seek,
  };
}
