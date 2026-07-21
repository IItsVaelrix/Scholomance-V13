# Phoneme Density Studio Dynamics Compressor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Phoneme Density display in `ComposeSignalChamberAdapter.tsx` into an authentic Studio Dynamics Audio Compressor UI with `IN`/`GR` dual meter bridge, live SVG transfer function curve, dynamic ratio readout, and anti-exploit limiter banner.

**Architecture:** 
1. `ComposeSignalChamberAdapter.tsx`: Replace the `.analytics-block` segment meter with a dedicated `phoneme-compressor-unit` container.
2. Calculate Gain Reduction: $\text{GR} = -(S - 0.75) \times 40\text{ dB}$ when $S > 0.75$.
3. Compute dynamic compressor mode: `1:1 LINEAR`, `4:1 COMPRESSING`, or `∞:1 HARD LIMIT`.
4. Render SVG dynamic knee transfer curve and dual LED meters (`IN` and `GR`).
5. `ListenPage.css`: Style the compressor console, meter tracks, SVG curve, and warning banners using Scholomance DTCG design tokens.

**Tech Stack:** React, TypeScript, Vitest, SVG, CSS Custom Properties, Framer Motion.

## Global Constraints

- SCHOL-COMPONENT-DEFINITION-v1 contract attributes (`data-compose-kind="phoneme-compressor-unit"`, `data-compose-part="compressorConsole"`)
- PB-UI-SCENE-v1 reference integrity preserved
- Hysteresis warning threshold: set true at `signalLevel > 0.75`, clear at `signalLevel < 0.68`
- 100% test pass rate across `compose-signal-chamber-kit.test.ts` and all 26 compose Vitest files

---

### Task 1: Test Suite for Phoneme Dynamics Compressor UI

**Files:**
- Modify: `tests/qa/features/compose-signal-chamber-kit.test.ts`

**Interfaces:**
- Consumes: `ComposeSignalChamberAdapter` component rendering with `signalLevel` prop
- Produces: Test assertions for `data-compose-kind="phoneme-compressor-unit"`, `IN` meter, `GR` meter, SVG transfer curve, and ratio badges

- [ ] **Step 1: Write the failing test cases**

Edit `tests/qa/features/compose-signal-chamber-kit.test.ts` to add test assertions for the Phoneme Compressor UI:

```typescript
test('renders Phoneme Dynamics Compressor UI with gain reduction and transfer curve', () => {
  const { container, rerender } = render(
    React.createElement(ComposeSignalChamberAdapter, {
      currentSchoolId: 'SONIC',
      isPlaying: true,
      signalLevel: 0.4,
    })
  );

  const compressorUnit = container.querySelector('[data-compose-kind="phoneme-compressor-unit"]');
  expect(compressorUnit).not.toBeNull();
  expect(compressorUnit?.getAttribute('data-compose-status')).toBe('NORMAL');

  const transferCurve = container.querySelector('[data-compose-part="transferCurve"]');
  expect(transferCurve).not.toBeNull();

  const ratioBadge = container.querySelector('.compressor-ratio-badge');
  expect(ratioBadge?.textContent).toContain('1:1 LINEAR');

  // Test attenuation state (> 0.75 signal level)
  rerender(
    React.createElement(ComposeSignalChamberAdapter, {
      currentSchoolId: 'SONIC',
      isPlaying: true,
      signalLevel: 0.85,
    })
  );

  expect(compressorUnit?.getAttribute('data-compose-status')).toBe('LIMITING');
  expect(container.querySelector('.compressor-ratio-badge')?.textContent).toContain('∞:1 HARD LIMIT');

  const grReadout = container.querySelector('.gr-meter-val');
  expect(grReadout?.textContent).toMatch(/-4\.\d dB/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`  
Expected: FAIL with "Unable to find element with [data-compose-kind="phoneme-compressor-unit"]"

---

### Task 2: Implement PhonemeCompressorConsole & Styling

