import React from 'react';
import { motion } from 'framer-motion';

/**
 * SigilEntity.jsx
 *
 * A PixelBrain-driven visual representation of a combatant.
 * Mutates its geometry and animation based on world-law signals.
 */

export default function SigilEntity({
  school = 'SONIC',
  effectClass = 'RESONANT',
  glowIntensity = 0.5,
  size = 60,
  className = ""
}) {
  // Mapping schools to base HSL (can be refined with computeBlendedHsl later)
  const schoolColors = {
    SONIC: { h: 265, s: 60, l: 55 },
    VOID: { h: 240, s: 15, l: 35 },
    PSYCHIC: { h: 195, s: 65, l: 50 },
    ALCHEMY: { h: 305, s: 60, l: 48 },
    WILL: { h: 30, s: 45, l: 55 },
  };

  const color = schoolColors[school] || schoolColors.SONIC;
  const baseColor = `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
  const glowColor = `hsla(${color.h}, ${color.s}%, ${color.l + 20}%, ${glowIntensity})`;

  // Effect Class determines animation and complexity
  const getAnimation = () => {
    switch (effectClass) {
      case 'TRANSCENDENT':
        return {
          animate: {
            rotate: 360,
            scale: [1, 1.1, 1],
            filter: [`drop-shadow(0 0 8px ${glowColor})`, `drop-shadow(0 0 24px ${glowColor})`, `drop-shadow(0 0 8px ${glowColor})`]
          },
          transition: { duration: 1.5, repeat: Infinity, ease: "linear" }
        };
      case 'HARMONIC':
        return {
          animate: {
            scale: [1, 1.05, 1],
            filter: [`drop-shadow(0 0 5px ${glowColor})`, `drop-shadow(0 0 15px ${glowColor})`, `drop-shadow(0 0 5px ${glowColor})`]
          },
          transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
        };
      case 'INERT':
        return {
          animate: { filter: 'grayscale(1) opacity(0.5)' },
          transition: { duration: 0.5 }
        };
      default: // RESONANT
        return {
          animate: {
            scale: [1, 1.02, 1],
            filter: `drop-shadow(0 0 10px ${glowColor})`
          },
          transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
        };
    }
  };

  const anim = getAnimation();

  return (
    <motion.div
      className={`sigil-entity-container ${className}`}
      style={{ width: size, height: size }}
      {...anim}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {/* Outer Ring - SYLLABLE DEPTH representation */}
        <motion.path
          d="M 50, 10 L 90, 50 L 50, 90 L 10, 50 Z" // Diamond base
          fill="none"
          stroke={baseColor}
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2 }}
        />

        {/* Inner Core - SCHOOL GLYPH */}
        <circle cx="50" cy="50" r="15" fill={baseColor} fillOpacity="0.2" stroke={baseColor} strokeWidth="1" />
        <text
          x="50"
          y="58"
          textAnchor="middle"
          fill={baseColor}
          fontSize="24"
          fontWeight="bold"
          style={{ textShadow: `0 0 5px ${glowColor}` }}
        >
          {school === 'SONIC' ? '♩' : school === 'VOID' ? '∅' : '✦'}
        </text>

        {/* Resonance Waves */}
        {effectClass !== 'INERT' && (
          <motion.circle
            cx="50"
            cy="50"
            r="15"
            stroke={baseColor}
            strokeWidth="1"
            fill="none"
            animate={{ r: [15, 45], opacity: [0.5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </svg>
    </motion.div>
  );
}
