import React from 'react';
import TurnTimer from './TurnTimer.jsx';

/**
 * BattleChrome.jsx - TopCombatBar
 *
 * Minimal, high-priority header for current combat context.
 * Shows: school context · turn state pill · mode label · round · flee
 *
 * Turn state pill: PLAYER ACTING (gold) / OPPONENT ACTING (school accent) / RESOLVING (dim pulse)
 * Mode label: appended when not idle - "· INSCRIBING", "· TARGETING", etc.
 */

const MODE_LABELS = {
  move:     '· MOVING',
  inscribe: '· INSCRIBING',
  channel:  '· CHANNELING',
  wait:     '· WAITING',
  resolve:  '· RESOLVING',
  inspect:  '· INSPECTING',
  idle:     '',
};

export default function BattleChrome({ school, round, onFlee, timeRemaining, mode = 'idle', isPlayerTurn = true, isResolving = false }) {
  const turnState = isResolving ? 'animating' : (isPlayerTurn ? 'player' : 'enemy');
  const modeLabel = MODE_LABELS[mode] ?? '';

  return (
    <div className="battle-chrome" data-turn-state={turnState}>
      <div className="chrome-left">
        <div className="school-glyph-badge" aria-hidden="true">✦</div>
        <div className="battle-title">{school} THAUMATURGY ARENA</div>
      </div>

      <div className="chrome-center">
        <div className="round-counter" aria-label={`Round ${round}`}>ROUND {round}</div>

        <div
          className={`turn-state-pill turn-state-${turnState}`}
          aria-live="polite"
          aria-atomic="true"
          aria-label={`Turn: ${turnState === 'player' ? 'player acting' : turnState === 'enemy' ? 'opponent acting' : 'resolving'}`}
        >
          {turnState === 'player'    && 'PLAYER ACTING'}
          {turnState === 'enemy'     && 'OPPONENT ACTING'}
          {turnState === 'animating' && 'RESOLVING'}
          {modeLabel && <span className="mode-label">{modeLabel}</span>}
        </div>

        <TurnTimer timeRemaining={timeRemaining} isActive={isPlayerTurn && !isResolving} isCompact={true} />
      </div>

      <div className="chrome-right">
        <button
          className="flee-button"
          onClick={onFlee}
          aria-label="Flee the encounter"
          type="button"
        >
          FLEE
        </button>
      </div>
    </div>
  );
}
