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
  it('renders the single soundscape and a master slider', () => {
    render(<AmbienceTray service={fakeService()} />);
    expect(screen.getByText(/rain \+ forest stream/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play rain \+ forest stream/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /café plaza/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wind through a house/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/master ambience volume/i)).toBeInTheDocument();
  });

  it('morphs the rain control from play to pause and back', async () => {
    render(<AmbienceTray service={fakeService()} />);
    const playRain = screen.getByRole('button', { name: /play rain/i });
    expect(playRain).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(playRain);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pause rain/i })).toHaveAttribute('aria-pressed', 'true'),
    );

    fireEvent.click(screen.getByRole('button', { name: /pause rain/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /play rain/i })).toHaveAttribute('aria-pressed', 'false'),
    );
  });
});
