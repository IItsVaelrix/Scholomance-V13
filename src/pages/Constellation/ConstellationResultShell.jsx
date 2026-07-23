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

/**
 * @param {{ packet: import('./types.js').ConstellationPhase1Packet }} props
 */
export default function ConstellationResultShell({ packet }) {
  const { query, leximancy, rhymeAstrology, phraseGenome, pageBytecode, provenance, diagnostics } = packet;
  // Older packets predate the channel, so every read below is optional.
  const semanticInquiry = packet.semanticInquiry ?? null;
  const engineVersions = provenance?.engineVersions ?? {};
  const degraded = diagnostics?.degradedChannels ?? [];
  const nearKin = leximancy.nearKin ?? [];
  const counterfield = leximancy.counterfield ?? [];
  const relations = leximancy.relations ?? { broader: [], narrower: [], akin: [] };
  const rarity = leximancy.rarity ?? null;
  const etymology = leximancy.etymology ?? null;
  const selectedInterpretation =
    leximancy.interpretations.find((i) => i.id === leximancy.selectedInterpretationId) || null;
  const hasLeximancy = leximancy.interpretations.length > 0;
  const hasRhyme = rhymeAstrology != null;
  const hasGenome =
    phraseGenome.syllables > 0 ||
    phraseGenome.devicesHint.length > 0 ||
    phraseGenome.schoolHint != null;

  return (
    <div id="constellation-result-shell" className="constellation-result-shell">
      {degraded.length > 0 ? (
        <p className="constellation-result-degraded" role="status">
          Partial sky — {degraded.join(', ')} unavailable. Other channels are shown in full.
        </p>
      ) : null}

      <section className="constellation-result-section" aria-labelledby="cos-phrase-identity">
        <h2 id="cos-phrase-identity">Phrase Identity</h2>
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
        <ul className="constellation-result-versions" aria-label="Engine versions">
          {Object.entries(engineVersions).map(([name, version]) => (
            <li key={name}>
              <span className="constellation-result-mono">{name}</span> {version}
            </li>
          ))}
        </ul>
      </section>

      <section className="constellation-result-section" aria-labelledby="cos-leximancy">
        <h2 id="cos-leximancy">Leximancy Meaning Field</h2>
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
      </section>

      <section className="constellation-result-section" aria-labelledby="cos-rhyme">
        <h2 id="cos-rhyme">Rhyme Constellation</h2>
        {hasRhyme ? (
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
            <Chips items={rhymeAstrology.exactRhymes} label="Exact rhymes" tone="rhyme" />
            <Chips items={rhymeAstrology.slantRhymes} label="Slant rhymes" tone="slant" />
          </>
        ) : (
          <p className="constellation-result-awaiting">Awaiting engine — Rhyme Astrology</p>
        )}
      </section>

      <section className="constellation-result-section" aria-labelledby="cos-genome">
        <h2 id="cos-genome">Phrase Genome</h2>
        {hasGenome ? (
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
        ) : (
          <p className="constellation-result-awaiting">Awaiting engine — Phrase Genome</p>
        )}
      </section>
    </div>
  );
}
