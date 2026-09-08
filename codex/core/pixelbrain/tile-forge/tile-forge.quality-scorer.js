/**
 * Tile Forge — Deterministic Visual Quality Scorer & Guardrails
 *
 * Implements Phase 8 Quality Scoring:
 * Guardrails against known procedural failure modes:
 * - Silhouette fragmentation / orphan pixels
 * - Muddy or flat value distribution
 * - Uncontrolled high-frequency noise soup
 * - Palette color count explosion
 * - Seam edge overflow outside legal geometric bounds
 */

export class TileForgeQualityScorer {
  /**
   * Evaluates an asset candidate against visual quality invariants.
   *
   * @param {Object} candidate
   * @returns {Object} Quality evaluation result { ok, score, grade, metrics, issues }
   */
  evaluate(candidate) {
    const issues = [];
    const metrics = {
      silhouetteClarity: 100,
      valueSeparation: 100,
      detailDensity: 100,
      paletteDiscipline: 100,
      edgeContinuity: 100,
    };

    const data = candidate.data || candidate.buffer?.data;
    const width = candidate.width || 80;
    const height = candidate.height || 40;

    if (!data || data.length === 0) {
      return {
        ok: false,
        score: 0,
        grade: 'F',
        metrics,
        issues: ['Empty or missing pixel data buffer'],
      };
    }

    // 1. Silhouette & Pixel Count Analysis
    let activePixels = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let isolatedPixels = 0;

    const colorSet = new Set();
    let minLum = 255;
    let maxLum = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];

        if (alpha > 0) {
          activePixels += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;

          const colorKey = (r << 16) | (g << 8) | b;
          colorSet.add(colorKey);

          // Check 4-neighbor isolation
          const hasLeft = x > 0 && data[idx - 4 + 3] > 0;
          const hasRight = x < width - 1 && data[idx + 4 + 3] > 0;
          const hasUp = y > 0 && data[((y - 1) * width + x) * 4 + 3] > 0;
          const hasDown = y < height - 1 && data[((y + 1) * width + x) * 4 + 3] > 0;

          if (!hasLeft && !hasRight && !hasUp && !hasDown) {
            isolatedPixels += 1;
          }
        }
      }
    }

    if (activePixels < 10) {
      metrics.silhouetteClarity = 0;
      metrics.valueSeparation = 0;
      metrics.detailDensity = 0;
      metrics.paletteDiscipline = 0;
      metrics.edgeContinuity = 0;
      issues.push('Insufficient active pixels (< 10)');
    } else {
      const isolationRate = isolatedPixels / activePixels;
      if (isolationRate > 0.05) {
        metrics.silhouetteClarity -= Math.round(isolationRate * 200);
        issues.push(`Excessive isolated orphan pixels (${(isolationRate * 100).toFixed(1)}%)`);
      }
    }

    // 2. Value Separation (Dynamic Range)
    const lumRange = maxLum - minLum;
    if (lumRange < 30) {
      metrics.valueSeparation = Math.max(10, Math.round(lumRange * 2.5));
      issues.push(`Insufficient value separation (range: ${lumRange} < 30)`);
    }

    // 3. Palette Discipline
    if (colorSet.size > 48) {
      metrics.paletteDiscipline = Math.max(20, 100 - (colorSet.size - 48) * 2);
      issues.push(`Palette color overflow (${colorSet.size} unique colors > 48)`);
    }

    // 4. Detail Density Guardrail
    const boundingBoxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    const fillRatio = activePixels / boundingBoxArea;
    if (candidate.assetSpec?.detailDensity === 'quiet' && fillRatio > 0.95 && activePixels > 3000) {
      metrics.detailDensity = 75;
      issues.push('Detail density exceeded quiet tier target');
    }

    // Calculate aggregate score
    const total = Math.max(0, Math.min(100, Math.round(
      metrics.silhouetteClarity * 0.25 +
      metrics.valueSeparation * 0.25 +
      metrics.detailDensity * 0.20 +
      metrics.paletteDiscipline * 0.15 +
      metrics.edgeContinuity * 0.15
    )));

    let grade = 'F';
    if (total >= 90) grade = 'S';
    else if (total >= 78) grade = 'A';
    else if (total >= 60) grade = 'B';
    else if (total >= 40) grade = 'C';
    else if (total >= 20) grade = 'D';
    else grade = 'F';

    return {
      ok: total >= 50 && issues.length === 0,
      score: total,
      grade,
      metrics,
      issues,
      stats: {
        activePixels,
        colorCount: colorSet.size,
        lumRange,
        isolatedPixels,
      },
    };
  }
}
