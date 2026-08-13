/**
 * GENES SCORED BY EVIDENCE, NOT BY DECLARATION.
 *
 * Every SCDNA gene carries a lifecycle built for this — `degradationFactor`
 * 0.85, `recoveryIncrement` 0.02, `deprecationThreshold` 0.45 — and nothing had
 * ever filled it. All thirteen genes sat at `contradictionCount: 0`, because the
 * only thing that could contradict a gene was another gene.
 *
 * So `BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK` held confidence 0.98 while the
 * bug it names was live and undetected, and held 0.98 once it was fixed. The
 * number was a declaration. These tests hold the wiring that makes it a
 * measurement.
 *
 * The Python half (`scdna/evidence.py`) applies the counts through
 * `degrade_gene` / `recover_gene`. This half proves the counts are honest,
 * because a scoring loop fed by a lying counter is worse than no loop at all.
 */

import { describe, expect, it } from 'vitest';
import { GENE_EVIDENCE, judgeGenes, sweepRuleOccurrences } from '../../../scripts/gene-evidence-sweep.mjs';

describe('gene evidence sweep', () => {
  it('scores a gene only where a check can COUNT what it claims', () => {
    // The refusal is the point. `SEMANTIC_KIND_PROBE_READONLY` is a policy about
    // intent with no occurrence count; scoring it would be inventing a
    // measurement, which is the failure the Gutenberg Tribunal was convened for.
    for (const [geneId, entry] of Object.entries(GENE_EVIDENCE)) {
      expect(entry.rules.length, `${geneId} claims evidence but names no rule`).toBeGreaterThan(0);
      expect(entry.claim, `${geneId} must state what it claims in words`).toBeTruthy();
      for (const rule of entry.rules) expect(rule).toMatch(/^[A-Z]+-[0-9A-F]{4}$/);
    }
  });

  it('says CONFIRMED when the pattern is present', () => {
    const verdicts = judgeGenes({
      scanned: 1,
      counts: { 'ARCH-0F0E': 2, 'ARCH-0F0D': 0 },
      sites: { 'ARCH-0F0E': ['src/a.ts', 'src/b.ts'], 'ARCH-0F0D': [] },
    });
    expect(verdicts.BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK.verdict).toBe('CONFIRMED');
    expect(verdicts.BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK.occurrences).toBe(2);
  });

  it('says CONTRADICTED when the pattern is gone everywhere', () => {
    // CONTRADICTED does not mean the gene is WRONG. A gene warning about a
    // pattern that no longer occurs is unemployed, and decay is how the system
    // stops shouting about a fixed bug while staying able to shout again.
    const verdicts = judgeGenes({
      scanned: 1, counts: { 'ARCH-0F0E': 0, 'ARCH-0F0D': 0 }, sites: { 'ARCH-0F0E': [], 'ARCH-0F0D': [] },
    });
    expect(verdicts.BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK.verdict).toBe('CONTRADICTED');
  });

  it('sums every rule a gene rests on, so one surviving site keeps it alive', () => {
    const verdicts = judgeGenes({
      scanned: 1, counts: { 'ARCH-0F0D': 1, 'ARCH-0F0E': 0 },
      sites: { 'ARCH-0F0D': ['codex/x.js'], 'ARCH-0F0E': [] },
    });
    expect(verdicts.ARCH_RULE_BACKEND_TRUTH_AUTHORITY.verdict).toBe('CONFIRMED');
    expect(verdicts.BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK.verdict).toBe('CONTRADICTED');
  });

  it('counts real occurrences over the tracked tree without throwing', () => {
    const occurrences = sweepRuleOccurrences();
    expect(occurrences.scanned).toBeGreaterThan(1000);
    for (const rule of Object.keys(occurrences.counts)) {
      expect(occurrences.counts[rule]).toBe(occurrences.sites[rule].length);
    }
  });

  it('reports the repository as clean of both patterns today', () => {
    // The Color Dragon was fixed on 2026-08-13. If this fails, either the bug is
    // back — in which case the gene should recover and start warning again — or
    // a detector regressed. Both are worth stopping for.
    const { counts } = sweepRuleOccurrences();
    expect(counts['ARCH-0F0D']).toBe(0);
    expect(counts['ARCH-0F0E']).toBe(0);
  });
});
