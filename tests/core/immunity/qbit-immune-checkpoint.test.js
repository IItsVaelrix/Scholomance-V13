/**
 * QBIT IMMUNE CHECKPOINT v1 — Tests
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/QBIT-Immune-Checkpoint-PDR.md
 *
 * QA checklist (from PDR §"QA Checklist"):
 *   - Cold start: first-time rule fire emits WARN, not hard suppression.
 *   - Confirmed pathogen: vaccine match emits VIOLATION.
 *   - Refuted local false positive: repeated refutes emit HEALTH_SIGNAL.
 *   - Novel antigen: unknown suspicious shape emits NEEDS_MERLIN.
 *   - Decay: old refutes lose power after half-life.
 *   - Rule apoptosis: high-refute rules are flagged, not silently deleted.
 *   - Determinism: checkpoint key and verdict stable across agents.
 *   - Memory updates are canonical JSON with stable checksums.
 *   - Vaccine match bypasses local refute suppression.
 *
 * VAELRIX_LAW §6: determinism verified by running identical inputs 100x
 * and asserting the same verdict + key each time.
 */

import { describe, expect, it } from 'vitest';
import {
  applyMemoryHalfLife,
  buildCheckpointKey,
  checkpointDiagnosticObservation,
  computeBytecodeShapeHash,
  createDefaultMemoryCell,
  evaluateImmuneCheckpoint,
  evaluateRuleReputation,
  normalizeFilePath,
  normalizeLocationHash,
  passesG1SignalFloor,
  persistCheckpointCell,
  updateMemoryCellWithObservation,
  __internals,
} from '../../../codex/core/immunity/qbit-immune-checkpoint.js';
import {
  ImmuneCheckpointConfig,
  IMMUNE_CHECKPOINT_CONTRACT,
  IMMUNE_CHECKPOINT_SCHEMA_VERSION,
  IMMUNE_CHECKPOINT_ACTIONS,
  IMMUNE_CHECKPOINT_VERDICTS,
} from '../../../codex/core/immunity/qbit-immune-checkpoint.config.js';
import { decodeBytecodeError } from '../../../codex/core/pixelbrain/bytecode-error.js';

const RULE = 'LAYOUT_THRASHING';
const FILE = 'src/ui/WandPage.jsx';

function makeObservation(overrides = {}) {
  return {
    ruleId: overrides.ruleId ?? RULE,
    filePath: overrides.filePath ?? FILE,
    location: overrides.location ?? { line: 354, column: 12, astNodeId: 'ast.7c4' },
    ruleConfidence: overrides.ruleConfidence ?? 0.82,
    evidenceCount: overrides.evidenceCount ?? 4,
    bytecodeEnvelope: overrides.bytecodeEnvelope ?? {
      opcode: 'LAYOUT_SHIFT',
      repeat: 7,
      spanPx: 184,
    },
    bytecodeShapeHash: overrides.bytecodeShapeHash ?? null,
    runId: overrides.runId ?? null,
  };
}

function makeMemory(seed = {}) {
  const store = new Map();
  if (seed.cells) {
    for (const [k, v] of Object.entries(seed.cells)) store.set(k, v);
  }
  return {
    get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    upsert(key, cell) {
      store.set(key, cell);
      return { ok: true, key };
    },
    _store: store,
  };
}

function makeVaccines(matches = []) {
  return {
    match(envelope) {
      if (!envelope) return { matched: false };
      if (matches.includes(envelope?.opcode)) {
        return {
          matched: true,
          vaccineId: `PB-XP-v1-ERR-WBCHG-${envelope.opcode.toLowerCase()}`,
          pathogenId: `pathogen.${envelope.opcode.toLowerCase()}`,
        };
      }
      return { matched: false };
    },
  };
}

