// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../src/pages/Landing/StormCanvas.jsx', () => ({
  default: () => <div data-testid="storm" />,
}));
vi.mock('../../../src/pages/Landing/WatercolorDissolve.jsx', () => ({
  default: ({ children }) => <div data-testid="dissolve">{children}</div>,
}));

import LandingPage from '../../../src/pages/Landing/LandingPage.jsx';

afterEach(cleanup);

describe('LandingPage twin-gate', () => {
  it('renders portal before ledger and keeps enter control', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const enter = screen.getByRole('button', { name: 'Enter Scholomance' });
    const ledger = screen.getByRole('region', { name: 'Scholomance Update Ledger' });
    expect(enter.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
