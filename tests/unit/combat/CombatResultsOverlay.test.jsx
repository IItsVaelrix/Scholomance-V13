import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import CombatResultsOverlay, {
  COMBAT_RESULTS_REVEAL_DELAY_MS,
} from '../../../src/ui/combat/CombatResultsOverlay.jsx';

const sampleReport = {
  grade: 'A',
  gradeLabel: 'Battle Poet',
  prowessScore: 78,
  summary: 'Defeated 2/2 flank sentinels with 88 HP remaining.',
  metrics: {
    damageDealt: 40,
    damageTaken: 12,
    playerAttacksLanded: 5,
    sentinelsDefeated: 2,
    sentinelTotal: 2,
    tilesMoved: 6,
    turnsEnded: 3,
    aggroEvents: 1,
    aggroSentinelCount: 2,
  },
  vitals: {
    hpRemaining: 88,
    maxHp: 100,
    hpPercent: 88,
  },
  scholomanceHighlights: {
    combatStats: [
      { key: 'BAPO', label: 'BAPO', fullName: 'Battle Poetry', value: 16 },
      { key: 'VALCH', label: 'VALCH', fullName: 'Valor Channeling', value: 14 },
    ],
  },
  xpEarned: {
    total: 40,
    topStats: [
      { stat: 'BAPO', amount: 24, label: 'Battle Poetry' },
      { stat: 'VALCH', amount: 16, label: 'Valor Channeling' },
    ],
  },
  meritTags: ['Flank Cleared', 'Tower Threat'],
};

describe('CombatResultsOverlay', () => {
  it('reveals victory metrics after the fanfare delay', async () => {
    vi.useFakeTimers();

    render(
      <CombatResultsOverlay
        report={sampleReport}
        reducedMotion
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Victory')).toBeTruthy();
    expect(screen.getByText('Tactical Ledger')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('Flank Cleared')).toBeTruthy();

    vi.useRealTimers();
  });

  it('waits for reveal delay before mounting when motion is enabled', () => {
    vi.useFakeTimers();

    const { container } = render(
      <CombatResultsOverlay
        report={sampleReport}
        reducedMotion={false}
        onDismiss={() => {}}
      />,
    );

    expect(container.firstChild).toBeNull();

    act(() => {
      vi.advanceTimersByTime(COMBAT_RESULTS_REVEAL_DELAY_MS);
    });

    expect(screen.getByRole('dialog')).toBeTruthy();

    vi.useRealTimers();
  });
});