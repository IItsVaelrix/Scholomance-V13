import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../src/context/AuthContext.jsx';
import BlogIndexPage from '../../../src/pages/Blog/BlogIndexPage.tsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <BlogIndexPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('BlogIndexPage (wiring smoke)', () => {
  it('renders the seed transmissions from the store', async () => {
    renderAt('/blog');
    expect(
      await screen.findByText('Emergent Disparity Reconciliation Spell')
    ).toBeInTheDocument();
    expect(
      screen.getByText('ScholoEcho and the Space-Painting Instrument')
    ).toBeInTheDocument();
  });

  it('hides admin controls from non-admin visitors', async () => {
    renderAt('/blog');
    await screen.findByText('Emergent Disparity Reconciliation Spell');
    expect(screen.queryByText('New transmission')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('shows the empty-band message for a filter with no posts', async () => {
    renderAt('/blog?kind=essay');
    expect(
      await screen.findByText('No transmissions in this band yet.')
    ).toBeInTheDocument();
  });

  it('filters to a single band via ?kind', async () => {
    renderAt('/blog?kind=skill');
    expect(
      await screen.findByText('Emergent Disparity Reconciliation Spell')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Launch Verdict: Channel Zero')
    ).not.toBeInTheDocument();
  });
});
