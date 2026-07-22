/**
 * @param {{ packet: import('./types.js').ConstellationPhase1Packet }} props
 */
export default function ConstellationResultShell({ packet }) {
  const { query, leximancy, rhymeAstrology, phraseGenome, pageBytecode, provenance } = packet;
  const engineVersions = provenance?.engineVersions ?? {};
  const hasLeximancy = leximancy.interpretations.length > 0;
  const hasRhyme = rhymeAstrology != null;
  const hasGenome =
    phraseGenome.syllables > 0 ||
    phraseGenome.devicesHint.length > 0 ||
    phraseGenome.schoolHint != null;

  return (
    <div id="constellation-result-shell" className="constellation-result-shell">
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
        {hasLeximancy ? (
          <>
            <ul className="constellation-result-interpretations">
              {leximancy.interpretations.map((item) => (
                <li key={item.id}>
                  <span className="constellation-result-gloss">{item.gloss}</span>
                  <span className="constellation-result-confidence">
                    {(item.confidence * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
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
                <tr>
                  <th scope="row">Stress</th>
                  <td>{rhymeAstrology.stress}</td>
                </tr>
                <tr>
                  <th scope="row">Cadence</th>
                  <td>{rhymeAstrology.cadenceFamily}</td>
                </tr>
                <tr>
                  <th scope="row">Exact rhymes</th>
                  <td>{rhymeAstrology.exactRhymes.join(', ')}</td>
                </tr>
                <tr>
                  <th scope="row">Slant rhymes</th>
                  <td>{rhymeAstrology.slantRhymes.join(', ')}</td>
                </tr>
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
                <dt>School hint</dt>
                <dd>{phraseGenome.schoolHint}</dd>
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
