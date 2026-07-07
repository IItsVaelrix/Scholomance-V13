import { useEffect, useState } from 'react';
import styles from './DiscoveryFlash.module.css';

/** Total on-screen time (enter + hold + exit). */
export const DISCOVERY_FLASH_DURATION_MS = 3500;
const EXIT_MS = 420;

/**
 * Center-screen discovery banner for obelisk (and future) discoveries.
 */
export default function DiscoveryFlash({
  xpAmount = 100,
  reducedMotion = false,
  onComplete,
}) {
  const [phase, setPhase] = useState(reducedMotion ? 'visible' : 'enter');

  useEffect(() => {
    if (reducedMotion) {
      const done = window.setTimeout(() => onComplete?.(), DISCOVERY_FLASH_DURATION_MS);
      return () => window.clearTimeout(done);
    }

    const exitTimer = window.setTimeout(
      () => setPhase('exit'),
      DISCOVERY_FLASH_DURATION_MS - EXIT_MS,
    );
    const doneTimer = window.setTimeout(() => onComplete?.(), DISCOVERY_FLASH_DURATION_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete, reducedMotion]);

  return (
    <div
      className={`${styles.root} ${styles[phase]}`}
      style={{ '--discovery-duration': `${DISCOVERY_FLASH_DURATION_MS}ms` }}
      role="status"
      aria-live="polite"
      aria-label={`Discovery. Plus ${xpAmount} experience.`}
    >
      <div className={styles.backdrop} aria-hidden="true" />

      <article className={styles.panel}>
        <header className={styles.chromeHeader}>
          <span className={styles.chromeBadge}>Scholomance</span>
          <span className={styles.chromeLabel}>Discovery Event</span>
          <span className={styles.chromeDivider} aria-hidden="true" />
        </header>

        <div className={styles.panelBody}>
          <h2 className={styles.title}>DISCOVERY!</h2>
          <p className={styles.xp}>
            <span className={styles.xpValue}>+{xpAmount}</span>
            <span className={styles.xpUnit}>XP</span>
          </p>
        </div>

        <footer className={styles.chromeFooter} aria-hidden="true">
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} />
          </div>
        </footer>

        <span className={`${styles.corner} ${styles.cornerTl}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerTr}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBl}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />
      </article>
    </div>
  );
}