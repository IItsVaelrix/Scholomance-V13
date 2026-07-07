import { useState } from 'react';
import WordToolTip from './WordToolTip';
import './CombatRundownModal.css';

/**
 * CombatRundownModal
 * Grimoire-style modal for the Codex Reckoning post-combat exegesis.
 *
 * Props:
 *  - isOpen: boolean
 *  - rundown: object (returned by buildCombatRundown)
 *  - onClose: function
 *  - onRestart: function
 */
export default function CombatRundownModal({ isOpen, rundown, onClose, onRestart }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen || !rundown) return null;

  const { result, grade, stats, mostImpressiveSpell, oracleMessage } = rundown;
  const isVictory = result === 'victory';

  const breakdown = mostImpressiveSpell?.scoreComponents || null;

  // Render Oracle message and substitute the keyword with WordToolTip inline
  const renderOracleMessage = (message, word, tooltip) => {
    if (!message || !word || !tooltip) return message;
    // Case-insensitive replacement to find the word safely
    const index = message.toUpperCase().indexOf(word.toUpperCase());
    if (index === -1) {
      return (
        <>
          {message}{' '}
          <WordToolTip term={word} category={tooltip.category} definition={tooltip.body || tooltip.definition} />
        </>
      );
    }

    const before = message.slice(0, index);
    const matchedWord = message.slice(index, index + word.length);
    const after = message.slice(index + word.length);

    return (
      <>
        {before}
        <WordToolTip term={matchedWord} category={tooltip.category} definition={tooltip.body || tooltip.definition} />
        {after}
      </>
    );
  };

  return (
    <div className="rundown-modal-backdrop">
      <div className="rundown-modal-container" role="dialog" aria-modal="true" aria-labelledby="rundown-title">

        {/* Arcane Corners */}
        <div className="modal-corner tl" />
        <div className="modal-corner tr" />
        <div className="modal-corner bl" />
        <div className="modal-corner br" />

        <button className="rundown-modal-close" onClick={onClose} aria-label="Close modal">×</button>

        <div className="rundown-modal-inner">

          {/* Header */}
          <div className="rundown-header-section">
            <h1 id="rundown-title" className={`rundown-modal-result-title ${isVictory ? 'victory' : 'defeat'}`}>
              {isVictory ? 'THE RITE IS CONCLUDED' : 'THE RITE HAS FAILED'}
            </h1>
            <p className="rundown-modal-subtitle">
              {isVictory ? 'Reality has settled around your verbal law.' : 'Your incantation decayed into void entropy.'}
            </p>
          </div>

          <div className="rundown-divider" />

          {/* Core exegesis block */}
          <div className="rundown-summary-row">
            {/* Grade Seal */}
            <div className="rundown-grade-chamber">
              <span className="rundown-grade-label">CODEX GRADE</span>
              <div className={`rundown-grade-seal ${grade.toLowerCase()}`}>
                {grade}
              </div>
            </div>

            {/* Combat Stats Grid */}
            <div className="rundown-stats-grid">
              <div className="rundown-stat-row">
                <span className="rundown-stat-label">TURNS SPENT</span>
                <span className="rundown-stat-value">{stats.turnsTaken}</span>
              </div>
              <div className="rundown-stat-row">
                <span className="rundown-stat-label">TOTAL DAMAGE</span>
                <span className="rundown-stat-value">{stats.totalDamageDealt}</span>
              </div>
              <div className="rundown-stat-row">
                <span className="rundown-stat-label">DAMAGE TAKEN</span>
                <span className="rundown-stat-value">{stats.totalDamageTaken}</span>
              </div>
              <div className="rundown-stat-row">
                <span className="rundown-stat-label">LEYLINES EXTRACTED</span>
                <span className="rundown-stat-value">{stats.leylinesExtracted}</span>
              </div>
            </div>
          </div>

          <div className="rundown-divider" />

          {/* Most Impressive Spell */}
          {mostImpressiveSpell ? (
            <div className="rundown-impressive-section">
              <h3 className="rundown-section-title">MOST IMPRESSIVE VERSE</h3>
              <div className="rundown-spell-card">
                <blockquote className="rundown-spell-phrase">
                  {`"${mostImpressiveSpell.phrase}"`}
                </blockquote>

                <div className="rundown-spell-meta">
                  <div className="rundown-score-badge">
                    <span>Codex Rating:</span>
                    <strong className="rundown-score-val">{mostImpressiveSpell.codexScore} / 100</strong>
                  </div>

                  <div className="rundown-reasons-wrap">
                    {mostImpressiveSpell.reasons?.map((reason, idx) => (
                      <span key={idx} className="rundown-reason-badge">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Progressive Disclosure: Scored Components */}
                <div className="rundown-disclosure-area">
                  <button
                    type="button"
                    className="rundown-disclosure-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Hide Component Details ▲' : 'Inspect Scored Components ▼'}
                  </button>

                  {isExpanded && breakdown && (
                    <div className="rundown-breakdown-panel">
                      <div className="breakdown-row">
                        <span className="breakdown-label">Kinetic Output (Damage)</span>
                        <div className="breakdown-meter-wrap">
                          <div className="breakdown-meter" style={{ width: `${breakdown.damageScore}%` }} />
                          <span className="breakdown-value">{Math.round(breakdown.damageScore)} / 100</span>
                        </div>
                      </div>
                      <div className="breakdown-row">
                        <span className="breakdown-label">Vital Preservation (Healing)</span>
                        <div className="breakdown-meter-wrap">
                          <div className="breakdown-meter" style={{ width: `${breakdown.healingScore}%` }} />
                          <span className="breakdown-value">{Math.round(breakdown.healingScore)} / 100</span>
                        </div>
                      </div>
                      <div className="breakdown-row">
                        <span className="breakdown-label">Rhyme Architecture</span>
                        <div className="breakdown-meter-wrap">
                          <div className="breakdown-meter" style={{ width: `${breakdown.rhymeScore}%` }} />
                          <span className="breakdown-value">{Math.round(breakdown.rhymeScore)} / 100</span>
                        </div>
                      </div>
                      <div className="breakdown-row">
                        <span className="breakdown-label">VerseIR Novelty</span>
                        <div className="breakdown-meter-wrap">
                          <div className="breakdown-meter" style={{ width: `${breakdown.verseIRScore}%` }} />
                          <span className="breakdown-value">{Math.round(breakdown.verseIRScore)} / 100</span>
                        </div>
                      </div>
                      <div className="breakdown-row">
                        <span className="breakdown-label">Leyline Supercharge</span>
                        <div className="breakdown-meter-wrap">
                          <div className="breakdown-meter" style={{ width: `${breakdown.leylineScore}%` }} />
                          <span className="breakdown-value">{Math.round(breakdown.leylineScore)} / 100</span>
                        </div>
                      </div>
                      <div className="breakdown-row">
                        <span className="breakdown-label">Clutch Correction</span>
                        <div className="breakdown-meter-wrap">
                          <div className="breakdown-meter" style={{ width: `${breakdown.clutchScore}%` }} />
                          <span className="breakdown-value">{Math.round(breakdown.clutchScore)} / 100</span>
                        </div>
                      </div>
                      <div className="breakdown-row">
                        <span className="breakdown-label">Baseline Efficiency</span>
                        <div className="breakdown-meter-wrap">
                          <div className="breakdown-meter" style={{ width: `${breakdown.efficiencyScore}%` }} />
                          <span className="breakdown-value">{Math.round(breakdown.efficiencyScore)} / 100</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rundown-impressive-section">
              <p className="rundown-no-spells">No linguistic law was written during this rite.</p>
            </div>
          )}

          {/* Oracle Marginalia */}
          {oracleMessage && oracleMessage.triggered && (
            <>
              <div className="rundown-divider" />
              <div className="rundown-oracle-section">
                <h3 className="rundown-section-title oracle">{"THE ORACLE'S MARGINALIA"}</h3>
                <div className="rundown-oracle-card">
                  <p className="rundown-oracle-msg">
                    {renderOracleMessage(oracleMessage.message, oracleMessage.word, oracleMessage.tooltip)}
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="rundown-divider" />

          {/* Actions */}
          <div className="rundown-footer-actions">
            {onRestart && (
              <button type="button" className="btn btn-primary rundown-btn" onClick={onRestart}>
                Begin a new combat rite
              </button>
            )}
            <button type="button" className="btn btn-secondary rundown-btn close-btn" onClick={onClose}>
              Return to arena floor
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
