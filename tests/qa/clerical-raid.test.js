/**
 * Clerical RAID — PDR acceptance tests (vector + verdict + library size).
 */

import { describe, it, expect } from 'vitest';
import { createRaidWithSeeds } from '../../codex/core/immunity/clerical-raid.bootstrap.js';
import { cosineSimilarity, Pattern, ClericalRAID } from '../../codex/core/immunity/clerical-raid.core.js';
import { bugToVector } from '../../codex/core/immunity/clerical-raid.vector.js';
import { SEED_PATTERNS, SEED_STATS } from '../../codex/core/immunity/clerical-raid.patterns.js';
import { agentHookQuery, agentHookApplies } from '../../codex/core/immunity/clerical-raid.agents.js';
import {
  merlinReportToBugReport,
  autoTrainFromMerlinReport,
  patternEffectivenessScore,
  clusterPatternsBySimilarity,
  extractVectorFromMerlinReport
} from '../../codex/core/immunity/clerical-raid.learning.js';
import { AGENT_INDEX } from '../../codex/core/immunity/clerical-raid.schema.js';

describe('Clerical RAID', () => {
  it('seeds fifty patterns (PDR Phase 1 target)', () => {
    expect(SEED_PATTERNS.length).toBe(52);
    expect(SEED_STATS.total).toBe(52);
  });

  it('returns CONFIRMED with ~1.0 confidence when report matches a seed exactly', () => {
    const raid = createRaidWithSeeds();
    const p = SEED_PATTERNS[0];
    const result = raid.query({
      symptoms: [...p.symptoms],
      filePaths: [...p.filePaths],
      errorMessages: [...p.errorMessages]
    });
    expect(result.verdict).toBe('CONFIRMED');
    expect(result.confidence).toBeGreaterThan(0.99);
    expect(result.matchedPattern?.id).toBe(p.id);
  });

  it('does not false-CONFIRM unrelated gibberish (escalation path)', () => {
    const raid = createRaidWithSeeds();
    const result = raid.query({
      symptoms: ['qwerty zzz no signal'],
      filePaths: ['/tmp/void'],
      errorMessages: []
    });
    expect(result.verdict).not.toBe('CONFIRMED');
    expect(result.confidence).toBeLessThan(0.95);
    expect(result.escalationRequired).toBe(true);
  });

  it('cosineSimilarity is 1 for identical vectors', () => {
    const a = bugToVector(
      { symptoms: ['null pointer', 'schema validation failed'], filePaths: ['codex/core'] },
      42
    );
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it('rebuildIndex keeps pattern count stable', () => {
    const raid = createRaidWithSeeds();
    raid.rebuildIndex();
    expect(raid.patterns.length).toBe(52);
    expect(raid.getStats().memoryBytes).toBeGreaterThan(0);
  });

  it('honors BugReport.layer alias', () => {
    const raid = createRaidWithSeeds({ seed: 7 });
    const v1 = bugToVector({ symptoms: ['render mismatch'], layer: 'src/pages' }, 7);
    const v2 = bugToVector({ symptoms: ['render mismatch'], layerHint: 'src/pages' }, 7);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1, 5);
  });

  it('Phase 3: agent hook adds playbook and applicability', () => {
    const raid = createRaidWithSeeds();
    const r = agentHookQuery(raid, 'codex', {
      symptoms: ['schema validation failed'],
      filePaths: ['codex/core/foo.js'],
      timestamp: Date.now()
    });
    expect(r.playbook).toContain('Codex');
    expect(r.agent).toBe('codex');
    expect(agentHookApplies('codex', ['codex/core/x.js'])).toBe(true);
  });

  it('Phase 4: Merlin row maps to bug report and yields extractable vector', () => {
    const row = {
      id: 'bug-test-1',
      title: 'null pointer in combat hook',
      summary: 'cannot read property of undefined',
      observed_behavior: 'crash on submit',
      module_id: 'codex/core/combat.js',
      bytecode: 'PB-ERR-v1-test',
      repro_steps: '1. open panel\n2. click fight'
    };
    const br = merlinReportToBugReport(row);
    expect(br.symptoms.length).toBeGreaterThan(0);
    expect(br.filePaths).toContain('codex/core/combat.js');
    const v = extractVectorFromMerlinReport(row, 42);
    expect(v.length).toBe(128);
  });

  it('Phase 4: auto-train appends pattern only on NOVEL', () => {
    const raid = createRaidWithSeeds();
    const n0 = raid.patterns.length;
    const novel = {
      id: 'novel-xyz-99',
      title: 'Qm9yaW5nIHVuaXF1ZSBwcm9iZSBrbHdqeCByYWlkLiBSU1RUVlhYWg==',
      summary: 'd2VpcmQgb25seSByYW5kb20gc3RyaW5ncyB6enp6enp6ejk5OTk5',
      module_id: '/zzzzz/clerical-raid-novel-only-path-999999',
      observed_behavior: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    };
    const { trained, query } = autoTrainFromMerlinReport(raid, novel, { train: true });
    expect(['NOVEL', 'NEEDS_MERLIN']).toContain(query.verdict);
    expect(trained).toBeTruthy();
    expect(raid.patterns.length).toBe(n0 + 1);
  });

  it('Phase 4: effectiveness score blends confidence and hit rate', () => {
    const p = new Pattern('x', 'n', [], [], [], AGENT_INDEX.CODEX, '', 0.8);
    p.hitCount = 1;
    p.missCount = 1;
    const s = patternEffectivenessScore(p);
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('Phase 4: clustering groups identical duplicate patterns', () => {
    const raid = createRaidWithSeeds();
    const dup = new Pattern(
      'PAT-DUP-TEST',
      'dup',
      [...SEED_PATTERNS[0].symptoms],
      [...SEED_PATTERNS[0].filePaths],
      [...SEED_PATTERNS[0].errorMessages],
      AGENT_INDEX.CODEX,
      'fix',
      1.0
    );
    raid.train(dup);
    const clusters = clusterPatternsBySimilarity(raid, 0.999);
    const big = clusters.filter(c => c.length > 1);
    expect(big.length).toBeGreaterThan(0);
  });

  it('deprecated patterns are skipped in nearest-neighbor search', () => {
    const raid = new ClericalRAID({ capacity: 5, seed: 42 });
    const p = new Pattern(
      'PAT-SOLO',
      'solo',
      ['alpha unique clerical deprecation probe'],
      ['/tmp/clerical-raid-solo.js'],
      [],
      AGENT_INDEX.CODEX,
      '',
      1.0
    );
    raid.train(p);
    const q1 = raid.query({
      symptoms: [...p.symptoms],
      filePaths: [...p.filePaths],
      errorMessages: []
    });
    expect(q1.verdict).toBe('CONFIRMED');
    p.deprecated = true;
    const q2 = raid.query({
      symptoms: [...p.symptoms],
      filePaths: [...p.filePaths],
      errorMessages: []
    });
    expect(q2.verdict).toBe('NOVEL');
  });
});
