import { useState, useRef, useEffect, useCallback } from 'react';
import { combatBridge } from '../combatBridge.js';
import { buildCombatRundown } from '../../../../codex/core/combat.exegesis.js';

/**
 * useSpellScoringFlow
 *
 * Owns the bridge-state machine for the spell-scoring flow:
 *   PLAYER_TURN → CASTING → SPELL_FLYING → SCORE_REVEAL → VICTORY
 *
 * Two scoring paths:
 *   - Local:   submitCast() invokes onLocalCast() (synchronous in-page resolution)
 *   - Bridge:  submitCast() POSTs to /api/combat/score; SCORE_REVEAL shows
 *              the verse aftermath; "Claim victory" synthesizes a one-turn
 *              rundown and opens the rundown modal.
 *
 * Also owns the post-battle auto-open of the rundown modal for the
 * non-bridge (in-page) victory/defeat endings.
 *
 * Layer law: buildCombatRundown is consumed here (not in the page) so the
 * React component layer never imports Codex analysis modules directly.
 */
export function useSpellScoringFlow({
  battleState,
  scholar,
  arenaSchool,
  isPlaying,
  isResolving,
  isCombatEnded,
  onLocalCast,
}) {
  const [bridgeState, setBridgeState] = useState('PLAYER_TURN');
  const [scoreResult, setScoreResult] = useState(null);
  const [combatRundown, setCombatRundown] = useState(null);
  const [isRundownOpen, setIsRundownOpen] = useState(false);
  const lastRundownKeyRef = useRef(null);

  // --- Bridge event subscriptions ---
  useEffect(() => {
    const offStateUpdate = combatBridge.on('state:update', (payload) => {
      if (payload.state) setBridgeState(payload.state);
    });
    const offActionInscribe = combatBridge.on('action:inscribe', () => {
      setBridgeState('CASTING');
    });
    const offAnimDone = combatBridge.on('anim:player:done', () => {
      setBridgeState('SCORE_REVEAL');
    });
    return () => {
      offStateUpdate();
      offActionInscribe();
      offAnimDone();
    };
  }, []);

  // --- Post-battle rundown auto-open (in-page victory/defeat endings) ---
  useEffect(() => {
    if (!isCombatEnded) return;
    if (isResolving || isPlaying) return;

    const rundownKey = [
      battleState?.id || 'battle',
      battleState?.phase,
      Array.isArray(battleState?.history) ? battleState.history.length : 0,
    ].join(':');

    if (lastRundownKeyRef.current === rundownKey) return;
    lastRundownKeyRef.current = rundownKey;
    setCombatRundown(buildCombatRundown(battleState));
    setIsRundownOpen(true);
  }, [battleState, isPlaying, isResolving, isCombatEnded]);

  // --- Bridge scoring fetch ---
  const submitBridgeCast = useCallback(async (text, weave) => {
    try {
      const resp = await fetch('/api/combat/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, weave }),
      });
      const data = await resp.json();
      setScoreResult(data);
      setBridgeState('SPELL_FLYING');
    } catch {
      setBridgeState('PLAYER_TURN');
    }
  }, []);

  // --- Unified submit dispatcher (routes local vs bridge) ---
  const submitCast = useCallback((text, weave) => {
    if (bridgeState === 'CASTING') {
      submitBridgeCast(text, weave);
    } else {
      onLocalCast?.(text, weave);
    }
  }, [bridgeState, submitBridgeCast, onLocalCast]);

  // --- "Claim victory" from the SCORE_REVEAL overlay ---
  // Synthesizes a one-turn history so buildCombatRundown has data to
  // shape into the post-bridge modal.
  const claimVictory = useCallback(() => {
    const bridgeRundown = buildCombatRundown({
      phase: 'victory',
      round: battleState?.round,
      playerTurnIndex: battleState?.playerTurnIndex,
      spentLeylineIds: battleState?.spentLeylineIds,
      history: [{
        type: 'PLAYER_CAST',
        entityId: 'player',
        actionType: 'cast',
        phrase: scoreResult?.text || 'Bridge inscription',
        damageDealt: Number(scoreResult?.damage) || 0,
        healingDone: Number(scoreResult?.healing) || 0,
        mpCost: 10,
        wasSupercharged: false,
        playerHpAtCast: scholar?.hp ?? 100,
        playerMaxHpAtCast: scholar?.maxHp ?? 100,
        profile: {
          rhymeQuality: scoreResult?.rhymeQuality ?? 0,
          verseIRMultiplier: scoreResult?.verseIRMultiplier ?? 1,
          affinity: scoreResult?.school || arenaSchool,
        },
      }],
    });
    setBridgeState('VICTORY');
    setCombatRundown(bridgeRundown);
    setIsRundownOpen(true);
  }, [battleState, scoreResult, scholar, arenaSchool]);

  // --- Modal dismiss (reset bridge state when leaving VICTORY) ---
  const dismissRundown = useCallback(() => {
    setIsRundownOpen(false);
    if (bridgeState === 'VICTORY') {
      setBridgeState('PLAYER_TURN');
    }
  }, [bridgeState]);

  // --- Reset the entire scoring flow for a new battle ---
  const clearForRestart = useCallback(() => {
    lastRundownKeyRef.current = null;
    setIsRundownOpen(false);
    setCombatRundown(null);
    setBridgeState('PLAYER_TURN');
    setScoreResult(null);
  }, []);

  return {
    bridgeState,
    scoreResult,
    combatRundown,
    isRundownOpen,
    submitCast,
    claimVictory,
    dismissRundown,
    clearForRestart,
  };
}
