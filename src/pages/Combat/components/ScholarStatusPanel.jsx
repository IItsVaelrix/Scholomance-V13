import { motion } from 'framer-motion';

/**
 * ScholarStatusPanel.jsx
 *
 * Persistent player state display. Always visible, compact.
 * Severe-state feedback: .is-low-hp when HP < 25%, .is-low-mp when MP < 20%.
 * Framer Motion animates bar fill changes.
 */
export default function ScholarStatusPanel({ scholar, latestTurn = null, playerTurnIndex = 0 }) {
  if (!scholar) return null;

  const hpPct = scholar.hp / scholar.maxHp;
  const mpPct = scholar.mp / scholar.maxMp;
  const isLowHp = hpPct <= 0.25;
  const isLowMp = mpPct <= 0.2;
  const statusEffects = Array.isArray(scholar.statusEffects) ? scholar.statusEffects : [];
  const unstableTurnsLeft = scholar.unstableUntilTurn
    ? Math.max(0, scholar.unstableUntilTurn - playerTurnIndex + 1)
    : 0;
  const isUnstable = unstableTurnsLeft > 0;
  const badges = Array.isArray(latestTurn?.scoreSummary?.badges)
    ? latestTurn.scoreSummary.badges.slice(0, 3)
    : [];

  return (
    <div className="scholar-status-panel" aria-label="Scholar status">
      <div className="bottom-subpanel-title">SCHOLAR</div>

      <div className="bar-row">
        <div className="bar-label">
          <span>HP</span>
          <span className={isLowHp ? 'stat-critical' : ''}>{scholar.hp} / {scholar.maxHp}</span>
        </div>
        <div className={`bar-track${isLowHp ? ' is-low-hp' : ''}`}>
          <motion.div
            className="bar-fill-hp"
            initial={false}
            animate={{ width: `${hpPct * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="bar-row">
        <div className="bar-label">
          <span>MP</span>
          <span className={isLowMp ? 'stat-critical' : ''}>{scholar.mp} / {scholar.maxMp}</span>
        </div>
        <div className={`bar-track${isLowMp ? ' is-low-mp' : ''}`}>
          <motion.div
            className="bar-fill-mp"
            initial={false}
            animate={{ width: `${mpPct * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="stats-emblem-row">
        <div className="stats-emblem" title="Range">
          <span className="emblem-label">RANGE</span>
          <span className="emblem-value">{scholar.range}</span>
        </div>
        <div className="stats-emblem" title="Movement Points">
          <span className="emblem-label">MOVES</span>
          <span className="emblem-value">{scholar.movesRemaining} / {scholar.maxMovesPerTurn}</span>
        </div>
      </div>

      <div className="bottom-subpanel-title">LORE RATINGS</div>
      <div className="lore-stat-grid">
        {['SYNT', 'META', 'MYTH', 'VIS', 'PSYC', 'CODEX'].map(stat => {
          const rating = latestTurn?.scoreSummary?.loreStats?.[stat]?.rating || 'Neophyte';
          const value = latestTurn?.scoreSummary?.loreStats?.[stat]?.value || 0;
          return (
            <div key={stat} className={`lore-stat-item rating-${rating.toLowerCase()}`} title={latestTurn?.scoreSummary?.loreStats?.[stat]?.justification}>
              <span className="lore-stat-abbr">{stat}</span>
              <span className="lore-stat-rating">{rating}</span>
            </div>
          );
        })}
      </div>

      <div className="scholar-school-badge">{scholar.school}</div>

      <div className="bottom-subpanel-title">STATUS EFFECTS</div>
      {(statusEffects.length > 0 || isUnstable || scholar.supercharged) ? (
        <div className="status-effect-list" aria-live="polite">
          {isUnstable && (
            <div className="status-effect-chip is-unstable" title="Incoherent leyline extraction destabilized you. Casts may fizzle until this decays - a coherent verse reduces the risk.">
              UNSTABLE · {unstableTurnsLeft}T
            </div>
          )}
          {scholar.supercharged && (
            <div className="status-effect-chip is-supercharged" title="Supercharged: your next cast deals double damage.">
              SUPERCHARGED
            </div>
          )}
          {statusEffects.map((effect) => (
            <div key={`${effect.chainId || effect.id}-${effect.turnsRemaining}`} className="status-effect-chip">
              {effect.label || effect.id}
              {effect.turnsRemaining ? ` · ${effect.turnsRemaining}T` : ''}
            </div>
          ))}
        </div>
      ) : (
        <div className="status-effect-empty">NO ACTIVE EFFECTS</div>
      )}

      {latestTurn && (
        <>
          <div className="bottom-subpanel-title">LAST VERSE</div>
          <div className="scholar-last-turn">
            {badges.length > 0 && (
              <div className="scholar-last-badges">{badges.join(' · ')}</div>
            )}
            {latestTurn.commentary && (
              <div className="scholar-last-commentary">{latestTurn.commentary}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
