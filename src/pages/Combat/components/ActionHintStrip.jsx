/**
 * ActionHintStrip.jsx
 *
 * Single-line contextual metadata strip below the ActionBar.
 * Shows target type, cost, and keyboard instructions for the selected action.
 * Static lookup - no backend calls.
 *
 * The idle-state key range is derived from ACTION_DEFS so it can never
 * drift from the actual keymap.
 */

import { ACTION_DEFS, buildActionHotkeyFooter } from '../state/combatActions.js';

const ACTION_HINTS = {
  INSCRIBE: {
    meta: 'Single Target',
    cost: 'MP 10',
    keys: 'Shift+Enter to cast · Tab completes word',
  },
  MOVE: {
    meta: null, // replaced dynamically with moves remaining
    cost: null,
    keys: 'WASD / Arrows to navigate · Enter to confirm',
  },
  EXTRACT: {
    meta: 'Verbal Alchemy Extraction',
    cost: 'No MP cost',
    keys: 'Solve the alchemical puzzle to harvest mana',
  },
  CHANNEL: {
    meta: 'No Target',
    cost: 'Restores MP',
    keys: 'Enter to confirm',
  },
  WAIT: {
    meta: 'No Target',
    cost: null,
    keys: null, // derived from ACTION_DEFS
  },
  FLEE: {
    meta: 'Exits Combat',
    cost: null,
    keys: 'Confirm to escape',
  },
};

const _hotkeyByAction = ACTION_DEFS.reduce((acc, d) => {
  acc[d.id] = d.hotkey;
  return acc;
}, {});

function keysFor(actionId) {
  if (actionId === 'WAIT') {
    const key = _hotkeyByAction.WAIT;
    return `Press [${key}] or click to yield turn`;
  }
  return ACTION_HINTS[actionId]?.keys;
}

export default function ActionHintStrip({ selectedAction, movesRemaining }) {
  if (!selectedAction) {
    return (
      <div className="action-hint-strip is-idle" aria-live="polite" aria-atomic="true">
        <span className="hint-idle">SELECT AN ACTION</span>
        <span className="hint-divider">·</span>
        <span className="hint-keys">{buildActionHotkeyFooter()} hotkeys · [WASD] navigate lattice · [Esc] cancel</span>
      </div>
    );
  }

  const hint = ACTION_HINTS[selectedAction];
  if (!hint) return null;

  const metaText =
    selectedAction === 'MOVE' && movesRemaining != null
      ? `${movesRemaining} move${movesRemaining !== 1 ? 's' : ''} remaining`
      : hint.meta;

  return (
    <div className="action-hint-strip" aria-live="polite" aria-atomic="true">
      <span className="hint-action">{selectedAction}</span>
      {metaText && (
        <>
          <span className="hint-divider">·</span>
          <span className="hint-meta">{metaText}</span>
        </>
      )}
      {hint.cost && (
        <>
          <span className="hint-divider">·</span>
          <span className="hint-cost">{hint.cost}</span>
        </>
      )}
      <span className="hint-divider">·</span>
      <span className="hint-keys">{keysFor(selectedAction)}</span>
    </div>
  );
}
