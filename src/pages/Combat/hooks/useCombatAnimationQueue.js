import { useState, useCallback, useRef } from 'react';
import { deriveDescriptorFromSignals } from '../render/motionDescriptors.js';

/**
 * useCombatAnimationQueue.js
 *
 * Manages a deterministic sequence of visual intents played against the Phaser board.
 * Game logic resolves first; animation plays after.
 *
 * Fixes applied:
 *   - isPlayingRef (not state) controls enqueue guard — eliminates stale-closure double-start
 *   - enqueue has no isPlaying dependency so callers' useEffect deps stay stable
 *   - phaserApi stored in ref so recursive processNext always has the current handle
 */

export function useCombatAnimationQueue() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIntent, setActiveIntent] = useState(null);

  // Refs used inside callbacks — avoid stale closures
  const isPlayingRef   = useRef(false);
  const queueRef       = useRef([]);
  const phaserApiRef   = useRef(null);

  const processNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setActiveIntent(null);
      return;
    }

    isPlayingRef.current = true;
    setIsPlaying(true);

    const intent = queueRef.current.shift();
    setActiveIntent(intent);

    const phaserApi = phaserApiRef.current;
    if (!phaserApi) {
      // No Phaser handle — drain silently
      processNext();
      return;
    }

    const descriptor = deriveDescriptorFromSignals(
      intent.type === 'MOVE'       ? 'PHONEMIC_STEP'  :
      intent.type === 'CAST'       ? 'LEXICAL_CHARGE' :
      intent.type === 'EXTRACT'    ? 'LEXICAL_CHARGE' :
      intent.type === 'HIT'        ? 'IMPACT_FLASH'   :
      /* TURN_SHIFT */               'TURN_SWEEP',
      intent.signals || {}
    );

    const onComplete = () => processNext();

    switch (intent.type) {
      case 'MOVE':
        phaserApi.animateMove(intent.unitId, intent.path, descriptor, onComplete, intent.origin, {
          suppressDebris: Boolean(intent.suppressDebris),
        });
        break;
      case 'CAST':
        phaserApi.animateCast(intent.unitId, intent.target, intent.school, descriptor, onComplete, {
          suppressDebris: Boolean(intent.suppressDebris),
        });
        break;
      case 'EXTRACT':
        phaserApi.animateExtraction(intent.unitId, intent.target, intent.school, intent.signals, intent.stars, onComplete);
        break;
      case 'HIT':
        phaserApi.animateHit(intent.affectedTiles, intent.school, descriptor, onComplete, {
          suppressDebris: Boolean(intent.suppressDebris),
        });
        break;
      case 'TURN_SHIFT':
        phaserApi.animateTurnShift(intent.activeSide, descriptor, onComplete);
        break;
      default:
        onComplete();
    }
  }, []); // stable — only refs inside

  /**
   * Add an intent to the queue and start playback if idle.
   * @param {{ type: string, [key: string]: any }} intent
   * @param {object} phaserApi  — the BattleArena imperative handle
   */
  const enqueue = useCallback((intent, phaserApi) => {
    // Always keep phaserApi current
    phaserApiRef.current = phaserApi;
    queueRef.current.push(intent);

    // Guard via ref — not state — so concurrent enqueue calls in the same tick
    // don't both see isPlaying=false and start two processNext chains.
    if (!isPlayingRef.current) {
      processNext();
    }
  }, [processNext]); // processNext is stable, no isPlaying dep

  return {
    enqueue,
    isPlaying,
    activeIntent,
    queueSize: queueRef.current.length,
  };
}
