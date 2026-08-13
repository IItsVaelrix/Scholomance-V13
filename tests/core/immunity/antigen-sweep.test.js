// @vitest-environment node
/**
 * ANTIGEN SWEEP — the edge from remembered scar to active hunt.
 *
 * Every assertion here exists because the failure it guards silently reports
 * ZERO, which reads as health. Measured 2026-08-12.
 */

import { describe, it, expect } from 'vitest';
import { triageAntigens, buildChunks } from '../../../scripts/antigen-sweep.mjs';
import { INFUSED_ANTIGENS } from '../../../codex/core/immunity/clerical-raid.substrate.js';

describe('antigen triage', () => {
  it('marks an antigen carrying a planner phrase as huntable', () => {
    const { huntable, unhuntable } = triageAntigens([
      { title: 'Silent failure: a swallowed error in a catch block returns a fallback' },
    ]);
    expect(unhuntable).toHaveLength(0);
    expect(huntable).toHaveLength(1);
    expect(huntable[0].classes).toContain('SWALLOWED_ERROR');
  });

  /**
   * The mistake this guards is one I made. The first draft of the swallowed-error
   * antigen was titled "A swallowed catch that returns a degraded-but-valid
   * value blinds every caller". The planner matches EXACT PHRASES — 'swallowed
   * error', 'catch block', 'silent failure', 'empty catch', 'error is ignored' —
   * and "swallowed catch" is none of them. It compiled to zero pathology
   * classes, so the sweep would have reported INCONCLUSIVE and the scar would
   * never have been hunted. An antigen must speak the planner's vocabulary.
   */
  it('marks a near-miss title as UNHUNTABLE rather than silently finding nothing', () => {
    const { huntable, unhuntable } = triageAntigens([
      { title: 'A swallowed catch that returns a degraded-but-valid value blinds every caller' },
    ]);
    expect(huntable).toHaveLength(0);
    expect(unhuntable).toHaveLength(1);
    expect(unhuntable[0].why).toMatch(/no pathology class/i);
  });

  it('never silently drops an antigen — every one lands in exactly one bucket', () => {
    const antigens = [
      { title: 'Silent failure: a swallowed error in a catch block' },
      { title: 'nothing the planner recognises whatsoever' },
      { title: 'math random used without a seed' },
    ];
    const { huntable, unhuntable } = triageAntigens(antigens);
    expect(huntable.length + unhuntable.length).toBe(antigens.length);
  });

  it('the committed substrate carries at least one huntable antigen', () => {
    // If this fails, the immune system has memory but nothing it can act on.
    const { huntable } = triageAntigens(INFUSED_ANTIGENS);
    expect(huntable.length).toBeGreaterThan(0);
  });
});

describe('sweep chunking', () => {
  /**
   * A single wide investigation exceeds cleri-probe's 30s runtime budget
   * (measured 35,623ms over codex+src) and returns PARTIAL with ZERO findings
   * while reporting coverage.complete = true. The two largest trees must be
   * split, or the sweep reports health it never established.
   */
  it('splits codex/core and src/lib instead of scanning them whole', () => {
    const chunks = buildChunks();
    expect(chunks).not.toContain('codex/core');
    expect(chunks).not.toContain('src/lib');
    expect(chunks.some((c) => c.startsWith('codex/core/'))).toBe(true);
    expect(chunks.some((c) => c.startsWith('src/lib/'))).toBe(true);
  });

  it('produces enough chunks that no single one carries the whole tree', () => {
    expect(buildChunks().length).toBeGreaterThan(10);
  });
});
