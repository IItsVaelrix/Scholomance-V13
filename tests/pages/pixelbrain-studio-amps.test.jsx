import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { AmpConveyorPanel } from '../../src/pages/PixelBrain/studio/AmpConveyorPanel.jsx';
import { MutationLabPanel } from '../../src/pages/PixelBrain/studio/MutationLabPanel.jsx';

describe('PixelBrain Studio AMP homes', () => {
  test('Conveyor exposes every non-mutation executable and its deterministic plan', () => {
    render(<AmpConveyorPanel snapshot={{ checksum: 'asset:test' }} />);

    expect(screen.getByText('AMP Conveyor')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(30);
    expect(screen.getByText(/support substrates/i)).toBeInTheDocument();
    expect(screen.getByText(/0 activated/i)).toBeInTheDocument();
  });

  test('Conveyor previews a selected real adapter and exposes the receipt', async () => {
    const onReceipt = vi.fn();
    render(<AmpConveyorPanel onReceipt={onReceipt} snapshot={{ checksum: 'asset:test', width: 16, height: 16, seed: 7 }} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /grass/i }));
    fireEvent.click(screen.getByRole('button', { name: /preview selected amp/i }));

    await waitFor(() => expect(screen.getByText(/studio-output1:/i)).toBeInTheDocument());
    expect(screen.getByText(/preview ready/i)).toBeInTheDocument();
    expect(onReceipt).toHaveBeenCalledWith(expect.objectContaining({ ampId: 'grass', mode: 'preview' }));
  });

  test('Mutation Lab keeps accept and reject unavailable until a candidate exists', async () => {
    const onAccept = vi.fn();
    render(<MutationLabPanel snapshot={{ checksum: 'asset:test' }} onAccept={onAccept} />);

    expect(screen.getAllByRole('option')).toHaveLength(10);
    expect(screen.getByRole('button', { name: /accept candidate/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject candidate/i })).toBeDisabled();
    expect(screen.getAllByText(/immutable baseline/i)).toHaveLength(2);
  });

  test('offers a cancellable queued job before adapter dispatch', async () => {
    render(<AmpConveyorPanel snapshot={{ checksum: 'asset:cancel', width: 16, height: 16, seed: 7 }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /grass/i }));
    fireEvent.click(screen.getByRole('button', { name: /preview selected amp/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel job/i }));

    await waitFor(() => expect(screen.getByText(/PB-STUDIO-JOB-CANCELLED/i)).toBeInTheDocument());
  });
});
