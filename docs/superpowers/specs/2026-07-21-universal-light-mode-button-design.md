# Universal Light/Dark Mode Toggle Design Specification

## Overview
This specification details the creation and integration of a universal light mode / dark mode toggle button across the Scholomance application.

## Goals
- Provide a clear, accessible, and animated toggle button to switch between light mode (`data-theme="light"`) and dark mode (`data-theme="dark"`).
- Make the theme toggle universally accessible from any page via the top navigation rail (`.rail-right`) and the mobile drawer overlay.
- Maintain persistence across sessions using the existing `scholomance-theme` key in `Storage`.

## Proposed Architecture

### 1. `ThemeToggle` Component
- **File**: `src/components/Navigation/ThemeToggle.jsx`
- **Dependencies**: `useTheme` hook (`src/hooks/useTheme.jsx`), `lucide-react` (`Sun`, `Moon`), `framer-motion` (`motion`), `haptics` (`triggerHapticPulse`).
- **Behavior**:
  - Displays `Sun` icon when `theme === 'dark'` (clicking activates light mode).
  - Displays `Moon` icon when `theme === 'light'` (clicking activates dark mode).
  - Triggers haptic tick feedback on user interaction.
  - Features smooth rotation and scale animations on hover and click.
  - Fully accessible with dynamic `aria-label` and `title` properties.

### 2. Integration into Navigation (`Navigation.jsx`)
- **File**: `src/components/Navigation/Navigation.jsx`
- **Desktop**: Render `<ThemeToggle />` inside `.rail-right` adjacent to the account/portal button.
- **Mobile**: Render a mobile-optimized `<ThemeToggle />` item inside `.nav-mobile-links` or `.nav-mobile-header` within the navigation menu drawer.

### 3. Styling & Tokens
- **Theme Attribute**: `document.documentElement.setAttribute('data-theme', theme)`
- Ensure `.rail-link` hover and focus styles adapt gracefully when `data-theme="light"` is active.

## Verification & Testing Strategy
1. Click the theme toggle button in desktop navigation rail: verify HTML attribute `data-theme="light"` is applied and persisted in `localStorage`.
2. Toggle theme back to dark: verify `data-theme="dark"` is set.
3. Test in mobile menu drawer view.
4. Verify page navigation preserves selected theme.
