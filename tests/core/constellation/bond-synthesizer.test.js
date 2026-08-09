import { describe, it, expect } from 'vitest';
import { ACTIVE_CONSTRUCTIONS, CONSTRUCTIONS } from '../../../codex/core/constellation/grimoire/index.js';
import {
  synthesizeBonds,
  rediscoveryReport,
  predictHead,
} from '../../../codex/core/constellation/grimoire/bond-synthesizer.js';

describe('theoretical bond synthesizer', () => {
  it('emits candidates without requiring the gold table', () => {
    const c = synthesizeBonds();
    expect(c.length).toBeGreaterThan(40);
    expect(c.every((x) => x.left && x.right && x.result && (x.head === 0 || x.head === 1))).toBe(true);
  });

  it('rediscovers a viable fraction of active constructions (≥40 signatures)', () => {
    const report = rediscoveryReport(ACTIVE_CONSTRUCTIONS);
    expect(report.nGold).toBe(ACTIVE_CONSTRUCTIONS.length);
    expect(report.nHitSignatureOnly).toBeGreaterThanOrEqual(40);
    expect(report.viableAt40).toBe(true);
  });

  it('predicts DET+N and NP+VP heads in the UD direction', () => {
    expect(predictHead('DET', 'N', 'NP')).toBe(1);
    expect(predictHead('NP', 'VP', 'S')).toBe(1);
    expect(predictHead('V', 'NP', 'VP')).toBe(0);
    expect(predictHead('S', 'PUNCT', 'S')).toBe(0);
  });

  it('covers core determination and clause signatures', () => {
    const sigs = new Set(synthesizeBonds().map((c) => c.signature));
    expect(sigs.has('DET|N|NP')).toBe(true);
    expect(sigs.has('NP|VP|S')).toBe(true);
    expect(sigs.has('AUX|VP|VP')).toBe(true);
    expect(sigs.has('S|PUNCT|S')).toBe(true);
  });

  it('full constitution rediscovery stays in the same ballpark', () => {
    const report = rediscoveryReport(CONSTRUCTIONS);
    expect(report.nHitSignatureOnly).toBeGreaterThanOrEqual(40);
  });
});
