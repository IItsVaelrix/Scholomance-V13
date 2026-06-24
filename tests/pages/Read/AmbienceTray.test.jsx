import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AmbienceTray from '../../../src/pages/Read/AmbienceTray.jsx';
import { createAmbienceMixerService } from '../../../src/lib/ambient/ambienceMixer.service.js';

function fakeService() {
  return createAmbienceMixerService({
    createEngine: () => ({
      setChannelGain: vi.fn(),
      setMasterGain: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      onAvailabilityChange: vi.fn(),
    }),
  });
}

describe('AmbienceTray', () => {
  it('renders the three soundscapes and a master slider', () => {
    render(<AmbienceTray service={fakeService()} />);
    expect(screen.getByRole('button', { name: /rain/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /café plaza/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wind through a house/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/master ambience volume/i)).toBeInTheDocument();
  });

  it('toggling a channel flips its aria-pressed state', async () => {
    render(<AmbienceTray service={fakeService()} />);
    const rain = screen.getByRole('button', { name: /rain/i });
    expect(rain).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(rain);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /rain/i })).toHaveAttribute('aria-pressed', 'true'),
    );
  });
});
