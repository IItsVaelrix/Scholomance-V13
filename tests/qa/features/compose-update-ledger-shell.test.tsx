// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ComposeUpdateLedger } from '../../../src/core/compose/migrated/ComposeUpdateLedger';
import type { LedgerEntryData } from '../../../src/core/compose/migrated/ComposeUpdateLedger';

expect.extend(toHaveNoViolations);

vi.mock('../../../src/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: vi.fn(() => true),
}));

const SAMPLE_ENTRIES: LedgerEntryData[] = [
  {
    id: '2026-07-19-alpha',
    date: '2026-07-19',
    title: 'Alpha Title',
    summary: 'Alpha summary that is long enough to read clearly.',
  },
];

describe('ComposeUpdateLedger shell', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { usePrefersReducedMotion } = await import(
      '../../../src/hooks/usePrefersReducedMotion.js'
    );
    usePrefersReducedMotion.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('preserves named region and compose marker', () => {
    render(<ComposeUpdateLedger entries={SAMPLE_ENTRIES} />);
    const region = screen.getByRole('region', { name: 'Scholomance Update Ledger' });
    expect(region).toBeTruthy();
    expect(region.getAttribute('data-compose-ledger')).toBe('true');
    expect(region.classList.contains('update-ledger--compose')).toBe(true);
  });

  it('shows CHRONICLE // ONLINE status chip', () => {
    render(<ComposeUpdateLedger entries={SAMPLE_ENTRIES} />);
    expect(screen.getByText(/CHRONICLE\s*\/\/\s*ONLINE/i)).toBeTruthy();
  });

  it('shows boot line with sealed entry count', async () => {
    render(<ComposeUpdateLedger entries={SAMPLE_ENTRIES} />);
    expect(await screen.findByText(/entries sealed:\s*1/i)).toBeTruthy();
    expect(screen.getByText(/binding chronicle/i)).toBeTruthy();
    expect(screen.getByText(/ready\./i)).toBeTruthy();
  });

  it('passes jest-axe on the ledger region', async () => {
    const { container } = render(<ComposeUpdateLedger entries={SAMPLE_ENTRIES} />);
    const region = screen.getByRole('region', { name: 'Scholomance Update Ledger' });
    const results = await axe(region);
    expect(results).toHaveNoViolations();
    expect(container.querySelector('[data-compose-ledger="true"]')).toBeTruthy();
  });

  it('staggers boot lines when motion is allowed', async () => {
    const { usePrefersReducedMotion } = await import(
      '../../../src/hooks/usePrefersReducedMotion.js'
    );
    usePrefersReducedMotion.mockReturnValue(false);

    render(<ComposeUpdateLedger entries={SAMPLE_ENTRIES} />);
    expect(screen.queryByText(/binding chronicle/i)).toBeNull();

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => {
      expect(screen.getByText(/binding chronicle/i)).toBeTruthy();
    });
    expect(screen.queryByText(/entries sealed:/i)).toBeNull();

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => {
      expect(screen.getByText(/entries sealed:\s*1/i)).toBeTruthy();
    });
  });

  it('maps DomSpec scene ids onto slot hosts', () => {
    const { container } = render(<ComposeUpdateLedger entries={SAMPLE_ENTRIES} />);
    expect(container.querySelector('#update-ledger-window')).toBeTruthy();
    expect(container.querySelector('[data-compose-part="header"]')?.id).toBe(
      'update-ledger-window.header',
    );
    expect(container.querySelector('[data-compose-part="boot"]')?.id).toBe(
      'update-ledger-window.boot',
    );
    expect(container.querySelector('[data-compose-part="scroll"]')?.id).toBe(
      'update-ledger-window.scroll',
    );
  });
});

describe('ComposeUpdateLedger validation fallback', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../../src/core/compose/packets', async (importOriginal) => {
      const actual = await importOriginal<
        typeof import('../../../src/core/compose/packets')
      >();
      return {
        ...actual,
        validateComposeScene: vi.fn(() => ({ ok: false, diagnostics: [] })),
      };
    });
    const { usePrefersReducedMotion } = await import(
      '../../../src/hooks/usePrefersReducedMotion.js'
    );
    usePrefersReducedMotion.mockReturnValue(true);
  });

  afterEach(() => {
    vi.doUnmock('../../../src/core/compose/packets');
    vi.resetModules();
    cleanup();
  });

  it('falls back to LegacyUpdateLedger without compose marker', async () => {
    const { ComposeUpdateLedger: FallbackLedger } = await import(
      '../../../src/core/compose/migrated/ComposeUpdateLedger'
    );
    const { container } = render(<FallbackLedger entries={SAMPLE_ENTRIES} />);

    const region = screen.getByRole('region', { name: 'Scholomance Update Ledger' });
    expect(region).toBeTruthy();
    expect(region.getAttribute('data-compose-ledger')).toBeNull();
    expect(container.querySelector('[data-compose-ledger="true"]')).toBeNull();
    expect(screen.getByText('Alpha Title')).toBeTruthy();
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.queryByText(/CHRONICLE\s*\/\/\s*ONLINE/i)).toBeNull();
  });
});
