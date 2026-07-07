import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import CombatMatrixIntro from '../../../src/ui/combat/CombatMatrixIntro.jsx';
import { COMBAT_MATRIX_INTRO_REDUCED_MS } from '../../../src/game/combat/combatBattleIntro.js';

describe('CombatMatrixIntro', () => {
  it('announces lattice boot status and completes on reduced motion', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(
      <CombatMatrixIntro reducedMotion onComplete={onComplete} />,
    );

    expect(screen.getByText('Battle Engaged')).toBeTruthy();
    expect(screen.getByText(/ENCOUNTER LOCK DETECTED/i)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(COMBAT_MATRIX_INTRO_REDUCED_MS);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});