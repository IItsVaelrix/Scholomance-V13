import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Storage } from '../../../src/lib/platform/storage.js';
import {
  resetInventoryForTests,
  getInventorySnapshot,
  setInventorySnapshot,
} from '../../../src/game/inventory/inventoryService.js';
import { CharacterCompendiumOverlay } from '../../../src/ui/character/CharacterCompendiumOverlay.jsx';
import { installRealCanvas } from '../../helpers/realCanvas.js';

installRealCanvas();

describe('CharacterCompendiumOverlay portrait', () => {
  beforeEach(() => {
    Storage.clear();
    resetInventoryForTests();
  });

  it('renders the tutorial-forest lotus wanderer sprite as the portrait, not the static IdealHuman PNG', () => {
    render(<CharacterCompendiumOverlay />);
    fireEvent.keyDown(window, { key: 'c' });

    const portrait = screen.getByAltText('Scholomancer portrait');
    expect(portrait.src).toMatch(/^data:image\/png;base64,/);
  });

  it('refreshes the portrait once a weapon gets equipped elsewhere, instead of staying on the stale mount-time snapshot', () => {
    render(<CharacterCompendiumOverlay />);
    fireEvent.keyDown(window, { key: 'c' });
    const initialPortrait = screen.getByAltText('Scholomancer portrait').src;

    const snapshot = getInventorySnapshot();
    const weapon = snapshot.slots.find((item) => item?.type === 'weapon');
    act(() => {
      setInventorySnapshot({ slots: snapshot.slots, equipped: { ...snapshot.equipped, weapon } });
    });

    const updatedPortrait = screen.getByAltText('Scholomancer portrait').src;
    expect(updatedPortrait).not.toBe(initialPortrait);
  });
});
