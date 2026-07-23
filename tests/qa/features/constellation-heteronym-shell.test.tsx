/** @vitest-environment jsdom */
/**
 * The channel shipped for several commits with nothing rendering it: the packet
 * carried the split, the verdict and the frame, and `wound` knew it was two
 * words while being unable to tell anyone. These tests assert the markup exists,
 * so that cannot happen silently again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ConstellationResultShell from '../../../src/pages/Constellation/ConstellationResultShell.jsx';

afterEach(cleanup);

const basePacket = {
  query: { raw: 'wound', normalized: 'wound', kind: 'word', tokenCount: 1, graphemeCount: 5, intent: 'literary' },
  leximancy: {
    status: 'ok',
    selectedInterpretationId: 'w.n.0',
    interpretations: [{ id: 'w.n.0', gloss: 'an injury to living tissue', confidence: 0.9, pos: 'n', examples: [] }],
    warnings: [], nearKin: [], counterfield: [],
    relations: { broader: [], narrower: [], akin: [] },
  },
  rhymeAstrology: null,
  phraseGenome: { syllables: 1, devicesHint: [], schoolHint: null },
  pageBytecode: 'COS-PAGE-v1-test',
  provenance: { engineVersions: { constellationOS: 'x' } },
  diagnostics: { degradedChannels: [], warnings: [] },
};

const heteronym = {
  status: 'ok', bound: true, probeId: 'constellation.sense.disambiguation',
  hypotheses: { supported: [], eliminated: [], surviving: [], underdetermined: [] },
  selection: { warranted: false, reason: 'heteronym_unresolved', senseId: null, gloss: null, overlap: null },
  evidence: { candidateCount: 7, edgeCount: 0 },
  isHeteronym: true, distinctPronunciations: 2, headToken: 'wound',
  framePos: null, frameCue: null, viableWordCount: 3,
  lexicalEntries: [
    { pos: 'a', senseCount: 1, gloss: 'put in a coil', synsetId: 'oewn-02325885-s' },
    { pos: 'n', senseCount: 4, gloss: 'an injury to living tissue', synsetId: 'oewn-14322317-n' },
  ],
};

describe('heteronym split rendering', () => {
  it('tells the reader the spelling is two words, and which', () => {
    render(<ConstellationResultShell packet={{ ...basePacket, semanticInquiry: heteronym }} />);
    expect(screen.getByText(/is\s*2 words, not one meaning/)).toBeTruthy();
    expect(screen.getByText('put in a coil')).toBeTruthy();
    // Scoped to the split block: "1 sense" also appears in the leximancy panel note.
    const split = document.querySelector('.constellation-result-heteronym__list');
    expect(split).toBeTruthy();
    expect(split.textContent).toContain('4 senses');
    expect(split.textContent).toContain('1 sense');
    expect(split.textContent).toContain('put in a coil');
  });

  it('says the context could not settle it when no frame exists', () => {
    render(<ConstellationResultShell packet={{ ...basePacket, semanticInquiry: heteronym }} />);
    expect(screen.getByText(/No context to settle which/)).toBeTruthy();
  });

  it('names the cue when the frame did settle it', () => {
    const settled = { ...heteronym, framePos: 'n', frameCue: 'determiner:the', viableWordCount: 1 };
    render(<ConstellationResultShell packet={{ ...basePacket, semanticInquiry: settled }} />);
    expect(screen.getByText(/Context settled it \(determiner:the\)/)).toBeTruthy();
  });

  it('shows nothing for an ordinary word', () => {
    const ordinary = { ...heteronym, isHeteronym: false, distinctPronunciations: 1 };
    render(<ConstellationResultShell packet={{ ...basePacket, semanticInquiry: ordinary }} />);
    expect(screen.queryByText(/words, not one meaning/)).toBeNull();
  });

  it('renders an older packet with no semanticInquiry at all', () => {
    // The field is absent on anything built before the channel existed.
    render(<ConstellationResultShell packet={basePacket} />);
    expect(screen.getByText('an injury to living tissue')).toBeTruthy();
    expect(screen.queryByText(/words, not one meaning/)).toBeNull();
  });
});

describe('evidenced vs default selection', () => {
  it('marks a reasoned pick differently from a fallback pick', () => {
    const evidenced = {
      ...heteronym, isHeteronym: false, distinctPronunciations: 1,
      selection: { warranted: true, reason: 'supported', senseId: 'w.n.0', gloss: 'an injury to living tissue', overlap: 2 },
    };
    render(<ConstellationResultShell packet={{ ...basePacket, semanticInquiry: evidenced }} />);
    expect(screen.getByText('evidenced')).toBeTruthy();
  });

  it('says "selected" when nothing in the query chose it', () => {
    render(<ConstellationResultShell packet={basePacket} />);
    expect(screen.getByText('selected')).toBeTruthy();
  });
});
