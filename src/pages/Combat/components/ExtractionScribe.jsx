// IMMUNE_ALLOW: LING-0F03
import { useState, useMemo } from 'react';
import { tokenize } from '../../../../codex/core/tokenizer.js';

/**
 * ExtractionScribe.jsx
 *
 * An interactive Verbal Alchemy editor for Leyline Extraction.
 * Replaces the OracleScribe panel when the scholar is harvesting a leyline.
 */
export default function ExtractionScribe({ leyline, onSubmit, isDisabled, variant = 'default' }) {
  const [phrase, setPhrase] = useState('');

  const { requiredTerms = [], requiredActions = [], forbiddenTerms = [], literaryConstraints = null, minScore } =
    leyline?.extractionProfile || {};

  const normalizedPhrase = useMemo(() => phrase.trim().toLowerCase(), [phrase]);
  const tokens = useMemo(() => tokenize(normalizedPhrase), [normalizedPhrase]);

  // Real-time criteria matching
  const termMatches = useMemo(() => {
    return requiredTerms.map((group) => {
      return group.some((synonym) => tokens.some((t) => t.includes(synonym)) || normalizedPhrase.includes(synonym));
    });
  }, [requiredTerms, tokens, normalizedPhrase]);

  const actionMatches = useMemo(() => {
    return requiredActions.map((group) => {
      return group.some((synonym) => tokens.some((t) => t.includes(synonym)) || normalizedPhrase.includes(synonym));
    });
  }, [requiredActions, tokens, normalizedPhrase]);

  const detectedForbidden = useMemo(() => {
    return forbiddenTerms.filter((term) => tokens.some((t) => t.includes(term)) || normalizedPhrase.includes(term));
  }, [forbiddenTerms, tokens, normalizedPhrase]);

  const canExtract = phrase.trim().length > 0 && !isDisabled;

  const handleSubmit = () => {
    if (canExtract) {
      onSubmit(phrase);
    }
  };

  const starRatingStr = '★'.repeat(leyline?.stars || 1) + '☆'.repeat(5 - (leyline?.stars || 1));
  const literaryLabel = literaryConstraints
    ? `${literaryConstraints.minRequired || 1} poetic device${(literaryConstraints.minRequired || 1) === 1 ? '' : 's'} required`
    : null;
  const literaryDevices = literaryConstraints?.allowed?.map((device) => device.replaceAll('_', ' ')) || [];

  return (
    <div className={`oracle-scribe battle-panel alchemical-scribe-root oracle-scribe--${variant}`}>
      <div className="scribe-header alchemical-header">
        <div className="scribe-label alchemical-title">
          LEYLINE HARVEST - {leyline?.codexId ? `${leyline.codexId} ` : ''}{leyline?.name || `${leyline?.affinity} ${leyline?.type?.toUpperCase().replace('-', ' ')}`}
        </div>
        <div className="leyline-stars" aria-label={`Difficulty: ${leyline?.stars} stars`}>
          {starRatingStr}
        </div>
      </div>

      <div className="alchemical-puzzle-box">
        <div className="puzzle-section-title">THE TRANSMUTATION TASK</div>
        <p className="alchemical-prompt">&quot;{leyline?.extractionProfile?.prompt}&quot;</p>
      </div>

      {literaryConstraints && (
        <div className="alchemical-poetics-box">
          <div className="puzzle-section-title">POETIC LOCK</div>
          <div className="poetics-summary">{literaryLabel}</div>
          <div className="poetics-device-row">
            {literaryDevices.map((device) => (
              <span key={device} className="poetics-device-chip">{device}</span>
            ))}
          </div>
          {literaryConstraints.requiresPolarityPair && (
            <div className="poetics-note">Requires a polarity pair.</div>
          )}
        </div>
      )}

      <div className="scribe-editor-stack">
        <div className="scribe-field verse-field">
          <div className="field-label">VERBAL ALCHEMY PHRASE</div>
          <div className="scribe-textarea-container">
            <textarea
              className="scribe-textarea alchemical-textarea"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              disabled={isDisabled}
              placeholder="Inscribe the transmutational formula..."
              aria-label="Verbal Alchemy phrase input"
            />
          </div>
        </div>
      </div>

      <div className="alchemical-checklist-container">
        <div className="puzzle-section-title">HARVEST CRITERIA</div>
        <ul className="alchemical-checklist">
          {requiredTerms.map((group, idx) => (
            <li key={`term-${idx}`} className={`checklist-item ${termMatches[idx] ? 'is-matched' : ''}`}>
              <span className="checklist-status-icon">{termMatches[idx] ? '✓' : '◌'}</span>
              <span className="checklist-text">Include a material term: <strong>{group.join(' / ')}</strong></span>
            </li>
          ))}
          {requiredActions.map((group, idx) => (
            <li key={`action-${idx}`} className={`checklist-item ${actionMatches[idx] ? 'is-matched' : ''}`}>
              <span className="checklist-status-icon">{actionMatches[idx] ? '✓' : '◌'}</span>
              <span className="checklist-text">Include a containment/action term: <strong>{group.join(' / ')}</strong></span>
            </li>
          ))}
          {forbiddenTerms.map((term) => {
            const warning = detectedForbidden.includes(term);
            return (
              <li key={`forbidden-${term}`} className={`checklist-item is-forbidden ${warning ? 'is-triggered' : ''}`}>
                <span className="checklist-status-icon">{warning ? '!' : '◌'}</span>
                <span className="checklist-text">Avoid direct concept: <strong>{term}</strong></span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="scribe-footer">
        <div className="scribe-metrics">
          <div className="metric-resonance">
            <span>TARGET COMPLEXITY</span>
            <div className="metric-bar alchemical-target-bar">
              <div className="metric-fill alchemical-target-fill" style={{ width: `${minScore * 100}%` }} />
            </div>
            <span className="target-score-badge">{(minScore * 100).toFixed(0)}%</span>
          </div>
        </div>
        <button className="scribe-cast-btn alchemical-harvest-btn" onClick={handleSubmit} disabled={!canExtract}>
          Harvest Leyline
        </button>
      </div>
    </div>
  );
}
