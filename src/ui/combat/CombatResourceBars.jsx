import { computeResourceBarRatio } from './combatResourceBarUtils.js';

function CombatResourceBar({
  label,
  current,
  max,
  variant,
  lowThreshold = 0.25,
}) {
  const safeCurrent = Number.isFinite(Number(current)) ? Math.max(0, Math.round(Number(current))) : 0;
  const safeMax = Number.isFinite(Number(max)) ? Math.max(0, Math.round(Number(max))) : 0;
  const ratio = computeResourceBarRatio(safeCurrent, safeMax);
  const isLow = variant === 'health' && ratio > 0 && ratio <= lowThreshold;

  return (
    <div className={`combat-resource-bar combat-resource-bar--${variant}${isLow ? ' combat-resource-bar--low' : ''}`}>
      <div className="combat-resource-bar__header">
        <span className="combat-resource-bar__label">{label}</span>
        <span className="combat-resource-bar__values" aria-hidden="true">
          <b>{safeCurrent}</b>
          <span className="combat-resource-bar__sep">/</span>
          {safeMax}
        </span>
      </div>
      <div
        className="combat-resource-bar__track"
        role="progressbar"
        aria-valuenow={safeCurrent}
        aria-valuemin={0}
        aria-valuemax={safeMax || 0}
        aria-label={`${label}: ${safeCurrent} of ${safeMax}`}
      >
        <div
          className="combat-resource-bar__fill"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function CombatRangeIndicator({ value }) {
  const range = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;

  return (
    <div className="combat-range-indicator" aria-label={`Attack range: ${range} tiles`}>
      <span className="combat-range-indicator__label">RNG</span>
      <span className="combat-range-indicator__value">{range}</span>
      <span className="combat-range-indicator__unit">tiles</span>
    </div>
  );
}

export default function CombatResourceBars({ stats }) {
  if (!stats) return null;

  const hp = stats.hp ?? stats.health ?? 0;
  const maxHp = stats.maxHp ?? stats.maxHealth ?? hp;
  const manaCurrent = stats.manaPointsRemaining ?? stats.manaPoints ?? 0;
  const manaMax = stats.manaPoints ?? manaCurrent;
  const mpCurrent = stats.movementPointsRemaining ?? stats.movementPoints ?? 0;
  const mpMax = stats.movementPoints ?? mpCurrent;
  const apCurrent = stats.attackPointsRemaining ?? stats.attackPoints ?? 0;
  const apMax = stats.attackPoints ?? apCurrent;

  return (
    <div className="combat-resource-bars" aria-label="Combat vitals and resources">
      <CombatResourceBar
        label="HP"
        current={hp}
        max={maxHp}
        variant="health"
      />
      <div className="combat-resource-bars__grid">
        <CombatResourceBar
          label="Mana"
          current={manaCurrent}
          max={manaMax}
          variant="mana"
        />
        <CombatResourceBar
          label="MP"
          current={mpCurrent}
          max={mpMax}
          variant="mp"
        />
        <CombatResourceBar
          label="AP"
          current={apCurrent}
          max={apMax}
          variant="ap"
        />
        <CombatRangeIndicator value={stats.attackRange} />
      </div>
    </div>
  );
}