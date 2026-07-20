// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateDivProposal } from '../../../src/features/divwand/validateDivProposal.js';
import {
  SAFE_LEDGER_SHELL,
  UPDATE_LEDGER_SHELL_PROPOSAL,
} from '../../../src/pages/Landing/updateLedgerShellProposal.js';
import UpdateLedgerWindow from '../../../src/pages/Landing/UpdateLedgerWindow.jsx';

afterEach(cleanup);

const SAMPLE_SOURCE = JSON.stringify([
  {
    id: '2026-07-19-alpha',
    date: '2026-07-19',
    title: 'Alpha Title',
    summary: 'Alpha summary that is long enough to read clearly.',
  },
]);

describe('updateLedgerShellProposal', () => {
  it('validates primary and safe shells', () => {
    expect(validateDivProposal(UPDATE_LEDGER_SHELL_PROPOSAL).valid).toBe(true);
    expect(validateDivProposal(SAFE_LEDGER_SHELL).valid).toBe(true);
  });
});

describe('UpdateLedgerWindow', () => {
  it('exposes a named region and list entries', () => {
    render(<UpdateLedgerWindow source={SAMPLE_SOURCE} />);
    expect(screen.getByRole('region', { name: 'Scholomance Update Ledger' })).toBeTruthy();
    expect(screen.getByText('Alpha Title')).toBeTruthy();
    expect(screen.getByRole('list')).toBeTruthy();
  });

  it('keeps a single keyboard focus stop on the scrollable entries', () => {
    const { container } = render(<UpdateLedgerWindow source={SAMPLE_SOURCE} />);
    const focusables = container.querySelectorAll('[tabindex="0"]');
    expect(focusables).toHaveLength(1);
    expect(focusables[0].classList.contains('update-ledger__entries')).toBe(true);
  });

  it('shows empty chronicle when source is empty array', () => {
    render(<UpdateLedgerWindow source="[]" />);
    expect(screen.getByText('Chronicle awaiting first entry')).toBeTruthy();
  });

  it('shows CLI boot lines with sealed entry count', async () => {
    render(<UpdateLedgerWindow source={SAMPLE_SOURCE} />);
    expect(await screen.findByText(/entries sealed:\s*1/i)).toBeTruthy();
    expect(screen.getByText(/CHRONICLE\s*\/\/\s*ONLINE/i)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Scholomance Update Ledger' }).getAttribute('data-compose-ledger')).toBe('true');
  });
});

describe('UpdateLedgerWindow validation fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../../../src/core/compose/packets', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        validateComposeScene: vi.fn(() => ({ ok: false, diagnostics: [] })),
      };
    });
  });

  afterEach(() => {
    vi.doUnmock('../../../src/core/compose/packets');
    vi.resetModules();
    cleanup();
  });

  it('uses DivWand legacy shell when scene validation fails', async () => {
    const { default: FallbackWindow } = await import(
      '../../../src/pages/Landing/UpdateLedgerWindow.jsx'
    );
    const { container } = render(<FallbackWindow source={SAMPLE_SOURCE} />);

    const region = screen.getByRole('region', { name: 'Scholomance Update Ledger' });
    expect(region.getAttribute('data-compose-ledger')).toBeNull();
    expect(container.querySelector('[data-compose-ledger="true"]')).toBeNull();
    expect(screen.getByText('Alpha Title')).toBeTruthy();
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.queryByText(/CHRONICLE\s*\/\/\s*ONLINE/i)).toBeNull();
  });
});
