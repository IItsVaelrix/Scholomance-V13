import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { freshRng } from '../lib/math/seededRng.js';
import './DigitalRainText.css';

const MATRIX_CHARS = '001101011010|/\\#+=~';
const GLOW_VARIANTS = ['glow-cyan', 'glow-gold', 'glow-iridescent', 'glow-spark', 'glow-ethereal', 'glow-ember'];
const GLOW_DURATIONS = {
  'glow-cyan': 1200,
  'glow-gold': 1800,
  'glow-iridescent': 2400,
  'glow-spark': 700,
  'glow-ethereal': 2000,
  'glow-ember': 1600,
};

function randMatrixChar() {
  const rng = freshRng();
  return MATRIX_CHARS[Math.floor(rng() * MATRIX_CHARS.length)];
}

function useDigitalRainAnimation(text, reduceMotion, animateOnMount) {
  const [slots, setSlots] = useState(() => {
    const str = String(text || '');
    if (animateOnMount && str && !reduceMotion) {
      return str.split('').map(() => ({ char: randMatrixChar(), state: 'cycling' }));
    }
    return null;
  });
  const prevTextRef = useRef(String(text || ''));
  const isInitialRef = useRef(true);
  const cycleIds = useRef([]);
  const settleIds = useRef([]);
  const fullSettleId = useRef(null);

  const clearRainTimers = useCallback(() => {
    cycleIds.current.forEach(clearInterval);
    settleIds.current.forEach(clearTimeout);
    clearTimeout(fullSettleId.current);
    cycleIds.current = [];
    settleIds.current = [];
  }, []);

  const startRain = useCallback((str) => {
    clearRainTimers();

    if (!str || reduceMotion) {
      setSlots(null);
      return;
    }

    const chars = str.split('');
    setSlots(chars.map(() => ({ char: randMatrixChar(), state: 'cycling' })));

    chars.forEach((targetChar, i) => {
      const cId = setInterval(() => {
        setSlots(prev => {
          if (!Array.isArray(prev) || !prev[i] || prev[i].state !== 'cycling') return prev;
          const copy = [...prev];
          copy[i] = { char: randMatrixChar(), state: 'cycling' };
          return copy;
        });
      }, 45);
      cycleIds.current[i] = cId;

      const rng = freshRng();
      const delay = 80 + i * 55 + rng() * 20;
      const sId = setTimeout(() => {
        clearInterval(cycleIds.current[i]);
        setSlots(prev => {
          if (!Array.isArray(prev)) return prev;
          const copy = [...prev];
          if (copy[i]) copy[i] = { char: targetChar === ' ' ? ' ' : targetChar, state: 'settled' };
          return copy;
        });
      }, delay);
      settleIds.current[i] = sId;
    });

    const lastSettleAt = 80 + (chars.length - 1) * 55 + 20;
    fullSettleId.current = setTimeout(() => setSlots(null), lastSettleAt + 620);
  }, [clearRainTimers, reduceMotion]);

  useEffect(() => {
    const str = String(text || '');

    if (isInitialRef.current) {
      isInitialRef.current = false;
      prevTextRef.current = str;
      if (animateOnMount && !reduceMotion) {
        startRain(str);
      } else {
        setSlots(null);
      }
      return () => clearRainTimers();
    }

    if (reduceMotion) {
      clearRainTimers();
      setSlots(null);
      prevTextRef.current = str;
      return () => clearRainTimers();
    }

    if (str === prevTextRef.current) return;
    prevTextRef.current = str;
    startRain(str);

    return () => clearRainTimers();
  }, [text, reduceMotion, animateOnMount, startRain, clearRainTimers]);

  return slots;
}

function useGlowSchedule(enableGlow, reduceMotion) {
  const [glowClass, setGlowClass] = useState('');
  const glowTimer = useRef(null);
  const glowClear = useRef(null);

  const scheduleGlow = useCallback(() => {
    const rng = freshRng();
    const delay = 15000 + rng() * 30000;
    glowTimer.current = setTimeout(() => {
      const variant = GLOW_VARIANTS[Math.floor(rng() * GLOW_VARIANTS.length)];
      setGlowClass(`ide-title--${variant}`);
      glowClear.current = setTimeout(() => {
        setGlowClass('');
        scheduleGlow();
      }, GLOW_DURATIONS[variant] + 120);
    }, delay);
  }, []);

  useEffect(() => {
    if (!enableGlow || reduceMotion) return undefined;
    scheduleGlow();
    return () => {
      clearTimeout(glowTimer.current);
      clearTimeout(glowClear.current);
    };
  }, [enableGlow, scheduleGlow, reduceMotion]);

  return glowClass;
}

export default function DigitalRainText({
  text,
  as: Tag = 'span',
  className = '',
  animateOnMount = false,
  enableGlow = false,
}) {
  const reduceMotion = usePrefersReducedMotion();
  const slots = useDigitalRainAnimation(text, reduceMotion, animateOnMount);
  const glowClass = useGlowSchedule(enableGlow, reduceMotion);
  const str = String(text || '');
  const useIdeCharClasses = className.split(/\s+/).includes('ide-title');

  const rootClassName = [
    className,
    glowClass || null,
  ].filter(Boolean).join(' ');

  return (
    <Tag
      className={rootClassName || undefined}
      aria-label={str}
    >
      {slots !== null
        ? slots.map((slot, i) => (
            <span
              key={i}
              className={[
                'digital-rain-char',
                `digital-rain-char--${slot.state}`,
                useIdeCharClasses ? 'ide-title-char' : null,
                useIdeCharClasses ? `ide-title-char--${slot.state}` : null,
              ].filter(Boolean).join(' ')}
              aria-hidden="true"
            >
              {slot.char}
            </span>
          ))
        : (str || null)}
    </Tag>
  );
}
