import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useAlbumResolver } from './hooks/useAlbumResolver';
import { useAlbumAudioEngine } from './hooks/useAlbumAudioEngine';
import { AlbumSidebar } from './AlbumSidebar';
import { AlbumLyrics } from './AlbumLyrics';
import { AlbumTransport } from './AlbumTransport';
import type { ResolvedAlbumTrack } from './hooks/useAlbumResolver';
import './AlbumPage.css';

const EMPTY_TRACK: ResolvedAlbumTrack = {
  albumTrack: { trackId: '', trackNumber: 0 },
  grimoireTrack: null,
  title: '',
  audioUrl: '',
  coverUrl: '',
  duration: 0,
  available: false,
  lyrics: [],
  annotations: [],
};

export default function AlbumPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();

  const trackQuery = searchParams.get('track') ?? undefined;
  const resolver = useAlbumResolver(albumId ?? '', trackQuery);

  const [activeIndex, setActiveIndex] = useState(resolver.activeTrackIndex);
  const [repeat, setRepeat] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const activeTrack = resolver.tracks[activeIndex] ?? resolver.activeTrack;

  const findNextPlayable = useCallback((from: number, direction: 1 | -1): number => {
    const { tracks } = resolver;
    let idx = from + direction;
    while (idx >= 0 && idx < tracks.length) {
      if (tracks[idx].available && !tracks[idx].albumTrack.hidden) return idx;
      idx += direction;
    }
    return -1;
  }, [resolver]);

  const setTrackQuery = useCallback((trackId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('track', trackId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const switchTrack = useCallback((index: number, shouldPlay: boolean) => {
    setActiveIndex(index);
    const track = resolver.tracks[index];
    if (!track?.available) return;

    setTrackQuery(track.grimoireTrack?.id ?? '');

    if (shouldPlay) {
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 100);
    }
  }, [resolver.tracks, setTrackQuery]);

  const onEnded = useCallback(() => {
    const next = findNextPlayable(activeIndex, 1);
    if (next >= 0) {
      switchTrack(next, true);
    } else if (repeat) {
      const first = findNextPlayable(-1, 1);
      if (first >= 0) switchTrack(first, true);
    }
  }, [activeIndex, repeat, findNextPlayable, switchTrack]);

  const engine = useAlbumAudioEngine({
    audioRef,
    activeTrack: activeTrack ?? resolver.tracks[0] ?? EMPTY_TRACK,
    autoplayIntent: false,
    onEnded,
  });

  const handleSelectTrack = useCallback((index: number) => {
    const wasPlaying = engine.status === 'playing' || engine.status === 'loading' || engine.status === 'buffering';
    switchTrack(index, wasPlaying || true);
  }, [engine.status, switchTrack]);

  const handlePrev = useCallback(() => {
    if (engine.currentTime > 3) {
      engine.seek(0);
      return;
    }
    const prev = findNextPlayable(activeIndex, -1);
    if (prev >= 0) {
      const wasPlaying = engine.status === 'playing';
      switchTrack(prev, wasPlaying);
    }
  }, [activeIndex, engine, findNextPlayable, switchTrack]);

  const handleNext = useCallback(() => {
    const next = findNextPlayable(activeIndex, 1);
    if (next >= 0) {
      const wasPlaying = engine.status === 'playing';
      switchTrack(next, wasPlaying);
    }
  }, [activeIndex, engine.status, findNextPlayable, switchTrack]);

  const togglePlay = useCallback(() => {
    if (engine.status === 'playing') {
      engine.pause();
    } else {
      engine.play().catch(() => {});
    }
  }, [engine]);

  // Space bar toggles play/pause — unless the user is typing or a real button
  // has focus (let that button's own Space activation stand).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' ||
          tag === 'SELECT' || t?.isContentEditable) {
        return;
      }
      e.preventDefault(); // stop the page from scrolling
      togglePlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay]);

  const canPrev = findNextPlayable(activeIndex, -1) >= 0;
  const canNext = findNextPlayable(activeIndex, 1) >= 0;

  if (resolver.notFound) {
    return (
      <main className="alb-page alb-page--not-found" aria-label="Album not found">
        <h1>Album Not Found</h1>
        <p>The album you are looking for does not exist.</p>
        <Link to="/visualiser/albums">Browse all albums</Link>
      </main>
    );
  }

  if (resolver.empty) {
    return (
      <main className="alb-page alb-page--empty" aria-label="Empty album">
        <h1>{resolver.album?.title ?? 'Album'}</h1>
        <p>This album has no playable tracks.</p>
        <Link to="/visualiser/albums">Browse all albums</Link>
      </main>
    );
  }

  return (
    <main className="alb-page" aria-label={`${resolver.album?.title} album`}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="metadata"
      />

      <div className="alb-spread">
        <AlbumSidebar
          resolver={resolver}
          activeIndex={activeIndex}
          status={engine.status}
          onSelectTrack={handleSelectTrack}
        />

        <section className="alb-experience" aria-label="Track experience">
          <div className="alb-experience__banner">
            <img
              src={`${import.meta.env.BASE_URL}media/album-banner.png`}
              alt={`${resolver.album?.title ?? 'Album'} ritual banner`}
              loading="eager"
              decoding="async"
            />
          </div>

          <div className="alb-experience__lyrics">
            {activeTrack && (
              <AlbumLyrics
                track={activeTrack}
                currentTime={engine.currentTime}
                status={engine.status}
                reducedMotion={reducedMotion}
              />
            )}
          </div>

          <AlbumTransport
            status={engine.status}
            currentTime={engine.currentTime}
            duration={engine.duration}
            onPlay={() => { engine.play().catch(() => {}); }}
            onPause={engine.pause}
            onSeek={engine.seek}
            onPrev={handlePrev}
            onNext={handleNext}
            repeat={repeat}
            onToggleRepeat={() => setRepeat(r => !r)}
            canPrev={canPrev}
            canNext={canNext}
          />
        </section>
      </div>

      <div aria-live="polite" className="sr-only">
        {activeTrack && engine.status === 'playing'
          ? `Now playing: ${activeTrack.title}`
          : ''}
      </div>
    </main>
  );
}
