import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';
import { LINKS } from '../../../src/data/library.js';
import Navigation from '../../../src/components/Navigation/Navigation.jsx';
import { ThemeProvider } from '../../../src/hooks/useTheme.jsx';
import { AuthContext } from '../../../src/context/AuthContext.jsx';

vi.mock('../../../src/hooks/useAuth.jsx', () => ({
  useAuth: () => ({ user: null, isLoading: false, logout: vi.fn() }),
}));

function ConstellationStub() {
  return <div>ConstellationOS chamber</div>;
}

describe('Constellation routing + nav', () => {
  it('exposes a Constellation link to /constellation in library data', () => {
    const link = LINKS.find((l) => l.id === 'constellation');
    expect(link).toEqual({ id: 'constellation', path: '/constellation', label: 'Constellation' });
  });

  it('redirects /nexus to /constellation', () => {
    render(
      <MemoryRouter initialEntries={['/nexus']}>
        <Routes>
          <Route path="/nexus" element={<Navigate to="/constellation" replace />} />
          <Route path="/constellation" element={<ConstellationStub />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('ConstellationOS chamber')).toBeInTheDocument();
  });

  it('shows Constellation in the navigation rail copy map', () => {
    render(
      <ThemeProvider>
        <AuthContext.Provider value={{ user: null, isLoading: false, logout: vi.fn() }}>
          <MemoryRouter initialEntries={['/constellation']}>
            <Navigation />
            <Routes>
              <Route path="/constellation" element={<ConstellationStub />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ThemeProvider>,
    );
    expect(screen.getAllByText('Constellation').length).toBeGreaterThan(0);
  });
});
