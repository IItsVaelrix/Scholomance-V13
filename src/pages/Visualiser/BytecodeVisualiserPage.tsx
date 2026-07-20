import { memo, useCallback, useEffect, useMemo, useRef, useState, Fragment, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { StageArt } from './StageArt';
import { computeFingerprint } from './bytecodeFingerprint';
import { useKaraokeMotion } from './karaoke/useKaraokeMotion';
import { applyKaraokePlayhead } from './karaoke/karaokePlayhead';
import { DiscographyNav } from './DiscographyNav';
import {
  DeliveryPressureChart,
  IdentityStrip,
  PhonemicDensityChart,
  SchoolShareChart,
  SpectralStrip,
} from './charts';
import { buildTrackScore } from './songScore';
import { useVisualizerTruesight } from './hooks/useVisualizerTruesight';
import { PhonemeEngine, generateSchoolColor } from '../../lib/engine.adapter.js';
import { alignPhonemes } from '../../lib/phonology/phonemeAlignment.js';
import { useLyricAlignment } from '../../kits/scholomance-visualizer-kit/hooks/useLyricAlignment';
import { lineAtTime, wordAtTime } from '../../kits/scholomance-visualizer-kit/utils/lyricAlignment';
import { GRIMOIRE_TRACKS, DEFAULT_PACING, type GrimoireTrack, type TrackPacing } from './tracks';
import { degradeWithFallback } from './recovery';
import './BytecodeVisualiser.css';

interface PhonemeEngineAPI {
  init?: () => Promise<unknown>;
  analyzeDeep?: (w: string) => { phonemes?: string[]; syllableCount?: number } | null;
}

/** Fallback syllable estimate (pre-engine): vowel groups + silent-e. */
function syllableCountHeuristic(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 0;
  let count = (w.match(/[aeiouy]+/g) ?? []).length;
  if (count > 1 && w.endsWith('e') && !w.endsWith('le')) count -= 1;
  return Math.max(1, count);
}

/** Elongated written vowel runs ("Oooooohhhhh") are held across extra beats. */
function melismaBonus(word: string): number {
  const runs = word.toLowerCase().match(/([aeiou])\1{2,}/g);
  return runs ? runs.length * 3 : 0;
}

// ── Lyric pacing - tempo × phoneme-engine syllables ───────────────────────
// Each track publishes no per-line timestamps, so each line's duration is
// estimated mathematically: syllables per word from the phoneme engine's
// syllabifier (graphemic vowel-group heuristic only as the pre-init fallback,
// melisma-aware) ÷ syllables-per-beat for its delivery style, quantized to a
// half-beat grid at the detected tempo. Adjacent lines that alignPhonemes
// scores as phonemically parallel (rhymed/anaphoric couplets) are snapped to
// the same bar length - couplets share bars in rap flow. Cumulative beat-times
// are scaled onto the vocal window, which absorbs breaths and fills.

function beatsFromSyllables(syl: number, lineIndex: number, pacing: TrackPacing): number {
  const chorus = pacing.chorusStartLine !== undefined && lineIndex >= pacing.chorusStartLine;
  const spb = chorus ? pacing.chorusSylPerBeat : pacing.verseSylPerBeat;
  return Math.max(2, Math.round((syl / spb) * 2) / 2); // half-beat grid, >=2 beats
}

/** Pre-init line beats from the graphemic heuristic; replaced by the engine. */
function heuristicLineBeats(track: GrimoireTrack, pacing: TrackPacing): number[] {
  return track.lyrics.map((line, i) =>
    beatsFromSyllables(
      line.split(/\s+/).reduce((a, w) => a + syllableCountHeuristic(w) + melismaBonus(w), 0),
      i,
      pacing,
    ));
}

/** Playhead seconds -> active lyric line (-1 outside the vocal window). */
function lyricLineAt(progress: number, duration: number, lineBeats: number[], pacing: TrackPacing): number {
  const totalBeats = lineBeats.reduce((a, b) => a + b, 0);
  const windowS = Math.max(1, duration - pacing.leadInS - pacing.tailS);
  const nominalBeatS = 60 / pacing.bpm;
  const scale = windowS / (totalBeats * nominalBeatS);
  const beatS = nominalBeatS * scale;
  const t = progress - pacing.leadInS;
  if (t < 0) return -1;
  let acc = 0;
  for (let i = 0; i < lineBeats.length; i += 1) {
    acc += lineBeats[i] * beatS;
    if (t < acc) return i;
  }
  return lineBeats.length - 1;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Monoline transport glyph - crisp currentColor strokes, no emoji glyphs. */
function TransportGlyph({ d, filled = false }: { d: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const GLYPHS = {
  suno: 'M15 3h6v6M21 3l-9 9M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  prev: 'M19 20 9 12l10-8v16ZM5 19V5',
  play: 'M7 4.5 19.5 12 7 19.5v-15Z',
  pause: 'M7 4h3.4v16H7zM13.6 4H17v16h-3.4z',
  next: 'm5 4 10 8-10 8V4ZM19 5v14',
  repeat: 'm17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3',
};

type ColoredTok = {
  word: string;
  color: string | null;
  school: string | null;
  analysis: unknown;
  padLeft?: string;
};

/** Static token DOM — whitespace is never a token (padLeft text only). */
const LyricLineRow = memo(function LyricLineRow({
  lineIndex,
  plainLine,
  tokens,
  onWordEnter,
  onWordLeave,
}: {
  lineIndex: number;
  plainLine: string;
  tokens: ColoredTok[] | null;
  onWordEnter: (payload: { word: string; color: string; school: string; line: number; analysis: unknown }) => void;
  onWordLeave: () => void;
}) {
  return (
    <li data-k-line={lineIndex}>
      <span className="bcv-lyric-n">{String(lineIndex + 1).padStart(2, '0')}</span>
      <span className="bcv-lyric-text">
        {tokens
          ? (() => {
              let w = -1;
              return tokens.map((tok, j) => {
                const isWord = /[A-Za-z]/.test(tok.word);
                const pad = tok.padLeft || '';
                if (!isWord) {
                  return <Fragment key={j}>{pad}{tok.word}</Fragment>;
                }
                w += 1;
                return (
                  <Fragment key={j}>
                    {pad}
                    <span
                      className={tok.color ? 'bcv-tsword' : undefined}
                      style={tok.color ? ({ '--w': tok.color } as CSSProperties) : undefined}
                      data-k-word={w}
                      onMouseEnter={tok.color
                        ? () => onWordEnter({
                            word: tok.word,
                            color: tok.color!,
                            school: tok.school!,
                            line: lineIndex,
                            analysis: tok.analysis,
                          })
                        : undefined}
                      onMouseLeave={tok.color ? onWordLeave : undefined}
                    >{tok.word}</span>
                  </Fragment>
                );
              });
            })()
          : (() => {
              let w = -1;
              let pad = '';
              const nodes: ReactNode[] = [];
              for (const [j, part] of plainLine.split(/(\s+)/).entries()) {
                if (/^\s+$/.test(part)) {
                  pad += part;
                  continue;
                }
                const isWord = /[A-Za-z]/.test(part);
                if (!isWord) {
                  nodes.push(<Fragment key={j}>{pad}{part}</Fragment>);
                  pad = '';
                  continue;
                }
                w += 1;
                nodes.push(
                  <Fragment key={j}>
                    {pad}
                    <span data-k-word={w}>{part}</span>
                  </Fragment>,
                );
                pad = '';
              }
              return nodes;
            })()}
      </span>
    </li>
  );
});

export default function BytecodeVisualiserPage() {
  const reducedMotion = usePrefersReducedMotion();
  /** Steam Deck / coarse pointer: kill every live visual path during playback. */
  const deckSafe = useMemo(
    () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    [],
  );
  const freezeVisuals = reducedMotion || deckSafe;

  // Active grimoire track - deep-linkable: ?track=<id>.
  const [activeTrack, setActiveTrack] = useState<GrimoireTrack>(() => {
    const id = new URLSearchParams(window.location.search).get('track');
    return GRIMOIRE_TRACKS.find((t) => t.id === id) ?? GRIMOIRE_TRACKS[0];
  });
  const pacing = activeTrack.pacing ?? DEFAULT_PACING;

  // ── Real transport: an <audio> element streams the published Suno track. ──
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [fftReady, setFftReady] = useState(false);
  const [audioOk, setAudioOk] = useState(true);
  const [duration, setDuration] = useState(activeTrack.duration);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [coverOk, setCoverOk] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const selectTrack = (track: GrimoireTrack) => {
    if (track.id === activeTrack.id) return;
    setActiveTrack(track);
    setProgress(0);
    setPlaying(false);
    setAudioOk(true);
    setAudioBlocked(false);
    setCoverOk(true);
    // New <audio> element (key change) -> the Web Audio graph must rebuild.
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setFftReady(false);
    const url = new URL(window.location.href);
    url.searchParams.set('track', track.id);
    window.history.replaceState(null, '', url);
  };

  // Sync duration when track changes.
  useEffect(() => { setDuration(activeTrack.duration); }, [activeTrack]);

  /** Web Audio graph built on first user gesture (autoplay policy).
   *  Skip on coarse pointers (Deck) — SpectralStrip FFT + AudioContext was a
   *  remaining play-only crash path after mandala/karaoke bytecode landed. */
  const ensureAnalyser = () => {
    const el = audioRef.current;
    if (!el || analyserRef.current) return;
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512; // 256 bins >= visualiser's 192-slot read
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      setFftReady(true);
    } catch (error) {
      // Mandala keeps deterministic synthetic spectrum when Web Audio fails.
      degradeWithFallback(error, 'audio-context-unsupported');
    }
  };

  useEffect(() => () => { audioCtxRef.current?.close().catch(() => {}); }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !audioOk) { setPlaying((p) => !p); return; }
    if (el.paused) {
      ensureAnalyser();
      audioCtxRef.current?.resume().catch(() => {});
      el.play().catch(() => {
        setAudioOk(false);
        setAudioBlocked(true);
      });
    } else {
      el.pause();
    }
  };

  const seekTo = (t: number) => {
    const el = audioRef.current;
    if (el && audioOk) el.currentTime = t;
    setProgress(t);
  };

  // Fallback simulator: only if the stream is unreachable, the transport keeps
  // its 1s tick so the surface stays state-driven (no dead buttons).
  useEffect(() => {
    if (!playing || audioOk) return;
    const id = window.setInterval(() => {
      setProgress((p) => {
        const n = p + 1;
        if (n >= duration) return repeat ? 0 : (setPlaying(false), duration);
        return n;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, repeat, audioOk, duration]);

  // Ground-truth karaoke sync: static forced-alignment artifact, when one
  // exists for this track. Null -> every consumer below keeps the heuristic.
  const alignment = useLyricAlignment(activeTrack.id);

  // Gated Truesight via amp.visualizer.truesight + baked artifact (Approach B).
  // Deck-safe: do not fetch/apply the artifact at all (hundreds of KB in React state).
  const truesightAmp = useVisualizerTruesight(
    deckSafe ? '' : activeTrack.id,
    deckSafe ? [] : activeTrack.lyrics,
  );

  // Pacing only — colour comes from the gated AMP, never ungated client paint.
  // Deck: skip PhonemeEngine couplet pass — it walks every lyric word with
  // analyzeDeep and was stacking memory on a machine already Aw Snapping.
  const [hoveredWord, setHoveredWord] = useState<{ word: string; color: string; school: string; line: number; analysis: any } | null>(null);
  const onWordEnter = useCallback((payload: { word: string; color: string; school: string; line: number; analysis: unknown }) => {
    setHoveredWord(payload as { word: string; color: string; school: string; line: number; analysis: any });
  }, []);
  const onWordLeave = useCallback(() => setHoveredWord(null), []);
  const [lineBeats, setLineBeats] = useState<number[]>(() => heuristicLineBeats(activeTrack, pacing));
  useEffect(() => {
    setLineBeats(heuristicLineBeats(activeTrack, pacing));
    if (deckSafe) return;
    let cancelled = false;
    (async () => {
      try {
        const initEngine = PhonemeEngine as PhonemeEngineAPI;
        await initEngine.init?.();
      } catch (error) {
        // Pacing keeps heuristic beats when PhonemeEngine init fails.
        degradeWithFallback(error, 'phoneme-engine-init-failed');
      }
      if (cancelled) return;

      const engine = PhonemeEngine as PhonemeEngineAPI;
      const lines = activeTrack.lyrics.map((line, i) => {
        let syl = 0;
        const phonemes: string[] = [];
        for (const tok of line.split(/\s+/)) {
          const clean = tok.replace(/[^A-Za-z']/g, '');
          if (!clean) continue;
          const a = engine.analyzeDeep?.(clean) ?? null;
          syl += (a?.syllableCount || syllableCountHeuristic(clean)) + melismaBonus(tok);
          if (a?.phonemes?.length) phonemes.push(...a.phonemes);
        }
        return { beats: beatsFromSyllables(syl, i, pacing), phonemes };
      });

      for (let i = 0; i + 1 < lines.length; i += 1) {
        if (pacing.chorusStartLine !== undefined && i + 1 === pacing.chorusStartLine) continue;
        const a = lines[i].phonemes;
        const b = lines[i + 1].phonemes;
        if (a.length < 4 || b.length < 4) continue;
        const { cost } = alignPhonemes(a, b);
        if (cost / Math.max(a.length, b.length) <= pacing.coupletCostMax) {
          const bar = Math.max(lines[i].beats, lines[i + 1].beats);
          lines[i].beats = bar;
          lines[i + 1].beats = bar;
        }
      }

      if (!cancelled) setLineBeats(lines.map((l) => l.beats));
    })();
    return () => { cancelled = true; };
  }, [activeTrack, pacing, deckSafe]);

  const coloredLyrics = truesightAmp?.syncMode === 'gated' ? truesightAmp.lines : null;
  const dominantSchool = truesightAmp?.syncMode === 'gated'
    ? truesightAmp.dominantSchool
    : 'SONIC';

  // The track's "world" - themed to its dominant phonemic school.
  const worldColor = generateSchoolColor(dominantSchool);

  // Playhead line for charts/scroll — setState ONLY when the LINE changes.
  // Progress bar + sung-word markers update via DOM in the clock (no full-tree
  // reconcile every tick — that was dying around PANDA / ~62s of play).
  const [activeLine, setActiveLine] = useState(-1);
  const activeLineRef = useRef(-1);
  const lyricsRef = useRef<HTMLOListElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef(0);
  const alignmentRef = useRef(alignment);
  alignmentRef.current = alignment;
  const lineBeatsRef = useRef(lineBeats);
  lineBeatsRef.current = lineBeats;
  const pacingRef = useRef(pacing);
  pacingRef.current = pacing;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const getAudioTime = useCallback(() => {
    const el = audioRef.current;
    if (el && audioOk) return el.currentTime;
    return clockRef.current;
  }, [audioOk]);

  useEffect(() => {
    if (!playing || !audioOk) return;
    // Deck: progress bar only. No playhead DOM walks, no scrollIntoView, no
    // karaoke attribute thrash — those were still crashing and getting worse.
    const id = window.setInterval(() => {
      const t = audioRef.current?.currentTime ?? 0;
      clockRef.current = t;

      const dur = durationRef.current || 1;
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${(t / dur) * 100}%`;
      }
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = fmt(t);
      }

      if (deckSafe) return;

      const align = alignmentRef.current;
      const alignedPos = align ? lineAtTime(align.lines, t) : -1;
      const line = align
        ? (alignedPos < 0 ? -1 : align.lines[alignedPos].index)
        : lyricLineAt(t, durationRef.current, lineBeatsRef.current, pacingRef.current);
      const sungIdx = align ? wordAtTime(align.words, t) : -1;
      const sung = align && sungIdx >= 0 ? align.words[sungIdx] : null;

      const root = lyricsRef.current;
      if (root) {
        applyKaraokePlayhead(root, {
          line,
          word: sung && sung.line === line ? sung.word : -1,
          backing: Boolean(sung?.backing),
          estimated: Boolean(sung?.interpolated),
        });
      }

      if (line !== activeLineRef.current) {
        activeLineRef.current = line;
        if (line >= 0 && root) {
          const el = root.querySelector(`[data-k-line="${line}"]`) as HTMLElement | null;
          el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
        const lineReadout = document.getElementById('bcv-playhead-line');
        if (lineReadout) {
          lineReadout.textContent = line >= 0 ? String(line + 1).padStart(2, '0') : '—';
        }
      }
    }, deckSafe ? 500 : 200);
    return () => window.clearInterval(id);
  }, [playing, audioOk, deckSafe]);

  // Sync React progress + activeLine when pausing so charts catch up once.
  useEffect(() => {
    if (playing) return;
    const t = audioRef.current?.currentTime ?? clockRef.current;
    clockRef.current = t;
    setProgress(t);
    setActiveLine(activeLineRef.current);
  }, [playing]);

  useEffect(() => {
    activeLineRef.current = -1;
    setActiveLine(-1);
    clockRef.current = 0;
  }, [activeTrack.id]);

  const visibleColoredLyrics = (!deckSafe && coloredLyrics?.length === activeTrack.lyrics.length)
    ? coloredLyrics
    : null;

  const karaokeSeed = useMemo(
    () => computeFingerprint({
      title: activeTrack.title,
      bpm: pacing.bpm,
      key: String((activeTrack.meta.find(([k]) => k.toLowerCase() === 'key') || ['', 'Am'])[1] || 'Am'),
      trackId: activeTrack.id,
    }).hash,
    [activeTrack.title, activeTrack.id, activeTrack.meta, pacing.bpm],
  );

  useKaraokeMotion({
    seed: karaokeSeed,
    bpm: pacing.bpm,
    getTimeSeconds: !freezeVisuals && playing && audioOk ? getAudioTime : undefined,
    reducedMotion: freezeVisuals,
    rootRef: lyricsRef,
  });

  // Live FFT once the Web Audio graph exists; deterministic synthetic before
  // that. Stable identity (useCallback) is load-bearing: a fresh function per
  // render would restart the mandala's canvas effect on every timeupdate
  // re-render (~4 Hz) and make the orb flicker.
  const readFFT = useCallback((a: Uint8Array) => {
    analyserRef.current?.getByteFrequencyData(a as Uint8Array<ArrayBuffer>);
  }, []);
  const getFFT = fftReady ? readFFT : undefined;

  const trackScore = useMemo(
    () => buildTrackScore({
      coloredLyrics: visibleColoredLyrics,
      lineBeats,
      bpm: pacing.bpm,
      syncMode: alignment ? 'aligned' : 'estimated',
      lyricLines: activeTrack.lyrics,
    }),
    [visibleColoredLyrics, lineBeats, pacing.bpm, alignment, activeTrack.lyrics],
  );
  const activeLineSchools = activeLine >= 0 ? trackScore.lines[activeLine]?.schools ?? null : null;
  const activePressure = activeLine >= 0 ? trackScore.lines[activeLine]?.pressure : null;

  return (
    <main
      className="bcv-page bcv-reader"
      aria-label="Grimoire reader"
      data-school={dominantSchool}
      style={{
        '--bcv-world': worldColor,
        '--grim-color': worldColor,
        '--grim-color-muted': worldColor,
        '--grim-border': `1px solid color-mix(in oklab, ${worldColor} 55%, transparent)`,
        '--grim-transition': '360ms ease-in-out',
      } as CSSProperties}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- no VTT exists for
          this track; the left page renders the full lyrics with aria-current
          playhead tracking, which is the captioning surface. */}
      <audio
        key={activeTrack.id}
        ref={audioRef}
        src={activeTrack.audioUrl}
        crossOrigin="anonymous"
        preload="metadata"
        loop={repeat}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || activeTrack.duration)}
        onError={() => setAudioOk(false)}
      />

      <div className="bcv-spread">
        {/* ── LEFT PAGE: the track ───────────────────────────────────────── */}
        <section className="bcv-leftpage" aria-label="Track">
          <p className="bcv-eyebrow">✦ Verses &amp; Veritas ✦</p>
          <h1 className="bcv-tracktitle">{activeTrack.title}</h1>
          <p className="bcv-artist">{activeTrack.artist}</p>
          <p className="bcv-album">a suno incantation · {activeTrack.model} {activeTrack.modelVersion}</p>

          <div className="bcv-trackhead">
            <div className="bcv-cover">
              {coverOk
                ? <img src={activeTrack.coverUrl} alt={`${activeTrack.title} cover art`} onError={() => setCoverOk(false)} />
                : <span aria-hidden="true">◈</span>}
            </div>
            <dl className="bcv-meta">
              {activeTrack.meta.map(([k, v]) => (
                <div className="bcv-meta__row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
              {/* Provenance comes from the artifact itself, never hardcoded  - 
                  a non-aligned artifact must not be presented as aligned. */}
              <div className="bcv-meta__row"><dt>Sync</dt><dd>{alignment ? `aligned · ${alignment.source.aligner}` : 'estimated'}</dd></div>
              <div className="bcv-meta__row"><dt>Truesight</dt><dd>{truesightAmp?.syncMode ?? 'loading'}{truesightAmp?.gateSize ? ` · ${truesightAmp.gateSize} gated` : ''}</dd></div>
            </dl>
          </div>

          <section className="bcv-provenance" aria-label="Provenance">
            <h2>Provenance</h2>
            <p className="bcv-prov-statement">{activeTrack.provenance.statement}</p>
            <p className="bcv-prov-label">Tools &amp; Model</p>
            <p className="bcv-prov-tools">{activeTrack.provenance.tools.join(' · ')}</p>
            <p className="bcv-prov-label">Assistance</p>
            <p className="bcv-prov-tools">{activeTrack.provenance.assistance}</p>
          </section>

          <ol ref={lyricsRef} className={`bcv-lyrics ${visibleColoredLyrics ? 'is-truesight' : ''}`}>
            {activeTrack.lyrics.map((line, i) => (
              <LyricLineRow
                key={i}
                lineIndex={i}
                plainLine={line}
                tokens={visibleColoredLyrics ? visibleColoredLyrics[i] as ColoredTok[] : null}
                onWordEnter={onWordEnter}
                onWordLeave={onWordLeave}
              />
            ))}
          </ol>

          <section className="bcv-annotations-layer" aria-labelledby="annotations-heading">
            <h2 id="annotations-heading" className="sr-only">Truesight Annotations</h2>
            <div className="bcv-annotations-grid">
              <AnimatePresence mode="wait">
                {hoveredWord && (
                  <motion.div
                    key={`word-${hoveredWord.word}-${hoveredWord.line}`}
                    className="bcv-panel bcv-panel--annotation"
                    initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    role="article"
                    style={{ borderLeftColor: hoveredWord.color }}
                  >
                    <header className="bcv-annotation__header">
                      <span className="bcv-annotation__id" style={{ color: hoveredWord.color, textShadow: `0 0 10px ${hoveredWord.color}66` }}>
                        {hoveredWord.school}
                      </span>
                      <h3 className="bcv-annotation__title" style={{ color: hoveredWord.color }}>{hoveredWord.word}</h3>
                      {hoveredWord.analysis?.syllableCount && (
                         <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--bcv-dim)' }}>
                           DEPTH: {hoveredWord.analysis.syllableCount}
                         </span>
                      )}
                    </header>
                    <div className="bcv-annotation__content">
                      <p className="bcv-annotation__body">
                        {hoveredWord.analysis?.rhymeKey && `Echo Key: ${hoveredWord.analysis.rhymeKey} · `}
                        {hoveredWord.analysis?.vowelFamily && `Vowel Family: ${hoveredWord.analysis.vowelFamily}`}
                        {!hoveredWord.analysis?.rhymeKey && !hoveredWord.analysis?.vowelFamily && `Arcane structural token mapped to the ${hoveredWord.school} school.`}
                      </p>
                    </div>
                  </motion.div>
                )}
                
                {hoveredWord && activeTrack.annotations.filter(a => a.n === hoveredWord.line).map((a, _idx) => (
                  <motion.div
                    key={a.n}
                    className="bcv-panel bcv-panel--annotation"
                    initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.25, delay: reducedMotion ? 0 : 0.05, ease: 'easeOut' }}
                    role="article"
                  >
                    <header className="bcv-annotation__header">
                      <span className="bcv-annotation__id">
                        {String(a.n).padStart(2, '0')}
                      </span>
                      <h3 className="bcv-annotation__title">{a.title}</h3>
                    </header>
                    <div className="bcv-annotation__content">
                      <p className="bcv-annotation__body">{a.body}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {audioBlocked && (
            <div className="bcv-audio-warning" style={{ color: 'hsl(0 90% 70%)', fontSize: '0.85rem', marginBottom: '8px', padding: '8px', background: 'hsl(0 90% 10%)', borderRadius: '4px', border: '1px solid hsl(0 90% 20%)' }}>
              ⚠️ Audio Blocked - Please interact with the page or check your browser settings to allow playback.
            </div>
          )}

          {/* Player transport - every control state-driven (architect law). */}
          <div className="bcv-player">
            <span className="bcv-time" ref={timeLabelRef}>{fmt(progress)}</span>
            <div className="bcv-progress" role="presentation">
              <div
                ref={progressFillRef}
                className="bcv-progress__fill"
                style={{ width: `${(progress / duration) * 100}%` }}
              />
            </div>
            <span className="bcv-time">{fmt(duration)}</span>
          </div>
          <div className="bcv-transport">
            <a
              className="bcv-transport__link"
              href={activeTrack.sunoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${activeTrack.title} on Suno`}
            >
              <TransportGlyph d={GLYPHS.suno} />
            </a>
            <button type="button" aria-label="Restart" onClick={() => seekTo(0)}><TransportGlyph d={GLYPHS.prev} /></button>
            <button type="button" aria-label={playing ? 'Pause' : 'Play'} className="bcv-transport__play" onClick={togglePlay}><TransportGlyph d={playing ? GLYPHS.pause : GLYPHS.play} filled /></button>
            <button type="button" aria-label="Skip to end" onClick={() => seekTo(duration)}><TransportGlyph d={GLYPHS.next} /></button>
            <button type="button" aria-label="Repeat" aria-pressed={repeat} className={repeat ? 'is-on' : ''} onClick={() => setRepeat((r) => !r)}><TransportGlyph d={GLYPHS.repeat} /></button>
          </div>
        </section>

        {/* ── RIGHT PAGE: song score instruments ─────────────────────────── */}
        <section className="bcv-rightpage" aria-label="Bytecode visualiser">
          <header className="bcv-head">
            <h1>Bytecode Visualiser</h1>
            <p>
              <span className={`bcv-beacon${playing ? ' is-live' : ''}`} aria-hidden="true" />
              Song score · {dominantSchool} world · {playing ? 'ritual live' : 'standby'}
            </p>
          </header>

          <div className="bcv-grid">
            <section className="bcv-panel bcv-panel--grim" aria-label="Track identity">
              <h2>Track Identity</h2>
              <IdentityStrip
                score={trackScore}
                model={activeTrack.model}
                modelVersion={activeTrack.modelVersion}
              />
            </section>

            <section className="bcv-panel bcv-panel--grim" aria-label="Spectral analysis">
              <h2>Spectral Analysis</h2>
              <SpectralStrip
                getByteFrequencyData={deckSafe ? undefined : getFFT}
                reducedMotion={freezeVisuals}
              />
              <p className="bcv-dim">{deckSafe ? 'deck-safe · spectrum off' : (fftReady ? 'live FFT' : 'standby · connect audio to wake')}</p>
            </section>

            <section className="bcv-panel bcv-panel--grim" aria-label="Phonemic density">
              <h2>Phonemic Density</h2>
              <PhonemicDensityChart
                lines={trackScore.lines}
                activeLine={activeLine}
                reducedMotion={freezeVisuals}
              />
            </section>

            <div className="bcv-stage">
              <StageArt
                stageArtUrl={activeTrack.stageArtUrl}
                coverUrl={activeTrack.coverUrl}
                title={activeTrack.title}
              />
              <div className="bcv-stage__scanlines" aria-hidden="true" />
            </div>

            <section className="bcv-panel bcv-panel--right bcv-panel--grim" aria-label="School association">
              <h2>School Association</h2>
              <SchoolShareChart
                shares={trackScore.schoolShares}
                activeSchools={activeLineSchools}
              />
            </section>

            <section className="bcv-panel bcv-panel--right bcv-panel--grim" aria-label="Delivery pressure">
              <h2>Delivery Pressure</h2>
              <DeliveryPressureChart
                lines={trackScore.lines}
                activeLine={activeLine}
              />
            </section>

            <section className="bcv-panel bcv-panel--right bcv-panel--grim" aria-label="Playhead">
              <h2>Playhead</h2>
              <p className="bcv-coord">
                <span>LINE</span>
                <span id="bcv-playhead-line">
                  {activeLine >= 0 ? String(activeLine + 1).padStart(2, '0') : '—'}
                </span>
              </p>
              <p className="bcv-coord">
                <span>PRESSURE</span>
                {activePressure != null ? activePressure.toFixed(2) : '—'}
              </p>
              <p className="bcv-coord">
                <span>SYL</span>
                {activeLine >= 0 ? trackScore.lines[activeLine]?.syllables ?? '—' : '—'}
              </p>
            </section>
          </div>

          <footer className="bcv-foot">The Pattern Is Law · The Sound Is Code</footer>
        </section>
      </div>

      {import.meta.env.VITE_ENABLE_DISCOGRAPHY !== 'false' && (
        <DiscographyNav activeTrackId={activeTrack.id} onSelectTrack={selectTrack} />
      )}
    </main>
  );
}
