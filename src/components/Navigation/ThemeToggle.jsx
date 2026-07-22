import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.jsx';
import { triggerHapticPulse, UI_HAPTICS } from '../../lib/platform/haptics.js';

/** IDE-only sun/moon control. Prefer mounting inside Read TopBar, not global nav. */
export function ThemeToggle({ className = 'ide-icon-btn', showLabel = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const handleClick = useCallback(() => {
    triggerHapticPulse(UI_HAPTICS.TICK);
    toggleTheme();
  }, [toggleTheme]);

  const label = isDark ? 'Switch IDE to light mode' : 'Switch IDE to dark mode';

  return (
    <motion.button
      type="button"
      className={`theme-toggle-btn ${className}`.trim()}
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
          {isDark ? 'IDE Light' : 'IDE Dark'}
        </span>
      )}
    </motion.button>
  );
}

export default ThemeToggle;
