/**
 * Compose Enter Portal shell tests
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';

vi.mock('../../../src/pages/Landing/StormCanvas.jsx', () => ({
  default: () => <div data-testid="storm" />,
}));
vi.mock('../../../src/pages/Landing/WatercolorDissolve.jsx', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dissolve">{children}</div>
  ),
}));

import { ComposeEnterPortal } from '../../../src/core/compose/migrated/ComposeEnterPortal';
import LandingPage from '../../../src/pages/Landing/LandingPage.jsx';

expect.extend(toHaveNoViolations);

afterEach(cleanup);

describe('ComposeEnterPortal', () => {
  it('exposes Enter Scholomance button and fires onEnter once per activation', () => {
    const onEnter = vi.fn();
    render(
      <ComposeEnterPortal onEnter={onEnter}>
        <span className="portal-ring portal-ring--energy" />
        <div className="portal-content">Inside</div>
      </ComposeEnterPortal>,
    );
    const btn = screen.getByRole('button', { name: 'Enter Scholomance' });
    expect(btn.getAttribute('data-compose-portal')).toBe('true');
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(2);
  });

  it('ignores activation while dissolving', () => {
    const onEnter = vi.fn();
    render(
      <ComposeEnterPortal onEnter={onEnter} dissolving>
        <div className="portal-content">Inside</div>
      </ComposeEnterPortal>,
    );
    const btn = screen.getByRole('button', { name: 'Enter Scholomance' });
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('passes jest-axe on the portal gate', async () => {
    const { container } = render(
      <ComposeEnterPortal onEnter={() => {}}>
        <div className="portal-content">
          <h1>Title</h1>
        </div>
      </ComposeEnterPortal>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('LandingPage compose portal', () => {
  it('renders compose Enter Scholomance control', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: 'Enter Scholomance' });
    expect(btn.getAttribute('data-compose-portal')).toBe('true');
  });
});
