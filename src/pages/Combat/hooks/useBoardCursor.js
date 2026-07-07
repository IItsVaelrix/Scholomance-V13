/**
 * useBoardCursor.js
 *
 * Manages the keyboard cursor position on the 5×5 board.
 *
 * Responsibilities:
 *   - WASD / arrow key navigation (bounds-clamped)
 *   - Does not activate when a textarea/input has focus
 *   - Does not move actual entities — only the cursor
 *
 * Returns:
 *   cursorTile   — current { x, y } cursor position
 *   setCursorTile — direct position setter (for mouse clicks)
 *   moveCursor   — delta-based movement ({ dx, dy })
 */

import { useState, useEffect, useCallback } from 'react';
import { isWithinBounds } from '../state/combatBoardUtils.js';

/** Default cursor starts at the scholar's default spawn (bottom-center). */
const INITIAL_CURSOR = { x: 4, y: 7 };

export function useBoardCursor() {
  const [cursorTile, setCursorTile] = useState(INITIAL_CURSOR);

  const moveCursor = useCallback((dx, dy) => {
    setCursorTile(prev => {
      const next = { x: prev.x + dx, y: prev.y + dy };
      return isWithinBounds(next) ? next : prev;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Do not capture when player is typing in a form field.
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          dx = -1;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          dx = 1;
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          dy = -1;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          dy = 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      moveCursor(dx, dy);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [moveCursor]);

  return { cursorTile, setCursorTile, moveCursor };
}