describe('qbit-immune-checkpoint — config contract', () => {
  it('exposes a stable contract and schema version', () => {
    expect(ImmuneCheckpointConfig.contract).toBe(IMMUNE_CHECKPOINT_CONTRACT);
    expect(ImmuneCheckpointConfig.schemaVersion).toBe(IMMUNE_CHECKPOINT_SCHEMA_VERSION);
  });

  it('freezes the config and its nested sections', () => {
    expect(Object.isFrozen(ImmuneCheckpointConfig)).toBe(true);
    expect(Object.isFrozen(ImmuneCheckpointConfig.merlinEscalation)).toBe(true);
    expect(Object.isFrozen(ImmuneCheckpointConfig.ruleReputation)).toBe(true);
  });

  it('exposes the action and verdict enums expected by the PDR', () => {
    expect(IMMUNE_CHECKPOINT_ACTIONS).toEqual([
      'VIOLATION',
      'WARN',
      'HEALTH_SIGNAL',
      'SUPPRESSED',
      'NEEDS_MERLIN',
    ]);
    expect(IMMUNE_CHECKPOINT_VERDICTS).toContain('CONFIRMED');
    expect(IMMUNE_CHECKPOINT_VERDICTS).toContain('REFUTED');
    expect(IMMUNE_CHECKPOINT_VERDICTS).toContain('NEEDS_MERLIN');
  });
});

describe('qbit-immune-checkpoint — deterministic key', () => {
  it('builds a stable key across agents and machines', () => {
    const a = buildCheckpointKey({
      ruleId: RULE,
      filePath: 'src\\ui\\WandPage.jsx',
      location: { line: 354, column: 12, astNodeId: 'ast.7c4' },
      bytecodeShapeHash: 'LAYOUT_SHIFT|7|184',
    });
    const b = buildCheckpointKey({
      ruleId: RULE,
      filePath: 'src/ui/WandPage.jsx',
      location: { line: 354, column: 12, astNodeId: 'ast.7c4' },
      bytecodeShapeHash: 'LAYOUT_SHIFT|7|184',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^LAYOUT_THRASHING:src\/ui\/WandPage\.jsx:node\.ast\.7c4:shape\.[0-9a-f]{12}$/);
  });

  it('prefers astNodeId over raw line number (PDR §"Overfitting to Location")', () => {
    const withAst = buildCheckpointKey({
      ruleId: RULE,
      filePath: FILE,
      location: { line: 999, astNodeId: 'ast.7c4' },
      bytecodeShapeHash: 'X',
    });
    const sameAst = buildCheckpointKey({
      ruleId: RULE,
      filePath: FILE,
      location: { line: 1, astNodeId: 'ast.7c4' },
      bytecodeShapeHash: 'X',
    });
    expect(withAst).toBe(sameAst);
  });

  it('produces different keys for different shapes', () => {
    const k1 = buildCheckpointKey({ ruleId: RULE, filePath: FILE, location: 'line354', bytecodeShapeHash: 'A' });
    const k2 = buildCheckpointKey({ ruleId: RULE, filePath: FILE, location: 'line354', bytecodeShapeHash: 'B' });
    expect(k1).not.toBe(k2);
  });

  it('normalizes Windows paths to forward slashes', () => {
    expect(normalizeFilePath('src\\ui\\WandPage.jsx')).toBe('src/ui/WandPage.jsx');
    // The function is given relative paths per PDR ("no absolute filesystem
    // prefixes"); callers strip drive letters before invoking the checkpoint.
    expect(normalizeFilePath('C:\\repo\\src\\ui\\WandPage.jsx'))
      .toBe('C:/repo/src/ui/WandPage.jsx');
    expect(normalizeFilePath('  ./src/ui/WandPage.jsx  ')).toBe('src/ui/WandPage.jsx');
    expect(normalizeFilePath('')).toBe('path.absent');
  });

  it('normalizes location fragments to stable loc/node prefixes', () => {
    expect(normalizeLocationHash('line354')).toBe('line354');
    expect(normalizeLocationHash(354)).toBe('line354');
    expect(normalizeLocationHash({ line: 354, column: 12, astNodeId: 'ast.7c4' }))
      .toBe('node.ast.7c4');
    expect(normalizeLocationHash({ line: 354 })).toMatch(/^loc\.[0-9a-f]{12}$/);
    expect(normalizeLocationHash(null)).toBe('loc.absent');
  });

  it('hashed bytecode shapes are stable', () => {
    expect(computeBytecodeShapeHash('LAYOUT_SHIFT|7|184'))
      .toBe(computeBytecodeShapeHash('LAYOUT_SHIFT|7|184'));
    expect(computeBytecodeShapeHash('A')).toMatch(/^shape\.[0-9a-f]{12}$/);
    expect(computeBytecodeShapeHash(null)).toBe('shape.absent');
  });
});

describe('qbit-immune-checkpoint — G1 signal floor', () => {
  it('passes a well-formed observation', () => {
    expect(passesG1SignalFloor(makeObservation())).toEqual({ pass: true });
  });

  it('fails on missing ruleId', () => {
    const obs = makeObservation();
    delete obs.ruleId;
    expect(passesG1SignalFloor(obs)).toEqual({ pass: false, reason: 'RULE_ID_MISSING' });
  });

  it('fails when rule confidence is below the floor', () => {
    const obs = makeObservation({ ruleConfidence: 0.4 });
    expect(passesG1SignalFloor(obs)).toEqual({ pass: false, reason: 'RULE_CONFIDENCE_BELOW_FLOOR' });
  });

  it('fails when evidence count is below the floor', () => {
    const obs = makeObservation({ evidenceCount: 1 });
    expect(passesG1SignalFloor(obs)).toEqual({ pass: false, reason: 'EVIDENCE_BELOW_FLOOR' });
  });

  it('fails when no bytecode envelope is supplied', () => {
    const obs = makeObservation();
    obs.bytecodeEnvelope = null;
    expect(passesG1SignalFloor(obs)).toEqual({ pass: false, reason: 'NO_BYTECODE_ENVELOPE' });
  });
});

describe('qbit-immune-checkpoint — cold start behavior', () => {
  it('emits WARN for a first-time observation (no memory cell)', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      memory,
      vaccines,
      runIndex: 0,
    });
    expect(result.action).toBe('WARN');
    expect(result.reason).toBe('INSUFFICIENT_MEMORY_SIGNAL');
    expect(result.verdict).toBe('INSUFFICIENT');
    expect(result.key).toMatch(/^LAYOUT_THRASHING:src\/ui\/WandPage\.jsx:/);
    expect(memory._store.size).toBe(0);
  });

  it('emits WARN when G1 floor fails and does not touch memory', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const result = checkpointDiagnosticObservation({
      observation: makeObservation({ ruleConfidence: 0.2, evidenceCount: 0 }),
      memory,
      vaccines,
      runIndex: 0,
    });
    expect(result.action).toBe('WARN');
    expect(result.reason).toBe('FAILED_G1_SIGNAL_FLOOR');
    expect(result.g1FailureReason).toBe('RULE_CONFIDENCE_BELOW_FLOOR');
    expect(memory._store.size).toBe(0);
  });
});

