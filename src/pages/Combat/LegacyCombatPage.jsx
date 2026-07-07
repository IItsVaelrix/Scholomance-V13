import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useCombatBoard } from './hooks/useCombatBoard.js';
import { useSpellScoringFlow } from './hooks/useSpellScoringFlow.js';
import { CombatUIStateProvider, deriveCombatMode } from './state/useCombatUIState.js';
import { HOTKEY_TO_ACTION } from './state/combatActions.js';
import BattleArena from './BattleArena.jsx';
import OracleScribe from './OracleScribe.jsx';
import ExtractionScribe from './components/ExtractionScribe.jsx';
import { getCrossPattern } from './state/combatPreviewUtils.js';
import ShaderArenaBackdrop from './components/ShaderArenaBackdrop.jsx';
import { connectCombatBridge, onCombatCommand, broadcastCombatInit, broadcastCombatAction, buildActionPayload } from './combatBridge.js';
import './CombatPage.css';

export default function CombatPage() {
  const arenaRef = useRef(null);
  const [arenaReady, setArenaReady] = useState(false);
  const lastAnimatedOpponentTurnRef = useRef(null);
  const [opponentMotionHold, setOpponentMotionHold] = useState(null);

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
    isPlayerTurn,
    selectedAction,
    setSelectedAction,
    cursorTile,
    setCursorTile,
    tileViewModels,
    renderedUnits,
    encounterHeader,
    scholar,
    opponent,
  } = useCombatBoard();

  const canExtract = useMemo(
    () => tileViewModels.some((t) => t.canExtractLeyline),
    [tileViewModels]
  );
  const arenaSchool = encounterHeader?.arenaSchool || 'SONIC';
  const latestHistoryTurn = battleState?.history?.[battleState.history.length - 1] || null;
  const pendingOpponentMotion = useMemo(() => (
    latestHistoryTurn?.entityId === 'opponent'
      && latestHistoryTurn?.motion?.origin
      && latestHistoryTurn?.id !== opponentMotionHold?.completedTurnId
      ? {
        turnId: latestHistoryTurn.id,
        origin: latestHistoryTurn.motion.origin,
      }
      : null
  ), [latestHistoryTurn, opponentMotionHold?.completedTurnId]);
  const displayedRenderedUnits = useMemo(() => {
    const hold = opponentMotionHold?.turnId === pendingOpponentMotion?.turnId
      ? opponentMotionHold
      : pendingOpponentMotion;
    if (!hold?.origin) return renderedUnits;
    return renderedUnits.map((unit) => (
      unit.id === 'opponent'
        ? { ...unit, position: hold.origin }
        : unit
    ));
  }, [opponentMotionHold, pendingOpponentMotion, renderedUnits]);

  // Derive UI mode from game state
  const mode = useMemo(
    () => deriveCombatMode(selectedAction, isResolving),
    [selectedAction, isResolving]
  );

  useEffect(() => {
    connectCombatBridge();

    return onCombatCommand((commandText) => {
      // Execute the command via React state
      if (commandText.startsWith("MOVE ")) {
        const parts = commandText.split(" ");
        const dx = parseInt(parts[1], 10);
        const dy = parseInt(parts[2], 10);
        moveEntity({ dx, dy });
      } else {
        submitScroll(commandText);
      }
    });
  }, [submitScroll, moveEntity]);

  const lastInitIdRef = useRef(null);
  const lastHistoryLengthRef = useRef(0);

  useEffect(() => {
    if (!battleState) return;

    // Detect new battle and broadcast INIT
    if (battleState.id !== lastInitIdRef.current) {
      lastInitIdRef.current = battleState.id;
      lastHistoryLengthRef.current = 0;
      const seed = battleState.metadata?.battleSeed || 'default';
      broadcastCombatInit(seed, battleState);
    }

    // Detect new history actions and broadcast ACTION
    if (battleState.history && battleState.history.length > lastHistoryLengthRef.current) {
      const newActions = battleState.history.slice(lastHistoryLengthRef.current);
      newActions.forEach(turnResult => {
        const payload = buildActionPayload(turnResult);
        if (payload) {
          broadcastCombatAction(payload);
        }
      });
      lastHistoryLengthRef.current = battleState.history.length;
    }
  }, [battleState, tileViewModels]);

  const handleConfirmMove = useCallback((target) => {
    if (!scholar || (Number(scholar.movesRemaining) || 0) <= 0 || battleState?.phase === 'victory' || battleState?.phase === 'defeat') return;
    const dx = target.x - scholar.position.x;
    const dy = target.y - scholar.position.y;
    moveEntity({ dx, dy });
    setSelectedAction(null);
  }, [scholar, battleState?.phase, moveEntity, setSelectedAction]);

  const handleActionSelect = useCallback((action) => {
    if (battleState?.phase === 'victory' || battleState?.phase === 'defeat') return;
    if (action === 'FLEE') { fleeBattle(); return; }
    if (action === 'MOVE' && (Number(scholar?.movesRemaining) || 0) <= 0) {
      setSelectedAction(null);
      return;
    }

    if (action === 'CHANNEL') {
      channelEnergy();
      setSelectedAction(null);
      return;
    }

    if (action === 'WAIT') {
      waitTurn();
      setSelectedAction(null);
      return;
    }

    setSelectedAction(selectedAction === action ? null : action);
  }, [battleState?.phase, fleeBattle, scholar?.movesRemaining, setSelectedAction, selectedAction, channelEnergy, waitTurn]);

  const handleSelectCell = useCallback((cell) => {
    if (battleState?.phase === 'victory' || battleState?.phase === 'defeat') return;
    setCursorTile(cell);

    if (isPlayerTurn && scholar && (Number(scholar.movesRemaining) || 0) > 0 && cell.x === scholar.position.x && cell.y === scholar.position.y) {
      setSelectedAction('MOVE');
      return;
    }

    const clickedTileVM = tileViewModels.find(t => t.coord.x === cell.x && t.coord.y === cell.y);
    if (isPlayerTurn && clickedTileVM?.occupantId === 'opponent') {
      setSelectedAction('INSCRIBE');
      return;
    }

    if (selectedAction === 'MOVE') {
      const isReachable = tileViewModels.find(t => t.coord.x === cell.x && t.coord.y === cell.y)?.isReachable;
      if (isReachable) handleConfirmMove(cell);
    }
  }, [battleState?.phase, isPlayerTurn, scholar, selectedAction, tileViewModels, setCursorTile, handleConfirmMove, setSelectedAction]);

  useEffect(() => {
    const onKey = (e) => {
      // Ignore text input fields
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

      if (!isPlayerTurn || battleState?.phase === 'victory' || battleState?.phase === 'defeat') return;

      // Number hotkeys for action selection
      const actionId = HOTKEY_TO_ACTION[e.key];
      if (actionId) {
        if (actionId === 'EXTRACT' && !canExtract) return;
        handleActionSelect(actionId);
        return;
      }

      if (e.key === 'Enter') {
        if (selectedAction === 'MOVE' && cursorTile) {
          const isReachable = tileViewModels.find(t => t.coord.x === cursorTile.x && t.coord.y === cursorTile.y)?.isReachable;
          if (isReachable) handleConfirmMove(cursorTile);
        }
      }
      if (e.key === 'Escape') setSelectedAction(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlayerTurn, battleState?.phase, selectedAction, cursorTile, tileViewModels, handleConfirmMove, setSelectedAction, handleActionSelect, canExtract]);

  const handleCast = useCallback((text, weave) => {
    if (scholar && cursorTile && battleState?.phase !== 'victory' && battleState?.phase !== 'defeat') {
      const affectedCells = getCrossPattern(cursorTile, 1);
      submitScroll(text, weave, cursorTile, affectedCells);
    }
  }, [scholar, cursorTile, battleState?.phase, submitScroll]);

  useEffect(() => {
    if (!arenaReady || !battleState?.history?.length) return;

    const latestTurn = battleState.history[battleState.history.length - 1];
    if (!latestTurn || latestTurn.entityId !== 'opponent' || latestTurn.id === lastAnimatedOpponentTurnRef.current) return;

    lastAnimatedOpponentTurnRef.current = latestTurn.id;
    const origin = latestTurn.motion?.origin || latestTurn.previousPosition || latestTurn.origin;
    if (origin) {
      setOpponentMotionHold({ turnId: latestTurn.id, origin });
    }
  }, [arenaReady, battleState?.history]);

  useEffect(() => {
    if (!opponentMotionHold?.turnId) return;
    setOpponentMotionHold({ completedTurnId: opponentMotionHold.turnId });
  }, [opponentMotionHold]);

  useEffect(() => {
    startBattle('void_wraith_01');
  }, [startBattle]);

  useEffect(() => {
    if (battleState?.phase === 'victory' || battleState?.phase === 'defeat') {
      setSelectedAction(null);
    }
  }, [battleState?.phase, setSelectedAction]);

  const {
    bridgeState,
    submitCast: submitScoringCast,
  } = useSpellScoringFlow({
    battleState,
    scholar,
    arenaSchool,
    isPlaying: false,
    isResolving,
    isCombatEnded: battleState?.phase === 'victory' || battleState?.phase === 'defeat',
    onLocalCast: handleCast,
  });

  if (!battleState) {
    return <div className="battle-page-loading">The Arena Stirs...</div>;
  }

  const uiStateValue = { mode, isLogCollapsed: true, setIsLogCollapsed: () => {} };
  const isCombatEnded = battleState.phase === 'victory' || battleState.phase === 'defeat';

  return (
    <CombatUIStateProvider value={uiStateValue}>
      <div
        className={`battle-page-root mmorpg-hybrid-layout ${bridgeState !== 'PLAYER_TURN' ? ' bridge-active' : ''}`}
        data-combat-mode={mode}
        data-state={bridgeState}
      >
        <div className="battle-immersive-mode">

          {/* MMORPG World View (Fullscreen) */}
          <div className="mmorpg-world-view">
            <ShaderArenaBackdrop school={arenaSchool} resonance={0.72} />
            <BattleArena
              ref={arenaRef}
              arenaSchool={arenaSchool}
              tileViewModels={tileViewModels}
              renderedUnits={displayedRenderedUnits}
              cursorTile={cursorTile}
              onSelectCell={handleSelectCell}
              onReady={() => setArenaReady(true)}
            />
          </div>

          {/* MMORPG HUD Overlay */}
          <div className="mmorpg-hud">
            {/* Top Left: Unit Frame (Scholar) */}
            {scholar && (
              <div className="hud-unit-frame hud-scholar">
                <div className="unit-name">{scholar.name || 'Scholar'}</div>
                <div className="bar-row">
                  <div className="bar-label"><span>HP</span><span>{scholar.hp} / {scholar.maxHp}</span></div>
                  <div className="bar-track"><div className="bar-fill-hp" style={{ width: `${(scholar.hp / scholar.maxHp) * 100}%` }} /></div>
                </div>
                <div className="bar-row">
                  <div className="bar-label"><span>MP</span><span>{scholar.mp} / {scholar.maxMp}</span></div>
                  <div className="bar-track"><div className="bar-fill-mp" style={{ width: `${(scholar.mp / scholar.maxMp) * 100}%` }} /></div>
                </div>
                <div className="unit-level">Lv. {scholar.level || 1}</div>
              </div>
            )}

            {/* Top Center: Opponent Unit Frame */}
            {opponent && (
              <div className="hud-unit-frame hud-opponent">
                <div className="unit-name">{opponent.name || 'Opponent'}</div>
                <div className="bar-row">
                  <div className="bar-label"><span>HP</span><span>{opponent.hp} / {opponent.maxHp}</span></div>
                  <div className="bar-track"><div className="bar-fill-hp" style={{ width: `${(opponent.hp / opponent.maxHp) * 100}%` }} /></div>
                </div>
              </div>
            )}

            {/* Bottom Left: Action Bar / MUD Input */}
            <div className="hud-action-bar">
              {canExtract && selectedAction !== 'EXTRACT' && (
                <button
                  className="hud-extract-btn"
                  onClick={() => setSelectedAction('EXTRACT')}
                >
                  Leyline Resonating - Click to Extract
                </button>
              )}
              {selectedAction === 'EXTRACT' && (
                <button
                  className="hud-extract-btn cancel"
                  onClick={() => setSelectedAction(null)}
                >
                  Cancel Extraction
                </button>
              )}

              {selectedAction === 'EXTRACT' ? (
                <ExtractionScribe
                  leyline={battleState.leylines?.find(ley => ley.coord.x === scholar?.position.x && ley.coord.y === scholar?.position.y)}
                  onSubmit={async (phrase) => {
                    await submitExtraction(phrase, scholar?.position);
                    setSelectedAction(null);
                  }}
                  isDisabled={isCombatEnded || !isPlayerTurn || isResolving}
                  variant="terminal"
                />
              ) : (
                <OracleScribe
                  onSubmit={submitScoringCast}
                  isDisabled={isCombatEnded || (bridgeState === 'CASTING' ? false : (!isPlayerTurn || isResolving))}
                  school={arenaSchool}
                  variant="terminal"
                />
              )}
            </div>
          </div>

        </div>
      </div>
    </CombatUIStateProvider>
  );
}
