import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  STUDIO_TABS,
  studioHashForTab,
  studioTabFromHash,
} from '../../src/pages/PixelBrain/studio/studio-tabs.js';
import { StudioTabBar } from '../../src/pages/PixelBrain/studio/StudioTabBar.jsx';

describe('PixelBrain SWARD studio tab shell', () => {
  test('exposes every flagship workspace as an accessible tab', () => {
    render(<StudioTabBar activeTab="canvas" onSelect={() => {}} />);

    expect(screen.getAllByRole('tab')).toHaveLength(9);
    expect(screen.getByRole('tab', { name: /canvas & aseprite/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /amp conveyor/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /mutation lab/i })).toBeInTheDocument();
    expect(STUDIO_TABS.map((tab) => tab.id)).toEqual([
      'canvas',
      'blueprint',
      'foundry',
      'amps',
      'mutations',
      'finish',
      'mentor',
      'library',
      'diagnostics',
    ]);
  });

  test('supports roving keyboard navigation without trapping focus', () => {
    const onSelect = vi.fn();
    render(<StudioTabBar activeTab="canvas" onSelect={onSelect} />);

    const canvas = screen.getByRole('tab', { name: /canvas & aseprite/i });
    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('blueprint');

    fireEvent.keyDown(canvas, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('diagnostics');

    fireEvent.keyDown(canvas, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('canvas');
  });

  test('normalizes deep links to known studio tabs', () => {
    expect(studioTabFromHash('#studio=mutations')).toBe('mutations');
    expect(studioTabFromHash('#studio=not-real')).toBe('canvas');
    expect(studioTabFromHash('')).toBe('canvas');
    expect(studioHashForTab('amps')).toBe('#studio=amps');
    expect(studioHashForTab('not-real')).toBe('#studio=canvas');
  });
});
