/**
 * ActionBar.jsx
 *
 * Tactical command surface. Replaces the plain text action-menu list.
 * Each action has a world-law glyph, label, and hotkey badge.
 *
 * Action definitions are imported from state/combatActions.js so the
 * keymap, button labels, and footer text can never drift.
 */

import { ACTION_DEFS } from '../state/combatActions.js';

export default function ActionBar({ selectedAction, onActionSelect, isDisabled, canExtract, movesRemaining }) {
  return (
    <div className="action-bar" role="toolbar" aria-label="Combat actions">
      {ACTION_DEFS.map(({ id, glyph, label, hotkey, title, situational }) => {
        const moveSpent = id === 'MOVE' && (Number(movesRemaining) || 0) <= 0;
        const isBtnDisabled = isDisabled || moveSpent || (id === 'EXTRACT' && !canExtract);
        const btnTitle = moveSpent
          ? 'Movement already spent this turn'
          : id === 'EXTRACT' && !canExtract
            ? 'Requires standing on an active glowing leyline'
            : title;
        return (
          <button
            key={id}
            className={`action-bar-btn${selectedAction === id ? ' is-active' : ''}`}
            onClick={() => onActionSelect(id)}
            disabled={isBtnDisabled}
            title={btnTitle}
            aria-label={`${label} - hotkey ${hotkey}`}
            aria-pressed={selectedAction === id}
            type="button"
          >
            <span className="action-btn-hotkey" aria-hidden="true">[{hotkey}]</span>
            <span className="action-btn-glyph" aria-hidden="true">{glyph}</span>
            <span className="action-btn-label">{label}</span>
            {situational && (
              <span className="action-btn-situational" aria-label="Situational action">situational</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
