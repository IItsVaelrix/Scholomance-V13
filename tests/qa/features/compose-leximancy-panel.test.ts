import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
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
});
