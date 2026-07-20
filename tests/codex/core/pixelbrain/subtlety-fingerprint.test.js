import { describe, it, expect } from 'vitest';
import {
  fingerprintOutput,
  probeUnit,
  compareFingerprints,
  identityKeysMatch,
  diffPaths,
} from '../../../../codex/core/pixelbrain/subtlety-fingerprint.js';
import { canonicalForms, shapeOf, defaultCanonConfig } from '../../../../codex/core/pixelbrain/subtlety-canonicalizer.js';
import { detectDrift } from '../../../../codex/core/pixelbrain/subtlety-drift.js';
import {
  buildDataflowGraph,
  detectSeamViolations,
  detectDeadTissue,
} from '../../../../codex/core/pixelbrain/subtlety-seam-flow.js';
import {
  toRaidSymptom,
  proposeRemediation,
  baselineIsApproved,
  recordHealing,
} from '../../../../codex/core/pixelbrain/subtlety-closed-loop.js';
import { createSubtletyApm } from '../../../../codex/core/pixelbrain/subtlety-fingerprint-apm.js';

// A deterministic seeded RNG (LCG) — controlled variability, reproducible.
function seededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const baseIdentity = {
  unitId: 'unit.compose.silhouette',
  unitKind: 'route',
  contractVersion: 'v1',
  implementationVersion: 'impl-1',
  canonicalCorpusId: 'corpus-1',
  runtimeProfile: 'node-test',
  buildId: 'build-A',
};

describe('SUBTLETY-CANON-v1 canonicalizer (§3.3)', () => {
  it('exact form preserves key order; semantic form is order-independent', () => {
    const a = { a: 1, b: 2 };
    const b = { b: 2, a: 1 };
    const fa = canonicalForms(a);
    const fb = canonicalForms(b);
    // exact differs (byte-level), semantic matches (behaviorally identical).
    expect(fa.exact).not.toBe(fb.exact);
    expect(fa.semantic).toBe(fb.semantic);
    expect(fa.shape).toBe(fb.shape);
  });

  it('ignoredPaths drop subtrees from the semantic form only', () => {
    const cfg = defaultCanonConfig({ ignoredPaths: ['meta.generatedAt'] });
    const a = { value: 1, meta: { generatedAt: 111 } };
    const b = { value: 1, meta: { generatedAt: 999 } };
    const fa = canonicalForms(a, cfg);
    const fb = canonicalForms(b, cfg);
    expect(fa.exact).not.toBe(fb.exact);
    expect(fa.semantic).toBe(fb.semantic);
  });

  it('redactionPolicy normalizes secrets so they do not cause drift', () => {
    const cfg = defaultCanonConfig({ redactionPolicy: { paths: ['token'], marker: '[REDACTED]' } });
    const a = { id: 1, token: 'sekrit-abc' };
    const b = { id: 1, token: 'sekrit-xyz' };
    expect(canonicalForms(a, cfg).semantic).toBe(canonicalForms(b, cfg).semantic);
  });

  it('numericPolicy rounds floats so precision noise is absorbed', () => {
    const cfg = defaultCanonConfig({ numericPolicy: { precision: 2 } });
    const a = { score: 0.123456 };
    const b = { score: 0.123999 };
    expect(canonicalForms(a, cfg).semantic).toBe(canonicalForms(b, cfg).semantic);
  });

  it('orderedPaths sort collections so iteration order is irrelevant', () => {
    const cfg = defaultCanonConfig({ orderedPaths: ['tags'] });
    const a = { tags: ['x', 'y', 'z'] };
    const b = { tags: ['z', 'x', 'y'] };
    expect(canonicalForms(a, cfg).semantic).toBe(canonicalForms(b, cfg).semantic);
  });

  it('shapeOf strips values but keeps keys/types; a new key changes shape', () => {
    expect(shapeOf({ a: 1, b: 'x' })).toEqual({ a: 'int', b: 'string' });
    expect(canonicalForms({ a: 1 }).shape).not.toBe(canonicalForms({ a: 1, b: 2 }).shape);
  });
});