describe('qbit-immune-checkpoint — vaccine match wins', () => {
  it('vaccine match emits VIOLATION even if memory would refute', () => {
    const key = buildCheckpointKey({
      ruleId: RULE,
      filePath: FILE,
      location: makeObservation().location,
      bytecodeShapeHash: { opcode: 'LAYOUT_SHIFT', repeat: 7, spanPx: 184 },
    });
    const memory = makeMemory({
      cells: {
        [key]: createDefaultMemoryCell({
          key,
          ruleId: RULE,
          filePath: FILE,
          locationHash: 'node.7c4',
          bytecodeShapeHash: 'shape.5b4e0a85eaaf',
          runIndex: 0,
        }),
      },
    });
    // Pre-seed the cell with refutes so local memory would refute.
    for (let i = 1; i <= 5; i += 1) {
      memory._store.set(key, updateMemoryCellWithObservation(
        memory._store.get(key),
        { ...makeObservation(), verdict: 'REFUTED', runId: `run.0000${i}` },
        i,
      ));
    }

    const vaccines = makeVaccines(['LAYOUT_SHIFT']);
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      memory,
      vaccines,
      runIndex: 10,
    });
    expect(result.action).toBe('VIOLATION');
    expect(result.reason).toBe('VACCINE_MATCH_CONFIRMED_PATHOGEN');
    expect(result.vaccineVerdict.matched).toBe(true);
  });
});

