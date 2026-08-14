/** @vitest-environment jsdom */
/**
 * The sky and the dock must speak the same degradation the packet already
 * carries. A measured star count that includes a failed channel is a lie.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ConstellationExperience from '../../../src/pages/Constellation/ConstellationExperience.jsx';
import { projectConstellationPacket } from '../../../src/pages/Constellation/constellationSceneProjection.js';

function packet(overrides = {}) {
  return {
    pageBytecode: 'COS-PAGE-v1-TISSUE-UI-001',
    query: {
      raw: 'the bright wound',
      normalized: 'the bright wound',
      kind: 'phrase',
      tokenCount: 3,
      graphemeCount: 16,
      intent: 'literary',
    },
    leximancy: {
      status: 'unsupported',
      selectedInterpretationId: null,
      interpretations: [],
      nearKin: [],
      counterfield: [],
      warnings: [],
      anchor: null,
    },
    rhymeAstrology: {
      phonemes: ['W', 'UW1', 'N', 'D'],
      stress: '/',
      cadenceFamily: 'mono',
      exactRhymes: [],
      slantRhymes: [],
    },
    phraseGenome: { syllables: 1, devicesHint: [], schoolHint: null },
    readings: {
      contested: false,
      primary: null,
      readings: [{
        anchor: 'wound',
        role: 'head',
        proposedBy: 'rarity',
        rationale: 'rare',
        candidate: true,
      }],
      silent: [],
    },
    scaleField: {
      status: 'ok',
      anchor: 'wound',
      scale: {
        id: 's',
        dimension: null,
        kind: 'intensity',
        memberCount: 1,
        span: 0,
        ladder: [{ word: 'wound', rank: 1, relative: 1, isAnchor: true }],
      },
      neighbours: [],
      opposites: [],
      warnings: [],
    },
    discovery: null,
    diagnostics: { degradedChannels: [], warnings: [] },
    provenance: { engineVersions: { constellationOS: 'test' } },
    ...overrides,
  };
}

describe('constellation experience — degraded channels', () => {
  it('labels a degraded meaning channel for assistive tech and dims the dock control', () => {
    const degraded = packet({
      diagnostics: { degradedChannels: ['leximancy'], warnings: [] },
    });
    render(<ConstellationExperience packet={degraded} reducedMotion />);

    const dock = screen.getByRole('navigation', { name: 'Analysis channels' });
    const meaning = within(dock).getByRole('button', { name: /meaning field, degraded/i });
    expect(meaning).toHaveAttribute('data-state', 'degraded');

    const identity = within(dock).getByRole('button', { name: /^phrase identity$/i });
    expect(identity.getAttribute('data-state')).not.toBe('degraded');
  });

  it('counts only measured stars in the spatial index aria-label', () => {
    const degraded = packet({
      diagnostics: { degradedChannels: ['leximancy'], warnings: [] },
    });
    const model = projectConstellationPacket(degraded);
    render(<ConstellationExperience packet={degraded} reducedMotion />);

    const group = screen.getByRole('group', { name: /semantic stars/i });
    expect(group.getAttribute('aria-label')).toMatch(
      new RegExp(`${model.measuredNodeCount} measured semantic stars`),
    );
    expect(group.getAttribute('aria-label')).not.toMatch(
      new RegExp(`${model.nodes.length} measured semantic stars`),
    );
  });

  it('names an empty healthy meaning channel as nothing found, not degraded', () => {
    render(<ConstellationExperience packet={packet()} reducedMotion />);
    const dock = screen.getByRole('navigation', { name: 'Analysis channels' });
    expect(within(dock).getByRole('button', { name: /meaning field, nothing found/i })).toBeTruthy();
    expect(within(dock).queryByRole('button', { name: /meaning field, degraded/i })).toBeNull();
  });
});
