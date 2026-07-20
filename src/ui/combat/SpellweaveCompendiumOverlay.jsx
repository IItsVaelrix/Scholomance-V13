import { useMemo, useState } from 'react';
import styles from './SpellweaveCompendiumOverlay.module.css';
import { COMPENDIUM_ENTRIES } from '../../lib/combat/spellweaveCompendium.adapter.js';

export default function SpellweaveCompendiumOverlay({
  ledger,
  onDismiss,
}) {
  const tiers = useMemo(
    () => [...new Set(COMPENDIUM_ENTRIES.map((entry) => entry.tierId))],
    [],
  );
  const [activeTier, setActiveTier] = useState(tiers[0] || 'ELEMENTAL');

  const unlocked = new Set(ledger?.unlockedEntryIds || []);
  const mastery = ledger?.masteryCounts || {};

  const entries = COMPENDIUM_ENTRIES.filter((entry) => entry.tierId === activeTier);

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-labelledby="spellweave-compendium-title">
      <button type="button" className={styles.backdrop} aria-label="Close compendium" onClick={onDismiss} />
      <article className={styles.panel}>
        <header className={styles.chromeHeader}>
          <span className={styles.chromeBadge}>Grimoire</span>
          <span id="spellweave-compendium-title" className={styles.chromeLabel}>Spellweave Compendium</span>
          <button type="button" className={styles.closeBtn} onClick={onDismiss} aria-label="Close">×</button>
        </header>

        <nav className={styles.tierRail} aria-label="Compendium tiers">
          {tiers.map((tierId) => (
            <button
              key={tierId}
              type="button"
              className={`${styles.tierBtn} ${activeTier === tierId ? styles.tierBtnActive : ''}`}
              onClick={() => setActiveTier(tierId)}
            >
              {tierId.replace(/_/g, ' ')}
            </button>
          ))}
        </nav>

        <section className={styles.entryPane}>
          {entries.map((entry) => {
            const isUnlocked = unlocked.has(entry.entryId);
            const count = mastery[entry.entryId] || 0;
            return (
              <div key={entry.entryId} className={`${styles.entryCard} ${!isUnlocked ? styles.locked : ''}`}>
                <div className={styles.entryTitle}>
                  {isUnlocked ? entry.title : '???'}
                </div>
                <div className={styles.entryMeta}>
                  {isUnlocked
                    ? `${entry.band} · mastery ${count}`
                    : `${entry.tierId} — unlock by casting with tier signal`}
                </div>
                {isUnlocked && entry.statGates && (
                  <div className={styles.entryMeta}>
                    Gates:
                    {' '}
                    {Object.entries(entry.statGates).map(([key, value]) => `${key} ${value}`).join(', ')}
                  </div>
                )}
                {isUnlocked && entry.weavePrompt && (
                  <div className={styles.entryMeta}>Weave hint: {entry.weavePrompt}</div>
                )}
              </div>
            );
          })}
        </section>
      </article>
    </div>
  );
}