describe('SUBTLETY-FINGERPRINT-v1 core (§3)', () => {
  it('produces a three-part SCD64 (64-char hex) fingerprint', () => {
    const fp = fingerprintOutput(baseIdentity, { cells: [1, 2, 3] });
    for (const key of ['exactChecksum', 'semanticChecksum', 'shapeChecksum']) {
      expect(fp.fingerprint[key]).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(fp.schema).toBe('SUBTLETY-FINGERPRINT-v1');
    expect(fp.execution.mode).toBe('observed');
  });

  it('fingerprint stability: identical input → identical checksum across N runs (§11.1)', () => {
    const output = { cells: [{ x: 1, y: 2, partId: 'head' }], material: 'iron' };
    const checksums = new Set();
    for (let i = 0; i < 50; i += 1) {
      checksums.add(fingerprintOutput(baseIdentity, output).fingerprint.semanticChecksum);
    }
    expect(checksums.size).toBe(1);
  });

  it('probeUnit confirms stability of a seeded run across iterations', () => {
    const packet = probeUnit(baseIdentity, (seed) => {
      const rng = seededRng(seed);
      return { roll: Math.floor(rng() * 100), cells: [1, 2, 3] };
    }, { seed: 42, iterations: 20 });
    expect(packet.provenance.iterationCount).toBe(20);
    expect(packet.comparison.status).not.toBe('non-reproducible');
  });

  it('probeUnit flags non-reproducibility for a genuinely nondeterministic run', () => {
    const packet = probeUnit(baseIdentity, () => ({ roll: Math.random() }), {
      seed: 1,
      iterations: 20,
    });
    expect(packet.comparison.status).toBe('non-reproducible');
    expect(packet.provenance.iterationCount).toBeLessThan(20);
  });
});

describe('Comparison model (§3.1)', () => {
  const out = { cells: [1, 2, 3] };

  it('stable: identical fingerprints under a matching key', () => {
    const a = fingerprintOutput(baseIdentity, out);
    const b = fingerprintOutput(baseIdentity, out);
    expect(compareFingerprints(a, b).status).toBe('stable');
  });

  it('within-tolerance: exact differs but semantic matches (key reorder)', () => {
    const a = fingerprintOutput(baseIdentity, { a: 1, b: 2 });
    const b = fingerprintOutput(baseIdentity, { b: 2, a: 1 });
    const cmp = compareFingerprints(a, b);
    expect(cmp.status).toBe('within-tolerance');
    expect(cmp.toleranceApplied).toBe(true);
  });

  it('unexpected-change: semantic drift under an UNCHANGED approved key', () => {
    const a = fingerprintOutput(baseIdentity, { cells: [1, 2, 3] });
    const b = fingerprintOutput(baseIdentity, { cells: [1, 2, 4] });
    expect(compareFingerprints(a, b).status).toBe('unexpected-change');
  });

  it('approved-change: behavior moved but implementationVersion moved with it', () => {
    const a = fingerprintOutput(baseIdentity, { cells: [1, 2, 3] });
    const b = fingerprintOutput({ ...baseIdentity, implementationVersion: 'impl-2' }, { cells: [9, 9, 9] });
    expect(compareFingerprints(a, b).status).toBe('approved-change');
  });

  it('incomparable: identity keys do not match (different corpus)', () => {
    const a = fingerprintOutput(baseIdentity, out);
    const b = fingerprintOutput({ ...baseIdentity, canonicalCorpusId: 'corpus-2' }, out);
    expect(identityKeysMatch(a, b)).toBe(false);
    expect(compareFingerprints(a, b).status).toBe('incomparable');
  });

  it('shape change is escalated even when values look close', () => {
    const a = fingerprintOutput(baseIdentity, { cells: [1] });
    const b = fingerprintOutput(baseIdentity, { cells: [1], extra: true });
    expect(compareFingerprints(a, b).status).toBe('unexpected-change');
  });

  it('diffPaths reports the top-level paths that changed', () => {
    expect(diffPaths({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
  });
});

describe('Lens I — Chroma-Drift, two-sided (§5 / §11.2)', () => {
  it('seeded RNG stays stable: determinismScore 1.0, no divergence alert', () => {
    const readings = [];
    for (let i = 0; i < 10; i += 1) {
      const rng = seededRng(7);
      readings.push(fingerprintOutput(baseIdentity, { roll: Math.floor(rng() * 1000) }));
    }
    const drift = detectDrift(readings);
    expect(drift.determinismScore).toBe(1);
    expect(drift.status).toBe('stable');
    expect(drift.divergenceAlerts).toHaveLength(0);
  });

  it('genuine nondeterminism fires a divergence alert while every reading "succeeds"', () => {
    const readings = [];
    for (let i = 0; i < 10; i += 1) {
      readings.push(fingerprintOutput(baseIdentity, { roll: Math.random() }));
    }
    const drift = detectDrift(readings);
    expect(drift.status).toBe('non-reproducible');
    expect(drift.determinismScore).toBeLessThan(1);
    expect(drift.divergenceAlerts[0].code).toBe('SUBTLETY_DRIFT_NON_REPRODUCIBLE');
  });

  it('representational-only variance is within-tolerance, not drift', () => {
    const readings = [
      fingerprintOutput(baseIdentity, { a: 1, b: 2 }),
      fingerprintOutput(baseIdentity, { b: 2, a: 1 }),
    ];
    const drift = detectDrift(readings);
    expect(drift.status).toBe('within-tolerance');
    expect(drift.determinismScore).toBe(1);
    expect(drift.divergenceAlerts).toHaveLength(0);
  });

  it('readings under different canonicalization configs are incomparable, not drift (§3.1/§3.3)', () => {
    // Two readings canonicalized with DIFFERENT configs legitimately differ in
    // semanticChecksum without any nondeterminism. The drift lens must NOT flag
    // this as drift — it groups by config signature and compares within the
    // majority config only, reporting the rest as incomparable.
    const configA = { ignoredPaths: ['meta.generatedAt'], orderedPaths: ['cells'] };
    const output = { cells: [3, 1, 2], meta: { generatedAt: 'x' } };
    const readings = [
      fingerprintOutput(baseIdentity, output, { canonicalization: configA }),
      fingerprintOutput(baseIdentity, output, { canonicalization: configA }),
      // Same deterministic output, but the DEFAULT canon config → different semanticChecksum.
      fingerprintOutput(baseIdentity, output),
    ];
    const drift = detectDrift(readings);
    // The two config-A readings agree → stable; the config-B reading is excluded, not drift.
    expect(drift.status).toBe('stable');
    expect(drift.determinismScore).toBe(1);
    expect(drift.divergenceAlerts).toHaveLength(0);
    expect(drift.incomparableConfigs).toBe(1);
    expect(drift.configGroups).toBe(2);
  });

  it('genuine nondeterminism within a single config still fires (config-awareness is not a blindfold)', () => {
    const configA = { orderedPaths: ['cells'] };
    const readings = [
      fingerprintOutput(baseIdentity, { cells: [1, 2, 3], jitter: 1 }, { canonicalization: configA }),
      fingerprintOutput(baseIdentity, { cells: [1, 2, 3], jitter: 1 }, { canonicalization: configA }),
      fingerprintOutput(baseIdentity, { cells: [1, 2, 3], jitter: 2 }, { canonicalization: configA }),
    ];
    const drift = detectDrift(readings);
    expect(drift.status).toBe('non-reproducible');
    expect(drift.divergenceAlerts).toHaveLength(1);
    expect(drift.incomparableConfigs).toBe(0);
    expect(drift.configGroups).toBe(1);
  });
});

describe('Lens II — Seam-Flow (§6)', () => {
  const fp = (unitId, seam) =>
    fingerprintOutput({ ...baseIdentity, unitId }, { ok: true }, { seam });

  it('builds a dataflow graph from observed fingerprints', () => {
    const graph = buildDataflowGraph([
      fp('composer', { emits: ['silhouette.cells'] }),
      fp('filler', { consumes: ['silhouette.cells'], emits: ['fills.coordinates'] }),
    ]);
    expect(graph.fieldOwners.get('silhouette.cells')).toEqual(['composer']);
    expect(graph.fieldConsumers.get('silhouette.cells')).toEqual(['filler']);
  });

  it('detects a dangling input, ownership collision, and write-write race (§11.3)', () => {
    const graph = buildDataflowGraph([
      fp('a', { consumes: ['ghost.field'], emits: ['shared'], mutates: ['contested'] }),
      fp('b', { emits: ['shared'], mutates: ['contested'] }),
    ]);
    const { violations } = detectSeamViolations(graph);
    const codes = violations.map((v) => v.code).sort();
    expect(codes).toContain('SUBTLETY_SEAM_DANGLING_INPUT');
    expect(codes).toContain('SUBTLETY_SEAM_OWNERSHIP_COLLISION');
    expect(codes).toContain('SUBTLETY_SEAM_WRITE_WRITE_RACE');
  });

  it('base inputs (spec./silhouette./...) are never dangling', () => {
    const graph = buildDataflowGraph([fp('a', { consumes: ['spec.parts'] })]);
    expect(detectSeamViolations(graph).ok).toBe(true);
  });

  it('dead tissue carries a confidence class, never a bare assertion (§6.3)', () => {
    const graph = buildDataflowGraph([
      fp('a', { emits: ['unused', 'clientField', 'futureField', 'branchField'] }),
    ]);
    const { candidates } = detectDeadTissue(graph, {
      externalFields: ['clientField'],
      reservedFields: ['futureField'],
      conditionalFields: ['branchField'],
      corpusCoverage: 0.4,
      evidenceCount: 5,
    });
    const byField = Object.fromEntries(candidates.map((c) => [c.field, c.deadTissue.status]));
    expect(byField.unused).toBe('unobserved'); // coverage < 1 → cannot confirm dead
    expect(byField.clientField).toBe('externally-exposed');
    expect(byField.futureField).toBe('reserved');
    expect(byField.branchField).toBe('conditionally-consumed');
  });

  it('confirmed-dead requires full branch coverage + evidence', () => {
    const graph = buildDataflowGraph([fp('a', { emits: ['unused'] })]);
    const { candidates } = detectDeadTissue(graph, { corpusCoverage: 1, evidenceCount: 100 });
    expect(candidates[0].deadTissue.status).toBe('confirmed-dead');
  });
});

describe('Lens III — Closed-Loop (§7)', () => {
  const deviation = { code: 'SUBTLETY_DRIFT_NON_REPRODUCIBLE', message: 'drift', unitId: 'unit.x' };

  it('converts a deviation into a structured RAID symptom', () => {
    const symptom = toRaidSymptom(deviation);
    expect(symptom.symptomCode).toBe('SUBTLETY_DRIFT_NON_REPRODUCIBLE');
    expect(symptom.symptoms[0]).toContain('SUBTLETY_DRIFT_NON_REPRODUCIBLE');
    expect(symptom.source).toBe('subtlety-fingerprint-apm');
  });

  it('PROHIBITS auto-heal when no baseline is supplied (§7.4)', () => {
    const proposal = proposeRemediation(deviation, null, { buildId: 'build-B' });
    expect(proposal.allowed).toBe(false);
    expect(proposal.action).toBe('propose-only');
    expect(proposal.reason).toBe('no-baseline-supplied');
  });

  it('PROHIBITS auto-heal when the baseline is not promoted', () => {
    const proposal = proposeRemediation(deviation, { expectedBaselineId: 'b1' }, {});
    expect(proposal.allowed).toBe(false);
    expect(proposal.reason).toBe('baseline-not-promoted');
  });

  it('PROHIBITS auto-heal when the baseline approval is for a different version', () => {
    const baseline = {
      expectedBaselineId: 'b1',
      baselineApproval: { implementationVersion: 'impl-1', contractVersion: 'v1' },
    };
    const current = { identity: { implementationVersion: 'impl-2', contractVersion: 'v1' } };
    expect(baselineIsApproved(baseline, current.identity)).toBe(false);
    expect(proposeRemediation(deviation, baseline, current).allowed).toBe(false);
  });

  it('ALLOWS auto-heal only against a matching approved baseline', () => {
    const baseline = {
      expectedBaselineId: 'b1',
      baselineApproval: { implementationVersion: 'impl-1', contractVersion: 'v1' },
    };
    const current = {
      identity: { implementationVersion: 'impl-1', contractVersion: 'v1' },
      buildId: 'build-A',
      proposedPatch: 'fix-patch',
      rollbackPatch: 'undo-patch',
    };
    const proposal = proposeRemediation(deviation, baseline, current);
    expect(proposal.allowed).toBe(true);
    expect(proposal.action).toBe('eligible-for-auto-heal');
    expect(proposal.proposedPatchHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proposal.rollbackPatchHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('healing ledger entries are reversible when a rollback patch is present', () => {
    const ledger = recordHealing([], {
      unitId: 'unit.x',
      symptomCode: 'SUBTLETY_DRIFT_NON_REPRODUCIBLE',
      rollbackPatchHash: 'abc',
      testResult: 'pass',
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].reversible).toBe(true);
  });
});

describe('Facade — createSubtletyApm (§8)', () => {
  it('detect → localize → act over a unit, healing only with an approved baseline', () => {
    const apm = createSubtletyApm();
    // Record divergent (nondeterministic) readings for the unit.
    for (let i = 0; i < 5; i += 1) {
      apm.recordObserved(baseIdentity, { roll: Math.random() });
    }
    // No baseline promoted → drift detected, but recovery is propose-only.
    const noBaseline = apm.assess(baseIdentity.unitId);
    expect(noBaseline.drift.status).toBe('non-reproducible');
    expect(noBaseline.recovery.proposals[0].allowed).toBe(false);

    // Promote an approved baseline matching the current version.
    const baselineFp = apm.recordObserved(baseIdentity, { roll: 0 });
    apm.promoteBaseline(baseIdentity.unitId, baselineFp, {
      expectedBaselineId: 'approved-1',
      implementationVersion: 'impl-1',
      contractVersion: 'v1',
    });
    const withBaseline = apm.assess(baseIdentity.unitId, {
      current: { identity: baseIdentity, buildId: 'build-A', proposedPatch: 'p', rollbackPatch: 'r' },
    });
    expect(withBaseline.recovery.proposals.some((p) => p.allowed)).toBe(true);
  });

  it('probe + assess: a seeded unit is stable end-to-end', () => {
    const apm = createSubtletyApm();
    for (let i = 0; i < 5; i += 1) {
      apm.probe(baseIdentity, (seed) => {
        const rng = seededRng(seed);
        return { roll: Math.floor(rng() * 100) };
      }, { seed: 99, iterations: 10 });
    }
    const result = apm.assess(baseIdentity.unitId);
    expect(result.drift.status).toBe('stable');
    expect(result.drift.divergenceAlerts).toHaveLength(0);
  });
});
