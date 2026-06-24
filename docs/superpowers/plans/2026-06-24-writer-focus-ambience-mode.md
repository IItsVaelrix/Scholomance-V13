# Writer Focus & Ambience Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a distraction-free "focus mode" to the Scribe IDE — a red engraved **M** button hides all IDE chrome and centers the editor, with a layered Web Audio ambience mixer (rain / café plaza / wind) for writers.

**Architecture:** A framework-free `ambienceMixer` service owns the Web Audio graph and mix state (injectable engine for testability). A React hook binds it to components and persists the mix to `localStorage`. Focus mode is a `focusMode` boolean in `ReadPage` that toggles a CSS modifier class on the existing layout wrapper — the `ScrollEditor` is **never remounted**. A tray UI and the M button consume the hook.

**Tech Stack:** React (JSX + one `.ts` hook), Web Audio API, Vitest + `@testing-library/react`, existing Read/IDE CSS.

## Global Constraints

- **No editor remount:** focus mode is CSS-class-only on `.ide-layout-wrapper`; never change the `ScrollEditor` subtree or its React key (`ReadPage.jsx:544` documents that remounting loses the document).
- **Aesthetic:** keep the Scholomance dark theme + TrueSight coloring. This is NOT a retro Windows WordPad reskin.
- **Channels (exact ids):** `rain`, `cafe`, `wind`. Labels (exact copy): `Rain`, `Café Plaza`, `Wind through a house`.
- **Persistence key (verbatim):** `scholomance.focus.ambience.v1`. Mix settings persist; focus mode itself does NOT persist (always boots into the normal IDE).
- **Asset contract (verbatim paths):** `public/audio/ambience/rain.mp3`, `cafe.mp3`, `wind.mp3` (served at `/audio/ambience/<id>.mp3`). Filenames are the swap contract.
- **Accessibility:** channel toggles + the M button use `aria-pressed`; every `range` slider has an explicit `aria-label`.
- **Test runner:** `npx vitest run <path>`. Component tests use `render/screen/fireEvent/waitFor` from `@testing-library/react` and `describe/it/expect/vi/beforeEach` from `vitest`.
- **Commits:** end every commit message with a second `-m` trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**New files:**
- `src/lib/ambient/ambienceMixer.service.js` — Web Audio mixer engine + mix state machine (injectable engine).
- `src/hooks/useAmbienceMixer.ts` — React binding + `localStorage` persistence.
- `src/pages/Read/AmbienceTray.jsx` — mixer UI (3 channels + master, collapsible).
- `src/pages/Read/FocusModeButton.jsx` — the engraved red M button (bar + floating variants).
- `src/pages/Read/useFocusMode.js` — Esc-to-exit + fade-ambience-on-exit hook.
- `tests/pages/Read/ambienceMixer.service.test.js`
- `tests/pages/Read/useAmbienceMixer.test.jsx`
- `tests/pages/Read/AmbienceTray.test.jsx`
- `tests/pages/Read/FocusModeButton.test.jsx`
- `tests/pages/Read/useFocusMode.test.jsx`
- `public/audio/ambience/{rain,cafe,wind}.mp3` + `public/audio/ambience/CREDITS.md`

**Modified files:**
- `src/pages/Read/IDEChrome.jsx` — `TopBar` hosts the bar-variant M button (new `focusMode` / `onToggleFocus` props).
- `src/pages/Read/ReadPage.jsx` — `focusMode` state, wrapper modifier class, render floating button + tray, use `useFocusMode`.
- `src/pages/Read/IDE.css` — `.ide-layout-wrapper--focus` rules + tray/button styling.

---

## Task 1: Ambience mixer service

**Files:**
- Create: `src/lib/ambient/ambienceMixer.service.js`
- Test: `tests/pages/Read/ambienceMixer.service.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `AMBIENCE_CHANNELS: ['rain','cafe','wind']`
  - `AMBIENCE_ASSETS: { rain:'/audio/ambience/rain.mp3', cafe:'/audio/ambience/cafe.mp3', wind:'/audio/ambience/wind.mp3' }`
  - `AMBIENCE_STORAGE_KEY: 'scholomance.focus.ambience.v1'`
  - `createAmbienceMixerService({ createEngine }) -> service`
  - `getAmbienceMixerService() -> service` (singleton, default Web Audio engine)
  - State shape: `{ running:boolean, master:number, channels:{ [id]:{ enabled:boolean, volume:number, available:boolean } } }`
  - Service methods: `getState()`, `subscribe(fn)->unsub`, `setMasterVolume(v)`, `setChannelEnabled(id,bool)->Promise`, `setChannelVolume(id,v)`, `start()->Promise`, `stop()->Promise`, `loadConfig(config)`
  - Engine interface (what `createEngine()` must return): `{ setChannelGain(id,value,rampMs), setMasterGain(value,rampMs), resume()->Promise, suspend()->Promise, onAvailabilityChange(cb) }`

- [ ] **Step 1: Write the failing test**

Create `tests/pages/Read/ambienceMixer.service.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import {
  createAmbienceMixerService,
  AMBIENCE_CHANNELS,
} from '../../../src/lib/ambient/ambienceMixer.service.js';

