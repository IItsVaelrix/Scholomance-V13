import { motion } from 'framer-motion';
import SigilEntity from './SigilEntity.jsx';

export default function OpponentDisplay({ archetype, currentHP, maxHP, phase, onShowDetails }) {
  const hpPct = currentHP / maxHP;
  const isMid = hpPct <= 0.5 && hpPct > 0.25;
  const isCritical = hpPct <= 0.25;
  const counterTokens = Array.isArray(archetype?.counterTokens)
    ? archetype.counterTokens.slice(0, 3)
    : [];
  const activeEffects = Array.isArray(archetype?.statusEffects)
    ? archetype.statusEffects.slice(0, 2)
    : [];
  const syntacticProfile = archetype?.syntacticProfile || null;

  return (
    <div className="opponent-display battle-panel">
      <button
        className="opponent-portrait-frame clickable"
        onClick={onShowDetails}
        title="View detailed archetype data"
        aria-label={`View details for ${archetype?.name || 'opponent'}`}
        type="button"
      >
        <SigilEntity
          school={archetype?.school}
          effectClass={archetype?.bytecodeEffectClass}
          glowIntensity={archetype?.glowIntensity}
          size={50}
        />
        <span
          className="opponent-portrait-info-badge"
          aria-hidden="true"
          title="Click for archetype details"
        >
          ⓘ
        </span>
        <span className="opponent-portrait-info-label">DETAILS</span>
      </button>

      <div className="opponent-info">
        <button
          className="opponent-name clickable-text"
          onClick={onShowDetails}
          type="button"
          aria-label="Toggle archetype details"
        >
          {archetype?.name || 'Void Wraith'}
        </button>
        <div className="opponent-school-label">{archetype?.school || 'VOID'}</div>
        <div className="opponent-description italic">{archetype?.description || 'A hollow echo of a forgotten verse.'}</div>
      </div>

      <div className="opponent-hp-bar">
        <div className="hp-bar-track">
          <motion.div
            className={`hp-bar-fill ${isMid ? 'hp-mid' : ''} ${isCritical ? 'hp-critical' : ''}`}
            initial={false}
            animate={{ width: `${hpPct * 100}%` }}
          />
        </div>
        <div className="hp-text">{currentHP} / {maxHP}</div>
      </div>

      {phase === 'opponent_responding' && (
        <div className="opponent-thinking">
          <span>THINKING</span>
          <div className="thinking-dots">
            <span>.</span><span>.</span><span>.</span>
          </div>
        </div>
      )}

      {archetype?.telegraph?.summary && (
        <div className="opponent-telegraph">
          <div className="opponent-telegraph-label">{archetype.telegraph.label || 'TELEGRAPH'}</div>
          <div className="opponent-telegraph-text">{archetype.telegraph.summary}</div>
        </div>
      )}

      {counterTokens.length > 0 && (
        <div className="opponent-counter-tokens">
          COUNTER TOKENS: {counterTokens.join(', ')}
        </div>
      )}

      {syntacticProfile && (
        <div className="opponent-symbolic-structure">
          <div className="opponent-telegraph-label">SYMBOLIC STRUCTURE</div>
          <div className="opponent-telegraph-text">
            Body: {syntacticProfile.symbolicBody?.slice(0, 3).join(', ') || 'unknown'}
          </div>
          <div className="opponent-telegraph-text">
            Weaknesses: {syntacticProfile.weaknessFamilies?.slice(0, 3).join(', ') || '???'}
          </div>
          <div className="opponent-telegraph-text">
            Resists: {syntacticProfile.resistanceFamilies?.slice(0, 2).join(', ') || '???'}
          </div>
        </div>
      )}

      {activeEffects.length > 0 && (
        <div className="opponent-status-strip">
          {activeEffects.map((effect) => (
            <span key={`${effect.chainId || effect.id}-${effect.turnsRemaining}`} className="opponent-status-chip">
              {effect.label || effect.id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
