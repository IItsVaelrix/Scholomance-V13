import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeToggle } from '../../src/components/Navigation/ThemeToggle.jsx';
import { ThemeProvider } from '../../src/hooks/useTheme.jsx';

describe('ThemeToggle component', () => {
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
});
