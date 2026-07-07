/**
 * Scholomance Character Motif Amp
 * Injects runes, sigils, crystal accents, and arcane glows onto clothing/hair.
 * Designed to layer on top of existing character-foundry output.
 */
import { registerAmp } from './amp-registry.js'; // assume pattern from other amps

export function applyScholomanceMotifs(cells, options = {}) {
  const { school = 'void', intensity = 0.7 } = options;
  const motifColor = {
    void: '#4B2E6E',
    frost: '#7EC8FF',
    holyfire: '#FF9E4D',
    crystal: '#A8E6FF',
  }[school] || '#6B4E8C';

  // Simple rune injection on upper torso / hair
  const runeCells = cells.filter(c => c.y < 8 && c.y > 0 && Math.abs(c.x) < 6);
  runeCells.forEach((cell, i) => {
    if (i % 7 === 0) {
      cell.color = motifColor;
      cell.alpha = intensity;
    }
  });

  return cells;
}

registerAmp('scholomance.character.motif', applyScholomanceMotifs);
