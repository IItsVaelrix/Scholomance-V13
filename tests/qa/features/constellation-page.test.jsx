import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('renders etymology, rarity, relations, examples, and IPA from the enriched fixture', async () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    const field = screen.getByLabelText(/search the literary sky/i);
    fireEvent.change(field, { target: { value: 'the bright wound of morning' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    // Fixture (Task 5) carries the enrichment; assert each new surface renders.
    expect(await screen.findByText(/lexical relations/i)).toBeInTheDocument();
    // Glyphs live in nested aria-hidden spans, so match the label text, not "↑ broader".
    expect(screen.getByText(/broader/i)).toBeInTheDocument();
    expect(screen.getByText(/akin/i)).toBeInTheDocument();
    expect(screen.getByText(/\d\/9/)).toBeInTheDocument();            // rarity "n/9"
    expect(screen.getByText('IPA')).toBeInTheDocument();
  });

  /**
   * THE RETRY PATH IS THE FAILURE PATH. Submitting the same words again is the
   * only way this page offers to re-ask a question, and it was a no-op:
   * `setSubmittedQuery(q)` with an unchanged `q` is a React bail-out, so the
   * fetch effect never re-ran. Invisible while the backend is up; a dead end the
   * moment it is not, because the reader is holding the offline fixture and the
   * one control that could replace it does nothing.
   */
  it('re-submitting the identical query issues a new request', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(
        <MemoryRouter>
          <ConstellationPage />
        </MemoryRouter>,
      );
      const field = screen.getByLabelText(/search the literary sky/i);
      fireEvent.change(field, { target: { value: 'gravity' } });
      fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
      expect(await screen.findByRole('heading', { name: /phrase identity/i })).toBeInTheDocument();
      const afterFirst = fetchMock.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);

      fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
      await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst));
    } finally {
      vi.unstubAllGlobals();
    }
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
