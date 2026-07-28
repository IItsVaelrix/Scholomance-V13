import { describe, it, expect } from 'vitest';
import {
  compileSemanticIntent,
  compileProbeReport,
  compileProbePlan,
  assertExecutable,
  SCHEMA_HASH,
} from '../../codex/core/semantic-calculus/compiler.ts';
import { assertSealedIntact } from '../../codex/core/semantic-calculus/seal.ts';
import { emptyContext } from '../../codex/core/semantic-calculus/trustPartition.ts';
import { deriveEpistemic, assertEpistemicDoesNotAlterKind } from '../../codex/core/semantic-calculus/epistemic.ts';
import { evaluateHypotheses, evalPredicate } from '../../codex/core/semantic-calculus/hypothesisStatus.js';
import { makeReceipt, receiptDigest } from '../../codex/core/semantic-calculus/observationReceipt.ts';
import { getProbe, listProbeIds } from '../../codex/core/semantic-calculus/probeRegistry.ts';
import { SEMANTIC_CALCULUS_ERRORS } from '../../codex/core/semantic-calculus/types.ts';

const ctx = (over = {}) => ({ ...emptyContext(), ...over });

describe('rev 7 — five kinds only (no Theory subkinds)', () => {
  it('never emits TheoryUnbound* kinds', () => {
    const samples = [
      'go to albums',
      'infernal plumed helm',
      'why listen animations fail',
      'open it',
      'run the tests',
      'what is track',
    ];
    for (const u of samples) {
      const { act } = compileSemanticIntent({ utterance: u, context: ctx() });
      expect(['Do', 'Clarify', 'Probe', 'Theory', 'Hypothesis']).toContain(act.kind);
      expect(String(act.kind)).not.toMatch(/TheoryUnbound/);
    }
  });

  it('schemaVersion is SEMANTIC_ACT_v2', () => {
    const { act } = compileSemanticIntent({ utterance: 'go to albums', context: ctx() });
    expect(act.schemaVersion).toBe('SEMANTIC_ACT_v2');
    expect(act.version).toBe('SemanticCalculus-v2');
    expect(act.compiler.schemaHash).toBe(SCHEMA_HASH);
  });
});

describe('rev 7 — orthogonal epistemic fields', () => {
  it('Do has gap=none method=bound', () => {
    const { act } = compileSemanticIntent({ utterance: 'go to albums', context: ctx() });
    expect(act.kind).toBe('Do');
    expect(act.epistemic.gap).toBe('none');
    expect(act.epistemic.method).toBe('bound');
    expect(act.phase).toBe('atomic');
    expect(act.epistemic.warrantPresent).toContain('lexicon');
  });

  it('Theory unbound gibberish is concept gap, still Theory', () => {
    const { act } = compileSemanticIntent({ utterance: 'infernal plumed helm', context: ctx() });
    expect(act.kind).toBe('Theory');
    expect(act.epistemic.gap).toBe('concept');
    expect(act.epistemic.method).toBe('absent');
    expect(act.theoryDeposit.required).toBe(true);
  });

  it('diagnostic unbound without probe bind uses procedure gap', () => {
    // Interrogative without inquiry-keyword density → Theory + procedure gap
    const { act } = compileSemanticIntent({
      utterance: 'why does the flargle break in production tonight',
      context: ctx(),
    });
    expect(act.kind).toBe('Theory');
    expect(act.epistemic.gap).toBe('procedure');
    expect(act.investigationDeposit).toBeTruthy();
    expect(act.investigationDeposit.status).toBe('open');
  });

  it('Clarify open it has required_slot gap', () => {
    const { act } = compileSemanticIntent({
      utterance: 'open it',
      context: ctx({ user: { route: '/visualiser/album/grimoire-vol-1' } }),
    });
    expect(act.kind).toBe('Clarify');
    expect(act.epistemic.gap).toBe('required_slot');
    expect(act.epistemic.method).toBe('underspecified');
  });

  it('a lexicon-role hint never overrides the surface-form gap', () => {
    // Regression: the CLI gate asserted lexiconRole:'action' for every unbound
    // Theory because its only lexicon is package.json scripts. That made a
    // closed-world miss masquerade as a command request, so 'what is a session
    // word' reported gap=command and advised writing an npm script for it.
    const base = {
      kind: 'Theory',
      bound: false,
      hasUnresolvedSlots: false,
      unknownReferent: false,
      needsEvidence: false,
      hasObservationReceipts: false,
      hasGeneCites: false,
    };
    const concept = deriveEpistemic({ ...base, utterance: 'what is a session word', lexiconRole: 'action' });
    expect(concept.gap).toBe('concept');

    const procedure = deriveEpistemic({ ...base, utterance: 'why does the flargle break', lexiconRole: 'action' });
    expect(procedure.gap).toBe('procedure');

    // A command-shaped utterance still earns a command gap on surface form alone.
    const command = deriveEpistemic({ ...base, utterance: 'run the flargle deploy', lexiconRole: 'action' });
    expect(command.gap).toBe('command');
  });

  it('epistemic derivation never changes kind', () => {
    const kinds = ['Do', 'Clarify', 'Probe', 'Theory', 'Hypothesis'];
    for (const kind of kinds) {
      const e = deriveEpistemic({
        kind,
        bound: kind === 'Do' || kind === 'Probe' || kind === 'Clarify',
        hasUnresolvedSlots: kind === 'Clarify',
        unknownReferent: false,
        needsEvidence: kind === 'Probe',
        hasObservationReceipts: false,
        hasGeneCites: false,
        utterance: 'test',
      });
      assertEpistemicDoesNotAlterKind(kind, kind);
      expect(e.gap).toBeTruthy();
    }
  });

  it('mutating epistemic after seal breaks seal', () => {
    const { act } = compileSemanticIntent({ utterance: 'go to albums', context: ctx() });
    const tampered = structuredClone(act);
    tampered.epistemic = { ...tampered.epistemic, gap: 'procedure' };
    expect(() => assertSealedIntact(tampered)).toThrow(SEMANTIC_CALCULUS_ERRORS.SEAL_MUTATION);
  });
});

