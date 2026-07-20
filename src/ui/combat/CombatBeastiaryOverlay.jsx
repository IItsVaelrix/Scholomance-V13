import styles from './CombatBeastiaryOverlay.module.css';
import CombatBeastiaryGlossaryText from './CombatBeastiaryGlossaryText.jsx';
import { lookupCombatBestiaryGlossaryTerm } from '../../game/combat/bestiary/combatBestiary.glossary.js';

function TagList({ tags = [] }) {
  if (!tags.length) return null;
  return (
    <div className={styles.tagRow} aria-label="Status tags">
      {tags.map((tag) => {
        const glossary = lookupCombatBestiaryGlossaryTerm(tag);
        if (!glossary) {
          return <span key={tag} className={styles.tag}>{tag}</span>;
        }
        return (
          <span
            key={tag}
            className={`${styles.tag} ${styles.glossaryTerm}`}
            role="button"
            tabIndex={0}
            aria-label={`${tag}: ${glossary.body}`}
          >
            {tag}
            <span className={styles.glossaryTip} role="tooltip">
              <strong className={styles.glossaryTipTitle}>{glossary.title}</strong>
              <span className={styles.glossaryTipBody}>{glossary.body}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Modular bestiary reader — renders any registered dossier contract.
 */
export default function CombatBeastiaryOverlay({ dossier, onDismiss }) {
  if (!dossier) return null;

  return (
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="combat-beastiary-title"
    >
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close beastiary"
        onClick={onDismiss}
      />

      <article className={styles.panel}>
        <header className={styles.chromeHeader}>
          <span className={styles.chromeBadge}>Beastiary</span>
          <span className={styles.chromeLabel}>Enemy Dossier</span>
          <button type="button" className={styles.closeBtn} onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </header>

        <div className={styles.panelBody}>
          <p className={styles.epithet}>{dossier.epithet || 'Combatant Profile'}</p>
          <h2 id="combat-beastiary-title" className={styles.title}>{dossier.title}</h2>
          {dossier.subtitle && <p className={styles.subtitle}>{dossier.subtitle}</p>}
          {dossier.school && (
            <p className={styles.schoolLine}>
              School affinity:{' '}
              <b>
                <CombatBeastiaryGlossaryText text={dossier.school} />
              </b>
            </p>
          )}

          {(dossier.sections || []).map((section) => (
            <section key={section.id} className={styles.section}>
              <h3 className={styles.sectionLabel}>{section.label}</h3>
              <TagList tags={section.tags} />
              <ul className={styles.sectionList}>
                {section.lines.map((line) => (
                  <li key={line}>
                    <CombatBeastiaryGlossaryText text={line} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {dossier.chess && (
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Syntactical Chess</h3>
              <p className={styles.chessArchetype}>
                Archetype:{' '}
                <CombatBeastiaryGlossaryText text={dossier.chess.archetype} />
              </p>
              <div className={styles.chessGrid}>
                <div>
                  <span className={styles.chessKey}>
                    <CombatBeastiaryGlossaryText text="PRESS" />
                  </span>
                  <TagList tags={dossier.chess.weaknessFamilies} />
                  <TagList tags={dossier.chess.syntaxWeaknesses} />
                </div>
                <div>
                  <span className={styles.chessKey}>
                    <CombatBeastiaryGlossaryText text="AVOID" />
                  </span>
                  <TagList tags={dossier.chess.resistanceFamilies} />
                  <TagList tags={dossier.chess.syntaxResistances} />
                </div>
              </div>
              <p className={styles.chessCounsel}>
                <CombatBeastiaryGlossaryText text={dossier.chess.counsel} />
              </p>
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.dismissBtn} onClick={onDismiss}>
            Close
          </button>
        </footer>
      </article>
    </div>
  );
}
