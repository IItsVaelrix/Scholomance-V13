import { TileForgeQualityScorer } from './tile-forge.quality-scorer.js';

export class TileForgeScorer {
  constructor() {
    this.qualityScorer = new TileForgeQualityScorer();
  }

  score(candidate, validation, snapValidation) {
    let total = 0;
    const breakdown = {
      validationScore: 0,
      snapScore: 0,
      qualityScore: 100,
      penalties: 0
    };

    if (validation && validation.ok) {
      breakdown.validationScore = 50;
      total += 50;
    } else {
      breakdown.penalties -= 50;
      total -= 50;
    }

    if (snapValidation && snapValidation.ok) {
      breakdown.snapScore = 50;
      total += 50;
    } else {
      breakdown.penalties -= 50;
      total -= 50;
    }

    // Evaluate visual quality if pixel data or buffer is available
    let qualityResult = null;
    if (candidate && (candidate.data || candidate.buffer || candidate.layers?.scd128Synthesizer)) {
      qualityResult = this.qualityScorer.evaluate(candidate);
      breakdown.qualityScore = qualityResult.score;
      if (!qualityResult.ok) {
        breakdown.penalties -= (100 - qualityResult.score);
        total = Math.max(0, total - (100 - qualityResult.score));
      }
    }

    let grade = "C";
    if (total >= 100) grade = "S";
    else if (total >= 80) grade = "A";
    else if (total >= 50) grade = "B";
    else grade = "D";

    return {
      total,
      grade,
      breakdown,
      quality: qualityResult
    };
  }
}
