/**
 * ConstellationOS — the answer plate.
 *
 * Two renderings share one body of truth:
 *
 *  - `ComposedResultShell` is the bespoke presentation. It is gated by the
 *    Compose scene contract (`createConstellationResultScene`): the anatomy is
 *    validated BEFORE paint, every channel is tagged with its declared
 *    `data-compose-part`, honest refusals (degraded / heteronym / unevidenced)
 *    are surfaced as `data-state-*`, and the plates rise on a bytecode-seeded
 *    cascade (Law 6 — never a clock).
 *
 *  - `PlainResultShell` is the deterministic fallback. If the scene contract
 *    ever fails validation the shell degrades to this markup, byte-for-byte the
 *    pre-Compose rendering, so a broken contract can never take the answer down
 *    with it (PDR §7.8 — failure stays local).
 *
 * The section BODIES are factored into shared functions so the two shells can
 * never drift: whatever the composed plate shows, the fallback shows too.
 */

import { useMemo, Component } from 'react';
import {
  createConstellationResultScene,
  CONSTELLATION_RESULT_KIND,
  CONSTELLATION_RESULT_VERSION,
} from '../../core/compose/migrated/ConstellationResult.ts';
import { validateComposeScene } from '../../core/compose/packets.ts';
import { plateRevealFor, heroFigure, twinkleFor, fnv1a32, SPARK_PATH, heroStarGlyph } from './skyChart.js';

/* ─── Shared atoms ─────────────────────────────────────────────────────── */

/**
 * @param {{ items: string[], label: string, tone?: 'kin'|'counter'|'rhyme'|'slant' }} props
 */
