import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('exposes an accessible search label and stable search id', () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/search the literary sky/i)).toBeInTheDocument();
    expect(document.getElementById('constellation-search')).toBeTruthy();
  });

  it('refuses empty submit and stays idle', () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/enter a word, phrase, or line/i);
    expect(document.getElementById('constellation-stage').dataset.mode).toBe('idle');
    expect(document.getElementById('constellation-result-shell')).toBeNull();
  });

  it('submits a query and mounts the result shell', async () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    const field = screen.getByLabelText(/search the literary sky/i);
    fireEvent.change(field, { target: { value: 'the bright wound of morning' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(document.getElementById('constellation-stage').dataset.mode).toBe('submitted');
    // The hook fetches live, then falls back to the fixture asynchronously (no server in jsdom).
    expect(await screen.findByRole('heading', { name: /phrase identity/i })).toBeInTheDocument();
    expect(document.getElementById('constellation-result-shell')).toBeTruthy();
  });

  it('renders ambiguous interpretations for the bright-wound fixture', async () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    const field = screen.getByLabelText(/search the literary sky/i);
    fireEvent.change(field, { target: { value: 'the bright wound of morning' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByText(/injury \/ opening in flesh/i)).toBeInTheDocument();
    expect(screen.getByText(/past tense of wind/i)).toBeInTheDocument();
    expect(screen.getByText(/ambiguity is data|margin below/i)).toBeInTheDocument();
  });

  it('shows awaiting state for unwired rhyme on unknown queries', async () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    const field = screen.getByLabelText(/search the literary sky/i);
    fireEvent.change(field, { target: { value: 'gravity' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByText(/awaiting engine — rhyme astrology/i)).toBeInTheDocument();
  });

  it('disables morph animation class when reduced motion is preferred', () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    expect(
      document.getElementById('constellation-stage').classList.contains('constellation-stage--animate'),
    ).toBe(false);
  });
});
