import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useSpellBubbles
 *
 * Drives the lifecycle of spell-cast dialogue bubbles that hang above
 * each unit's head in the Phaser board. Synced to the animation queue:
 *
 *   CAST intent starts → bubble appears (status: 'showing')
 *   HIT  intent starts → bubble fades   (status: 'fading')
 *   fade complete      → bubble is removed
 *
 * The hook is the single source of truth for "what bubbles exist
 * right now and where they are." The component layer consumes
 * `bubbles` and positions each one at the unit's head anchor.
 *
 * Multiple bubbles can exist simultaneously (player casts and enemy
 * retaliates in the same turn) — each is keyed by its intent id, not
 * by unitId, so the same unit can show back-to-back bubbles without
 * a race.
 */

/**
 * @typedef {Object} SpellBubble
 * @property {string} id              — stable identity for animations
 * @property {string} unitId          — 'player' | 'opponent'
 * @property {string} phrase          — top-line text (the verse or telegraph)
 * @property {string} commentary      — bottom-line text (the aftermath)
 * @property {string} school          — casting school (drives glow color)
 * @property {'showing'|'fading'} status
 */

let _bubbleIdCounter = 0;
const nextBubbleId = () => `bubble-${++_bubbleIdCounter}`;

export function useSpellBubbles({ activeIntent, fadeMs = 260 }) {
  const [bubbles, setBubbles] = useState(/** @type {SpellBubble[]} */ ([]));
  const fadeTimersRef = useRef(new Map());

  const removeBubble = useCallback((id) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id));
    const timer = fadeTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      fadeTimersRef.current.delete(id);
    }
  }, []);

  const startFade = useCallback((id) => {
    setBubbles((prev) => prev.map((b) => (b.id === id && b.status === 'showing' ? { ...b, status: 'fading' } : b)));
    const existing = fadeTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => removeBubble(id), fadeMs);
    fadeTimersRef.current.set(id, timer);
  }, [fadeMs, removeBubble]);

  // Reset everything when the active intent becomes null (queue drained).
  useEffect(() => {
    if (activeIntent) return;
    // Give any in-flight bubble a graceful fade instead of a hard cut.
    setBubbles((prev) => {
      prev.forEach((b) => { if (b.status === 'showing') startFade(b.id); });
      return prev;
    });
  }, [activeIntent, startFade]);

  // React to the active intent.
  useEffect(() => {
    if (!activeIntent) return;
    if (activeIntent.type === 'CAST') {
      const payload = activeIntent.bubble;
      if (!payload?.phrase) return; // no bubble data — skip
      const id = nextBubbleId();
      const bubble = {
        id,
        unitId: activeIntent.unitId,
        phrase: payload.phrase,
        commentary: payload.commentary || '',
        school: activeIntent.school || payload.school || 'SONIC',
        status: 'showing',
      };
      setBubbles((prev) => [...prev, bubble]);
    } else if (activeIntent.type === 'HIT') {
      // HIT marks the spell landing — fade any bubble that's still
      // showing (typically the one from the preceding CAST).
      setBubbles((prev) => {
        prev.forEach((b) => { if (b.status === 'showing') startFade(b.id); });
        return prev;
      });
    }
  }, [activeIntent, startFade]);

  // Cleanup on unmount.
  useEffect(() => () => {
    fadeTimersRef.current.forEach((t) => clearTimeout(t));
    fadeTimersRef.current.clear();
  }, []);

  return { bubbles, removeBubble, startFade };
}