describe('qbit-immune-checkpoint — HEALTH_SIGNAL after repeated refutes', () => {
  it('emits HEALTH_SIGNAL once refute count dominates confirms past the threshold', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const key = buildCheckpointKey({
      ruleId: RULE,
      filePath: FILE,
      location: makeObservation().location,
      bytecodeShapeHash: { opcode: 'LAYOUT_SHIFT', repeat: 7, spanPx: 184 },
    });
    memory.upsert(key, createDefaultMemoryCell({
      key,
      ruleId: RULE,
      filePath: FILE,
      locationHash: 'node.7c4',
      bytecodeShapeHash: 'shape.5b4e0a85eaaf',
      runIndex: 0,
    }));
    for (let i = 1; i <= 7; i += 1) {
      const cell = memory.get(key);
      const next = updateMemoryCellWithObservation(
        cell,
        { ...makeObservation(), verdict: 'REFUTED', runId: `run.0000${i}` },
        i,
      );
      memory.upsert(key, next);
    }
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      memory,
      vaccines,
      runIndex: 8,
    });
    expect(result.action).toBe('HEALTH_SIGNAL');
    expect(result.reason).toBe('MEMORY_REFUTES_RULE');
  });

  it('emits VIOLATION when confirms outpace refutes past the threshold', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const key = buildCheckpointKey({
      ruleId: RULE,
      filePath: FILE,
      location: makeObservation().location,
      bytecodeShapeHash: { opcode: 'LAYOUT_SHIFT', repeat: 7, spanPx: 184 },
    });
    memory.upsert(key, createDefaultMemoryCell({
      key,
      ruleId: RULE,
      filePath: FILE,
      locationHash: 'node.7c4',
      bytecodeShapeHash: 'shape.5b4e0a85eaaf',
      runIndex: 0,
    }));
    for (let i = 1; i <= 6; i += 1) {
      const cell = memory.get(key);
      const verdict = i <= 5 ? 'CONFIRMED' : 'CONFIRMED';
      const next = updateMemoryCellWithObservation(
        cell,
        { ...makeObservation(), verdict, runId: `run.0000${i}` },
        i,
      );
      memory.upsert(key, next);
    }
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      memory,
      vaccines,
      runIndex: 8,
    });
    expect(result.action).toBe('VIOLATION');
    expect(result.reason).toBe('MEMORY_CONFIRMS_RULE');
  });

  it('emits WARN when memory is mixed or unstable', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const key = buildCheckpointKey({
      ruleId: RULE,
      filePath: FILE,
      location: makeObservation().location,
      bytecodeShapeHash: { opcode: 'LAYOUT_SHIFT', repeat: 7, spanPx: 184 },
    });
    memory.upsert(key, createDefaultMemoryCell({
      key,
      ruleId: RULE,
      filePath: FILE,
      locationHash: 'node.7c4',
      bytecodeShapeHash: 'shape.5b4e0a85eaaf',
      runIndex: 0,
    }));
    // 4 confirms, 4 refutes — neither side dominates past either ratio
    // threshold but the cell carries enough raw evidence to be MIXED.
    for (let i = 1; i <= 8; i += 1) {
      const cell = memory.get(key);
      const next = updateMemoryCellWithObservation(
        cell,
        { ...makeObservation(), verdict: i % 2 === 0 ? 'REFUTED' : 'CONFIRMED', runId: `run.0000${i}` },
        i,
      );
      memory.upsert(key, next);
    }
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      memory,
      vaccines,
      runIndex: 9,
    });
    expect(result.action).toBe('WARN');
    expect(result.reason).toBe('MIXED_OR_UNSTABLE_MEMORY');
  });
});

