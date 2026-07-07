import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BattleScreen from '../../../src/pages/Combat/battle-ui/BattleScreen.jsx';

describe('New Battle UI (SCDL v1.2 replacement)', () => {
  it('renders the BattleScreen shell', () => {
    render(<BattleScreen />);
    expect(screen.getByText(/OBJECTIVE/i)).toBeInTheDocument();
    expect(screen.getByText(/HAND/i)).toBeInTheDocument();
  });

  it('has interactive tactical grid', () => {
    const { container } = render(<BattleScreen />);
    const grid = container.querySelector('.tactical-grid');
    expect(grid).toBeTruthy();
  });
});
