/**
 * TrueSight Blink (Color Refresh) — the hex-tools control.
 *
 * Colour re-morphs on a whole token batch rather than per keystroke, which keeps
 * a typist clear of the analysis route's 60/min ceiling. That makes a deliberate
 * refresh necessary: without this control a sub-batch edit could never re-colour.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import ControlConsole from '../../../src/pages/Read/ControlConsole.jsx';

const baseProps = {
  isTruesight: true,
  onToggleTruesight: vi.fn(),
  isLatticeGrid: false,
  onToggleLatticeGrid: vi.fn(),
  mirrored: false,
  onToggleMirrored: vi.fn(),
  isPredictive: false,
  onTogglePredictive: vi.fn(),
  showScorePanel: false,
  onToggleScorePanel: vi.fn(),
  analysisMode: 'NONE',
  onModeChange: vi.fn(),
  isAnalyzing: false,
  predictorReady: true,
  resonanceDegraded: false,
  selectedSchool: 'SONIC',
  onSchoolChange: vi.fn(),
  schoolList: [{ id: 'SONIC', glyph: '♪', name: 'Sonic' }],
  auroraLevel: 0,
  onSetAurora: vi.fn(),
  focusMode: false,
  onToggleFocus: vi.fn(),
  showOraclePanel: false,
  onToggleOracle: vi.fn(),
  fontSize: 'medium',
  onFontSizeChange: vi.fn(),
  compactMode: false,
  onToggleCompact: vi.fn(),
  reducedMotion: false,
  onToggleReducedMotion: vi.fn(),
  hapticEnabled: false,
  onToggleHaptic: vi.fn(),
  telemetry: { line: 1, col: 1, syllables: 0, lines: 1, power: 0 },
};

const blinkButton = () =>
  screen.getByRole('button', { name: 'TrueSight Blink (Color Refresh)' });

describe('ControlConsole — TrueSight Blink', () => {
  it('renders under its full name', () => {
    render(<ControlConsole {...baseProps} onTruesightBlink={vi.fn()} />);
    expect(blinkButton()).toBeInTheDocument();
  });

  it('invokes the refresh on click', () => {
    const onTruesightBlink = vi.fn();
    render(<ControlConsole {...baseProps} onTruesightBlink={onTruesightBlink} />);

    fireEvent.click(blinkButton());
    expect(onTruesightBlink).toHaveBeenCalledTimes(1);
  });

  it('is a momentary action, not a toggle', () => {
    render(<ControlConsole {...baseProps} onTruesightBlink={vi.fn()} />);
    // A toggle would carry aria-pressed; this performs an operation and holds
    // no state, so advertising one would misreport it to a screen reader.
    expect(blinkButton()).not.toHaveAttribute('aria-pressed');
  });

  it('is disabled while TrueSight is off — nothing to refresh', () => {
    render(
      <ControlConsole {...baseProps} isTruesight={false} onTruesightBlink={vi.fn()} />,
    );
    expect(blinkButton()).toBeDisabled();
  });

  it('reports busy and blocks re-entry while analysis is in flight', () => {
    const onTruesightBlink = vi.fn();
    render(
      <ControlConsole {...baseProps} isAnalyzing onTruesightBlink={onTruesightBlink} />,
    );

    const button = blinkButton();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onTruesightBlink).not.toHaveBeenCalled();
  });

  it('is disabled when no refresh handler is supplied', () => {
    render(<ControlConsole {...baseProps} />);
    expect(blinkButton()).toBeDisabled();
  });

  describe('cooldown', () => {
    it('is disabled and says why while cooling', () => {
      const onTruesightBlink = vi.fn();
      render(
        <ControlConsole
          {...baseProps}
          canBlink={false}
          onTruesightBlink={onTruesightBlink}
        />,
      );

      const button = blinkButton();
      expect(button).toBeDisabled();
      // Silently swallowing the click would read as a broken button.
      expect(button).toHaveTextContent('Cooling');

      fireEvent.click(button);
      expect(onTruesightBlink).not.toHaveBeenCalled();
    });

    it('offers the refresh again once cooled', () => {
      render(<ControlConsole {...baseProps} canBlink onTruesightBlink={vi.fn()} />);
      const button = blinkButton();
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent('Color Refresh');
    });
  });
});