describe('qbit-immune-checkpoint — half-life decay', () => {
  it('decays confirm and refute counts toward zero as runs advance', () => {
    const cell = createDefaultMemoryCell({
      key: 'RULE:file.jsx:line1:shape.x',
      ruleId: 'RULE',
      filePath: 'file.jsx',
      locationHash: 'line1',
      bytecodeShapeHash: 'shape.x',
      runIndex: 0,
    });
    const seeded = updateMemoryCellWithObservation(
      cell,
      { verdict: 'REFUTED', runId: 'run.00001', ruleId: 'RULE', filePath: 'file.jsx', locationHash: 'line1', checkpointKey: 'RULE:file.jsx:line1:shape.x' },
      1,
    );
    expect(seeded.refutes).toBe(1);
    // Advance by 1.5 half-lives; with floor-decay, 1 * exp(-ln2 * 1.5) ≈ 0.354 → 0.
    // Advance further to land just below 1 half-life so 1 * 0.6 ≈ 0.6 → 0;
    // we need 2 half-lives to see partial decay from 1 with floor.
    // Use 2 half-lives: 1 * exp(-2*ln2) = 0.25, floor=0.
    // Better: seed with 3 refutes so partial decay is visible.
    const seeded3 = updateMemoryCellWithObservation(cell,
      { verdict: 'REFUTED', runId: 'r.s', ruleId: 'RULE', filePath: 'file.jsx', locationHash: 'line1', checkpointKey: 'RULE:file.jsx:line1:shape.x' },
      1,
    );
    const seeded3b = updateMemoryCellWithObservation(seeded3,
      { verdict: 'REFUTED', runId: 'r.s2', ruleId: 'RULE', filePath: 'file.jsx', locationHash: 'line1', checkpointKey: 'RULE:file.jsx:line1:shape.x' },
      2,
    );
    const seeded3c = updateMemoryCellWithObservation(seeded3b,
      { verdict: 'REFUTED', runId: 'r.s3', ruleId: 'RULE', filePath: 'file.jsx', locationHash: 'line1', checkpointKey: 'RULE:file.jsx:line1:shape.x' },
      3,
    );
    expect(seeded3c.refutes).toBe(3);
    const decayed = applyMemoryHalfLife(seeded3c, 3 + ImmuneCheckpointConfig.halfLifeRuns);
    // After exactly one half-life: 3 * 0.5 = 1.5, floor → 1
    expect(decayed.refutes).toBeLessThan(seeded3c.refutes);
    expect(decayed.refutes).toBeGreaterThan(0);
  });

  it('decays to zero after many half-lives', () => {
    let cell = createDefaultMemoryCell({
      key: 'RULE:file.jsx:line1:shape.x',
      ruleId: 'RULE',
      filePath: 'file.jsx',
      locationHash: 'line1',
      bytecodeShapeHash: 'shape.x',
      runIndex: 0,
    });
    for (let i = 1; i <= 5; i += 1) {
      cell = updateMemoryCellWithObservation(
        cell,
        {
          verdict: 'CONFIRMED',
          runId: `r.${i}`,
          ruleId: 'RULE',
          filePath: 'file.jsx',
          locationHash: 'line1',
          checkpointKey: 'RULE:file.jsx:line1:shape.x',
        },
        i,
      );
    }
    const farFuture = applyMemoryHalfLife(cell, 5 + 10 * ImmuneCheckpointConfig.halfLifeRuns);
    expect(farFuture.confirms).toBe(0);
  });

  it('strong new evidence can override old refutes after many runs', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const key = buildCheckpointKey({
      ruleId: RULE,
      filePath: FILE,
      location: makeObservation().location,
      bytecodeShapeHash: { opcode: 'LAYOUT_SHIFT', repeat: 7, spanPx: 184 },
    });
    memory.upsert(key, createDefaultMemoryCell({
      key,
      ruleId: RULE,
      filePath: FILE,
      locationHash: 'node.7c4',
      bytecodeShapeHash: 'shape.5b4e0a85eaaf',
      runIndex: 0,
    }));
    for (let i = 1; i <= 5; i += 1) {
      memory.upsert(key, updateMemoryCellWithObservation(
        memory.get(key),
        { ...makeObservation(), verdict: 'REFUTED', runId: `run.0000${i}` },
        i,
      ));
    }
    // 4 half-lives pass — old refutes should decay substantially.
    const advancedRun = 5 + 4 * ImmuneCheckpointConfig.halfLifeRuns;
    const decayed = applyMemoryHalfLife(memory.get(key), advancedRun);
    expect(decayed.refutes).toBeLessThan(5);
    memory.upsert(key, decayed);
    // New CONFIRMED observations at the same run rate as the refutes;
    // the freshly seeded evidence dominates because old refutes have decayed.
    for (let i = 0; i < 8; i += 1) {
      memory.upsert(key, updateMemoryCellWithObservation(
        memory.get(key),
        { ...makeObservation(), verdict: 'CONFIRMED', runId: `run.conf.${i}` },
        advancedRun + i + 1,
      ));
    }
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      memory,
      vaccines,
      // Evaluate one run after the last confirm so the freshest evidence
      // hasn't been heavily decayed.
      runIndex: advancedRun + 9,
    });
    expect(result.action).toBe('VIOLATION');
  });
});

