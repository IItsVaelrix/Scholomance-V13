# Universal Light/Dark Mode Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a modular, accessible, animated `ThemeToggle` component and integrate it into the global desktop navigation rail and mobile menu drawer.

**Architecture:** Create `src/components/Navigation/ThemeToggle.jsx` which consumes `useTheme()` context. Integrate `<ThemeToggle />` into `src/components/Navigation/Navigation.jsx` in both desktop (`.rail-right`) and mobile drawer views, supported by unit tests in `tests/qa/ui-theme-toggle.test.jsx`.

**Tech Stack:** React, Lucide Icons (`Sun`, `Moon`), Framer Motion, Vitest, Testing Library React.

## Global Constraints

- Theme attribute must toggle `data-theme` attribute on `document.documentElement` between `'dark'` and `'light'`.
- Persistence must be handled via `Storage.setItem('scholomance-theme', theme)` in `useTheme.jsx`.
- Clean accessibility (`aria-label`, `title`, keyboard focusable).

---

### Task 1: Create `ThemeToggle` Component and Unit Test

**Files:**
- Create: `src/components/Navigation/ThemeToggle.jsx`
- Create: `tests/qa/ui-theme-toggle.test.jsx`

**Interfaces:**
- Consumes: `useTheme` from `src/hooks/useTheme.jsx` (`{ theme, toggleTheme }`)
- Produces: `ThemeToggle` React component

- [ ] **Step 1: Write the failing unit test**

Create `tests/qa/ui-theme-toggle.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeToggle } from '../../src/components/Navigation/ThemeToggle.jsx';
import { ThemeProvider } from '../../src/hooks/useTheme.jsx';

describe('ThemeToggle component', () => {
  it('renders switch to light mode when theme is dark', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /switch to light mode/i });
    expect(button).toBeInTheDocument();
  });

  it('toggles theme attribute on click', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /switch to light mode/i });
    fireEvent.click(button);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const darkButton = screen.getByRole('button', { name: /switch to dark mode/i });
    expect(darkButton).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/ui-theme-toggle.test.jsx`
Expected: FAIL (Cannot find module or ThemeToggle component)

- [ ] **Step 3: Write minimal implementation**

Create `src/components/Navigation/ThemeToggle.jsx`:

```jsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/ui-theme-toggle.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Navigation/ThemeToggle.jsx tests/qa/ui-theme-toggle.test.jsx
git commit -m "feat: add ThemeToggle component and unit tests"
```

---

### Task 2: Integrate `ThemeToggle` into Navigation Bar and Mobile Menu Drawer

**Files:**
- Modify: `src/components/Navigation/Navigation.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `ThemeToggle` from `src/components/Navigation/ThemeToggle.jsx`

- [ ] **Step 1: Integrate `ThemeToggle` into `Navigation.jsx`**

Import `ThemeToggle` in `src/components/Navigation/Navigation.jsx`:

```jsx
import { ThemeToggle } from "./ThemeToggle.jsx";
```

Insert `<ThemeToggle />` inside `.rail-right`:

```jsx
<div className="rail-right">
  <ThemeToggle />
  {showAccountNavigation && user && (
    ...
```

And inside `.nav-mobile-header` or as a mobile navigation link inside `.nav-mobile-links`:

```jsx
<div className="nav-mobile-theme-row">
  <ThemeToggle showLabel={true} className="nav-mobile-theme-btn" />
</div>
```

- [ ] **Step 2: Add theme toggle CSS styling in `src/index.css`**

Add CSS rules for `.theme-toggle-btn`, `.nav-mobile-theme-row`, `.nav-mobile-theme-btn`, and light mode hover states.

```css
/* Theme Toggle Button Styles */
.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.7));
  cursor: pointer;
  padding: 0.4rem 0.6rem;
  border-radius: 0.375rem;
  transition: color 0.2s ease, background-color 0.2s ease;
}

.theme-toggle-btn:hover {
  color: var(--color-text-primary, #ffffff);
  background: rgba(255, 255, 255, 0.08);
}

[data-theme='light'] .theme-toggle-btn {
  color: #4a5568;
}

[data-theme='light'] .theme-toggle-btn:hover {
  color: #1a202c;
  background: rgba(0, 0, 0, 0.06);
}

.nav-mobile-theme-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

[data-theme='light'] .nav-mobile-theme-row {
  border-bottom-color: rgba(0, 0, 0, 0.08);
}
```

- [ ] **Step 3: Run unit tests and typechecks to verify**

Run: `npx vitest run tests/qa/ui-theme-toggle.test.jsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Navigation/Navigation.jsx src/index.css
git commit -m "feat: integrate universal ThemeToggle into navigation rail and mobile drawer"
```
