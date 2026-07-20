/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../src/pages/Landing/StormCanvas.jsx', () => ({
  default: (props: { skipGalaxyPlate?: boolean; className?: string }) => (
    <canvas
      data-testid="storm"
      data-skip-galaxy-plate={String(Boolean(props.skipGalaxyPlate))}
      className={props.className}
    />
  ),
}));
vi.mock('../../../src/pages/Landing/WatercolorDissolve.jsx', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dissolve">{children}</div>
  ),
}));

import { ComposeGalaxyBackdrop } from '../../../src/core/compose/migrated/ComposeGalaxyBackdrop';
import LandingPage from '../../../src/pages/Landing/LandingPage.jsx';

afterEach(cleanup);

describe('ComposeGalaxyBackdrop', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('mounts plate + storm overlay with skipGalaxyPlate', () => {
    const { container } = render(
      <ComposeGalaxyBackdrop className="portal-storm" intensity={1.4} />,
    );
    const root = container.querySelector('[data-compose-galaxy="true"]');
    expect(root).toBeTruthy();
    expect(container.querySelector('.galaxy-plate')).toBeTruthy();
    expect(screen.getByTestId('storm').getAttribute('data-skip-galaxy-plate')).toBe('true');
  });

  it('disables plate spin under reduced motion', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = render(<ComposeGalaxyBackdrop />);
    const plate = container.querySelector('.galaxy-plate');
    expect(plate?.classList.contains('galaxy-plate--static')).toBe(true);
  });
});

describe('LandingPage compose galaxy', () => {
  it('uses compose galaxy backdrop and keeps twin-gate controls', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-compose-galaxy="true"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter Scholomance' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Scholomance Update Ledger' })).toBeTruthy();
  });
});

describe('ComposeGalaxyBackdrop validation fallback', () => {
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
  });

  afterEach(() => {
    vi.doUnmock('../../../src/core/compose/packets');
    vi.resetModules();
    cleanup();
  });

  it('falls back to full StormCanvas without compose marker', async () => {
    const { ComposeGalaxyBackdrop: FallbackGalaxy } = await import(
      '../../../src/core/compose/migrated/ComposeGalaxyBackdrop'
    );
    const { container } = render(
      <FallbackGalaxy className="portal-storm" intensity={1.4} />,
    );

    expect(container.querySelector('[data-compose-galaxy="true"]')).toBeNull();
    const storm = screen.getByTestId('storm');
    expect(storm.getAttribute('data-skip-galaxy-plate')).toBe('false');
  });
});