**Files:**
- Modify: `src/pages/Listen/ComposeSignalChamberAdapter.tsx`
- Modify: `src/pages/Listen/ListenPage.css`

**Interfaces:**
- Consumes: `signalLevel`, `phonemeWarning`
- Produces: `data-compose-kind="phoneme-compressor-unit"` rendered JSX element with dual meter bridge (`IN`, `GR`), SVG transfer curve, and limiter alert banner

- [ ] **Step 1: Implement PhonemeCompressorConsole in `ComposeSignalChamberAdapter.tsx`**

Update `src/pages/Listen/ComposeSignalChamberAdapter.tsx` to replace the analytics block with the compressor UI:

```tsx
  // Calculate dynamic compressor values
  const gainReductionDb = useMemo(() => {
    if (signalLevel <= 0.75) return 0;
    return -((signalLevel - 0.75) * 40);
  }, [signalLevel]);

  const compressorRatio = useMemo(() => {
    if (signalLevel >= 0.75) return '∞:1 HARD LIMIT';
    if (signalLevel >= 0.50) return '4:1 COMPRESSING';
    return '1:1 LINEAR';
  }, [signalLevel]);

  const compressorStatus = useMemo(() => {
    if (signalLevel >= 0.75) return 'LIMITING';
    if (signalLevel >= 0.50) return 'ATTENUATING';
    return 'NORMAL';
  }, [signalLevel]);
```

Replace `.analytics-block` JSX with:

