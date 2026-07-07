import { useEffect, useState } from 'react';
import styles from './CombatResultsOverlay.module.css';

/** Delay before the results panel appears after victory fanfare. */
export const COMBAT_RESULTS_REVEAL_DELAY_MS = 2200;
const EXIT_MS = 360;

function gradeClassName(grade) {
  const normalized = String(grade || '').toLowerCase();
  return normalized === 's' ? styles['gradeChip--s'] : '';
}

function formatMetric(value, fallback = '—') {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  return String(value);
}

/**
 * Post-battle statistical results overlay — Scholomance chrome matching DiscoveryFlash.
 */
export default function CombatResultsOverlay({
  report,
  reducedMotion = false,
  onDismiss,
}) {
  const [phase, setPhase] = useState(reducedMotion ? 'visible' : 'enter');
  const [revealed, setRevealed] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return undefined;
    }

    const revealTimer = window.setTimeout(() => setRevealed(true), COMBAT_RESULTS_REVEAL_DELAY_MS);
    return () => window.clearTimeout(revealTimer);
  }, [reducedMotion]);

  const handleDismiss = () => {
    if (reducedMotion) {
      onDismiss?.();
      return;
    }
    setPhase('exit');
    window.setTimeout(() => onDismiss?.(), EXIT_MS);
  };

  if (!report || !revealed) return null;

  const metrics = report.metrics || {};
  const scholomanceBars = report.scholomanceHighlights?.combatStats || [];
  const xpTop = report.xpEarned?.topStats || [];

  return (
    <div
      className={`${styles.root} ${styles[phase]}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="combat-results-title"
      aria-describedby="combat-results-summary"
    >
      <div className={styles.backdrop} aria-hidden="true" onClick={handleDismiss} />

      <article className={styles.panel}>
        <header className={styles.chromeHeader}>
          <span className={styles.chromeBadge}>Scholomance</span>
          <span className={styles.chromeLabel}>Combat Prowess Report</span>
          <span
            className={`${styles.gradeChip} ${gradeClassName(report.grade)}`}
            aria-label={`Grade ${report.grade}`}
          >
            {report.grade}
          </span>
          <span className={styles.chromeDivider} aria-hidden="true" />
        </header>

        <div className={styles.panelBody}>
          <h2 id="combat-results-title" className={styles.title}>Victory</h2>
          <p className={styles.subtitle}>{report.gradeLabel}</p>
          <p id="combat-results-summary" className={styles.summary}>{report.summary}</p>

          <div className={styles.prowessRow} aria-label={`Prowess score ${report.prowessScore} out of 100`}>
            <div className={styles.prowessTrack}>
              <div
                className={styles.prowessFill}
                style={{ width: `${Math.max(0, Math.min(100, report.prowessScore || 0))}%` }}
              />
            </div>
            <span className={styles.prowessValue}>{report.prowessScore}</span>
          </div>

          {Array.isArray(report.meritTags) && report.meritTags.length > 0 && (
            <div className={styles.meritTags} aria-label="Combat merits">
              {report.meritTags.map((tag) => (
                <span key={tag} className={styles.meritTag}>{tag}</span>
              ))}
            </div>
          )}

          <section className={styles.section} aria-labelledby="combat-results-tactical">
            <h3 id="combat-results-tactical" className={styles.sectionTitle}>Tactical Ledger</h3>
            <div className={styles.metricGrid}>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Damage Dealt</span>
                <span className={`${styles.metricValue} ${styles['metricValue--cyan']}`}>
                  {formatMetric(metrics.damageDealt, '0')}
                </span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Damage Taken</span>
                <span className={`${styles.metricValue} ${styles['metricValue--gold']}`}>
                  {formatMetric(metrics.damageTaken, '0')}
                </span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Attacks Landed</span>
                <span className={styles.metricValue}>
                  {formatMetric(metrics.playerAttacksLanded, '0')}
                </span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Sentinels Down</span>
                <span className={`${styles.metricValue} ${styles['metricValue--green']}`}>
                  {formatMetric(metrics.sentinelsDefeated, '0')}/{formatMetric(metrics.sentinelTotal, '2')}
                </span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Tiles Moved</span>
                <span className={styles.metricValue}>{formatMetric(metrics.tilesMoved, '0')}</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Turns Ended</span>
                <span className={styles.metricValue}>{formatMetric(metrics.turnsEnded, '0')}</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>HP Remaining</span>
                <span className={`${styles.metricValue} ${styles['metricValue--green']}`}>
                  {formatMetric(report.vitals?.hpRemaining, '0')}/{formatMetric(report.vitals?.maxHp, '100')}
                </span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Tower Aggro</span>
                <span className={styles.metricValue}>
                  {metrics.aggroEvents > 0 ? `×${metrics.aggroSentinelCount}` : 'None'}
                </span>
              </div>
            </div>
          </section>

          {scholomanceBars.length > 0 && (
            <section className={styles.section} aria-labelledby="combat-results-scholomance">
              <h3 id="combat-results-scholomance" className={styles.sectionTitle}>Scholomance Attributes</h3>
              <div className={styles.statBars}>
                {scholomanceBars.map((entry) => (
                  <div key={entry.key} className={styles.statRow} title={entry.fullName}>
                    <span className={styles.statKey}>{entry.label}</span>
                    <div className={styles.statTrack}>
                      <div
                        className={styles.statFill}
                        style={{ width: `${Math.max(0, Math.min(100, entry.value || 0))}%` }}
                      />
                    </div>
                    <span className={styles.statValue}>{entry.value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.section} aria-labelledby="combat-results-xp">
            <h3 id="combat-results-xp" className={styles.sectionTitle}>Session XP</h3>
            <div className={styles.xpPanel}>
              <span className={styles.xpValue}>+{report.xpEarned?.total ?? 0}</span>
              <span className={styles.xpUnit}>XP</span>
            </div>
            {xpTop.length > 0 && (
              <div className={styles.xpBreakdown}>
                {xpTop.map((entry) => (
                  <span key={entry.stat} className={styles.xpStat}>
                    {entry.stat} +{entry.amount}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className={styles.chromeFooter}>
          <button type="button" className={styles.dismissBtn} onClick={handleDismiss}>
            OK
          </button>
        </footer>

        <span className={`${styles.corner} ${styles.cornerTl}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerTr}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBl}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />
      </article>
    </div>
  );
}