describe('rev 7 — inquiry Probe plans (no harness run)', () => {
  it('registers the harvested probes', () => {
    // truesight.payload.oom was added by USING the language on a real open bug
    // rather than by imagining one — the point of P1 was to find out whether the
    // abstraction survives contact with the codebase. It did; it also proved the
    // predicate language could not say "less than" until it had to.
    expect(listProbeIds()).toEqual([
      'runtime.csp.img_src',
      'cdn.asset.http',
      'render.stack.listen',
      'motion.visibility.station',
      'truesight.payload.oom',
      'listen.hidden.animation',
      'render.paint.overdraw',
      'tui.tabs.output_isolation',
    ]);
  });

  it('binds excessive painting inquiry to a Probe plan', () => {
    const { act } = compileSemanticIntent({
      utterance: 'why excessive painting',
      context: ctx(),
    });
    expect(act.kind).toBe('Probe');
    expect(act.phase).toBe('plan');
    expect(act.payload.probeId).toBe('render.paint.overdraw');
    expect(act.epistemic.gap).toBe('evidence');
    expect(act.epistemic.warrantRequired).toContain('observation');
    expect(() => assertExecutable(act)).toThrow();
  });

  it('binds per-frame animation spawn inquiry to the paint overdraw Probe', () => {
    const { act } = compileSemanticIntent({
      utterance: 'why are animation frames created individually',
      context: ctx(),
    });
    expect(act.kind).toBe('Probe');
    expect(act.payload.probeId).toBe('render.paint.overdraw');
    expect(act.epistemic.gap).toBe('evidence');
  });

  it('binds listen stutter inquiry to a Probe plan', () => {
    const { act } = compileSemanticIntent({
      utterance: 'why listen animations fail',
      context: ctx(),
    });
    expect(act.kind).toBe('Probe');
    expect(act.phase).toBe('plan');
    expect(act.payload.probeId).toBe('render.stack.listen');
    expect(act.payload.phase).toBe('plan');
    expect(act.epistemic.gap).toBe('evidence');
    expect(act.epistemic.warrantRequired).toContain('observation');
    expect(() => assertExecutable(act)).toThrow();
  });

  it('compileProbePlan seals a plan without running observations', () => {
    const { act } = compileProbePlan({
      utterance: 'diagnose',
      context: ctx(),
      probeId: 'runtime.csp.img_src',
    });
    expect(act.phase).toBe('plan');
    expect(act.payload.probeId).toBe('runtime.csp.img_src');
    expect(act.payload.hypotheses?.length).toBeGreaterThan(0);
  });
});

