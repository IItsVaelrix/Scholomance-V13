import { useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { MIN_WORDS_FOR_STATS } from '../../codex/core/song-stats/constants.js';
import { AnimatedSurface } from './AnimatedSurface';
import './SongStatsPanel.css';

const SEVERITY_RANK = { error: 3, warning: 2, info: 1 };

/** Always-visible glosses — CODEx-native wording, literature-informed. */
const METRIC_EXPLANATIONS = {
  technicalDensity:
    'Composite of rhyme density, lexical diversity, and flow.',
  rhymeDensity:
    'CODEx RD averages the squared length of matching vowel chains against recent words. Malmi baseline is the linear, unsquared measure kept for comparison.',
  lexicalDiversity:
    'Unique lemmas (word roots) per 100 analyzed lyric tokens. Song-scale diversity — not a fixed 35k-token discography catalogue count.',
  flowEstimated:
    'Syllables per second from a text pacing model. Syncopation proxy estimates stressed-syllable displacement across an assumed rhythmic grid until audio alignment exists.',
  flowAligned:
    'Syllables per second from timed vocals. Syncopation index scores stressed syllables on weak beats; grid deviation is timing looseness, not syncopation.',
};

/**
 * @param {unknown} value
 * @param {number} [digits]
 * @param {{ empty?: boolean }} [options]
 */
function formatNumber(value, digits = 2, { empty = false } = {}) {
  if (empty) return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '—';
}

function formatTechnicalDensity(value) {
  if (value == null) return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '—';
}

/**
 * @param {import('../../codex/core/song-stats/types.js').SongStatsResult} stats
 * @returns {import('../../codex/core/song-stats/types.js').Diagnostic | null}
 */
function topDiagnostic(stats) {
  const diagnostics = [
    ...(stats.pillars?.rhymeDensity?.diagnostics ?? []),
    ...(stats.pillars?.uniqueVocabulary?.diagnostics ?? []),
    ...(stats.pillars?.flowAlignment?.diagnostics ?? []),
  ];
  if (diagnostics.length === 0) return null;

  return diagnostics.reduce((best, candidate) => {
    const bestRank = SEVERITY_RANK[best?.severity] ?? 0;
    const candidateRank = SEVERITY_RANK[candidate?.severity] ?? 0;
    return candidateRank > bestRank ? candidate : best;
  });
}

function provisionalReason(stats) {
  const reasons = [];
  if ((stats.wordCount ?? 0) < 32) {
    reasons.push('short sample');
  }
  if (stats.pillars?.flowAlignment?.fidelity === 'estimated') {
    reasons.push('Flow estimated from text');
  }
  return reasons.length > 0 ? reasons.join(' · ') : 'limited evidence';
}

function PillarCard({ title, value, secondary, metaLine, explanation, fidelityChip }) {
  return (
    <AnimatedSurface className="song-stats-card">
      <div className="song-stats-card-heading">
        <h3>{title}</h3>
        {fidelityChip}
      </div>
      <p className="song-stats-card-value">{value}</p>
      {secondary && <p className="song-stats-card-secondary">{secondary}</p>}
      {metaLine && <p className="song-stats-card-meta">{metaLine}</p>}
      {explanation && <p className="song-stats-card-explanation">{explanation}</p>}
    </AnimatedSurface>
  );
}

/**
 * @param {{
 *   stats: import('../../codex/core/song-stats/types.js').SongStatsResult,
 *   visible: boolean,
 *   isEmbedded?: boolean,
 *   onClose?: (() => void) | null,
 * }} props
 */
export default function SongStatsPanel({
  stats,
  visible,
  isEmbedded = false,
  onClose = null,
}) {
  const reduceMotion = usePrefersReducedMotion();
  const densityExplanationId = useId();

  if (!visible || !stats) return null;

  const { composite, meta, pillars, wordCount } = stats;
  const rhyme = pillars.rhymeDensity;
  const vocabulary = pillars.uniqueVocabulary;
  const flow = pillars.flowAlignment;
  const analyzedCount = meta.analyzedTokenCount ?? wordCount;
  const pillarsEmpty = analyzedCount < MIN_WORDS_FOR_STATS;
  const isAligned = flow.fidelity === 'aligned';
  const flowSecondary = isAligned
    ? `Syncopation index ${formatNumber(flow.secondary?.syncopationIndex, 2, { empty: pillarsEmpty })}`
    : `Syncopation proxy ${formatNumber(flow.secondary?.stressDisplacementProxy, 2, { empty: pillarsEmpty })}`;
  const vocabSecondary = vocabulary.secondary
    ? `${vocabulary.secondary.uniqueLemmaCount ?? '—'} lemmas · ${vocabulary.secondary.surfaceTypeCount ?? '—'} surface forms · ${vocabulary.secondary.tokenCount ?? '—'} analyzed tokens`
    : null;
  const weights = composite.weights;
  const diagnostic = topDiagnostic(stats);
  const bpm = meta.assumptions?.estimatedBpm ?? 90;
  const flowChip = isAligned ? (
    <span className="song-stats-fidelity is-aligned">Aligned</span>
  ) : (
    <span className="song-stats-fidelity is-estimated">
      {`Estimated · ${bpm} BPM · 1 line = 1 bar`}
    </span>
  );

  const content = (
    <AnimatedSurface className="song-stats-surface">
      <header className="song-stats-header">
        <div className="song-stats-title-group">
          <span className="song-stats-kicker">CODEx Metrics</span>
          <span className="song-stats-subtitle">Song Stats</span>
          <h2>Technical Density</h2>
          <p className="song-stats-density">
            {formatTechnicalDensity(composite.total0to100)} · {composite.band ?? 'Unscored'}
          </p>
          {composite.provisional && (
            <span className="song-stats-provisional">
              {`Provisional · ${provisionalReason(stats)}`}
            </span>
          )}
          <p className="song-stats-header-explanation">
            {METRIC_EXPLANATIONS.technicalDensity}
          </p>
          <span className="song-stats-explanation">
            <button
              type="button"
              className="song-stats-explanation-trigger"
              aria-label="About Technical Density limits"
              aria-describedby={densityExplanationId}
            >
              ?
            </button>
            <span
              id={densityExplanationId}
              className="song-stats-explanation-tooltip"
              role="tooltip"
            >
              Measures technical concentration, not overall artistic quality, emotional impact, or song effectiveness.
            </span>
          </span>
        </div>

        <div className="song-stats-seal" aria-hidden="true">
          <span>TD</span>
          <i>{formatTechnicalDensity(composite.total0to100)}</i>
        </div>

        {!isEmbedded && onClose && (
          <button
            type="button"
            className="song-stats-close"
            onClick={onClose}
            aria-label="Close song statistics"
          >
            ×
          </button>
        )}
      </header>

      <div className="song-stats-grid">
        <PillarCard
          title="CODEx Rhyme Density"
          value={`${formatNumber(rhyme.value, 2, { empty: pillarsEmpty })} RD`}
          secondary={`Malmi baseline ${formatNumber(rhyme.secondary?.malmiDensity, 2, { empty: pillarsEmpty })}`}
          explanation={METRIC_EXPLANATIONS.rhymeDensity}
        />
        <PillarCard
          title="CODEx Lexical Diversity"
          value={`${formatNumber(vocabulary.value, 2, { empty: pillarsEmpty })} /100 tokens`}
          secondary={vocabSecondary}
          explanation={METRIC_EXPLANATIONS.lexicalDiversity}
        />
        <PillarCard
          title="Flow"
          value={`${formatNumber(flow.value, 2, { empty: pillarsEmpty })} SPS`}
          secondary={flowSecondary}
          explanation={isAligned ? METRIC_EXPLANATIONS.flowAligned : METRIC_EXPLANATIONS.flowEstimated}
          fidelityChip={flowChip}
        />
      </div>

      <footer className="song-stats-footer">
        <span>{analyzedCount} analyzed words</span>
        {Number.isFinite(meta.excludedTokenCount) && meta.excludedTokenCount > 0 && (
          <span title={`Raw words ${meta.rawWordCount ?? '—'}`}>
            {meta.excludedTokenCount} excluded
          </span>
        )}
        <span>window {meta.rhymeWindow}</span>
        <span>
          weights {Math.round(weights.rhymeDensity * 100)}/
          {Math.round(weights.uniqueVocabulary * 100)}/
          {Math.round(weights.flowAlignment * 100)}
        </span>
        <span>{meta.engineVersion}</span>
        <span>{meta.calibrationVersion}</span>
        {diagnostic && (
          <span className={`song-stats-diagnostic is-${diagnostic.severity}`} title={diagnostic.message}>
            {diagnostic.code}
          </span>
        )}
      </footer>
    </AnimatedSurface>
  );

  if (isEmbedded) {
    return (
      <aside className="song-stats-panel is-embedded" aria-label="CODEx Song Stats">
        {content}
      </aside>
    );
  }

  return (
    <AnimatePresence>
      <motion.aside
        className="song-stats-panel"
        initial={reduceMotion ? false : { opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, x: 32 }}
        transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
        aria-label="CODEx Song Stats"
      >
        {content}
      </motion.aside>
    </AnimatePresence>
  );
}
