// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DivLayoutRenderer } from '../../../src/features/divwand/DivLayoutRenderer.jsx';

afterEach(cleanup);

const proposal = {
  rationale: 'test',
  confidence: 1,
  reviewRequired: false,
  proposedLayout: {
    id: 'root',
    type: 'container',
    role: 'card',
    style: { variant: 'glassmorphic' },
    layout: { display: 'flex', flexDirection: 'column', width: 200, height: 200 },
    children: [
      { id: 'hdr', type: 'container', role: 'header', layout: { height: 40 }, children: [] },
      { id: 'body', type: 'container', role: 'content', layout: { flex: undefined, height: 120 }, children: [] },
    ],
  },
};

describe('DivLayoutRenderer', () => {
  it('renders layout nodes by id', () => {
    render(<DivLayoutRenderer proposal={proposal} />);
    expect(document.getElementById('root')).toBeTruthy();
    expect(document.getElementById('hdr')).toBeTruthy();
  });

  it('injects slots into header/content roles', () => {
    render(
      <DivLayoutRenderer
        proposal={proposal}
        slots={{
          title: <h2>Scholomance Update Ledger</h2>,
          content: <p>Chronicle body</p>,
        }}
      />
    );
    expect(screen.getByRole('heading', { name: 'Scholomance Update Ledger' })).toBeTruthy();
    expect(screen.getByText('Chronicle body')).toBeTruthy();
  });

  it('injects title/content slots into the first matching role only', () => {
    const nestedProposal = {
      ...proposal,
      proposedLayout: {
        id: 'root',
        type: 'container',
        role: 'card',
        layout: { display: 'flex', flexDirection: 'column' },
        children: [
          { id: 'hdr-1', type: 'container', role: 'header', layout: {}, children: [] },
          {
            id: 'section',
            type: 'container',
            role: 'section',
            layout: {},
            children: [
              { id: 'hdr-2', type: 'container', role: 'header', layout: {}, children: [] },
              { id: 'body-1', type: 'container', role: 'content', layout: {}, children: [] },
              { id: 'body-2', type: 'container', role: 'content', layout: {}, children: [] },
            ],
          },
        ],
      },
    };

    render(
      <DivLayoutRenderer
        proposal={nestedProposal}
        slots={{
          title: <h2>Only First Title</h2>,
          content: <p>Only First Content</p>,
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Only First Title' })).toBeTruthy();
    expect(screen.getByText('Only First Content')).toBeTruthy();
    expect(document.getElementById('hdr-1')?.querySelector('h2')).toBeTruthy();
    expect(document.getElementById('hdr-2')?.querySelector('h2')).toBeNull();
    expect(document.getElementById('body-1')?.querySelector('p')).toBeTruthy();
    expect(document.getElementById('body-2')?.querySelector('p')).toBeNull();
  });
});