describe('rev 7 — two-phase Probe report', () => {
  it('plan seal ≠ report seal', () => {
    const plan = compileProbePlan({
      utterance: 'csp',
      context: ctx(),
      probeId: 'runtime.csp.img_src',
    });
    const receipts = [
      makeReceipt({
        probeId: 'runtime.csp.img_src',
        observationId: 'obs.csp.header',
        result: { imgSrc: "'self' data:" },
        status: 'observed',
      }),
    ];
    const report = compileProbeReport({
      utterance: 'csp',
      context: ctx(),
      probeId: 'runtime.csp.img_src',
      receipts,
    });
    expect(report.act.phase).toBe('report');
    expect(report.act.seal.digest).not.toBe(plan.act.seal.digest);
    expect(report.act.payload.warrant).toBe('observation');
    expect(report.act.epistemic.warrantPresent).toContain('observation');
  });

  it('report without receipts throws', () => {
    expect(() =>
      compileProbeReport({
        utterance: 'csp',
        context: ctx(),
        probeId: 'runtime.csp.img_src',
        receipts: [],
      }),
    ).toThrow(SEMANTIC_CALCULUS_ERRORS.REPORT_WITHOUT_RECEIPTS);
  });

  it('receipt mutation breaks report seal', () => {
    const receipts = [
      makeReceipt({
        probeId: 'runtime.csp.img_src',
        observationId: 'obs.csp.header',
        result: { imgSrc: "'self' data:" },
        status: 'observed',
      }),
    ];
    const { act } = compileProbeReport({
      utterance: 'csp',
      context: ctx(),
      probeId: 'runtime.csp.img_src',
      receipts,
    });
    const tampered = structuredClone(act);
    tampered.payload.receiptDigests = ['0'.repeat(64)];
    expect(() => assertSealedIntact(tampered)).toThrow(SEMANTIC_CALCULUS_ERRORS.SEAL_MUTATION);
  });

  it('replay does not re-run observations — same receipts, same digest', () => {
    const receipts = [
      makeReceipt({
        probeId: 'runtime.csp.img_src',
        observationId: 'obs.csp.header',
        result: { imgSrc: "'self' data:" },
        status: 'observed',
      }),
    ];
    const a = compileProbeReport({
      utterance: 'csp',
      context: ctx(),
      probeId: 'runtime.csp.img_src',
      receipts,
    });
    const b = compileProbeReport({
      utterance: 'csp',
      context: ctx(),
      probeId: 'runtime.csp.img_src',
      receipts,
    });
    expect(b.act.seal.digest).toBe(a.act.seal.digest);
  });
});

describe('rev 7 — hypothesis status machine', () => {
  it('tool failure does not eliminate', () => {
    const probe = getProbe('runtime.csp.img_src');
    const receipts = [
      makeReceipt({
        probeId: probe.id,
        observationId: 'obs.csp.header',
        result: { error: 'timeout' },
        status: 'error',
      }),
    ];
    const ev = evaluateHypotheses(probe.hypotheses, receipts);
    expect(ev.eliminated).toEqual([]);
    expect(ev.underdetermined.length + ev.surviving.length).toBeGreaterThan(0);
  });

  it('two hypotheses may both be supported (multi-causal)', () => {
    // Craft two hypotheses that only require observed receipt
    const hyps = [
      {
        id: 'h1',
        claim: 'A',
        predictions: [{ id: 'p1', description: 'x', required: true, observationId: 'o1' }],
        falsifiers: [],
        citeSeeds: [],
      },
      {
        id: 'h2',
        claim: 'B',
        predictions: [{ id: 'p2', description: 'y', required: true, observationId: 'o1' }],
        falsifiers: [],
        citeSeeds: [],
      },
    ];
    const receipts = [
      makeReceipt({ probeId: 'p', observationId: 'o1', result: { ok: true }, status: 'observed' }),
    ];
    const ev = evaluateHypotheses(hyps, receipts);
    expect(ev.supported).toEqual(['h1', 'h2']);
    expect(ev.exclusive).toEqual([]);
  });

  it('CSP allows host eliminates blocks hypothesis', () => {
    const probe = getProbe('runtime.csp.img_src');
    const receipts = [
      makeReceipt({
        probeId: probe.id,
        observationId: 'obs.csp.header',
        result: { imgSrc: "'self' data: https://cdn2.suno.ai" },
        status: 'observed',
      }),
    ];
    const ev = evaluateHypotheses(probe.hypotheses, receipts);
    expect(ev.eliminated).toContain('h_csp_blocks_cdn2');
  });

  it('not falsified is never rendered as exclusive by default', () => {
    const probe = getProbe('runtime.csp.img_src');
    const receipts = [
      makeReceipt({
        probeId: probe.id,
        observationId: 'obs.csp.header',
        result: { imgSrc: "'self' data:" },
        status: 'observed',
      }),
    ];
    const ev = evaluateHypotheses(probe.hypotheses, receipts, { allowExclusive: false });
    expect(ev.exclusive).toEqual([]);
  });
});

