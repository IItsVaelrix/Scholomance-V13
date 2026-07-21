import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

vi.mock('../../../src/pages/Read/useLexicalAnalyze.js', () => ({
  useLexicalAnalyze: () => ({
    result: {
      resolution: {
        status: 'ambiguous',
        margin: 0.13,
        threshold: 0.2,
        candidates: [
          { id: 'leaf/noun', lemma: 'leaf', pos: 'noun', rank: 1, score: 0.74, evidence: [] },
        ],
      },
      context: { scope: 'line', contextHash: 'hash' },
      candidateResults: [],
      sharedGroups: [],
    },
    loading: false,
    error: null,
    submit: () => {},
    clear: () => {},
  }),
}));

import AnalyzePanel from '../../../src/pages/Read/AnalyzePanel.jsx';

describe('Compose Leximancy Panel Architecture', () => {
  it('has valid SCHOL-COMPONENT-DEFINITION attributes', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalyzePanel, {
        activeScroll: null,
        editorTitle: 'Test',
        editorContent: 'Test content',
        onCraftAction: () => {},
      })
    );
    expect(html).toContain('data-compose-kind="leximancy-panel"');
    expect(html).toContain('data-compose-version="1.0.0"');
    expect(html).toContain('role="region"');
  });

  it('renders dynamic ambiguity margin bar with constraint solver attributes', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalyzePanel, {
        activeScroll: null,
        editorTitle: 'Test',
        editorContent: 'Test content',
        onCraftAction: () => {},
      })
    );
    expect(html).toContain('az-ambiguity-margin-bar');
    expect(html).toContain('data-compose-layout="constraint"');
  });

  it('renders WAND procedural confidence sigil inside candidate chips', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalyzePanel, {
        activeScroll: null,
        editorTitle: 'Test',
        editorContent: 'Test content',
        onCraftAction: () => {},
      })
    );
    expect(html).toContain('az-candidate__sigil');
  });
});

