import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BytecodeVisualiserPage from '../../../src/pages/Visualiser/BytecodeVisualiserPage';

vi.mock('../../../src/kits/scholomance-visualizer-kit/hooks/useLyricAlignment', () => ({
  useLyricAlignment: () => null,
}));

vi.mock('../../../src/lib/engine.adapter.js', () => ({
  PhonemeEngine: {
    init: async () => {},
    analyzeDeep: () => null,
    getSchoolFromVowelFamily: () => 'SONIC',
  },
  generateSchoolColor: () => 'hsl(267, 52%, 52%)',
}));

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('BytecodeVisualiserPage song score', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/visualiser');
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('renders honest song-score panels instead of fingerprint theater', async () => {
    render(
      <MemoryRouter>
        <BytecodeVisualiserPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('region', { name: 'Track identity' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Spectral analysis' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Phonemic density' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'School association' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Delivery pressure' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Playhead' })).toBeTruthy();

    expect(screen.queryByText(/256-bit checksum/i)).toBeNull();
    expect(screen.queryByText(/GlyphCore/i)).toBeNull();
    expect(screen.queryByText(/Energy Matrix/i)).toBeNull();
    expect(screen.queryByText(/Semantic Map/i)).toBeNull();
  });
});
