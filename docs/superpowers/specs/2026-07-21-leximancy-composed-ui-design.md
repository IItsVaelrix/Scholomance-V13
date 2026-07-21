# Leximancy Composed UI Redesign — Morphological Resonance Chamber

**Date:** 2026-07-21  
**Status:** Approved  
**Module:** `src/pages/Read/AnalyzePanel.jsx`, `src/pages/Read/AnalyzePanel.css`, `src/core/compose/`

---

## 1. Executive Summary & Goals

The **Leximancy UI** (the primary lexical analysis and lookup panel in Scholomance's Read Page) is being upgraded to a full **Compose Composed Component Architecture (`v2`)** implementation.

This redesign introduces the **Morphological Resonance Chamber**, leveraging Compose capabilities:
1. **Dynamic Ambiguity Margin Bar:** Driven by `CassowarySolver` (`mode: 'constraint'`) to dynamically compute confidence and margin spatial widths for `clear`, `ambiguous`, and `unbound` states.
2. **WAND Confidence Sigils:** Procedural visual pulse slots on candidate chips (`.az-candidate`) whose pulse frequency and glow intensity scale with `morphologicalConfidence` (`0.0`–`1.0`).
3. **Roving Focus Navigation:** Keyboard-first accessible navigation using Zag.js adapters for POS bucket switching (`Nouns`, `Verbs`, `Adjectives`, `Adverbs`).
4. **DTCG Token System Integration:** Binds all panel colors, borders, focus rings, and scrollbars to DTCG Compose design tokens (`--compose-scrollbar-thumb-default`, `--compose-color-primary-500`) with dynamic school skin fallbacks (`--school-primary`, `--school-primary-glow`).

---

## 2. Canonical Contracts & Schemas

### 2.1 Semantic Contract (`SCHOL-COMPONENT-DEFINITION-v1`)
```json
{
  "kind": "leximancy-panel",
  "version": "1.0.0",
  "roles": ["region"],
  "parts": [
    "scope-selector",
    "query-input",
    "ambiguity-margin-bar",
    "candidate-chips",
    "evidence-accordion",
    "pos-bucket-list"
  ],
  "states": {
    "scope": ["word", "selection", "line", "local", "document"],
    "resolution": ["clear", "ambiguous", "unbound"],
    "activeCandidateId": "string | null"
  }
}
```

### 2.2 Layout Intent (`PB-LAYOUT-v1`)
* **Mode:** `constraint` for the Ambiguity Margin Bar (`regionId: "leximancy-margin-region"`).
* **Fallback:** `flow` (flex layout) for standard vertical panel scrolling.

### 2.3 Event Protocol (`PB-UI-EVENT-v1`)
* `LEXIMANCY.QUERY_CHANGED`: Emitted on query input change.
* `LEXIMANCY.SCOPE_CHANGED`: Emitted on scope button selection.
* `LEXIMANCY.CANDIDATE_SELECTED`: Emitted on selecting a candidate chip.
* `LEXIMANCY.ITEM_ACTION`: Emitted on action trigger (`insert`, `replace`, `pin`).

---

## 3. UI Component Anatomy & Logic

### 3.1 Ambiguity Margin Bar (`.az-ambiguity-margin-bar`)
* Computes spatial widths for confidence threshold (`threshold: 0.70`) and margin (`margin: 0.85`) using `CassowarySolver`.
* Status colors:
  * **Clear:** `#91d7be` (Emerald)
  * **Ambiguous:** `#e4c36b` (Amber)
  * **Unbound:** `#ef8ea0` (Crimson)

### 3.2 Candidate Chips with WAND Sigil (`.az-candidate`)
* Displays rank, lemma, POS tag, and score.
* Renders a procedural SVG pulse ring slot whose animation timing is bounded:
  $$\text{pulseDuration} = 3000 - (\text{score} \times 2000) \text{ ms}$$

### 3.3 Zag.js Accessible Keyboard Roving Focus
* Standardized keyboard shortcuts (`ArrowLeft`, `ArrowRight`, `Home`, `End`, `Space`, `Enter`) navigate between candidate chips and POS bucket lists.

---

## 4. Token System & CSS Architecture

* Uses Compose design tokens defined in `tokens/compose/base.json` and `tokens/compose/scrollbar.json`.
* Applies CSS variables:
  * `--scrollbar-thumb: var(--compose-scrollbar-thumb-default, var(--school-primary, rgba(196, 164, 92, 0.45)))`
  * `--scrollbar-thumb-hover: var(--compose-scrollbar-thumb-hover, var(--school-primary-glow, rgba(226, 201, 126, 0.75)))`
  * `--scrollbar-track: var(--compose-scrollbar-track-default, transparent)`

---

## 5. Verification & QA Plan

1. **Unit & Feature Tests:**
   * Create `tests/qa/features/compose-leximancy-panel.test.ts` testing schema validity, event emission, constraint solver fallback, and keyboard navigation.
2. **Visual & Token Checks:**
   * Verify token generation via `npm run build:tokens`.
   * Verify all 24 compose test files pass with 100% compliance.