```tsx
        {/* Studio Dynamics Audio Compressor UI */}
        <div
          className={`analytics-block compressor-console ${phonemeWarning ? 'compressor-console--warn' : ''}`}
          data-compose-kind="phoneme-compressor-unit"
          data-compose-part="compressorConsole"
          data-compose-status={compressorStatus}
          data-compose-warning={phonemeWarning}
        >
          <div className="compressor-header">
            <div className="compressor-eyebrow">
              <span className="material-symbols-outlined">tune</span>
              <span>PHONEME_DYNAMICS_C1</span>
            </div>
            <span
              className={`compressor-ratio-badge compressor-ratio-badge--${compressorStatus.toLowerCase()}`}
            >
              {compressorRatio}
            </span>
          </div>

          {/* Meter Bridge: IN & GR */}
          <div className="compressor-meter-bridge">
            <div className="meter-lane">
              <div className="meter-label">
                <span>IN</span>
                <span className="meter-val">{Math.round(signalLevel * 100)}%</span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill meter-fill--in"
                  style={{ width: `${Math.min(100, signalLevel * 100)}%` }}
                />
              </div>
            </div>

            <div className="meter-lane">
              <div className="meter-label">
                <span>GR</span>
                <span className="meter-val gr-meter-val">
                  {gainReductionDb < 0 ? `${gainReductionDb.toFixed(1)} dB` : '0.0 dB'}
                </span>
              </div>
              <div className="meter-track meter-track--gr">
                <div
                  className="meter-fill meter-fill--gr"
                  style={{
                    width: `${Math.min(100, (Math.abs(gainReductionDb) / 18) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Transfer Curve Micro SVG */}
          <div className="compressor-transfer-graph" data-compose-part="transferCurve">
            <svg viewBox="0 0 100 60" className="transfer-svg" aria-hidden="true">
              <line x1="10" y1="50" x2="90" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <line x1="10" y1="10" x2="10" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              {/* Threshold indicator line at x=70 */}
              <line x1="70" y1="10" x2="70" y2="50" stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" strokeWidth="1" />
              {/* Knee response path */}
              <path
                d="M 10 50 L 70 20 L 90 20"
                fill="none"
                stroke={phonemeWarning ? 'var(--ritual-danger, #ff4444)' : 'var(--ritual-glow, #858fa7)'}
                strokeWidth="2"
              />
              {/* Current operating point dot */}
              <circle
                cx={10 + Math.min(80, signalLevel * 80)}
                cy={50 - Math.min(30, signalLevel * 30 + (gainReductionDb < 0 ? Math.abs(gainReductionDb) * 0.5 : 0))}
                r="3"
                fill={phonemeWarning ? 'var(--ritual-danger, #ff4444)' : '#ffffff'}
              />
            </svg>
          </div>

          {/* Parameter Readouts */}
          <div className="compressor-params-grid">
            <div className="param-tag">
              <span className="lbl">THRESH</span>
              <span className="val">-12.0 dB</span>
            </div>
            <div className="param-tag">
              <span className="lbl">ATT/REL</span>
              <span className="val">12ms / 150ms</span>
            </div>
          </div>

          {/* Alert Banner */}
          {phonemeWarning && (
            <div className="compressor-limiter-banner" aria-live="assertive">
              <span className="material-symbols-outlined">warning</span>
              <span>HEURISTIC LIMITER ACTIVE - RETURNS DECAY</span>
            </div>
          )}

          {/* Phase Filter Controls */}
          <div className="phase-controls">
            <button className="phase-btn">CONSONANT</button>
            <button className="phase-btn">VOWEL</button>
          </div>
        </div>
```

- [ ] **Step 2: Add CSS rules to `src/pages/Listen/ListenPage.css`**

Add CSS styles for `.compressor-console`, `.compressor-meter-bridge`, `.compressor-transfer-graph`, `.compressor-ratio-badge`, and `.compressor-limiter-banner` in `src/pages/Listen/ListenPage.css`:

```css
/* Studio Dynamics Compressor Console */
.compressor-console {
  background: var(--ritual-surface-raised, rgba(20, 24, 33, 0.85));
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compressor-console--warn {
  border-color: var(--ritual-danger, #ff4444);
  box-shadow: 0 0 12px rgba(255, 68, 68, 0.25);
}

.compressor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.compressor-eyebrow {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ritual-text-muted, #858fa7);
}

.compressor-ratio-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ritual-text, #ffffff);
}

.compressor-ratio-badge--limiting {
  background: var(--ritual-danger, #ff4444);
  color: #ffffff;
  animation: pulse-limiter 1s infinite alternate;
}

.compressor-meter-bridge {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meter-lane {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meter-label {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--ritual-text-muted, #858fa7);
}

.meter-track {
  height: 6px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 3px;
  overflow: hidden;
}

.meter-fill--in {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #ffeb3b);
  transition: width 0.15s ease-out;
}

.meter-fill--gr {
  height: 100%;
  background: linear-gradient(90deg, #ff9800, #f44336);
  transition: width 0.15s ease-out;
}

.compressor-transfer-graph {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  height: 60px;
  overflow: hidden;
}

.transfer-svg {
  width: 100%;
  height: 100%;
}

.compressor-params-grid {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--ritual-text-muted, #858fa7);
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
}

.compressor-limiter-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 68, 68, 0.15);
  border: 1px solid var(--ritual-danger, #ff4444);
  color: #ff6666;
  font-size: 10px;
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 4px;
}
```

- [ ] **Step 3: Run Vitest to verify tests pass**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`  
Expected: PASS (4/4 tests passing)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Listen/ComposeSignalChamberAdapter.tsx src/pages/Listen/ListenPage.css tests/qa/features/compose-signal-chamber-kit.test.ts
git commit -m "feat(compose): implement Phoneme Density Studio Dynamics Compressor UI"
```

---

### Task 3: Full Verification & Token Build

**Files:**
- Output: Tokens build and Vitest suite execution across all 26 compose test files

- [ ] **Step 1: Execute token build and full Vitest suite**

Run: `npm run build:tokens && npx vitest run tests/qa/features/compose-*.test.ts`  
Expected: 26/26 test files passing, 325+ tests passing cleanly.

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "qa(compose): verify Phoneme Dynamics Compressor UI across full test suite"
```
