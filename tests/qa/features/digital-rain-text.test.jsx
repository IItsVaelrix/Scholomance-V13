// tests/qa/features/digital-rain-text.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DigitalRainText from '../../../src/components/DigitalRainText.jsx';

vi.mock('../../../src/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: vi.fn(() => false),
}));

describe('DigitalRainText', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { usePrefersReducedMotion } = await import('../../../src/hooks/usePrefersReducedMotion.js');
    usePrefersReducedMotion.mockReturnValue(false);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('renders accessible label with plain text when reduced motion', async () => {
    const { usePrefersReducedMotion } = await import('../../../src/hooks/usePrefersReducedMotion.js');
    usePrefersReducedMotion.mockReturnValue(true);
    render(<DigitalRainText text="Chronicle" as="h2" animateOnMount />);
    const heading = screen.getByRole('heading', { name: 'Chronicle' });
    expect(heading).toBeTruthy();
    expect(document.querySelectorAll('.digital-rain-char--cycling').length).toBe(0);
    expect(heading.textContent).toBe('Chronicle');
  });

  it('animates on mount when animateOnMount is true', () => {
    render(<DigitalRainText text="ABC" as="h2" animateOnMount className="rain" />);
    expect(document.querySelectorAll('.digital-rain-char--cycling').length).toBeGreaterThan(0);
  });

  it('does not rain on mount when animateOnMount is false; rains on text change', () => {
    const { rerender } = render(
      <DigitalRainText text="Hello" as="h2" animateOnMount={false} />,
    );
    expect(document.querySelectorAll('.digital-rain-char--cycling').length).toBe(0);
    rerender(<DigitalRainText text="World" as="h2" animateOnMount={false} />);
    expect(document.querySelectorAll('.digital-rain-char--cycling').length).toBeGreaterThan(0);
  });

  it('clears cycling slots when reduceMotion becomes true mid-flight', async () => {
    const { usePrefersReducedMotion } = await import('../../../src/hooks/usePrefersReducedMotion.js');
    usePrefersReducedMotion.mockReturnValue(false);
    const { rerender } = render(<DigitalRainText text="ABC" as="h2" animateOnMount />);
    expect(document.querySelectorAll('.digital-rain-char--cycling').length).toBeGreaterThan(0);

    usePrefersReducedMotion.mockReturnValue(true);
    rerender(<DigitalRainText text="ABC" as="h2" animateOnMount />);
    expect(document.querySelectorAll('.digital-rain-char--cycling').length).toBe(0);
    expect(screen.getByRole('heading', { name: 'ABC' }).textContent).toBe('ABC');
  });
});