describe('rev 7 — path existence alone is not causal warrant', () => {
  it('Probe plan warrantPresent does not include observation until receipts', () => {
    const { act } = compileProbePlan({
      utterance: 'x',
      context: ctx(),
      probeId: 'cdn.asset.http',
    });
    expect(act.epistemic.warrantPresent).not.toContain('observation');
    expect(act.epistemic.warrantRequired).toContain('observation');
  });
});

describe('rev 7 — procedure gap never becomes Do', () => {
  it('diagnostic Theory cannot assertExecutable', () => {
    const { act } = compileSemanticIntent({
      utterance: 'why does the flargle break in production tonight',
      context: ctx(),
    });
    expect(act.kind).toBe('Theory');
    expect(act.epistemic.gap).toBe('procedure');
    expect(() => assertExecutable(act)).toThrow(SEMANTIC_CALCULUS_ERRORS.THEORY_NOT_EXECUTABLE);
  });
});

describe('numeric predicates — added because a real probe needed them', () => {
  it('compares numbers', () => {
    expect(evalPredicate({ op: 'lt', path: 'n', value: 50 }, { n: 10 })).toBe(true);
    expect(evalPredicate({ op: 'lt', path: 'n', value: 50 }, { n: 1000 })).toBe(false);
    expect(evalPredicate({ op: 'lte', path: 'r', value: 1.15 }, { r: 0.945 })).toBe(true);
    expect(evalPredicate({ op: 'gt', path: 'n', value: 5 }, { n: 6 })).toBe(true);
    expect(evalPredicate({ op: 'gte', path: 'n', value: 6 }, { n: 6 })).toBe(true);
  });

  it('a missing or non-numeric field is inconclusive, never false', () => {
    // Coercing absence to 0 would eliminate a hypothesis on evidence nobody
    // collected — "unsearched counts as refutation", one layer down.
    expect(evalPredicate({ op: 'lt', path: 'missing', value: 50 }, {})).toBe('inconclusive');
    expect(evalPredicate({ op: 'lt', path: 'n', value: 50 }, { n: 'ten' })).toBe('inconclusive');
    expect(evalPredicate({ op: 'gte', path: 'n', value: 1 }, { n: NaN })).toBe('inconclusive');
  });
});

