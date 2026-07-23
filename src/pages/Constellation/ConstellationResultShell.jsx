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

import { useMemo } from 'react';
import {
  createConstellationResultScene,
  CONSTELLATION_RESULT_KIND,
  CONSTELLATION_RESULT_VERSION,
} from '../../core/compose/migrated/ConstellationResult.ts';
import { validateComposeScene } from '../../core/compose/packets.ts';
import { phonemeArc, plateRevealFor, heroFigure, twinkleFor, fnv1a32, SPARK_PATH, heroStarGlyph } from './skyChart.js';

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

  return (
    <>
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

/**
 * The sound figure. `variant === 'arc'` draws the phonemes as an edged sky-arc
 * with stressed vowels ignited as gold sparks (the composed presentation);
 * `variant === 'dots'` draws the quiet flat row the fallback has always used.
 */
function SoundBody({ rhymeAstrology, variant }) {
  if (!rhymeAstrology) {
    return <p className="constellation-result-awaiting">Awaiting engine — Rhyme Astrology</p>;
  }
  const arc = phonemeArc(rhymeAstrology.phonemes);
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
        <svg
          className="constellation-result-arc"
          viewBox="0 0 100 34"
          role="img"
          aria-label={`Phoneme constellation (${arc.nodes.length} nodes)`}
        >
          {arc.edges.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={arc.nodes[a].x}
              y1={arc.nodes[a].y}
              x2={arc.nodes[b].x}
              y2={arc.nodes[b].y}
              className="constellation-result-arc__edge"
            />
          ))}
          {arc.nodes.map((nd, i) =>
            nd.stressed ? (
              <path
                key={i}
                d={SPARK_PATH}
                transform={`translate(${nd.x} ${nd.y}) scale(1.7)`}
                className="constellation-result-arc__spark"
              />
            ) : (
              <circle key={i} cx={nd.x} cy={nd.y} r={1.5} className="constellation-result-arc__node" />
            ),
          )}
        </svg>
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
        <HeroFigure packet={packet} reducedMotion={reducedMotion} />
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
        <IdentityDl query={query} leximancy={leximancy} phraseGenome={phraseGenome} pageBytecode={pageBytecode} />
      </section>

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
