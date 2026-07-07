export class TileForgeScorer {
  score(candidate, validation, snapValidation) {
    let total = 0;
    const breakdown = {
      validationScore: 0,
      snapScore: 0,
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

    let grade = "C";
    if (total >= 100) grade = "S";
    else if (total >= 80) grade = "A";
    else if (total >= 50) grade = "B";

    return {
      total,
      grade,
      breakdown
    };
  }
}
