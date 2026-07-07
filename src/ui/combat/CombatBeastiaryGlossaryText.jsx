import { parseCombatBestiaryGlossaryText } from '../../game/combat/bestiary/combatBestiary.glossary.js';
import styles from './CombatBeastiaryOverlay.module.css';

/**
 * Renders beastiary copy with hover tooltips on ALL-CAPS registry terms.
 */
export default function CombatBeastiaryGlossaryText({ text, className = '' }) {
  const segments = parseCombatBestiaryGlossaryText(text);
  if (!segments.length) return null;

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`${segment.value}-${index}`}>{segment.value}</span>;
        }

        const { glossary } = segment;
        return (
          <span
            key={`${segment.value}-${index}`}
            className={styles.glossaryTerm}
            tabIndex={0}
            aria-label={`${segment.value}: ${glossary.body}`}
          >
            {segment.value}
            <span className={styles.glossaryTip} role="tooltip">
              <strong className={styles.glossaryTipTitle}>{glossary.title}</strong>
              <span className={styles.glossaryTipBody}>{glossary.body}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}