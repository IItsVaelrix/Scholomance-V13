import { createContext, useContext, createElement } from 'react';

/**
 * useCombatUIState.js
 *
 * Central context for UI-posture state — not game truth.
 * CombatPage.jsx is the provider. Nested components consume via hook.
 *
 * mode drives data-combat-mode on the shell, which controls layout transitions
 * and panel visibility via CSS attribute selectors.
 */

const CombatUIStateContext = createContext(null);

export function CombatUIStateProvider({ children, value }) {
  return createElement(CombatUIStateContext.Provider, { value }, children);
}

export function useCombatUIState() {
  const ctx = useContext(CombatUIStateContext);
  if (!ctx) throw new Error('useCombatUIState must be used within CombatUIStateProvider');
  return ctx;
}

/**
 * Derive CombatMode from game state.
 * Pure function — no hooks, no side effects.
 *
 * @param {string|null} selectedAction
 * @param {boolean} isResolving
 * @returns {'idle'|'move'|'inscribe'|'channel'|'wait'|'resolve'}
 */
export function deriveCombatMode(selectedAction, isResolving) {
  if (isResolving) return 'resolve';
  if (!selectedAction) return 'idle';
  switch (selectedAction.toUpperCase()) {
    case 'MOVE':    return 'move';
    case 'INSCRIBE': return 'inscribe';
    case 'CHANNEL': return 'channel';
    case 'WAIT':    return 'wait';
    default:        return 'idle';
  }
}
