// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BytecodeVisualiserPage from '../../src/pages/Visualiser/BytecodeVisualiserPage';

beforeEach(() => {
  // No alignment artifacts in jsdom - the hook must fall back silently.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
  // jsdom lacks IntersectionObserver / ResizeObserver — stub them.
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Wrap in MemoryRouter — DiscographyNav uses react-router Link. */
const renderPage = () => render(<MemoryRouter><BytecodeVisualiserPage /></MemoryRouter>);

describe('library shelf', () => {
  it('renders a tile per registry track with the active one highlighted', () => {
    const { container } = renderPage();
    const nav = screen.getByRole('navigation', { name: /discography/i });
    const tiles = nav.querySelectorAll('button.bcv-disco-btn');
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    // First track (Petrichor) is active by default.
    expect(container.querySelector('.bcv-disco-btn.is-active')).toBeTruthy();
  });

  it('switches the grimoire to Big Father and deep-links it', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Big Father/i }));
    expect(screen.getByRole('heading', { level: 1, name: /Big Father/i })).toBeTruthy();
    expect(window.location.search).toContain('track=eaba93dc');
  });

  it('honours ?track= on mount', () => {
    window.history.replaceState(null, '', '/?track=eaba93dc-bf75-4319-a67e-ddcedafc1c43');
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /Big Father/i })).toBeTruthy();
  });

  it('switches back to Petrichor after viewing Big Father', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Big Father/i }));
    expect(screen.getByRole('heading', { level: 1, name: /Big Father/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Petrichor/i }));
    expect(screen.getByRole('heading', { level: 1, name: /Petrichor/i })).toBeTruthy();
  });
});
