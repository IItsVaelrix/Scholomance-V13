/**
 * Particle orchestration — frozen-chart, default-off, grammar sovereignty.
 *
 * Production change that would make these fail: scoring during admission,
 * changing BONDS/lifts/roots, or making the channel default-on so the
 * frozen treebank gate silently moves.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { composePacked } from '../../../../codex/core/constellation/compose-packed.js';
import {
  FORBIDDEN_PERMISSIONS,
  particleSchemaChecksum,
} from '../../../../codex/core/constellation/semantic-particles/schema.js';
import {
  annotateSemanticParticles,
  forestFingerprint,
} from '../../../../codex/core/constellation/semantic-particles/annotate.js';

const require = createRequire(import.meta.url);
const annotateSource = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/semantic-particles/annotate.js'),
  'utf8',
);
const packedSource = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/compose-packed.js'),
  'utf8',
);

const pos = new Map([
  ['old', ['a']],
  ['men', ['n']],
  ['ran', ['v']],
]);

describe('semantic particle annotation is downstream of admission', () => {
  it('does not import a Grimoire mutator or expose ADMIT_BOND', () => {
    expect(annotateSource).not.toMatch(/from ['"]\.\.\/grimoire['"]/);
    expect(annotateSource).not.toMatch(/ACTIVE_CONSTRUCTIONS|validateConstructions/);
    expect(FORBIDDEN_PERMISSIONS).toContain('ADMIT_BOND');
    expect(packedSource).toMatch(/options\.semanticParticles/);
  });

  it('is OFF by default so the frozen baseline is untouched', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    expect(chart.semanticParticles).toBeNull();
  });

  it('annotation does not change forest structure, events, or admission', () => {
    const off = composePacked(['old', 'men', 'ran'], pos, { ledger: true });
    const on = composePacked(['old', 'men', 'ran'], pos, { ledger: true, semanticParticles: true });
    expect(forestFingerprint(on)).toBe(forestFingerprint(off));
    expect(on.events).toBe(off.events);
    expect(on.molecules.length).toBe(off.molecules.length);
    expect(on.bondAttempts).toBe(off.bondAttempts);
    expect(on.bondRefusals).toBe(off.bondRefusals);
    expect(on.semanticParticles.schemaChecksum).toBe(particleSchemaChecksum());
    expect(on.semanticParticles.mode).toBe('observe');
  });

  it('two identical runs yield byte-identical reports', () => {
    const a = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    const b = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    expect(a.semanticParticles.reportHash).toBe(b.semanticParticles.reportHash);
    expect(a.semanticParticles.reportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('abstains cleanly when the feature provider is missing', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const report = annotateSemanticParticles(chart, { featureProvider: null });
    expect(report.warnings).toContain('feature-provider-absent');
    expect(report.degradedChannels).toContain('microfeatures');
    expect(report.particles.every((p) => p.confidence === null || p.kind !== 'entity.animacy')).toBe(true);
  });

  it('does not throw on a chart with no spanning root', () => {
    const chart = composePacked(['the'], new Map([['the', ['x']]]), {
      semanticParticles: true,
    });
    expect(chart.stable).toEqual([]);
    expect(chart.semanticParticles).not.toBeNull();
    expect(chart.semanticParticles.reportHash).toMatch(/^[0-9a-f]{64}$/);
    expect(chart.semanticParticles.forest.best.score == null
      || Number.isFinite(chart.semanticParticles.forest.best.score)).toBe(true);
  });

  it('observes lexical senses and composed who-did-what without rewriting the forest', () => {
    const off = composePacked(['old', 'men', 'ran'], pos);
    const on = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    expect(forestFingerprint(on)).toBe(forestFingerprint(off));
    const men = on.semanticParticles.lexical.find((row) => row.lemma === 'men');
    expect(men.polysemy).toBeGreaterThan(0);
    const clause = on.semanticParticles.compositional.find((row) => row.type === 'S');
    expect(clause.roles.Agent).toBe('men');
    expect(clause.roles.Event).toBe('ran');
  });

  it('score modes attach ranks without rewriting the standing ranked field', () => {
    const observe = composePacked(['old', 'men', 'ran'], pos, {
      semanticParticles: { mode: 'observe' },
    });
    const scored = composePacked(['old', 'men', 'ran'], pos, {
      semanticParticles: { mode: 'score-derivation' },
    });
    expect(observe.ranked.map((r) => r.type)).toEqual(scored.ranked.map((r) => r.type));
    expect(scored.semanticParticles.rankedDerivations.length).toBeGreaterThan(0);
    expect(observe.semanticParticles.rankedDerivations).toEqual([]);
  });
});
