import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../src/pages/PixelBrain/PixelBrainPage.jsx', () => ({
  default: ({ studioEnabled, studioTab, onStudioTabChange }) => (
    <main>
      <span>{studioEnabled ? 'studio-enabled' : 'legacy'}</span>
      <span>{studioTab}</span>
      <button type="button" onClick={() => onStudioTabChange('mutations')}>Open mutations</button>
    </main>
  ),
}));

import PixelBrainStudioPage from '../../src/pages/PixelBrain/studio/PixelBrainStudioPage.jsx';
import PixelBrainEntryPage, { shouldRedirectLegacy } from '../../src/pages/PixelBrain/studio/PixelBrainEntryPage.jsx';
import {
  PIXELBRAIN_STUDIO_LEGACY_REDIRECT,
  PIXELBRAIN_STUDIO_V1,
} from '../../src/pages/PixelBrain/studio/studio-flags.js';

function Location() {
  return <output>{useLocation().pathname}</output>;
}

function renderRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pixelbrain/studio" element={<PixelBrainStudioPage />} />
        <Route path="/pixelbrain/studio/:studioTab" element={<PixelBrainStudioPage />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

describe('PixelBrain Studio routing', () => {
  test('opens a flagship workspace from a deep route', () => {
    renderRoute('/pixelbrain/studio/foundry');
    expect(screen.getByText('studio-enabled')).toBeInTheDocument();
    expect(screen.getByText('foundry')).toBeInTheDocument();
  });

  test('tab selection writes a deep-linkable route', () => {
    renderRoute('/pixelbrain/studio/canvas');
    fireEvent.click(screen.getByRole('button', { name: /open mutations/i }));
    expect(screen.getByText('/pixelbrain/studio/mutations')).toBeInTheDocument();
    expect(screen.getByText('mutations')).toBeInTheDocument();
  });

  test('unknown tabs fail closed to Canvas', () => {
    renderRoute('/pixelbrain/studio/not-real');
    expect(screen.getByText('canvas')).toBeInTheDocument();
  });

  test('makes Studio the default while either flag remains a classic-route rollback', () => {
    expect(PIXELBRAIN_STUDIO_V1).toBe(true);
    expect(PIXELBRAIN_STUDIO_LEGACY_REDIRECT).toBe(true);
    expect(shouldRedirectLegacy()).toBe(true);
    expect(shouldRedirectLegacy({ studioEnabled: true, legacyRedirect: false })).toBe(false);
    expect(shouldRedirectLegacy({ studioEnabled: false, legacyRedirect: true })).toBe(false);
    expect(shouldRedirectLegacy({ studioEnabled: true, legacyRedirect: true })).toBe(true);
  });

  test('redirects the shipped PixelBrain entry route into the Canvas home', () => {
    render(
      <MemoryRouter initialEntries={['/pixelbrain']}>
        <Routes>
          <Route path="/pixelbrain" element={<PixelBrainEntryPage />} />
          <Route path="/pixelbrain/studio/:studioTab" element={<PixelBrainStudioPage />} />
        </Routes>
        <Location />
      </MemoryRouter>,
    );

    expect(screen.getByText('/pixelbrain/studio/canvas')).toBeInTheDocument();
    expect(screen.getByText('studio-enabled')).toBeInTheDocument();
  });
});
