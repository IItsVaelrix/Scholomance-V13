import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeToggle } from '../../src/components/Navigation/ThemeToggle.jsx';
import Navigation from '../../src/components/Navigation/Navigation.jsx';
import { TopBar } from '../../src/pages/Read/IDEChrome.jsx';
import { ThemeProvider, IDE_THEME_STORAGE_KEY } from '../../src/hooks/useTheme.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';
import { getRitualPalette } from '../../src/data/schoolPalettes.js';

const mockAuthValue = {
  user: null,
  isLoading: false,
  logout: vi.fn(),
};


describe('ThemeToggle component (IDE-scoped)', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.removeItem(IDE_THEME_STORAGE_KEY);
    localStorage.removeItem('scholomance-theme');
  });

  it('renders switch IDE to light mode when theme is dark', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /switch ide to light mode/i });
    expect(button).toBeInTheDocument();
  });

  it('toggles IDE theme without lighting the document chrome', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /switch ide to light mode/i });
    fireEvent.click(button);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(IDE_THEME_STORAGE_KEY)).toBe('light');

    const darkButton = screen.getByRole('button', { name: /switch ide to dark mode/i });
    expect(darkButton).toBeInTheDocument();
  });

  it('IDE light ritual palette differs from dark while document stays dark', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /switch ide to light mode/i }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const light = getRitualPalette('SONIC', 'light');
    const dark = getRitualPalette('SONIC', 'dark');
    expect(light.abyss).not.toBe(dark.abyss);
    expect(localStorage.getItem(IDE_THEME_STORAGE_KEY)).toBe('light');
  });

  it('renders ThemeToggle in IDE TopBar only', () => {
    render(
      <ThemeProvider>
        <TopBar title="Test Scroll" onOpenSearch={() => {}} />
      </ThemeProvider>
    );

    expect(screen.getByRole('button', { name: /switch ide to light mode/i })).toBeInTheDocument();
  });

  it('does not render ThemeToggle in global Navigation', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <ThemeProvider>
            <Navigation />
          </ThemeProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /switch ide to (light|dark) mode/i })).toBeNull();
  });
});
