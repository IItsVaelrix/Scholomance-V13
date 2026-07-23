// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  ComposeReadTopBar,
  ComposeReadStatusBar,
} from '../../../src/core/compose/migrated/ComposeReadChrome';

expect.extend(toHaveNoViolations);

afterEach(cleanup);

describe('ComposeReadTopBar shell', () => {
  it('renders a labelled region landmark with compose markers', () => {
    render(
      <ComposeReadTopBar
        identity={<h1>Scholomance IDE</h1>}
        progression={<span>1200 XP</span>}
        actions={<button type="button">Settings</button>}
      />,
    );
    const bar = screen.getByRole('region', { name: 'Scroll editor chrome' });
    expect(bar.getAttribute('data-compose-pilot')).toBe('read-chrome');
    expect(bar.classList.contains('ide-topbar--compose')).toBe(true);
  });

  it('hosts region content in compose part hosts', () => {
    render(
      <ComposeReadTopBar
        identity={<h1>Scholomance IDE</h1>}
        actions={<button type="button">Settings</button>}
      />,
    );
    const title = screen.getByRole('heading', { name: 'Scholomance IDE' });
    expect(title.closest('[data-compose-part="identity"]')).toBeTruthy();
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings.closest('[data-compose-part="actions"]')).toBeTruthy();
  });

  it('mounts the harmonic seam as a decorative attachment host', () => {
    const { container } = render(
      <ComposeReadTopBar identity={<span>t</span>} actions={<span>a</span>} />,
    );
    const seam = container.querySelector('.grim-harmonic-seam');
    expect(seam).toBeTruthy();
    expect(seam?.getAttribute('aria-hidden')).toBe('true');
    expect(seam?.getAttribute('data-compose-visual')).toBe('harmonic-seam');
  });

  it('passes jest-axe', async () => {
    const { container } = render(
      <ComposeReadTopBar
        identity={<h1>Scholomance IDE</h1>}
        actions={<button type="button">Settings</button>}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ComposeReadStatusBar shell', () => {
  it('renders a labelled region landmark with vitals/position hosts', () => {
    render(
      <ComposeReadStatusBar
        vitals={<span>Ready</span>}
        position={<span>Ln 1, Col 1</span>}
      />,
    );
    const bar = screen.getByRole('region', { name: 'Editor status' });
    expect(bar.classList.contains('ide-statusbar--compose')).toBe(true);
    expect(
      screen.getByText('Ready').closest('[data-compose-part="vitals"]'),
    ).toBeTruthy();
    expect(
      screen.getByText('Ln 1, Col 1').closest('[data-compose-part="position"]'),
    ).toBeTruthy();
  });

  it('mounts the harmonic seam and passes jest-axe', async () => {
    const { container } = render(
      <ComposeReadStatusBar vitals={<span>Ready</span>} position={<span>Ln 1</span>} />,
    );
    expect(container.querySelector('.grim-harmonic-seam--top')).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});
