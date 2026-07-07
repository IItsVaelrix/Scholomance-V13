import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './CharacterCompendiumOverlay.module.css';
import { buildCharacterCompendiumSnapshot } from '../../game/character/characterCompendium.js';
import { getScholomanceXpSnapshot } from '../../game/character/scholomanceXpService.js';

const CHARACTER_IMAGE_URL = '/generated-assets/IdealHuman/IdealHuman-png.png';

function isTypingTarget(target) {
  if (!target) return false;
  return (
    target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.isContentEditable
  );
}

export function CharacterCompendiumOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [combatStats, setCombatStats] = useState(null);
  const [xpReadout, setXpReadout] = useState(null);

  const snapshot = useMemo(
    () => buildCharacterCompendiumSnapshot({
      combatStats,
      scholomance: combatStats?.scholomance,
      xpReadout,
    }),
    [combatStats, xpReadout],
  );

  useEffect(() => {
    setXpReadout(getScholomanceXpSnapshot().readout);
  }, []);

  useEffect(() => {
    const onStats = (event) => {
      if (event?.detail) setCombatStats(event.detail);
    };
    const onXp = (event) => {
      if (event?.detail?.readout) setXpReadout(event.detail.readout);
    };
    window.addEventListener('combat-stats-changed', onStats);
    window.addEventListener('scholomance-xp-changed', onXp);
    return () => {
      window.removeEventListener('combat-stats-changed', onStats);
      window.removeEventListener('scholomance-xp-changed', onXp);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;

      if (event.key.toLowerCase() === 'c') {
        setIsOpen((prev) => !prev);
      }
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const overlayVariants = {
    hidden: { opacity: 0, backdropFilter: 'blur(0px)' },
    visible: { opacity: 1, backdropFilter: 'blur(8px)' },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -20,
      transition: { duration: 0.2 },
    },
  };

  const mpRemaining = snapshot.tactical.movementPointsRemaining;
  const mpMax = snapshot.tactical.movementPoints;
  const movementRow = snapshot.tactical.rows.find((row) => row.key === 'movementPoints');
  const attackRow = snapshot.tactical.rows.find((row) => row.key === 'attackPoints');
  const rangeRow = snapshot.tactical.rows.find((row) => row.key === 'attackRange');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            className={styles.modal}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Character compendium"
          >
            <div className={styles.header}>
              <div className={styles.headerTitle}>
                <h2>Character Compendium</h2>
                <span className={styles.headerSubtitle}>Scholomance Stat Tree</span>
              </div>
              <span className={styles.headerHint}>Press C or Esc to close</span>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsOpen(false)}
                aria-label="Close character compendium"
              >
                ×
              </button>
            </div>

            <div className={styles.content}>
              <section className={styles.portraitPane}>
                <div className={styles.portraitFrame}>
                  <img
                    src={CHARACTER_IMAGE_URL}
                    alt="Scholomancer portrait"
                    className={styles.portraitImage}
                  />
                </div>
                <div>
                  <h3 className={styles.characterName}>{snapshot.name}</h3>
                  <p className={styles.characterMeta}>
                    {snapshot.scholomance.registryCount} scholomance attributes ·{' '}
                    {snapshot.equipment.equippedCount} equipped
                  </p>
                </div>
              </section>

              <section className={styles.statTreePane} aria-label="Scholomance attributes">
                {snapshot.scholomance.categories.map((category) => (
                  <div key={category.id} className={styles.categoryBlock}>
                    <h4 className={styles.categoryTitle}>{category.label}</h4>
                    {category.stats.map((stat) => (
                      <div key={stat.key} className={styles.statRow} title={stat.designRead}>
                        <span className={styles.statKey}>{stat.abbrev}</span>
                        <span className={styles.statName}>
                          {stat.fullName}
                          <small className={styles.statLevel}>Lv {stat.level}</small>
                        </span>
                        <span className={styles.statValue}>{stat.value}</span>
                        <div className={styles.statBarTrack}>
                          <div
                            className={styles.statBarFill}
                            style={{ width: `${stat.percent}%` }}
                          />
                        </div>
                        <div className={styles.xpBarTrack}>
                          <div
                            className={styles.xpBarFill}
                            style={{ width: `${stat.xpProgress}%` }}
                          />
                        </div>
                        <p className={styles.statHint}>{stat.coreFunction}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </section>

              <aside className={styles.sidePane}>
                <div className={styles.panel}>
                  <h4 className={styles.panelTitle}>Tactical Slice</h4>
                  <div className={styles.tacticalGrid}>
                    <div className={styles.tacticalItem}>
                      <span className={styles.tacticalLabel}>Movement</span>
                      <span className={`${styles.tacticalValue} ${styles.tacticalValueMp}`}>
                        {mpRemaining != null && mpMax != null
                          ? `${mpRemaining} / ${mpMax}`
                          : `${movementRow?.base ?? 3} base`}
                      </span>
                    </div>
                    <div className={styles.tacticalItem}>
                      <span className={styles.tacticalLabel}>Attack</span>
                      <span className={`${styles.tacticalValue} ${styles.tacticalValueAtk}`}>
                        {attackRow?.value ?? attackRow?.base ?? 6}
                      </span>
                    </div>
                    <div className={styles.tacticalItem}>
                      <span className={styles.tacticalLabel}>Range</span>
                      <span className={`${styles.tacticalValue} ${styles.tacticalValueRng}`}>
                        {rangeRow?.value ?? rangeRow?.base ?? 2}
                      </span>
                    </div>
                    {snapshot.tactical.attackUsed && (
                      <div className={styles.tacticalItem}>
                        <span className={styles.tacticalLabel}>Turn</span>
                        <span className={styles.tacticalValue}>Attack spent</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.panel}>
                  <h4 className={styles.panelTitle}>Equipped Gear</h4>
                  {snapshot.equipment.rows.length > 0 ? (
                    <div className={styles.gearList}>
                      {snapshot.equipment.rows.map((row) => (
                        <div key={row.slotId} className={styles.gearRow}>
                          <span className={styles.gearSlot}>{row.slotLabel}</span>
                          <span className={styles.gearName}>{row.item.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.gearEmpty}>No equipment slotted yet.</p>
                  )}
                </div>

                <div className={styles.panel}>
                  <h4 className={styles.panelTitle}>Spell Profile</h4>
                  <div className={styles.spellCard}>
                    <h5 className={styles.spellTitle}>{snapshot.spellProfile.name}</h5>
                    <p className={styles.spellMeta}>
                      Primary {snapshot.spellProfile.primary}
                      {snapshot.spellProfile.secondary
                        ? ` · Secondary ${snapshot.spellProfile.secondary}`
                        : ''}
                    </p>
                    <div className={styles.spellQuality}>
                      Quality {snapshot.spellProfile.quality.total}
                    </div>
                    <div className={styles.spellBreakdown}>
                      <span>Base rank {snapshot.spellProfile.quality.baseRank}</span>
                      <span>Primary mod {snapshot.spellProfile.quality.primaryModifier >= 0 ? '+' : ''}{snapshot.spellProfile.quality.primaryModifier}</span>
                      <span>Discovery {snapshot.spellProfile.quality.discoveryBonus >= 0 ? '+' : ''}{snapshot.spellProfile.quality.discoveryBonus}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}