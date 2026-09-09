import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Storage } from '../../../src/lib/platform/storage.js';
import { resetInventoryForTests, setInventorySnapshot, getInventorySnapshot } from '../../../src/game/inventory/inventoryService.js';
import { InventoryOverlay } from '../../../src/ui/inventory/InventoryOverlay.jsx';
import { installRealCanvas } from '../../helpers/realCanvas.js';

installRealCanvas();

describe('InventoryOverlay portrait', () => {
  beforeEach(() => {
    Storage.clear();
    resetInventoryForTests();
  });

  it('renders the tutorial-forest lotus wanderer sprite as the paper-doll base, not the static IdealHuman PNG', () => {
    render(<InventoryOverlay />);
    fireEvent.keyDown(window, { key: 'i' });

    const base = screen.getByAltText('Character Model');
    expect(base.src).toMatch(/^data:image\/png;base64,/);
  });

  it('swaps the base sprite once a weapon is equipped, so the built-in staff does not clash with the gear overlay', () => {
    const snapshot = getInventorySnapshot();
    const weapon = snapshot.slots.find((item) => item?.type === 'weapon');
    setInventorySnapshot({ slots: snapshot.slots, equipped: { ...snapshot.equipped, weapon } });

    render(<InventoryOverlay />);
    fireEvent.keyDown(window, { key: 'i' });

    const armedBase = screen.getByAltText('Character Model').src;

    resetInventoryForTests();
    render(<InventoryOverlay />);
    fireEvent.keyDown(window, { key: 'i' });
    const bareBases = screen.getAllByAltText('Character Model');
    const bareBase = bareBases[bareBases.length - 1].src;

    expect(armedBase).not.toBe(bareBase);
  });
});
