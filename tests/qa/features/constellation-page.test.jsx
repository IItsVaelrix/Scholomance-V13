import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import ConstellationPage from '../../../src/pages/Constellation/ConstellationPage.jsx';
import { SAMPLE_BRIGHT_WOUND_PACKET } from '../../../src/pages/Constellation/fixtures/samplePagePacket.js';

/**
 * Serve the enriched packet down the LIVE path.
 *
 * These renders used to reach the enriched surfaces by accident: with no fetch
 * stub, jsdom's fetch failed and the hook substituted the rich fixture, so the
 * offline error path was doubling as this suite's content source. Once the
 * error path started emitting an explicit engine-unreachable packet (empty
 * channels, by design), that accident stopped paying — and it was the only
 * coverage the enriched UI had. Stub the response instead, so what these tests
 * assert is the page rendering a real packet, not a fallback wearing one.
 */
const stubLivePacket = () =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => SAMPLE_BRIGHT_WOUND_PACKET })));

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
    // No fetch stub and no server in jsdom, so the hook emits the engine-unreachable
    // packet. Deliberately left unstubbed: the shell must mount even when NO analysis
    // came back, which is the one thing this test is for.
    expect(await screen.findByRole('heading', { name: /phrase identity/i })).toBeInTheDocument();
    expect(document.getElementById('constellation-result-shell')).toBeTruthy();
  });

  it('renders ambiguous interpretations for the bright-wound fixture', async () => {
    stubLivePacket();
    try {
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
    } finally {
      vi.unstubAllGlobals();
    }
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
    stubLivePacket();
    try {
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
    } finally {
      vi.unstubAllGlobals();
    }
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
