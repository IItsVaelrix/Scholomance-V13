import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.jsx';
import { triggerHapticPulse, UI_HAPTICS } from '../../lib/platform/haptics.js';

export function ThemeToggle({ className = '', showLabel = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const handleClick = useCallback(() => {
    triggerHapticPulse(UI_HAPTICS.TICK);
    toggleTheme();
  }, [toggleTheme]);

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <motion.button
      type="button"
      className={`rail-link theme-toggle-btn ${className}`}
      onClick={handleClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {isDark ? (
        <Sun size={15} className="theme-icon theme-icon--sun" aria-hidden="true" />
      ) : (
        <Moon size={15} className="theme-icon theme-icon--moon" aria-hidden="true" />
      )}
      {showLabel && (
        <span className="theme-toggle-label">
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </span>
      )}
    </motion.button>
  );
}

export default ThemeToggle;
