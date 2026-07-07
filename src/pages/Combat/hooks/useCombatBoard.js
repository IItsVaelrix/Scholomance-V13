/**
 * useCombatBoard.js
 *
 * Composite hook. Wraps useBattleSession + useBoardCursor + selectors.
 * CombatPage becomes a thin composition shell — no combat logic inline.
 *
 * Returns everything needed to render and interact with the full combat screen.
 */

import { useState, useMemo } from 'react';
import { useBattleSession } from '../../../hooks/useBattleSession.js';
import { useBoardCursor } from './useBoardCursor.js';
import {
  selectBoardTiles,
  selectRenderedUnits,
  selectScholarStatusModel,
  selectEncounterHeaderModel,
} from '../state/combatSelectors.js';
import { coordToLabel, getManhattanDistance } from '../state/combatBoardUtils.js';

export function useCombatBoard() {
  // --- Battle truth ---
  const {
    battleState,
    startBattle,
    submitScroll,
    submitExtraction,
    channelEnergy,
    waitTurn,
    moveEntity,
    fleeBattle,
    isResolving,
    turnTimeRemaining,
    isPlayerTurn,
  } = useBattleSession();

  // --- UI interaction state ---
  const [selectedAction, _setSelectedAction] = useState(null);
  const [targetingMode, setTargetingMode] = useState('none');

  const setSelectedAction = useMemo(() => (action) => {
    _setSelectedAction(action);
    if (action === 'MOVE') {
      setTargetingMode('move');
    } else if (action === 'INSCRIBE') {
      setTargetingMode('spell');
    } else {
      setTargetingMode('none');
    }
  }, []);

  // --- Cursor ---
  const { cursorTile, setCursorTile, moveCursor } = useBoardCursor();

  // --- Derived render models ---
  const tileViewModels = useMemo(
    () =>
      battleState
        ? selectBoardTiles(battleState, { cursorTile, selectedAction, targetingMode })
        : [],
    [battleState, cursorTile, selectedAction, targetingMode],
  );

  const renderedUnits = useMemo(
    () => (battleState ? selectRenderedUnits(battleState) : []),
    [battleState],
  );

  const scholarStatus = useMemo(
    () => selectScholarStatusModel(battleState),
    [battleState],
  );

  const encounterHeader = useMemo(
    () => selectEncounterHeaderModel(battleState),
    [battleState],
  );

  // --- Convenience derivations ---
  const scholar  = battleState?.entities?.find(e => e.id === 'player')   ?? null;
  const opponent = battleState?.entities?.find(e => e.id === 'opponent') ?? null;

  const cellLabel = cursorTile ? coordToLabel(cursorTile) : '--';

  const range = useMemo(() => {
    if (!cursorTile || !scholar) return 0;
    return getManhattanDistance(cursorTile, scholar.position);
  }, [cursorTile, scholar]);

  return {
    // Truth
    battleState,
    startBattle,
    submitScroll,
    submitExtraction,
    channelEnergy,
    waitTurn,
    moveEntity,
    fleeBattle,
    isResolving,
    turnTimeRemaining,
    isPlayerTurn,

    // UI state
    selectedAction,
    setSelectedAction,
    targetingMode,
    setTargetingMode,

    // Cursor
    cursorTile,
    setCursorTile,
    moveCursor,

    // Render models
    tileViewModels,
    renderedUnits,
    scholarStatus,
    encounterHeader,

    // Convenience
    scholar,
    opponent,
    cellLabel,
    range,
  };
}
