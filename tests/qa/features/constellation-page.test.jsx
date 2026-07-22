import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import ConstellationPage from '../../../src/pages/Constellation/ConstellationPage.jsx';

vi.mock('../../../src/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => true,
}));

describe('ConstellationPage chamber', () => {
  it('renders constellation backdrop and brand', () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'ConstellationOS' })).toBeInTheDocument();
    expect(document.getElementById('constellation-backdrop')).toBeTruthy();
    expect(document.getElementById('constellation-backdrop').getAttribute('aria-hidden')).toBe('true');
  });
});