function makeFakeEngine() {
  const calls = [];
  let availabilityCb = null;
  return {
    calls,
    setChannelGain: (id, value, rampMs) => calls.push(['channel', id, value, rampMs]),
    setMasterGain: (value, rampMs) => calls.push(['master', value, rampMs]),
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    onAvailabilityChange: (cb) => { availabilityCb = cb; },
    _fail: (id) => availabilityCb && availabilityCb(
      Object.fromEntries(AMBIENCE_CHANNELS.map((c) => [c, c !== id])),
    ),
  };
}

function makeService() {
  const engine = makeFakeEngine();
  const service = createAmbienceMixerService({ createEngine: () => engine });
  return { service, engine };
}

describe('ambienceMixer.service', () => {
  it('defaults to not-running, all channels disabled', () => {
    const { service } = makeService();
    const s = service.getState();
    expect(s.running).toBe(false);
    expect(s.channels.rain.enabled).toBe(false);
    expect(s.channels.cafe.available).toBe(true);
  });

  it('enabling a channel starts the engine and ramps its gain to its volume', async () => {
    const { service, engine } = makeService();
    service.setChannelVolume('rain', 0.4);
    await service.setChannelEnabled('rain', true);
    expect(engine.resume).toHaveBeenCalledTimes(1);
    expect(service.getState().running).toBe(true);
    expect(engine.calls).toContainEqual(['channel', 'rain', 0.4, expect.any(Number)]);
  });

  it('disabling a running channel ramps its gain to 0', async () => {
    const { service, engine } = makeService();
    await service.setChannelEnabled('cafe', true);
    engine.calls.length = 0;
    await service.setChannelEnabled('cafe', false);
    expect(engine.calls).toContainEqual(['channel', 'cafe', 0, expect.any(Number)]);
  });

  it('master volume scales independently and notifies subscribers', async () => {
    const { service, engine } = makeService();
    const seen = [];
    service.subscribe((s) => seen.push(s.master));
    await service.start();
    service.setMasterVolume(0.3);
    expect(engine.calls).toContainEqual(['master', 0.3, expect.any(Number)]);
    expect(seen).toContain(0.3);
  });

  it('stop() fades master to 0 and suspends', async () => {
    const { service, engine } = makeService();
    await service.start();
    await service.stop();
    expect(engine.calls).toContainEqual(['master', 0, expect.any(Number)]);
    expect(engine.suspend).toHaveBeenCalled();
    expect(service.getState().running).toBe(false);
  });

  it('marks a channel unavailable and forces its gain to 0', async () => {
    const { service, engine } = makeService();
    await service.setChannelEnabled('wind', true);
    engine.calls.length = 0;
    engine._fail('wind');
    expect(service.getState().channels.wind.available).toBe(false);
    expect(engine.calls).toContainEqual(['channel', 'wind', 0, expect.any(Number)]);
  });

  it('loadConfig applies persisted master + channel settings', () => {
    const { service } = makeService();
    service.loadConfig({ master: 0.2, channels: { rain: { enabled: true, volume: 0.9 } } });
    const s = service.getState();
    expect(s.master).toBe(0.2);
    expect(s.channels.rain.enabled).toBe(true);
    expect(s.channels.rain.volume).toBe(0.9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Read/ambienceMixer.service.test.js`
Expected: FAIL — cannot resolve `ambienceMixer.service.js` / `createAmbienceMixerService is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/ambient/ambienceMixer.service.js`:

```js
export const AMBIENCE_CHANNELS = ['rain', 'cafe', 'wind'];

export const AMBIENCE_ASSETS = Object.freeze({
  rain: '/audio/ambience/rain.mp3',
  cafe: '/audio/ambience/cafe.mp3',
  wind: '/audio/ambience/wind.mp3',
});

export const AMBIENCE_STORAGE_KEY = 'scholomance.focus.ambience.v1';

const CHANNEL_FADE_MS = 120;
const MASTER_FADE_MS = 400;
const MASTER_TRIM_MS = 60;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function createAmbienceMixerService({ createEngine }) {
  let engine = null;
  const listeners = new Set();
  const state = {
    running: false,
    master: 0.7,
    channels: {
      rain: { enabled: false, volume: 0.5, available: true },
      cafe: { enabled: false, volume: 0.5, available: true },
      wind: { enabled: false, volume: 0.5, available: true },
    },
  };

  function snapshot() {
    return {
      running: state.running,
      master: state.master,
      channels: Object.fromEntries(
        AMBIENCE_CHANNELS.map((id) => [id, { ...state.channels[id] }]),
      ),
    };
  }

  function emit() {
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
  }

  function ensureEngine() {
    if (!engine) {
      engine = createEngine();
      engine.onAvailabilityChange((availability) => {
        for (const id of AMBIENCE_CHANNELS) {
          state.channels[id].available = Boolean(availability[id]);
        }
        for (const id of AMBIENCE_CHANNELS) applyChannelGain(id, CHANNEL_FADE_MS);
        emit();
      });
    }
    return engine;
  }

  function applyChannelGain(id, rampMs) {
    if (!engine) return;
    const ch = state.channels[id];
    const value = ch.enabled && ch.available ? ch.volume : 0;
    engine.setChannelGain(id, value, rampMs);
  }

  async function start() {
    const e = ensureEngine();
    await e.resume();
    state.running = true;
    e.setMasterGain(state.master, MASTER_FADE_MS);
    for (const id of AMBIENCE_CHANNELS) applyChannelGain(id, CHANNEL_FADE_MS);
    emit();
  }

  async function stop() {
    if (engine) {
      engine.setMasterGain(0, MASTER_FADE_MS);
      await engine.suspend();
    }
    state.running = false;
    emit();
  }

  function setMasterVolume(value) {
    state.master = clamp01(value);
    if (state.running) ensureEngine().setMasterGain(state.master, MASTER_TRIM_MS);
    emit();
  }

  async function setChannelEnabled(id, enabled) {
    if (!state.channels[id]) return;
    state.channels[id].enabled = Boolean(enabled);
    if (enabled && !state.running) {
      await start();
      return;
    }
    applyChannelGain(id, CHANNEL_FADE_MS);
    emit();
  }

  function setChannelVolume(id, value) {
    if (!state.channels[id]) return;
    state.channels[id].volume = clamp01(value);
    applyChannelGain(id, CHANNEL_FADE_MS);
    emit();
  }

  function loadConfig(config) {
    if (!config) return;
    if (config.master != null) state.master = clamp01(config.master);
    for (const id of AMBIENCE_CHANNELS) {
      const c = config.channels && config.channels[id];
      if (!c) continue;
      if (c.volume != null) state.channels[id].volume = clamp01(c.volume);
      state.channels[id].enabled = Boolean(c.enabled);
    }
    emit();
  }

  return {
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setMasterVolume,
    setChannelEnabled,
    setChannelVolume,
    start,
    stop,
    loadConfig,
  };
}

function createWebAudioEngine() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const availability = { rain: false, cafe: false, wind: false };
  let availabilityCb = null;
  const channels = {};

  for (const id of AMBIENCE_CHANNELS) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const el = new Audio(AMBIENCE_ASSETS[id]);
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.addEventListener('canplaythrough', () => {
      availability[id] = true;
      if (availabilityCb) availabilityCb({ ...availability });
    }, { once: true });
    el.addEventListener('error', () => {
      availability[id] = false;
      if (availabilityCb) availabilityCb({ ...availability });
    });
    const src = ctx.createMediaElementSource(el);
    src.connect(gain);
    channels[id] = { gain, el };
  }

  function ramp(param, value, rampMs) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + rampMs / 1000);
  }

  return {
    setChannelGain(id, value, rampMs) {
      const c = channels[id];
      if (!c) return;
      if (value > 0) { const p = c.el.play(); if (p && p.catch) p.catch(() => {}); }
      ramp(c.gain.gain, value, rampMs);
    },
    setMasterGain(value, rampMs) { ramp(master.gain, value, rampMs); },
    async resume() { if (ctx.state === 'suspended') await ctx.resume(); },
    async suspend() { if (ctx.state === 'running') await ctx.suspend(); },
    onAvailabilityChange(cb) { availabilityCb = cb; },
  };
}

let singleton = null;
export function getAmbienceMixerService() {
  if (!singleton) {
    singleton = createAmbienceMixerService({ createEngine: createWebAudioEngine });
  }
  return singleton;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/Read/ambienceMixer.service.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ambient/ambienceMixer.service.js tests/pages/Read/ambienceMixer.service.test.js
git commit -m "feat(focus): ambience mixer service with injectable engine" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: useAmbienceMixer hook (persistence)

**Files:**
- Create: `src/hooks/useAmbienceMixer.ts`
- Test: `tests/pages/Read/useAmbienceMixer.test.jsx`

**Interfaces:**
- Consumes: `getAmbienceMixerService`, `AMBIENCE_STORAGE_KEY`, `AMBIENCE_CHANNELS` from Task 1.
- Produces: `useAmbienceMixer(service?) -> { state, setChannelEnabled, setChannelVolume, setMasterVolume, stop }`. Default `service` is the singleton. On mount it restores `scholomance.focus.ambience.v1` (without autoplaying) and persists on every state change.

- [ ] **Step 1: Write the failing test**

Create `tests/pages/Read/useAmbienceMixer.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAmbienceMixer } from '../../../src/hooks/useAmbienceMixer';
import {
  createAmbienceMixerService,
  AMBIENCE_STORAGE_KEY,
} from '../../../src/lib/ambient/ambienceMixer.service.js';

function fakeService() {
  return createAmbienceMixerService({
    createEngine: () => ({
      setChannelGain: vi.fn(),
      setMasterGain: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      onAvailabilityChange: vi.fn(),
    }),
  });
}

describe('useAmbienceMixer', () => {
  beforeEach(() => localStorage.clear());

  it('persists the mix to localStorage when a channel is enabled', async () => {
    const service = fakeService();
    const { result } = renderHook(() => useAmbienceMixer(service));
    await act(async () => { await result.current.setChannelEnabled('rain', true); });
    const saved = JSON.parse(localStorage.getItem(AMBIENCE_STORAGE_KEY));
    expect(saved.channels.rain.enabled).toBe(true);
  });

  it('restores a saved mix on mount without auto-running', () => {
    localStorage.setItem(
      AMBIENCE_STORAGE_KEY,
      JSON.stringify({ master: 0.25, channels: { wind: { enabled: true, volume: 0.8 } } }),
    );
    const service = fakeService();
    const { result } = renderHook(() => useAmbienceMixer(service));
    expect(result.current.state.master).toBe(0.25);
    expect(result.current.state.channels.wind.enabled).toBe(true);
    expect(result.current.state.channels.wind.volume).toBe(0.8);
    expect(result.current.state.running).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Read/useAmbienceMixer.test.jsx`
Expected: FAIL — cannot resolve `useAmbienceMixer`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useAmbienceMixer.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAmbienceMixerService,
  AMBIENCE_STORAGE_KEY,
  AMBIENCE_CHANNELS,
} from '../lib/ambient/ambienceMixer.service.js';

function readConfig(): any {
  try {
    const raw = localStorage.getItem(AMBIENCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeConfig(state: any) {
  try {
    const channels = Object.fromEntries(
      AMBIENCE_CHANNELS.map((id) => [
        id,
        { enabled: state.channels[id].enabled, volume: state.channels[id].volume },
      ]),
    );
    localStorage.setItem(
      AMBIENCE_STORAGE_KEY,
      JSON.stringify({ master: state.master, channels }),
    );
  } catch {
    // ignore storage errors
  }
}

export function useAmbienceMixer(service: any = getAmbienceMixerService()) {
  const [state, setState] = useState<any>(() => service.getState());
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) {
      const cfg = readConfig();
      if (cfg) service.loadConfig(cfg);
      loadedRef.current = true;
      setState(service.getState());
    }
    return service.subscribe(setState);
  }, [service]);

  useEffect(() => {
    if (loadedRef.current) writeConfig(state);
  }, [state]);

  const setChannelEnabled = useCallback((id: string, enabled: boolean) => service.setChannelEnabled(id, enabled), [service]);
  const setChannelVolume = useCallback((id: string, value: number) => service.setChannelVolume(id, value), [service]);
  const setMasterVolume = useCallback((value: number) => service.setMasterVolume(value), [service]);
  const stop = useCallback(() => service.stop(), [service]);

  return { state, setChannelEnabled, setChannelVolume, setMasterVolume, stop };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/Read/useAmbienceMixer.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAmbienceMixer.ts tests/pages/Read/useAmbienceMixer.test.jsx
git commit -m "feat(focus): useAmbienceMixer hook with localStorage persistence" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: AmbienceTray UI

**Files:**
- Create: `src/pages/Read/AmbienceTray.jsx`
- Test: `tests/pages/Read/AmbienceTray.test.jsx`

**Interfaces:**
- Consumes: `useAmbienceMixer(service?)` from Task 2.
- Produces: `export default function AmbienceTray({ service })` — accepts an optional mixer `service` (passed straight to `useAmbienceMixer`) so tests can inject a fake. Renders 3 channel toggles (`aria-pressed`) + volume sliders + a master slider, plus a collapse control.

- [ ] **Step 1: Write the failing test**

Create `tests/pages/Read/AmbienceTray.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AmbienceTray from '../../../src/pages/Read/AmbienceTray.jsx';
import { createAmbienceMixerService } from '../../../src/lib/ambient/ambienceMixer.service.js';

function fakeService() {
  return createAmbienceMixerService({
    createEngine: () => ({
      setChannelGain: vi.fn(),
      setMasterGain: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      onAvailabilityChange: vi.fn(),
    }),
  });
}

describe('AmbienceTray', () => {
  it('renders the three soundscapes and a master slider', () => {
    render(<AmbienceTray service={fakeService()} />);
    expect(screen.getByRole('button', { name: /rain/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /café plaza/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wind through a house/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/master ambience volume/i)).toBeInTheDocument();
  });

  it('toggling a channel flips its aria-pressed state', async () => {
    render(<AmbienceTray service={fakeService()} />);
    const rain = screen.getByRole('button', { name: /rain/i });
    expect(rain).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(rain);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /rain/i })).toHaveAttribute('aria-pressed', 'true'),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Read/AmbienceTray.test.jsx`
Expected: FAIL — cannot resolve `AmbienceTray.jsx`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/Read/AmbienceTray.jsx`:

```jsx
import { useState } from 'react';
import { useAmbienceMixer } from '../../hooks/useAmbienceMixer';

const CHANNEL_META = [
  { id: 'rain', label: 'Rain' },
  { id: 'cafe', label: 'Café Plaza' },
  { id: 'wind', label: 'Wind through a house' },
];

export default function AmbienceTray({ service }) {
  const { state, setChannelEnabled, setChannelVolume, setMasterVolume } = useAmbienceMixer(service);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        className="ambience-tray__fab"
        aria-label="Open ambient soundscapes"
        title="Ambient soundscapes"
        onClick={() => setCollapsed(false)}
      >
        ♪
      </button>
    );
  }

  return (
    <aside className="ambience-tray" aria-label="Ambient soundscapes">
      <div className="ambience-tray__head">
        <span className="ambience-tray__title">Ambience</span>
        <button
          type="button"
          className="ambience-tray__collapse"
          aria-label="Collapse ambience tray"
          onClick={() => setCollapsed(true)}
        >
          –
        </button>
      </div>

      {CHANNEL_META.map(({ id, label }) => {
        const ch = state.channels[id];
        return (
          <div className="ambience-tray__row" key={id}>
            <button
              type="button"
              className="ambience-tray__toggle"
              aria-pressed={ch.enabled}
              disabled={!ch.available}
              onClick={() => setChannelEnabled(id, !ch.enabled)}
            >
              {label}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={ch.volume}
              disabled={!ch.available}
              aria-label={`${label} volume`}
              onChange={(e) => setChannelVolume(id, Number(e.target.value))}
            />
          </div>
        );
      })}

      <div className="ambience-tray__row ambience-tray__master">
        <span className="ambience-tray__master-label">Master</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={state.master}
          aria-label="Master ambience volume"
          onChange={(e) => setMasterVolume(Number(e.target.value))}
        />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/Read/AmbienceTray.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Read/AmbienceTray.jsx tests/pages/Read/AmbienceTray.test.jsx
git commit -m "feat(focus): AmbienceTray mixer UI" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: FocusModeButton (the engraved red M)

**Files:**
- Create: `src/pages/Read/FocusModeButton.jsx`
- Test: `tests/pages/Read/FocusModeButton.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `export default function FocusModeButton({ active, onToggle, variant })` — `variant` is `'bar'` (default) or `'floating'`. Renders an engraved `M` glyph; `aria-pressed={active}`; calls `onToggle` on click.

- [ ] **Step 1: Write the failing test**

Create `tests/pages/Read/FocusModeButton.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FocusModeButton from '../../../src/pages/Read/FocusModeButton.jsx';

describe('FocusModeButton', () => {
  it('renders the engraved M and reflects active state', () => {
    render(<FocusModeButton active={false} onToggle={() => {}} />);
    const btn = screen.getByRole('button', { name: /focus mode/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveTextContent('M');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<FocusModeButton active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('applies the variant class', () => {
    render(<FocusModeButton active onToggle={() => {}} variant="floating" />);
    expect(screen.getByRole('button')).toHaveClass('focus-mode-btn--floating');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Read/FocusModeButton.test.jsx`
Expected: FAIL — cannot resolve `FocusModeButton.jsx`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/Read/FocusModeButton.jsx`:

```jsx
export default function FocusModeButton({ active, onToggle, variant = 'bar' }) {
  return (
    <button
      type="button"
      className={`focus-mode-btn focus-mode-btn--${variant}${active ? ' focus-mode-btn--active' : ''}`}
      aria-pressed={active}
      aria-label={active ? 'Exit focus mode' : 'Enter focus mode'}
      title={active ? 'Exit focus mode' : 'Focus mode'}
      onClick={onToggle}
    >
      <span className="focus-mode-btn__glyph" aria-hidden="true">M</span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/Read/FocusModeButton.test.jsx`
Expected: PASS (3 tests). Note: the `name: /focus mode/i` query matches both the `aria-label` ("Focus mode" / "Enter focus mode") and `title`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Read/FocusModeButton.jsx tests/pages/Read/FocusModeButton.test.jsx
git commit -m "feat(focus): engraved M focus-mode button" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: useFocusMode hook (Esc-to-exit + fade on exit)

**Files:**
- Create: `src/pages/Read/useFocusMode.js`
- Test: `tests/pages/Read/useFocusMode.test.jsx`

**Interfaces:**
- Consumes: `getAmbienceMixerService` from Task 1.
- Produces: `export function useFocusMode(active, setActive, service?)` — while `active`, a global `Escape` keydown calls `setActive(false)`; on the `active` true→false transition it calls `service.stop()` (fade ambience out). Default `service` is the singleton.

- [ ] **Step 1: Write the failing test**

Create `tests/pages/Read/useFocusMode.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useFocusMode } from '../../../src/pages/Read/useFocusMode.js';

function Harness({ active, setActive, service }) {
  useFocusMode(active, setActive, service);
  return <div data-testid="harness" />;
}

describe('useFocusMode', () => {
  it('pressing Escape while active calls setActive(false)', () => {
    const setActive = vi.fn();
    const service = { stop: vi.fn() };
    render(<Harness active setActive={setActive} service={service} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setActive).toHaveBeenCalledWith(false);
  });

  it('Escape does nothing when inactive', () => {
    const setActive = vi.fn();
    const service = { stop: vi.fn() };
    render(<Harness active={false} setActive={setActive} service={service} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setActive).not.toHaveBeenCalled();
  });

  it('fades ambience out on the active true to false transition', () => {
    const setActive = vi.fn();
    const service = { stop: vi.fn() };
    const { rerender } = render(<Harness active setActive={setActive} service={service} />);
    rerender(<Harness active={false} setActive={setActive} service={service} />);
    expect(service.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop ambience on initial inactive mount', () => {
    const service = { stop: vi.fn() };
    render(<Harness active={false} setActive={vi.fn()} service={service} />);
    expect(service.stop).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Read/useFocusMode.test.jsx`
Expected: FAIL — cannot resolve `useFocusMode.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/Read/useFocusMode.js`:

```js
import { useEffect, useRef } from 'react';
import { getAmbienceMixerService } from '../../lib/ambient/ambienceMixer.service.js';

export function useFocusMode(active, setActive, service = getAmbienceMixerService()) {
  const prevActive = useRef(active);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActive(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, setActive]);

  useEffect(() => {
    if (prevActive.current && !active) service.stop();
    prevActive.current = active;
  }, [active, service]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/Read/useFocusMode.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Read/useFocusMode.js tests/pages/Read/useFocusMode.test.jsx
git commit -m "feat(focus): useFocusMode Esc-exit and fade-on-exit hook" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire focus mode into the IDE (ReadPage + IDEChrome + CSS)

This task has no isolated unit test (rendering the full `ReadPage` requires the whole IDE provider tree). It is verified by (a) the existing suite staying green, (b) a production build succeeding, and (c) a manual run checklist. Keep each edit minimal.

**Files:**
- Modify: `src/pages/Read/IDEChrome.jsx` (TopBar: new props + bar M button)
- Modify: `src/pages/Read/ReadPage.jsx` (state, wrapper class, render tray/button, hook)
- Modify: `src/pages/Read/IDE.css` (focus rules + tray/button styling)

**Interfaces:**
- Consumes: `FocusModeButton` (Task 4), `AmbienceTray` (Task 3), `useFocusMode` (Task 5).
- Produces: a `focusMode` boolean in `ReadPage`; the wrapper gains `ide-layout-wrapper--focus`.

- [ ] **Step 1: Add focus props + bar button to `TopBar`**

In `src/pages/Read/IDEChrome.jsx`, add the import at the top (after the existing imports near line 4):

```jsx
import FocusModeButton from './FocusModeButton.jsx';
```

Add `focusMode` and `onToggleFocus` to the `TopBar` destructured props (the `export function TopBar({ ... })` list that ends with `onSettingsClick,` at ~line 237):

```jsx
  onSettingsClick,
  focusMode,
  onToggleFocus,
```

Render the button inside the `ide-topbar-right` cluster, immediately before the existing Settings button (`<button className="ide-icon-btn" title="Settings" ...>` at ~line 306):

```jsx
        <FocusModeButton variant="bar" active={focusMode} onToggle={onToggleFocus} />
```

- [ ] **Step 2: Wire state + render into `ReadPage`**

In `src/pages/Read/ReadPage.jsx`, add imports near the other Read-page imports (e.g. after the `ToolsSidebar` import at line 49):

```jsx
import AmbienceTray from './AmbienceTray.jsx';
import FocusModeButton from './FocusModeButton.jsx';
import { useFocusMode } from './useFocusMode.js';
```

Add state next to the other `useState` panel flags (near `showOraclePanel` at ~line 244):

```jsx
  const [focusMode, setFocusMode] = useState(false);
```

Activate the hook (place it with the other hooks in the component body, after the state declarations):

```jsx
  useFocusMode(focusMode, setFocusMode);
```

Change the wrapper `className` (line 1196) from:

```jsx
      className="ide-layout-wrapper"
```

to:

```jsx
      className={`ide-layout-wrapper${focusMode ? ' ide-layout-wrapper--focus' : ''}`}
```

Pass the focus props into `<TopBar ... />` (the prop list ending with `onSettingsClick={...}` near line 1224) by adding:

```jsx
        focusMode={focusMode}
        onToggleFocus={() => setFocusMode((v) => !v)}
```

Render the floating button + tray. Immediately after the closing `</main>` and the `<StatusBar ... />` block (StatusBar ends ~line 1597), add:

```jsx
      {focusMode && (
        <>
          <FocusModeButton variant="floating" active onToggle={() => setFocusMode(false)} />
          <AmbienceTray />
        </>
      )}
```

- [ ] **Step 3: Add focus-mode CSS**

Append to `src/pages/Read/IDE.css`:

```css
/* ── Writer focus mode ─────────────────────────────────────────────── */
/* Class names verified against ReadPage.jsx / IDEChrome.jsx:
   chrome = .ide-topbar/.ide-statusbar, ambient = .ide-ambient-canvas,
   left activity bar = .activity-icons-col, left files/tools = .ide-sidebar,
   right analysis = .ide-right-panel, resize handles = .sidebar-resize-handle,
   editor wrappers = .codex-workspace > .document-container (center Panel has no class). */
.ide-layout-wrapper--focus .ide-topbar,
.ide-layout-wrapper--focus .ide-statusbar,
.ide-layout-wrapper--focus .ide-ambient-canvas,
.ide-layout-wrapper--focus .activity-icons-col,
.ide-layout-wrapper--focus .ide-sidebar,
.ide-layout-wrapper--focus .ide-right-panel,
.ide-layout-wrapper--focus .sidebar-resize-handle {
  display: none !important;
}

.ide-layout-wrapper--focus .ide-main-content {
  padding: 0;
}

/* react-resizable-panels sets inline flex on panels; switching the group to
   block lets the (now only-visible) center editor panel span full width. */
.ide-layout-wrapper--focus .ide-panel-group {
  display: block;
}

.ide-layout-wrapper--focus .codex-workspace,
.ide-layout-wrapper--focus .document-container {
  max-width: 78ch;
  margin: 0 auto;
  width: 100%;
}

/* Engraved red M button */
.focus-mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 60, 60, 0.55);
  border-radius: 6px;
  background: radial-gradient(circle at 50% 30%, #7a1414, #3a0808);
  color: #ffb3b3;
  cursor: pointer;
}
.focus-mode-btn__glyph {
  font-weight: 700;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8), 0 -1px 0 rgba(255, 120, 120, 0.4);
}
.focus-mode-btn--bar { width: 28px; height: 28px; }
.focus-mode-btn--floating {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  z-index: 60;
  box-shadow: 0 0 16px rgba(255, 40, 40, 0.45);
}
.focus-mode-btn--active { box-shadow: 0 0 12px rgba(255, 40, 40, 0.7); }

/* Ambience tray */
.ambience-tray {
  position: fixed;
  bottom: 18px;
  right: 18px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  min-width: 220px;
  background: rgba(12, 12, 18, 0.86);
  border: 1px solid var(--ritual-border, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  backdrop-filter: blur(8px);
  color: var(--ritual-ink, #e8e8f0);
}
.ambience-tray__head { display: flex; justify-content: space-between; align-items: center; }
.ambience-tray__title { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8; }
.ambience-tray__row { display: flex; align-items: center; gap: 10px; }
.ambience-tray__toggle {
  flex: 0 0 9.5rem;
  text-align: left;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.ambience-tray__toggle[aria-pressed='true'] {
  border-color: var(--active-school-glow, rgba(120, 200, 255, 0.6));
  background: rgba(255, 255, 255, 0.06);
}
.ambience-tray__toggle:disabled { opacity: 0.4; cursor: not-allowed; }
.ambience-tray__collapse,
.ambience-tray__fab {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
}
.ambience-tray__fab {
  position: fixed;
  bottom: 18px;
  right: 18px;
  z-index: 60;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(12, 12, 18, 0.86);
  border: 1px solid var(--ritual-border, rgba(255, 255, 255, 0.12));
}

@media (prefers-reduced-motion: reduce) {
  .focus-mode-btn { transition: none; }
}
```

- [ ] **Step 4: Verify the suite still passes and the build succeeds**

Run: `npx vitest run tests/pages/Read tests/accessibility.test.jsx`
Expected: PASS for all new Read tests; `accessibility.test.jsx` shows the same 3 pre-existing failures as before this work (collab links in the closed mobile menu) and **no new** failures.

Run: `npm run build`
Expected: build completes with no errors referencing the new files.

- [ ] **Step 5: Manual run checklist**

Run the app (`npm run dev`), open `/read`, then confirm:
1. A small red **M** button is in the IDE top bar.
2. Clicking it hides the top bar, side panels, right panel, and status bar; the editor is centered; the ambience tray and a floating red **M** appear.
3. The text you had typed is still present (editor did not reset) — confirms no remount.
4. Toggle **Rain** → rain loop fades in; toggle **Café Plaza** and **Wind** → they blend; master + per-channel sliders change levels.
5. Press **Esc** (or click the floating **M**) → chrome returns, ambience fades out.
6. Re-enter focus mode → your previous channel/volume selections are restored from `localStorage`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Read/IDEChrome.jsx src/pages/Read/ReadPage.jsx src/pages/Read/IDE.css
git commit -m "feat(focus): wire focus mode + ambience tray into the Scribe IDE" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Ambient audio assets

**Files:**
- Create: `public/audio/ambience/rain.mp3`, `public/audio/ambience/cafe.mp3`, `public/audio/ambience/wind.mp3`
- Create: `public/audio/ambience/CREDITS.md`

**Interfaces:**
- Consumes: the `AMBIENCE_ASSETS` path contract from Task 1 (`/audio/ambience/<id>.mp3`).
- Produces: three seamless looping audio beds served at those URLs.

- [ ] **Step 1: Source three CC0 / public-domain loops**

Obtain seamless loops (trim at zero-crossings so they loop gaplessly), one each for:
- `rain` — steady rain, no thunder spikes.
- `cafe` — café / coffee-plaza murmur (indistinct chatter + crockery).
- `wind` — wind moving through a house (low, breathy, no gusumps/clipping).

Recommended CC0 sources: freesound.org (filter License = "Creative Commons 0"), or Pixabay audio. Target ~60–120s each, ~128–192 kbps MP3, mono or stereo, normalized to roughly -18 LUFS so the master slider has headroom.

Place them at the exact paths:
- `public/audio/ambience/rain.mp3`
- `public/audio/ambience/cafe.mp3`
- `public/audio/ambience/wind.mp3`

- [ ] **Step 2: Record provenance**

Create `public/audio/ambience/CREDITS.md`:

```markdown
# Ambience Loop Credits

All loops are CC0 / public domain unless noted.

| Channel | File | Source URL | Author | License |
| --- | --- | --- | --- | --- |
| Rain | rain.mp3 | <source-url> | <author> | CC0 |
| Café Plaza | cafe.mp3 | <source-url> | <author> | CC0 |
| Wind through a house | wind.mp3 | <source-url> | <author> | CC0 |

Loops trimmed at zero-crossings for gapless looping. Replace any file in
place to swap a soundscape — filenames are the contract used by
`src/lib/ambient/ambienceMixer.service.js`.
```

Fill the `<source-url>` / `<author>` cells with the actual sources you used.

- [ ] **Step 3: Verify the files exist and are non-empty**

Run: `ls -l public/audio/ambience/ && file public/audio/ambience/*.mp3`
Expected: three `.mp3` files, each non-zero size, reported as audio (MPEG ADTS / Audio).

- [ ] **Step 4: Manual playback check**

Run the app (`npm run dev`), open `/read`, enter focus mode, and toggle each channel. Expected: each plays a clean, seamless loop with no audible seam at the loop point.

- [ ] **Step 5: Commit**

```bash
git add public/audio/ambience/
git commit -m "assets(focus): CC0 rain / cafe / wind ambience loops" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage:** focus toggle (T6) · hide all chrome + center editor (T6 CSS) · no remount (T6 CSS-only, verified manually step 3) · layered mixer w/ per-channel + master (T1/T3) · M button TopBar + floating + Esc (T4/T5/T6) · fade-out on exit + mix persistence + focus not persisted (T1/T2/T5) · CC0 assets + filename contract (T7) · a11y aria-pressed/aria-label + axe-covered patterns (T3/T4) · error handling: autoplay-on-gesture (T1 `setChannelEnabled`→`start`), asset-failure availability (T1 `_fail` test), reduced motion (T6 CSS). All covered.

**Placeholder scan:** the only intentionally-templated content is the CREDITS table cells in T7 (real URLs filled at sourcing time) — unavoidable for third-party assets. No `TBD`/`add error handling`/"write tests for the above" placeholders elsewhere; every code step ships complete code.

**Type consistency:** `createAmbienceMixerService({ createEngine })`, engine method names (`setChannelGain`, `setMasterGain`, `resume`, `suspend`, `onAvailabilityChange`), service methods, state shape (`{running,master,channels:{enabled,volume,available}}`), `AMBIENCE_STORAGE_KEY`, and the `useAmbienceMixer(service?)` / `AmbienceTray({service})` / `useFocusMode(active,setActive,service?)` signatures are identical everywhere they appear across tasks.

**Risk to watch during execution:** the T6 focus-mode CSS selectors are verified against the current `ReadPage.jsx` / `IDEChrome.jsx` markup (`.ide-topbar`, `.ide-statusbar`, `.ide-ambient-canvas`, `.activity-icons-col`, `.ide-sidebar`, `.ide-right-panel`, `.sidebar-resize-handle`, editor wrappers `.codex-workspace` / `.document-container`). The remaining uncertainty is the `display:block` full-width override interacting with `react-resizable-panels`' inline flex styles and any **nested** panel group around `.ide-right-panel`; at T6 step 5 confirm the editor actually centers and the right panel is gone, and tighten selectors if not. This is the one place reality may differ from the plan.
