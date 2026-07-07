import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CombatResourceBars from '../../../src/ui/combat/CombatResourceBars.jsx';

describe('CombatResourceBars', () => {
  it('renders health, mana, mp, ap, and range indicators from combat stats', () => {
    render(
      <CombatResourceBars
        stats={{
          hp: 72,
          maxHp: 100,
          manaPointsRemaining: 40,
          manaPoints: 100,
          movementPointsRemaining: 2,
          movementPoints: 3,
          attackPointsRemaining: 4,
          attackPoints: 6,
          attackRange: 2,
        }}
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'HP: 72 of 100' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Mana: 40 of 100' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'MP: 2 of 3' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'AP: 4 of 6' })).toBeTruthy();
    expect(screen.getByLabelText('Attack range: 2 tiles')).toBeTruthy();
  });

  it('renders nothing when stats are missing', () => {
    const { container } = render(<CombatResourceBars stats={null} />);
    expect(container.firstChild).toBeNull();
  });
});