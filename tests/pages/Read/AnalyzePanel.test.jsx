import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeHook = vi.hoisted(() => ({
  clear: vi.fn(),
  submit: vi.fn(),
  state: { result: null, loading: false, error: null },
}));

vi.mock('../../../src/pages/Read/useLexicalAnalyze.js', () => ({
  useLexicalAnalyze: () => ({
    ...analyzeHook.state,
    clear: analyzeHook.clear,
    submit: analyzeHook.submit,
  }),
}));

import AnalyzePanel from '../../../src/pages/Read/AnalyzePanel.jsx';

const item = (text, source = 'fixture', pos) => ({
  text,
  source,
  confidence: 0.8,
  ...(pos !== undefined ? { pos } : {}),
});
const group = (key, label, words) => ({
  key,
  label,
  items: words.map((word) => (Array.isArray(word) ? item(word[0], 'fixture', word[1]) : item(word))),
});

function resultFixture({ scope = 'line', partial = false } = {}) {
  const candidates = [
    {
      id: 'leaf/noun', lemma: 'leaf', pos: 'noun', rank: 1, score: 0.74,
      evidence: [
        { channel: 'morphology', score: 0.85, available: true, source: 'oewn', reason: 'plural.s' },
        { channel: 'semantics', score: 0.72, available: true, source: 'turboquant:sense', reason: 'closest sense', contextSegments: ['containingLine'] },
        { channel: 'pos', score: 1, available: true, source: 'context', reason: 'context suggests noun' },
      ],
      senses: [],
    },
    {
      id: 'leave/verb', lemma: 'leave', pos: 'verb', rank: 2, score: 0.61,
      evidence: [{ channel: 'morphology', score: 0.85, available: true, source: 'oewn', reason: 'third-person.s' }],
      senses: [],
    },
  ];
  return {
    context: { version: 'ANALYSIS_CONTEXT_v1', scope, contextHash: 'sha256-canonical-v1:fixture' },
    resolution: {
      surface: 'leaves', status: 'ambiguous', margin: 0.13, threshold: 0.2,
      formulaVersion: 'LEMMA_RANK_v1',
      morphologyIndex: {
        version: 'LEMMA_FORM_v1', status: partial ? 'partial' : 'complete',
        expectedLemmaCount: 2, indexedLemmaCount: partial ? 1 : 2,
      },
      candidates: partial ? candidates.slice(0, 1) : candidates,
    },
    degradation: partial ? [{ code: 'morphology_index_incomplete', channel: 'morphology', reason: 'Index build is partial.' }] : [],
    sharedGroups: [
      group('sound', 'Sound', ['weaves']),
      group('phrases', 'Phrases', []),
      group('literary', 'Literary techniques', ['metaphor']),
    ],
    candidateResults: (partial ? candidates.slice(0, 1) : candidates).map((candidate) => ({
      candidateId: candidate.id,
      groups: [
        group('meaning', 'Meaning', [`meaning of ${candidate.lemma}`]),
        group('related', 'Related language', ['foliage']),
        group('oppositions', 'Oppositions', ['root']),
        group('symbols', 'Symbols', ['renewal']),
        group('corpus', 'Corpus examples', ['the leaves fell']),
      ],
    })),
  };
}

const renderPanel = (props = {}) => render(
  <AnalyzePanel
    initialQuery="leaves"
    selection="leaves"
    currentLineText="The tree sheds its leaves"
    scrollLines={['Before the tree', 'The tree sheds its leaves', 'After the rain']}
    currentLineIndex={1}
    documentContext={'Before the tree\nThe tree sheds its leaves\nAfter the rain'}
    {...props}
  />,
);

describe('AnalyzePanel ambiguity controls', () => {
  beforeEach(() => {
    analyzeHook.clear.mockReset();
    analyzeHook.submit.mockReset();
    analyzeHook.state = { result: null, loading: false, error: null };
  });

  it('submits the chosen deterministic context envelope only on Search', () => {
    renderPanel();
    expect(analyzeHook.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(analyzeHook.submit).toHaveBeenCalledWith({
      scope: 'line',
      surface: 'leaves',
      containingLine: 'The tree sheds its leaves',
    });
  });

  it('requires explicit document scope and explains its evidence boundary', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: 'Document' }));

    expect(screen.getByText(/whole document/i)).toBeInTheDocument();
    expect(analyzeHook.submit).not.toHaveBeenCalled();
  });

  it('keeps the internal Word scoring policy out of the scope UI', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: 'Word' }));

    expect(screen.queryByText(/semantic proximity|morphology and corpus priors/i))
      .not.toBeInTheDocument();
  });

  it('renders ranked candidate tabs, ordered result channels, and inspectable evidence', () => {
    analyzeHook.state = { result: resultFixture(), loading: false, error: null };
    renderPanel();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringMatching(/leaf.*noun.*74%/i),
      expect.stringMatching(/leave.*verb.*61%/i),
    ]);
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('meaning of leave')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ranking evidence/i }));
    expect(screen.getByText(/third-person\.s/i)).toBeInTheDocument();

    const results = screen.getByTestId('analyze-results');
    expect(within(results).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent))
      .toEqual(['Meaning 1', 'Related language 1', 'Oppositions 1', 'Sound 1', 'Phrases 0', 'Literary techniques 1', 'Symbols 1', 'Corpus examples 1']);
  });

  it('announces incomplete source coverage and never presents a lone candidate as certainty', () => {
    analyzeHook.state = { result: resultFixture({ scope: 'word', partial: true }), loading: false, error: null };
    renderPanel({ selection: '' });

    expect(screen.getByRole('status')).toHaveTextContent(/ambiguous/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/partial|incomplete/i);
    fireEvent.click(screen.getByRole('button', { name: /ranking evidence/i }));
    expect(screen.queryByText(/closest sense/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/context suggests noun/i)).not.toBeInTheDocument();
  });

  it('buckets pos-tagged words by part of speech, alphabetized, duplicating multi-POS words', () => {
    const result = resultFixture();
    result.sharedGroups[0] = group('sound', 'Sound', [
      ['weaves', ['verb']],
      ['stress', ['noun', 'verb']],
      ['achieves', []],
      ['believes', ['verb']],
    ]);
    analyzeHook.state = { result, loading: false, error: null };
    renderPanel();

    const results = screen.getByTestId('analyze-results');
    const soundGroup = within(results).getByRole('heading', { level: 3, name: /^Sound/ }).closest('section');

    const bucketHeadings = within(soundGroup).getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
    expect(bucketHeadings).toEqual(['Nouns 1', 'Verbs 3', 'Unclassified 1']);

    // Multi-POS word appears in both buckets; alphabetized within each.
    const texts = [...soundGroup.querySelectorAll('.az-item__text')].map((node) => node.textContent);
    expect(texts).toEqual(['stress', 'believes', 'stress', 'weaves', 'achieves']);

    // Group heading counts distinct items, not the duplicated total.
    expect(within(soundGroup).getByRole('heading', { level: 3 })).toHaveTextContent('Sound 4');

    // Groups without pos fields render flat: no h4 buckets in Meaning.
    const meaningGroup = within(results).getByRole('heading', { level: 3, name: /^Meaning/ }).closest('section');
    expect(within(meaningGroup).queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });
});
