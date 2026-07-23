// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ComposeOracleTerminal } from '../../../src/core/compose/migrated/ComposeOracleTerminal';

expect.extend(toHaveNoViolations);

afterEach(cleanup);

function renderShell(instance = 'sidebar') {
  return render(
    <ComposeOracleTerminal
      instance={instance}
      className="oracle-school-void"
      dataProps={{ 'data-school': 'VOID' }}
    >
      <div data-compose-part="session">session</div>
      <form data-compose-part="prompt">
        <label htmlFor={`oracle-in-${instance}`}>archive://</label>
        <input id={`oracle-in-${instance}`} type="search" />
      </form>
      <div data-compose-part="signal">idle</div>
      <div data-compose-part="feed">standing by</div>
    </ComposeOracleTerminal>,
  );
}

describe('ComposeOracleTerminal shell', () => {
  it('renders an instance-labelled region landmark with compose markers', () => {
    renderShell('rail');
    const region = screen.getByRole('region', {
      name: 'Lexicon Oracle terminal (rail)',
    });
    expect(region.getAttribute('data-compose-pilot')).toBe('oracle-terminal');
    expect(region.classList.contains('oracle-shell--compose')).toBe(true);
    expect(region.getAttribute('data-school')).toBe('VOID');
  });

  it('keeps landmark labels unique across simultaneous instances', () => {
    render(
      <>
        <ComposeOracleTerminal instance="sidebar">
          <div data-compose-part="feed">a</div>
        </ComposeOracleTerminal>
        <ComposeOracleTerminal instance="rail">
          <div data-compose-part="feed">b</div>
        </ComposeOracleTerminal>
      </>,
    );
    expect(
      screen.getByRole('region', { name: 'Lexicon Oracle terminal (sidebar)' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Lexicon Oracle terminal (rail)' }),
    ).toBeTruthy();
  });

  it('never emits packet node ids as DOM ids', () => {
    const { container } = renderShell();
    expect(container.querySelector('#oracle-terminal')).toBeNull();
  });

  it('mounts the scanline atmosphere as a decorative attachment host', () => {
    const { container } = renderShell();
    const atmosphere = container.querySelector('.oracle-scanline-atmosphere');
    expect(atmosphere).toBeTruthy();
    expect(atmosphere?.getAttribute('aria-hidden')).toBe('true');
    expect(atmosphere?.getAttribute('data-compose-visual')).toBe('phosphor-scanline');
  });

  it('passes jest-axe', async () => {
    const { container } = renderShell();
    expect(await axe(container)).toHaveNoViolations();
  });
});