describe('truesight.payload.oom — the first probe written against a real open bug', () => {
  const R = (observationId, result, status = 'observed') =>
    makeReceipt({ probeId: 'truesight.payload.oom', observationId, result, status });

  /**
   * Measured 2026-07-16: payload against the real scholomance_dict.sqlite,
   * host memory off the live Fly machine e826491a6e3648 (512mb -> 459MB usable).
   */
  const AVAILABLE_BYTES = 239156 * 1024;
  const ENTRY_BYTES_4K = 1608503;
  const hostMemory = (maxEntries) => ({
    memTotalKb: 469852,
    memAvailableKb: 239156,
    cacheMaxEntries: maxEntries,
    entryBytesAt4kChars: ENTRY_BYTES_4K,
    boundBytesAt4kChars: maxEntries * ENTRY_BYTES_4K,
    boundBytesOverAvailable: +((maxEntries * ENTRY_BYTES_4K) / AVAILABLE_BYTES).toFixed(3),
    entriesUntilExhaustion: Math.floor(AVAILABLE_BYTES / ENTRY_BYTES_4K),
  });

  const evidence = {
    cache: { maxEntries: 1000, ttlMs: 300000, enabled: true, keyedOnFullDocumentSha: true },
    window: { maxLineDistance: 4, enforcedAtAllAdmissionSites: true },
    phrase: { generationGatedOff: false, wireExcluded: true },
    scaling: { bytesPerChar1k: 425.4, bytesPerChar4k: 402.1, ratio4kOver1k: 0.945 },
    error: { catchDegradesSilently: true, setsErrorState: true },
    host: hostMemory(1000),
  };
  const receipts = [
    R('obs.cache.bound', evidence.cache),
    R('obs.rhyme.line_window', evidence.window),
    R('obs.phrase.server_alloc', evidence.phrase),
    R('obs.payload.scaling', evidence.scaling),
    R('obs.synthesis.error_path', evidence.error),
    R('obs.host.memory', evidence.host),
  ];

  it('the bound is not a bound: 1000 entries cannot fit a 512MB host', () => {
    // Bounded by COUNT, entries bounded by DOCUMENT LENGTH, host bounded by
    // BYTES. The cache cannot reach its own limit without killing the host at
    // roughly entry 152.
    const m = hostMemory(1000);
    expect(m.boundBytesOverAvailable).toBeGreaterThan(6);
    expect(m.entriesUntilExhaustion).toBeLessThan(200);
  });

  const probe = getProbe('truesight.payload.oom');

  it('three causes hold at once — server heap is additive, not a whodunnit', () => {
    const e = evaluateHypotheses(probe.hypotheses, receipts);
    expect(e.supported).toEqual(['h_lru_cache', 'h_phrase_alloc', 'h_swallowed_error']);
    expect(e.exclusive).toEqual([]);
  });

  it('the two fixed causes are eliminated ON EVIDENCE, not on memory', () => {
    const e = evaluateHypotheses(probe.hypotheses, receipts);
    // line window enforced at both admission sites; bytes-per-char FALLS 425->402.
    expect(e.eliminated).toContain('h_rhyme_window');
    expect(e.eliminated).toContain('h_quadratic_live');
  });

  it('PANEL_ANALYSIS_CACHE_MAX_SIZE=10 discriminates — the falsifier is live', () => {
    // Named in the 2026-07-13 investigation, never run until 2026-07-16, and
    // now actually set on the production machine. 10 x 1.6MB = 16MB against
    // 245MB available: ratio 0.066, so the bound finally IS a bound.
    const bounded = receipts.map((r) => {
      if (r.observationId === 'obs.cache.bound') return R('obs.cache.bound', { ...evidence.cache, maxEntries: 10 });
      if (r.observationId === 'obs.host.memory') return R('obs.host.memory', hostMemory(10));
      return r;
    });
    const e = evaluateHypotheses(probe.hypotheses, bounded);
    expect(hostMemory(10).boundBytesOverAvailable).toBeLessThan(1);
    expect(e.eliminated).toContain('h_lru_cache');
    expect(e.supported).toEqual(['h_phrase_alloc', 'h_swallowed_error']);
  });

  it('a crashed harness leaves the claim UNDERDETERMINED, never refuted', () => {
    const broken = receipts.map((r) =>
      r.observationId === 'obs.payload.scaling' ? R('obs.payload.scaling', evidence.scaling, 'error') : r,
    );
    const e = evaluateHypotheses(probe.hypotheses, broken);
    expect(e.underdetermined).toContain('h_quadratic_live');
    expect(e.eliminated).not.toContain('h_quadratic_live');
  });
});

describe('receipt digests are stable', () => {
  it('receiptDigest is pure', () => {
    const r = makeReceipt({
      probeId: 'p',
      observationId: 'o',
      result: { a: 1 },
      status: 'observed',
    });
    expect(receiptDigest(r)).toBe(receiptDigest(r));
  });
});