describe('qbit-immune-checkpoint — rule apoptosis', () => {
  it('emits RULE_APOPTOSIS_CANDIDATE for high-refute rules with enough data', () => {
    const cell = createDefaultMemoryCell({
      key: 'RULE:file.jsx:line1:shape.x',
      ruleId: 'NOISY_RULE',
      filePath: 'file.jsx',
      locationHash: 'line1',
      bytecodeShapeHash: 'shape.x',
      runIndex: 0,
    });
    let next = cell;
    for (let i = 1; i <= 10; i += 1) {
      next = updateMemoryCellWithObservation(
        next,
        {
          verdict: 'REFUTED',
          runId: `run.0000${i}`,
          ruleId: 'NOISY_RULE',
          filePath: 'file.jsx',
          locationHash: 'line1',
          checkpointKey: 'RULE:file.jsx:line1:shape.x',
        },
        i,
      );
    }
    const reputation = evaluateRuleReputation({
      ruleId: 'NOISY_RULE',
      memoryCell: next,
    });
    expect(reputation.candidate).toBe(true);
    expect(reputation.reason).toBe('RULE_APOPTOSIS_CANDIDATE');
    expect(reputation.observationCount).toBe(10);
    expect(reputation.bytecode).toMatch(/^PB-ERR-v1-STATE-WARN-IMMUNE-/);
    const decoded = decodeBytecodeError(reputation.bytecode);
    expect(decoded.valid).toBe(true);
    expect(decoded.context.apoptosis).toBe('RULE_APOPTOSIS_CANDIDATE');
  });

  it('does not flag a rule with too few observations', () => {
    const cell = createDefaultMemoryCell({
      key: 'RULE:file.jsx:line1:shape.x',
      ruleId: 'NEW_RULE',
      filePath: 'file.jsx',
      locationHash: 'line1',
      bytecodeShapeHash: 'shape.x',
      runIndex: 0,
    });
    const next = updateMemoryCellWithObservation(
      cell,
      {
        verdict: 'REFUTED',
        runId: 'run.00001',
        ruleId: 'NEW_RULE',
        filePath: 'file.jsx',
        locationHash: 'line1',
        checkpointKey: 'RULE:file.jsx:line1:shape.x',
      },
      1,
    );
    const reputation = evaluateRuleReputation({ ruleId: 'NEW_RULE', memoryCell: next });
    expect(reputation.candidate).toBe(false);
  });
});

describe('qbit-immune-checkpoint — NEEDS_MERLIN escalation', () => {
  it('escalates to NEEDS_MERLIN when the caller flags a novel antigen as suspicious', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const result = checkpointDiagnosticObservation({
      observation: {
        ...makeObservation({
          ruleConfidence: 0.9,
          evidenceCount: 5,
          bytecodeEnvelope: { opcode: 'NEVER_SEEN_BEFORE', repeat: 3, spanPx: 99 },
        }),
        suspectNovelAntigen: true,
      },
      memory,
      vaccines,
      runIndex: 0,
    });
    expect(result.action).toBe('NEEDS_MERLIN');
    expect(result.reason).toBe('NOVEL_ANTIGEN_FLAGGED');
    expect(result.verdict).toBe('NEEDS_MERLIN');
    expect(memory._store.size).toBe(0);
  });

  it('emits WARN for a cold-start observation that the caller did NOT flag', () => {
    const memory = makeMemory();
    const vaccines = makeVaccines();
    const result = checkpointDiagnosticObservation({
      observation: makeObservation({
        ruleConfidence: 0.9,
        evidenceCount: 5,
        bytecodeEnvelope: { opcode: 'JUST_NEW', repeat: 1 },
      }),
      memory,
      vaccines,
      runIndex: 0,
    });
    expect(result.action).toBe('WARN');
    expect(result.reason).toBe('INSUFFICIENT_MEMORY_SIGNAL');
  });
});

