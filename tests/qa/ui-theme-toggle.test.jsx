import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeToggle } from '../../src/components/Navigation/ThemeToggle.jsx';
import Navigation from '../../src/components/Navigation/Navigation.jsx';
import { ThemeProvider } from '../../src/hooks/useTheme.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';

const mockAuthValue = {
  user: null,
  isLoading: false,
  logout: vi.fn(),
};


describe('ThemeToggle component', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.removeItem('scholomance-theme');
  });

  it('renders switch to light mode when theme is dark', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /switch to light mode/i });
    expect(button).toBeInTheDocument();
  });

  it('toggles theme attribute on click', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /switch to light mode/i });
    fireEvent.click(button);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const darkButton = screen.getByRole('button', { name: /switch to dark mode/i });
    expect(darkButton).toBeInTheDocument();
  });

  it('sets data-theme light so Compose light suite can apply', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).not.toBe('dark');
  });

  it('renders ThemeToggle inside Navigation header rail', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <ThemeProvider>
            <Navigation />
          </ThemeProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    const toggleBtns = screen.getAllByRole('button', { name: /switch to (light|dark) mode/i });
    expect(toggleBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('renders ThemeToggle in mobile menu drawer when opened', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <ThemeProvider>
            <Navigation />
          </ThemeProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    const menuBtn = screen.getByRole('button', { name: /open all chambers/i });
    fireEvent.click(menuBtn);

    const mobileToggle = screen.getByText(/light mode|dark mode/i);
    expect(mobileToggle).toBeInTheDocument();
  });
});