function Chips({ items, label, tone = 'kin' }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="constellation-result-chipset">
      <span className="constellation-result-chipset__label">
        {label} <span className="constellation-result-chipset__count">{items.length}</span>
      </span>
      <ul className={`constellation-result-chips constellation-result-chips--${tone}`}>
        {items.map((item) => (
          <li key={item} className="constellation-result-chip">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** First sentence, ≤120 chars, ellipsis if trimmed. Render-side only (PDR §8). */
function truncateEtymology(text) {
  if (!text) return '';
  const firstSentence = String(text).split(/(?<=[.!?])\s/)[0];
  const clipped = firstSentence.length > 120 ? `${firstSentence.slice(0, 119)}…` : firstSentence;
  return clipped;
}

/** A labelled relation bucket with its own glyph; akin is capped with a +N affordance. */
function RelationChips({ glyph, label, items, cap }) {
  if (!items || items.length === 0) return null;
  const shown = cap ? items.slice(0, cap) : items;
  const extra = cap ? items.length - shown.length : 0;
  return (
    <div className="constellation-result-chipset">
      <span className="constellation-result-chipset__label">
        <span className="constellation-result-relglyph" aria-hidden="true">{glyph}</span> {label}{' '}
        <span className="constellation-result-chipset__count">{items.length}</span>
      </span>
      <ul className="constellation-result-chips constellation-result-chips--kin">
        {shown.map((item) => (
          <li key={item} className="constellation-result-chip">{item}</li>
        ))}
        {extra > 0 ? <li className="constellation-result-chip is-more">+{extra} more</li> : null}
      </ul>
    </div>
  );
}

/* ─── Shared section bodies (single source of truth for both shells) ───── */

function IdentityDl({ query, leximancy, phraseGenome, pageBytecode }) {
  return (
    <dl className="constellation-result-dl">
      <div>
        <dt>Raw query</dt>
        <dd>{query.raw}</dd>
      </div>
      <div>
        <dt>Normalized</dt>
        <dd>{query.normalized}</dd>
      </div>
      <div>
        <dt>Kind</dt>
        <dd>{query.kind}</dd>
      </div>
      <div>
        <dt>Tokens</dt>
        <dd>{query.tokenCount}</dd>
      </div>
      <div>
        <dt>Graphemes</dt>
        <dd>{query.graphemeCount}</dd>
      </div>
      <div>
        <dt>Meaning status</dt>
        <dd>{leximancy.status}</dd>
      </div>
      {phraseGenome.schoolHint ? (
        <div>
          <dt>Dominant school</dt>
          <dd className="constellation-result-school">{phraseGenome.schoolHint}</dd>
        </div>
      ) : null}
      <div>
        <dt>Page bytecode</dt>
        <dd className="constellation-result-mono">{pageBytecode}</dd>
      </div>
    </dl>
  );
}

function VersionsList({ engineVersions }) {
  return (
    <ul className="constellation-result-versions" aria-label="Engine versions">
      {Object.entries(engineVersions).map(([name, version]) => (
        <li key={name}>
          <span className="constellation-result-mono">{name}</span> {version}
        </li>
      ))}
    </ul>
  );
}

function MeaningBody({ leximancy, semanticInquiry, query }) {
  const rarity = leximancy.rarity ?? null;
  const etymology = leximancy.etymology ?? null;
  const nearKin = leximancy.nearKin ?? [];
  const counterfield = leximancy.counterfield ?? [];
  const relations = leximancy.relations ?? { broader: [], narrower: [], akin: [] };
  const selectedInterpretation =
    leximancy.interpretations.find((i) => i.id === leximancy.selectedInterpretationId) || null;
  const hasLeximancy = leximancy.interpretations.length > 0;
  const anchorToken = leximancy.lookupToken || leximancy.anchor || null;

  return (
    <>
      {anchorToken ? (
        <p className="constellation-result-anchor" data-testid="constellation-lexical-anchor">
          Meaning anchored on &ldquo;{anchorToken}&rdquo;
          {leximancy.compoundUsed ? ` (from ${leximancy.compoundUsed})` : ''}
        </p>
      ) : null}
      {rarity ? (
        <p className="constellation-result-rarity" aria-label={`Lexical rarity ${rarity.label}`}>
          {rarity.label} · {rarity.band}/{rarity.max}
        </p>
      ) : null}
      {etymology ? (
        <p className="constellation-result-etymology">
          <span className="constellation-result-etymology__label">Etymology</span>{' '}
          <span title={etymology}>{truncateEtymology(etymology)}</span>
        </p>
      ) : null}
      {/*
        A heteronym is not an ambiguous word — it is two WORDS sharing a
        spelling, so it is shown BEFORE the sense list rather than inside it.
        `wound` is /wuːnd/ an injury and /waʊnd/ coiled; listing their senses
        together as readings of one word is the error this surfaces.
      */}
      {semanticInquiry?.isHeteronym && semanticInquiry.lexicalEntries?.length ? (
        <div className="constellation-result-heteronym" role="note">
          <p className="constellation-result-heteronym__lede">
            <strong>{semanticInquiry.headToken || query.normalized}</strong> is{' '}
            {semanticInquiry.lexicalEntries.length} words, not one meaning.
          </p>
          <ul className="constellation-result-heteronym__list">
            {semanticInquiry.lexicalEntries.map((entry) => (
              <li key={entry.synsetId || entry.pos}>
                <span className="constellation-result-pos">{entry.pos}</span>
                <span className="constellation-result-gloss">{entry.gloss}</span>
                <span className="constellation-result-confidence">
                  {entry.senseCount} sense{entry.senseCount === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
          <p className="constellation-result-heteronym__note">
            {semanticInquiry.framePos
              ? `Context settled it (${semanticInquiry.frameCue}).`
              : 'No context to settle which — add a word before it.'}
          </p>
        </div>
      ) : null}
      {hasLeximancy ? (
        <>
          <p className="constellation-result-panel-note">
            {leximancy.status === 'ambiguous'
              ? `${leximancy.interpretations.length} readings — no single meaning selected`
              : `${leximancy.interpretations.length} sense${leximancy.interpretations.length === 1 ? '' : 's'}`}
          </p>
          <ol className="constellation-result-interpretations">
            {leximancy.interpretations.map((item) => {
              const selected = item.id === leximancy.selectedInterpretationId;
              return (
                <li
                  key={item.id}
                  className={selected ? 'is-selected' : undefined}
                  aria-current={selected ? 'true' : undefined}
                >
                  {item.pos ? <span className="constellation-result-pos">{item.pos}</span> : null}
                  <span className="constellation-result-gloss">{item.gloss}</span>
                  {selected ? (
                    <span
                      className="constellation-result-selected-mark"
                      title={
                        semanticInquiry?.selection?.warranted
                          ? `Chosen from context — ${semanticInquiry.selection.overlap} shared word${semanticInquiry.selection.overlap === 1 ? '' : 's'}`
                          : 'Default reading — nothing in the query chose it'
                      }
                    >
                      {semanticInquiry?.selection?.warranted ? 'evidenced' : 'selected'}
                    </span>
                  ) : null}
                  <span className="constellation-result-confidence">
                    {(item.confidence * 100).toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ol>
          {selectedInterpretation && selectedInterpretation.examples && selectedInterpretation.examples.length > 0 ? (
            <ul className="constellation-result-examples" aria-label="Example usage">
              {selectedInterpretation.examples.map((ex) => (
                <li key={ex} className="constellation-result-example">“{ex}”</li>
              ))}
            </ul>
          ) : null}
          <Chips items={nearKin} label="Near kin" tone="kin" />
          <Chips items={counterfield} label="Counterfield" tone="counter" />
          {(relations.broader.length || relations.narrower.length || relations.akin.length) ? (
            <div className="constellation-result-relations">
              <p className="constellation-result-relations__caption">lexical relations</p>
              <RelationChips glyph="↑" label="broader" items={relations.broader} />
              <RelationChips glyph="↓" label="narrower" items={relations.narrower} />
              <RelationChips glyph="≈" label="akin" items={relations.akin} cap={3} />
            </div>
          ) : null}
          {leximancy.warnings.length > 0 ? (
            <ul className="constellation-result-warnings">
              {leximancy.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="constellation-result-awaiting">Awaiting engine — Leximancy</p>
      )}
    </>
  );
}

const SOUNDWAVE_DUST = Array.from({ length: 38 }, (_, index) => ({
  x: 5 + ((index * 47) % 210),
  y: 7 + ((index * 31) % 80),
  radius: 0.18 + (index % 4) * 0.08,
  opacity: 0.22 + (index % 5) * 0.1,
}));

function phonemeEnergy(phoneme, index) {
  const code = Array.from(String(phoneme)).reduce((sum, character) => sum + character.codePointAt(0), 0);
  const stressed = /[12]$/.test(phoneme);
  const amplitude = stressed ? 19 + (code % 7) : 8 + (code % 11);
  return {
    stressed,
    amplitude,
    polarity: index % 2 === 0 ? -1 : 1,
  };
}

function buildSmoothWave(points) {
  if (points.length === 0) return 'M 8 46 L 212 46';
  const anchors = [{ x: 8, y: 46 }, ...points, { x: 212, y: 46 }];
  let path = `M ${anchors[0].x} ${anchors[0].y}`;

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const p0 = anchors[index - 1] ?? anchors[index];
    const p1 = anchors[index];
    const p2 = anchors[index + 1];
    const p3 = anchors[index + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return path;
}

function CosmicSoundwave({ phonemes, exactRhymes }) {
  const denominator = Math.max(phonemes.length - 1, 1);
  const points = phonemes.map((phoneme, index) => {
    const energy = phonemeEnergy(phoneme, index);
    return {
      id: `${phoneme}-${index}`,
      phoneme,
      x: 18 + (index / denominator) * 184,
      y: 46 + energy.polarity * energy.amplitude,
      ...energy,
    };
  });
  const mirrored = points.map((point) => ({ ...point, y: 92 - point.y }));
  const wavePath = buildSmoothWave(points);
  const mirrorPath = buildSmoothWave(mirrored);
  const stressedCount = points.filter((point) => point.stressed).length;
  const resonanceOrigin = points.at(-1) ?? { x: 202, y: 46 };
  const resonanceCount = Math.min(Math.max(exactRhymes?.length ?? 0, 1), 3);

  return (
    <svg
      className="constellation-soundwave constellation-result-arc"
      viewBox="0 0 220 92"
      role="img"
      aria-label={`Spectral soundwave of ${phonemes.length} phonemes with ${stressedCount} stressed nuclei`}
    >
      <desc>
        A mirrored cosmic waveform. Each vertical energy bar represents one phoneme; gold flares mark stress and the final rings show rhyme resonance.
      </desc>
      <defs>
        <radialGradient id="cos-wave-nebula-violet" cx="28%" cy="44%" r="58%">
          <stop offset="0%" stopColor="rgba(139, 124, 255, 0.3)" />
          <stop offset="100%" stopColor="rgba(139, 124, 255, 0)" />
        </radialGradient>
        <radialGradient id="cos-wave-nebula-blue" cx="76%" cy="58%" r="52%">
          <stop offset="0%" stopColor="rgba(207, 230, 255, 0.2)" />
          <stop offset="100%" stopColor="rgba(207, 230, 255, 0)" />
        </radialGradient>
        <linearGradient id="cos-wave-spectrum" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--cos-amethyst)" />
          <stop offset="52%" stopColor="var(--cos-arc)" />
          <stop offset="76%" stopColor="var(--cos-gold)" />
          <stop offset="100%" stopColor="var(--cos-arc)" />
        </linearGradient>
        <filter id="cos-wave-glow" x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="1.7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect className="constellation-soundwave__void" x="0" y="0" width="220" height="92" rx="4" />
      <rect x="0" y="0" width="220" height="92" fill="url(#cos-wave-nebula-violet)" />
      <rect x="0" y="0" width="220" height="92" fill="url(#cos-wave-nebula-blue)" />

      <g className="constellation-soundwave__dust" aria-hidden="true">
        {SOUNDWAVE_DUST.map((star, index) => (
          <circle
            key={index}
            cx={star.x}
            cy={star.y}
            r={star.radius}
            opacity={star.opacity}
          />
        ))}
      </g>

      <g className="constellation-soundwave__orbits" aria-hidden="true">
        <ellipse cx="110" cy="46" rx="86" ry="29" />
        <ellipse cx="110" cy="46" rx="57" ry="38" transform="rotate(-8 110 46)" />
      </g>

      <line className="constellation-soundwave__horizon" x1="8" y1="46" x2="212" y2="46" />

      <g className="constellation-soundwave__constellation" aria-hidden="true">
        {points.slice(0, -1).map((point, index) => (
          <line
            key={`${point.id}-chord`}
            x1={point.x}
            y1={point.y}
            x2={points[index + 1].x}
            y2={points[index + 1].y}
            className="constellation-soundwave__chord constellation-result-arc__edge"
          />
        ))}
      </g>

      <g className="constellation-soundwave__energy-bars">
        {points.map((point) => {
          const mirrorY = 92 - point.y;
          return (
            <line
              key={point.id}
              x1={point.x}
              y1={Math.min(point.y, mirrorY)}
              x2={point.x}
              y2={Math.max(point.y, mirrorY)}
              data-stressed={String(point.stressed)}
            />
          );
        })}
      </g>

      <path className="constellation-soundwave__wave constellation-soundwave__wave--echo" d={mirrorPath} pathLength="1" />
      <path className="constellation-soundwave__wave constellation-soundwave__wave--core" d={wavePath} pathLength="1" />

      <g className="constellation-soundwave__nodes">
        {points.map((point) => point.stressed ? (
          <path
            key={point.id}
            d={SPARK_PATH}
            transform={`translate(${point.x} ${point.y}) scale(1.45)`}
            className="constellation-soundwave__stress constellation-result-arc__spark"
          />
        ) : (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r="1.15"
            className="constellation-soundwave__node constellation-result-arc__node"
          />
        ))}
      </g>

      <g className="constellation-soundwave__resonance" aria-hidden="true">
        {Array.from({ length: resonanceCount }, (_, index) => (
          <circle
            key={index}
            cx={resonanceOrigin.x}
            cy={resonanceOrigin.y}
            r={5 + index * 5}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * The sound figure. `variant === 'arc'` renders the authoritative phoneme
 * sequence as a mirrored spectral nebula waveform; `variant === 'dots'`
 * retains the quiet deterministic fallback.
 */
function SoundBody({ rhymeAstrology, variant }) {
  if (!rhymeAstrology) {
    return <p className="constellation-result-awaiting">Awaiting engine — Rhyme Astrology</p>;
  }
  return (
    <>
      <table className="constellation-result-table">
        <caption className="constellation-result-sr-only">Rhyme astrology data</caption>
        <tbody>
          <tr>
            <th scope="row">Phonemes</th>
            <td>{rhymeAstrology.phonemes.join(' · ')}</td>
          </tr>
          {rhymeAstrology.ipa ? (
            <tr>
              <th scope="row">IPA</th>
              <td className="constellation-result-ipa">{rhymeAstrology.ipa}</td>
            </tr>
          ) : null}
          <tr>
            <th scope="row">Stress</th>
            <td>{rhymeAstrology.stress}</td>
          </tr>
          <tr>
            <th scope="row">Cadence</th>
            <td>{rhymeAstrology.cadenceFamily}</td>
          </tr>
          {rhymeAstrology.dominantVowelFamily ? (
            <tr>
              <th scope="row">Vowel family</th>
              <td>{rhymeAstrology.dominantVowelFamily}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {variant === 'arc' ? (
        <CosmicSoundwave
          phonemes={rhymeAstrology.phonemes}
          exactRhymes={rhymeAstrology.exactRhymes}
        />
      ) : (
        <svg
          className="constellation-result-rhyme-chart"
          viewBox="0 0 100 24"
          role="img"
          aria-label={`Phoneme constellation (${rhymeAstrology.phonemes.length} nodes)`}
        >
          {rhymeAstrology.phonemes.map((_, index) => {
            const x = rhymeAstrology.phonemes.length === 1
              ? 50
              : (index / (rhymeAstrology.phonemes.length - 1)) * 90 + 5;
            return (
              <circle
                key={index}
                cx={x}
                cy={12}
                r={1.8}
                className="constellation-result-rhyme-node"
              />
            );
          })}
        </svg>
      )}
      <Chips items={rhymeAstrology.exactRhymes} label="Exact rhymes" tone="rhyme" />
      <Chips items={rhymeAstrology.slantRhymes} label="Slant rhymes" tone="slant" />
    </>
  );
}

function GenomeBody({ phraseGenome }) {
  const hasGenome =
    phraseGenome.syllables > 0 ||
    phraseGenome.devicesHint.length > 0 ||
    phraseGenome.schoolHint != null;
  if (!hasGenome) {
    return <p className="constellation-result-awaiting">Awaiting engine — Phrase Genome</p>;
  }
  return (
    <dl className="constellation-result-dl">
      <div>
        <dt>Syllables</dt>
        <dd>{phraseGenome.syllables}</dd>
      </div>
      {phraseGenome.devicesHint.length > 0 ? (
        <div>
          <dt>Devices</dt>
          <dd>{phraseGenome.devicesHint.join(', ')}</dd>
        </div>
      ) : null}
      {phraseGenome.schoolHint ? (
        <div>
          <dt>School</dt>
          <dd className="constellation-result-school">{phraseGenome.schoolHint}</dd>
        </div>
      ) : null}
    </dl>
  );
}


/* ─── The scale field: where the word sits on its axis, and among what ──────
   PAINTS ONLY. Every position, span and similarity is computed backend-side and
   travels in the packet; nothing here recomputes a rank. A missing scale is a
   real answer — most neighbourhoods are flat (14,101 clusters carry no vertical
   against 423 that do) — so it is rendered as such, not hidden. */
function ScaleFieldBody({ scaleField }) {
  if (!scaleField || scaleField.status !== 'ok') {
    return <p className="constellation-result-awaiting">Awaiting engine — Scale Field</p>;
  }
  const { scale, neighbours = [], opposites = [] } = scaleField;
  return (
    <div className="constellation-scalefield">
      {scale && scale.ladder?.length > 1 ? (
        <div className="constellation-scalefield__ladder">
          <div className="constellation-scalefield__axis" aria-hidden="true" />
          <ol className="constellation-scalefield__rungs">
            {scale.ladder.map((step) => (
              <li
                key={step.word}
                className={[
                  'constellation-scalefield__rung',
                  step.isAnchor ? 'constellation-scalefield__rung--anchor' : '',
                ].filter(Boolean).join(' ')}
                /* The backend's own relative position, painted verbatim. */
                style={{ '--rung-at': step.relative }}
              >
                <span className="constellation-scalefield__word">{step.word}</span>
                <span className="constellation-scalefield__at">{step.relative.toFixed(2)}</span>
              </li>
            ))}
          </ol>
          {/* Span is shown because scales differ in vertical extent by up to 16x;
              a position without it invites a meaningless cross-scale comparison. */}
          <p className="constellation-scalefield__span">
            axis span {scale.span == null ? '—' : scale.span.toFixed(2)} · {scale.memberCount} words on this axis
          </p>
        </div>
      ) : (
        <p className="constellation-result-awaiting">
          No axis — this neighbourhood has no degree to measure along.
        </p>
      )}

      {neighbours.length > 0 ? (
        <Chips
          label="Field"
          tone="kin"
          /* Sound is shown when it was measured — for synonyms it is the only
             axis that discriminates, since they share a synset and read 1.00. */
          items={neighbours.map((n) => (
            n.soundSimilarity == null
              ? `${n.word} ${n.similarity.toFixed(2)}`
              : `${n.word} ${n.similarity.toFixed(2)} ♪${n.soundSimilarity.toFixed(2)}`
          ))}
        />
      ) : null}
      {opposites.length > 0 ? <Chips label="Opposed" tone="counter" items={opposites} /> : null}
    </div>
  );
}


/* ─── Readings: what the phrase's specialists each concluded ────────────────
   PAINTS ONLY. Contest, roles and rationales all arrive decided in the packet.
   A contested phrase is SHOWN as contested — that is the point of the channel,
   not a defect to hide behind a single answer. */
function ReadingsBody({ readings }) {
  if (!readings || !readings.readings?.length) {
    return <p className="constellation-result-awaiting">Awaiting engine — Readings</p>;
  }
  const candidates = readings.readings.filter((r) => r.candidate);
  const context = readings.readings.filter((r) => !r.candidate);
  return (
    <div className="constellation-readings">
      <p className={[
        'constellation-readings__verdict',
        readings.contested ? 'constellation-readings__verdict--contested' : '',
      ].filter(Boolean).join(' ')}>
        {readings.contested
          ? 'This line reads two ways — the specialists disagree on what it is about.'
          : 'The specialists agree on what this line is about.'}
      </p>
      <ul className="constellation-readings__list">
        {candidates.map((r) => (
          <li key={`${r.anchor}-${r.role}`} className="constellation-readings__item">
            <span className="constellation-readings__anchor">{r.anchor}</span>
            <span className="constellation-readings__role">{r.role.replace(/-/g, ' ')}</span>
            <span className="constellation-readings__why">{r.rationale}</span>
          </li>
        ))}
      </ul>
      {context.length > 0 ? (
        <ul className="constellation-readings__list constellation-readings__list--context">
          {context.map((r) => (
            <li key={`${r.anchor}-${r.role}`} className="constellation-readings__item">
              <span className="constellation-readings__anchor">{r.anchor}</span>
              <span className="constellation-readings__role">{r.role.replace(/-/g, ' ')}</span>
              <span className="constellation-readings__why">{r.rationale}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Phrase roles/devices from packet.phraseStructure — map fields only. */
function PhraseStructureChips({ phraseStructure }) {
  if (!phraseStructure) return null;
  const compounds = Array.isArray(phraseStructure.compounds) ? phraseStructure.compounds : [];
  const devices = Array.isArray(phraseStructure.devices) ? phraseStructure.devices : [];
  const hasAny =
    phraseStructure.intent ||
    phraseStructure.headToken ||
    compounds.length > 0 ||
    devices.length > 0;
  if (!hasAny) return null;
  return (
    <dl className="constellation-result-dl constellation-result-phrase-structure" data-testid="constellation-phrase-structure">
      {phraseStructure.intent ? (
        <div>
          <dt>Intent</dt>
          <dd>{phraseStructure.intent}</dd>
        </div>
      ) : null}
      {phraseStructure.headToken ? (
        <div>
          <dt>Head</dt>
          <dd>{phraseStructure.headToken}</dd>
        </div>
      ) : null}
      {compounds.length > 0 ? (
        <div>
          <dt>Compounds</dt>
          <dd>{compounds.join(', ')}</dd>
        </div>
      ) : null}
      {devices.length > 0 ? (
        <div>
          <dt>Devices</dt>
          <dd>{devices.join(', ')}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * Discovery Field — ranked kin from packet.discovery. Client maps fields only;
 * no frontend re-ranking or invented hits.
 */
function DiscoveryBody({ discovery }) {
  if (!discovery) return null;
  const hits = Array.isArray(discovery.hits) ? discovery.hits : [];
  const seeds = Array.isArray(discovery.seeds) ? discovery.seeds : [];
  const rhymeWith = discovery.constraints?.rhymeWith ?? null;
  const warnings = Array.isArray(discovery.warnings) ? discovery.warnings : [];

  return (
    <>
      <ul className="constellation-result-masthead-chips" aria-label="Discovery mode">
        {discovery.mode ? (
          <li className="constellation-result-masthead-chip constellation-result-masthead-chip--intent">
            {discovery.mode}
          </li>
        ) : null}
        {discovery.status ? (
          <li className="constellation-result-masthead-chip">{discovery.status}</li>
        ) : null}
        {discovery.relation && discovery.relation !== 'unknown' ? (
          <li className="constellation-result-masthead-chip">{discovery.relation}</li>
        ) : null}
      </ul>
      {seeds.length > 0 ? <Chips items={seeds} label="Seeds" tone="kin" /> : null}
      {rhymeWith ? (
        <p className="constellation-result-discovery-constraint">
          Rhyme with <span className="constellation-result-mono">{rhymeWith}</span>
        </p>
      ) : null}
      {hits.length > 0 ? (
        <ol className="constellation-result-discovery-hits" data-testid="constellation-discovery-hits">
          {hits.map((hit) => {
            const badges = Array.isArray(hit.badges) ? hit.badges : [];
            const firstReason =
              Array.isArray(hit.reasons) && hit.reasons.length > 0 ? hit.reasons[0] : null;
            const scoreText =
              typeof hit.score === 'number' && Number.isFinite(hit.score)
                ? hit.score.toFixed(3)
                : String(hit.score ?? '');
            return (
              <li key={hit.token} className="constellation-result-discovery-hit">
                <span className="constellation-result-discovery-hit__token">{hit.token}</span>
                <span className="constellation-result-confidence">{scoreText}</span>
                {badges.length > 0 ? (
                  <ul className="constellation-result-discovery-badges" aria-label="Evidence badges">
                    {badges.map((b) => (
                      <li key={b} className="constellation-result-discovery-badge">
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {firstReason ? (
                  <span className="constellation-result-discovery-hit__reason">{firstReason}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="constellation-result-awaiting" data-testid="constellation-discovery-empty">
          No local kin found for this inquiry
        </p>
      )}
      {warnings.length > 0 ? (
        <ul className="constellation-result-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/* ─── The hero figure: the answer drawn as a living constellation ──────────
   Pure geometry from `heroFigure(packet)`; the seed touches only the lodestar
   and per-star twinkle. Gold is reserved for the single lodestar nucleus — every
   other star takes the rarity temperature color. Reduced motion drops twinkle. */
function HeroFigure({ packet, reducedMotion }) {
  const fig = heroFigure(packet);
  // SCDL owns the invariant star vocabulary; SPARK_PATH is the deterministic
  // fallback when the compiled glyph is unavailable (see skyChart.js heroStarGlyph()).
  const glyph = heroStarGlyph();
  const starPath = glyph?.fills?.[0]?.d ?? SPARK_PATH;
  return (
    <svg
      className="constellation-result-hero"
      viewBox={fig.viewBox}
      role="img"
      aria-label={`Constellation of the answer — ${fig.nodes.length} stars, spectral class ${fig.spectralClass}${fig.degraded ? ', partial sky' : ''}`}
      data-degraded={String(fig.degraded)}
    >
      {fig.edges.map(([a, b]) => (
        <line
          key={`e${a}-${b}`}
          x1={fig.nodes[a].x} y1={fig.nodes[a].y}
          x2={fig.nodes[b].x} y2={fig.nodes[b].y}
          className="constellation-result-hero__edge"
        />
      ))}
      {fig.nodes.map((nd, i) => {
        const twinkle = reducedMotion
          ? undefined
          : (() => {
              const t = twinkleFor(fig.seed, i);
              return { animationDelay: `${t.delaySec}s`, animationDuration: `${t.durationSec}s` };
            })();
        if (nd.isLodestar) {
          return (
            <path
              key={nd.id}
              d={starPath}
              transform={`translate(${nd.x} ${nd.y}) scale(${2.4 * nd.magnitude})`}
              className="constellation-result-hero__spark constellation-result-hero__lodestar"
              style={twinkle}
            />
          );
        }
        if (nd.stressed || nd.isVowel) {
          return (
            <path
              key={nd.id}
              d={starPath}
              transform={`translate(${nd.x} ${nd.y}) scale(${1.4 * nd.magnitude})`}
              className="constellation-result-hero__spark"
              style={{ ...twinkle, fill: nd.color }}
            />
          );
        }
        return (
          <circle
            key={nd.id}
            cx={nd.x} cy={nd.y} r={0.9 + nd.magnitude}
            className="constellation-result-hero__star"
            style={{ ...twinkle, fill: nd.color }}
          />
        );
      })}
    </svg>
  );
}

/**
 * Failure stays local (PDR §7.8): a throw anywhere in the generated hero figure
 * renders nothing there and never takes the rest of the answer down.
 *
 * LOCAL IN SPACE, NOT IN TIME. A boundary that only ever latches `failed` is
 * local to the render and permanent for the session: this instance is not keyed
 * or remounted between queries, so one bad packet blanked the figure for every
 * packet after it. `resetKey` is the page bytecode — a new answer is a new
 * chance, and a figure that fails for one query does not condemn the next.
 *
 * AND IT SAYS SO. `getDerivedStateFromError` alone swallows the error outright in
 * a production build: no console, no diagnostics, an empty plate and no way to
 * learn why. Every adapter failure in this system declares itself; a presentation
 * failure that declares nothing is the one blind spot left.
 */
class HeroFigureBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError() { return { failed: true }; }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey === state.resetKey) return null;
    return { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error, info) {
    // The only channel a client-side presentation failure has. Silence here is
    // what made this invisible in a production build: no console, no
    // diagnostics, an empty plate and no way to learn why.
    console.error('[ConstellationOS] hero figure failed to render', error, info?.componentStack);
  }

  render() { return this.state.failed ? null : this.props.children; }
}

/* ─── The composed presentation ────────────────────────────────────────── */

/**
 * The bespoke answer plate. `scene` is the validated PB-UI-SCENE-v1; its
 * checksum is stamped on the root so the reader can verify the presentation
 * contract that sealed this rendering. Plates are tagged with their declared
 * anatomy part and rise on a bytecode-seeded cascade.
 */
function ComposedResultShell({ packet, scene, reducedMotion }) {
  const { query, leximancy, rhymeAstrology, phraseGenome, pageBytecode, provenance, diagnostics } = packet;
  const semanticInquiry = packet.semanticInquiry ?? null;
  const phraseStructure = packet.phraseStructure ?? null;
  const discovery = packet.discovery ?? null;
  const engineVersions = provenance?.engineVersions ?? {};
  const degraded = diagnostics?.degradedChannels ?? [];

  const isDegraded = degraded.length > 0;
  const isHeteronym = Boolean(semanticInquiry?.isHeteronym);
  const isEvidenced = Boolean(semanticInquiry?.selection?.warranted);

  const reveal = (index) =>
    reducedMotion ? undefined : { animationDelay: `${plateRevealFor(pageBytecode, index).delaySec}s` };

  const heroSeed = fnv1a32(pageBytecode || 'COS-HERO-v1');
  const goldPulse = (i) =>
    reducedMotion ? undefined : { animationDelay: `${twinkleFor(heroSeed, i).delaySec}s` };

  let plateIndex = 0;
  const nextReveal = () => reveal(plateIndex++);

  return (
    <div
      id="constellation-result-shell"
      className="constellation-result-shell constellation-result-shell--composed"
      role="article"
      aria-labelledby="cos-masthead-query"
      data-compose-kind={CONSTELLATION_RESULT_KIND}
      data-compose-version={CONSTELLATION_RESULT_VERSION}
      data-compose-scene={scene.sourceChecksum}
      data-state-degraded={String(isDegraded)}
      data-state-heteronym={String(isHeteronym)}
      data-state-evidenced={String(isEvidenced)}
    >
      {isDegraded ? (
        <p className="constellation-result-degraded" role="status">
          Partial sky — {degraded.join(', ')} unavailable. Other channels are shown in full.
        </p>
      ) : null}

      {/* ── Plate 0 · Hero figure: the answer as a living constellation ── */}
      <section
        className="constellation-result-plate constellation-result-plate--hero"
        data-compose-part="hero-figure"
        aria-label="Sound-bones constellation figure"
        style={nextReveal()}
      >
        <HeroFigureBoundary resetKey={pageBytecode}>
          <HeroFigure packet={packet} reducedMotion={reducedMotion} />
        </HeroFigureBoundary>
      </section>

      {/* ── Plate I · Masthead: the query as asked ── */}
      <section
        className="constellation-result-plate constellation-result-plate--masthead"
        data-compose-part="masthead"
        aria-labelledby="cos-masthead-query"
        style={nextReveal()}
      >
        <h2 id="cos-masthead-query" className="constellation-result-plate__overline">Phrase Identity</h2>
        <p className="constellation-result-masthead-query">{query.raw}</p>
        <ul className="constellation-result-masthead-chips" aria-label="Query classification">
          <li className="constellation-result-masthead-chip">{query.kind}</li>
          {query.intent ? (
            <li className="constellation-result-masthead-chip constellation-result-masthead-chip--intent">
              {query.intent}
            </li>
          ) : null}
        </ul>
        <PhraseStructureChips phraseStructure={phraseStructure} />
        <IdentityDl query={query} leximancy={leximancy} phraseGenome={phraseGenome} pageBytecode={pageBytecode} />
      </section>

      {/* ── Discovery Field: meta-query kin plate (before Leximancy) ── */}
      {discovery != null ? (
        <section
          className="constellation-result-plate"
          data-compose-part="discovery-field"
          aria-labelledby="cos-discovery"
          style={nextReveal()}
        >
          <h2 id="cos-discovery" className="constellation-result-plate__overline">Discovery Field</h2>
          <DiscoveryBody discovery={discovery} />
        </section>
      ) : null}

      {/* ── Plate II · Meaning field ── */}
      <section
        className="constellation-result-plate"
        data-compose-part="meaning-field"
        aria-labelledby="cos-leximancy"
        style={nextReveal()}
      >
        <h2 id="cos-leximancy" className="constellation-result-plate__overline">Leximancy Meaning Field</h2>
        <MeaningBody leximancy={leximancy} semanticInquiry={semanticInquiry} query={query} />
      </section>

      {/* ── Plate III · Sound field ── */}
      <section
        className="constellation-result-plate"
        data-compose-part="sound-field"
        aria-labelledby="cos-rhyme"
        style={nextReveal()}
      >
        <h2 id="cos-rhyme" className="constellation-result-plate__overline">Rhyme Constellation</h2>
        <SoundBody rhymeAstrology={rhymeAstrology} variant="arc" />
      </section>

      {/* ── Plate IV · Genome ── */}
      <section
        className="constellation-result-plate"
        data-compose-part="genome-field"
        aria-labelledby="cos-genome"
        style={nextReveal()}
      >
        <h2 id="cos-genome" className="constellation-result-plate__overline">Phrase Genome</h2>
        <GenomeBody phraseGenome={phraseGenome} />
      </section>

      {/* ── Plate IV·a · Readings: how many ways this line parses ── */}
      {packet.readings?.readings?.length ? (
        <section
          className="constellation-result-plate"
          data-compose-part="readings"
          aria-labelledby="cos-readings"
          style={nextReveal()}
        >
          <h2 id="cos-readings" className="constellation-result-plate__overline">Readings</h2>
          <ReadingsBody readings={packet.readings} />
        </section>
      ) : null}

      {/* ── Plate IV·b · Scale Field: the axis this word sits on ── */}
      {packet.scaleField ? (
        <section
          className="constellation-result-plate"
          data-compose-part="scale-field"
          aria-labelledby="cos-scale"
          style={nextReveal()}
        >
          <h2 id="cos-scale" className="constellation-result-plate__overline">Scale Field</h2>
          <ScaleFieldBody scaleField={packet.scaleField} />
        </section>
      ) : null}

      {/* ── Plate V · Verdict: was the pick evidenced? (only when the channel ran) ── */}
      {semanticInquiry ? (
        <section
          className="constellation-result-plate constellation-result-plate--verdict"
          data-compose-part="verdict-field"
          aria-labelledby="cos-verdict"
          style={nextReveal()}
        >
          <h2 id="cos-verdict" className="constellation-result-plate__overline">Semantic Verdict</h2>
          <p className="constellation-result-verdict-line">
            {isEvidenced ? (
              <>
                <span className="constellation-result-verdict-mark" aria-hidden="true" style={goldPulse(101)}>✦</span> Sense chosen on evidence —{' '}
                {semanticInquiry.selection.overlap} shared word
                {semanticInquiry.selection.overlap === 1 ? '' : 's'} with the context.
              </>
            ) : isHeteronym ? (
              'Refused — the spelling is two words and nothing in the query chose between them.'
            ) : (
              'Default reading — the context did not warrant a different pick.'
            )}
          </p>
          {semanticInquiry.distinctPronunciations != null ? (
            <p className="constellation-result-verdict-sub">
              {semanticInquiry.distinctPronunciations} distinct pronunciation
              {semanticInquiry.distinctPronunciations === 1 ? '' : 's'} on record
              {semanticInquiry.framePos ? ` · settled by ${semanticInquiry.frameCue}` : ''}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Plate VI · Provenance seal ── */}
      <section
        className="constellation-result-plate constellation-result-plate--provenance"
        data-compose-part="provenance-seal"
        aria-labelledby="cos-provenance"
        style={nextReveal()}
      >
        <h2 id="cos-provenance" className="constellation-result-plate__overline">Provenance</h2>
        <p className="constellation-result-seal" aria-label="Page bytecode">
          <span className="constellation-result-seal__glyph" aria-hidden="true" style={goldPulse(202)}>❖</span>
          <span className="constellation-result-mono">{pageBytecode}</span>
        </p>
        <VersionsList engineVersions={engineVersions} />
      </section>
    </div>
  );
}

/* ─── The deterministic fallback ───────────────────────────────────────── */

/**
 * Byte-for-byte the pre-Compose rendering. Reached only when the scene contract
 * fails validation, so a broken contract degrades the presentation — never the
 * answer (PDR §7.8).
 */
function PlainResultShell({ packet }) {
  const { query, leximancy, rhymeAstrology, phraseGenome, pageBytecode, provenance, diagnostics } = packet;
  const semanticInquiry = packet.semanticInquiry ?? null;
  const discovery = packet.discovery ?? null;
  const engineVersions = provenance?.engineVersions ?? {};
  const degraded = diagnostics?.degradedChannels ?? [];

  return (
    <div id="constellation-result-shell" className="constellation-result-shell">
      {degraded.length > 0 ? (
        <p className="constellation-result-degraded" role="status">
          Partial sky — {degraded.join(', ')} unavailable. Other channels are shown in full.
        </p>
      ) : null}

      <section className="constellation-result-section" aria-labelledby="cos-phrase-identity">
        <h2 id="cos-phrase-identity">Phrase Identity</h2>
        <IdentityDl query={query} leximancy={leximancy} phraseGenome={phraseGenome} pageBytecode={pageBytecode} />
        <VersionsList engineVersions={engineVersions} />
      </section>

      {discovery != null ? (
        <section className="constellation-result-section" aria-labelledby="cos-discovery">
          <h2 id="cos-discovery">Discovery Field</h2>
          <DiscoveryBody discovery={discovery} />
        </section>
      ) : null}

      <section className="constellation-result-section" aria-labelledby="cos-leximancy">
        <h2 id="cos-leximancy">Leximancy Meaning Field</h2>
        <MeaningBody leximancy={leximancy} semanticInquiry={semanticInquiry} query={query} />
      </section>

      <section className="constellation-result-section" aria-labelledby="cos-rhyme">
        <h2 id="cos-rhyme">Rhyme Constellation</h2>
        <SoundBody rhymeAstrology={rhymeAstrology} variant="dots" />
      </section>

      <section className="constellation-result-section" aria-labelledby="cos-genome">
        <h2 id="cos-genome">Phrase Genome</h2>
        <GenomeBody phraseGenome={phraseGenome} />
      </section>

      {packet.readings?.readings?.length ? (
        <section className="constellation-result-section" aria-labelledby="cos-readings">
          <h2 id="cos-readings">Readings</h2>
          <ReadingsBody readings={packet.readings} />
        </section>
      ) : null}

      {packet.scaleField ? (
        <section className="constellation-result-section" aria-labelledby="cos-scale">
          <h2 id="cos-scale">Scale Field</h2>
          <ScaleFieldBody scaleField={packet.scaleField} />
        </section>
      ) : null}
    </div>
  );
}

/* ─── The contract gate ────────────────────────────────────────────────── */

/**
 * @param {{ packet: import('./types.js').ConstellationPhase1Packet, reducedMotion?: boolean }} props
 */
export default function ConstellationResultShell({ packet, reducedMotion = false }) {
  // Validate the presentation contract once. The scene is a pure function of
  // frozen constants, so this is stable for the life of the bundle.
  const scene = useMemo(() => createConstellationResultScene(), []);
  const sceneValid = useMemo(() => validateComposeScene(scene).ok, [scene]);

  if (!sceneValid) {
    return <PlainResultShell packet={packet} />;
  }
  return <ComposedResultShell packet={packet} scene={scene} reducedMotion={reducedMotion} />;
}