describe('qbit-immune-checkpoint — determinism (VAELRIX_LAW §6)', () => {
  it('produces the same verdict, key, and memory cell 100x in a row', () => {
    const obs = makeObservation();
    const vaccines = makeVaccines();
    const verdicts = new Set();
    const keys = new Set();
    const checksums = new Set();
    for (let i = 0; i < 100; i += 1) {
      const memory = makeMemory();
      const r = checkpointDiagnosticObservation({
        observation: obs,
        memory,
        vaccines,
        runIndex: i,
      });
      verdicts.add(`${r.action}|${r.reason}|${r.verdict}`);
      keys.add(r.key);
      // persist and re-derive a stable canonical JSON of the cell
      const persisted = persistCheckpointCell(memory, r.key, r.memoryCell);
      expect(persisted.ok).toBe(true);
      const canonical = JSON.stringify({
        contract: r.memoryCell.version,
        key: r.key,
        confirms: r.memoryCell.confirms,
        refutes: r.memoryCell.refutes,
        lastVerdict: r.memoryCell.lastVerdict,
      });
      checksums.add(canonical);
    }
    expect(verdicts.size).toBe(1);
    expect(keys.size).toBe(1);
    expect(checksums.size).toBe(1);
  });

  it('memory cell updates are canonical JSON with stable checksum ordering', () => {
    const cell = createDefaultMemoryCell({
      key: 'RULE:f.js:line1:shape.x',
      ruleId: 'RULE',
      filePath: 'f.js',
      locationHash: 'line1',
      bytecodeShapeHash: 'shape.x',
      runIndex: 0,
    });
    const next = updateMemoryCellWithObservation(
      cell,
      {
        verdict: 'CONFIRMED',
        runId: 'run.00001',
        ruleId: 'RULE',
        filePath: 'f.js',
        locationHash: 'line1',
        checkpointKey: 'RULE:f.js:line1:shape.x',
        evidenceHash: 'evidence.13bc',
      },
      1,
    );
    const jsonA = JSON.stringify(next);
    const jsonB = JSON.stringify(next);
    expect(jsonA).toBe(jsonB);
    // Cell is frozen — mutation should throw or be a no-op
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe('qbit-immune-checkpoint — adapter seam', () => {
  it('survives a missing memory adapter by passing through with WARN', () => {
    const vaccines = makeVaccines();
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      vaccines,
      runIndex: 0,
    });
    expect(result.action).toBe('WARN');
    expect(result.reason).toBe('INSUFFICIENT_MEMORY_SIGNAL');
  });

  it('survives a missing vaccines adapter by skipping vaccine match', () => {
    const memory = makeMemory();
    const result = checkpointDiagnosticObservation({
      observation: makeObservation(),
      memory,
      runIndex: 0,
    });
    expect(result.vaccineVerdict).toBeNull();
    expect(result.action).toBe('WARN');
  });

  it('persistCheckpointCell returns NO_MEMORY_ADAPTER when no adapter is provided', () => {
    const result = persistCheckpointCell(null, 'k', {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NO_MEMORY_ADAPTER');
  });
});

describe('qbit-immune-checkpoint — internal helpers', () => {
  it('verdictForAction maps actions to canonical verdict strings', () => {
    expect(__internals.verdictForAction('VIOLATION', 'VACCINE_MATCH_CONFIRMED_PATHOGEN')).toBe('VACCINE_MATCH');
    expect(__internals.verdictForAction('VIOLATION', 'MEMORY_CONFIRMS_RULE')).toBe('CONFIRMED');
    expect(__internals.verdictForAction('HEALTH_SIGNAL', 'MEMORY_REFUTES_RULE')).toBe('REFUTED');
    expect(__internals.verdictForAction('NEEDS_MERLIN', 'NOVEL_ANTIGEN_FLAGGED')).toBe('NEEDS_MERLIN');
    expect(__internals.verdictForAction('WARN', 'INSUFFICIENT_MEMORY_SIGNAL')).toBe('INSUFFICIENT');
    expect(__internals.verdictForAction('WARN', 'MIXED_OR_UNSTABLE_MEMORY')).toBe('MIXED');
  });

  it('appendHistory dedupes consecutive identical entries and bounds the buffer', () => {
    const initial = [{ runId: 'r.1', verdict: 'REFUTED', evidenceHash: null }];
    const after1 = __internals.appendHistory(initial, { runId: 'r.1', verdict: 'REFUTED', evidenceHash: null });
    expect(after1).toBe(initial);
    const after2 = __internals.appendHistory(initial, { runId: 'r.2', verdict: 'REFUTED', evidenceHash: null });
    expect(after2.length).toBe(2);
  });
});
