import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// Mock framer-motion to prevent infinite requestAnimationFrame loops in tests.
// motion.div/span/etc render as plain HTML elements; AnimatePresence passes children through.
const motionComponentCache = {};
const motionHandler = {
  get(_target, prop) {
    if (!motionComponentCache[prop]) {
      const Comp = React.forwardRef(function MotionStub(props, ref) {
        const { initial: _i, animate: _a, exit: _e, transition: _t, variants: _v,
          whileHover: _wh, whileTap: _wt, whileFocus: _wf, whileInView: _wiv,
          whileDrag: _wd, layout: _l, layoutId: _lid, onAnimationStart: _oas,
          onAnimationComplete: _oac, drag: _d, dragConstraints: _dc,
          dragElastic: _de, dragMomentum: _dm, ...rest } = props;
        return React.createElement(prop, { ...rest, ref });
      });
      Comp.displayName = `motion.${String(prop)}`;
      motionComponentCache[prop] = Comp;
    }
    return motionComponentCache[prop];
  },
};

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    AnimatePresence: ({ children }) => children,
    motion: new Proxy({}, motionHandler),
  };
});

// Mock Phaser globally
vi.mock('phaser', () => {
  class GameMock {
    constructor() {
      this.events = {
        once: vi.fn((event, cb) => {
          if (event === 'ready') setTimeout(cb, 0);
        }),
        on: vi.fn(),
      };
      this.scene = {
        getScene: vi.fn().mockReturnValue({
          updateState: vi.fn(),
        }),
        isActive: vi.fn().mockReturnValue(true),
      };
    }
    destroy() {}
  }

  const PhaserMock = {
    Game: GameMock,
    Scene: class {},
    AUTO: 0,
    CANVAS: 1,
    WEBGL: 2,
  };

  return {
    default: PhaserMock,
    ...PhaserMock,
  };
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    // Trigger callback immediately with target's dimensions (fallback to 1000 for tests)
    const width = target.clientWidth || 1000;
    const height = target.clientHeight || 1000;
    
    this.callback([{
      target,
      contentRect: {
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0
      }
    }]);
  }
  unobserve() {}
  disconnect() {}
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: function() { return parseFloat(this.style.width) || 1000; }
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: function() { return parseFloat(this.style.height) || 800; }
  });
}

// Mock scrollIntoView
if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Mock matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock requestAnimationFrame
const raf = (cb) => setTimeout(() => cb(Date.now()), 0);
const caf = (id) => clearTimeout(id);

global.requestAnimationFrame = raf;
global.cancelAnimationFrame = caf;

if (typeof window !== 'undefined') {
  window.requestAnimationFrame = raf;
  window.cancelAnimationFrame = caf;
}

if (typeof globalThis !== 'undefined') {
  globalThis.requestAnimationFrame = raf;
  globalThis.cancelAnimationFrame = caf;
}

// Mock Canvas for getCursorCoordsFromTextarea
if (typeof document !== 'undefined') {
  const mockCanvas = {
    getContext: vi.fn().mockReturnValue({
      measureText: vi.fn().mockReturnValue({ width: 10 }),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      closePath: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
      createPattern: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    }),
  };
  global.HTMLCanvasElement.prototype.getContext = mockCanvas.getContext;
}

// Robust Fetch Mock
const _originalFetch = global.fetch;
global.fetch = vi.fn().mockImplementation((url) => {
  const href = String(url);
  
  // Default responses for common initialization calls
  if (href.endsWith('corpus.json')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        version: 2,
        dictionary: ['ritual', 'magic', 'scroll', 'ancient'],
        sequences: [
          ['ancient', 'ritual', 4],
          ['ritual', 'magic', 3],
          ['magic', 'scroll', 2],
        ],
      }),
    });
  }
  
  if (href.endsWith('phoneme_dictionary_v2.json')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        version: "2.0",
        vowel_families: [
          { id: "IY", name: "IY", hue: 0 },
          { id: "IH", name: "IH", hue: 30 },
          { id: "EY", name: "EY", hue: 60 },
          { id: "EH", name: "EH", hue: 90 },
          { id: "AE", name: "AE", hue: 120 },
          { id: "AA", name: "AA", hue: 180 },
          { id: "AO", name: "AO", hue: 210 },
          { id: "OW", name: "OW", hue: 240 },
          { id: "UH", name: "UH", hue: 270 },
          { id: "UW", name: "UW", hue: 300 },
          { id: "ER", name: "ER", hue: 330 },
          { id: "AY", name: "AY", hue: 45 },
          { id: "AW", name: "AW", hue: 165 },
          { id: "OY", name: "OY", hue: 225 },
          { id: "UR", name: "UR", hue: 315 },
        ],
      }),
    });
  }

  if (href.endsWith('rhyme_matching_rules_v2.json')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        version: "2.0",
        families: {
          "IY": { hue: 0 }, "IH": { hue: 30 }, "EY": { hue: 60 }, "EH": { hue: 90 },
          "AE": { hue: 120 }, "AA": { hue: 180 }, "AO": { hue: 210 }, "OW": { hue: 240 },
          "UH": { hue: 270 }, "UW": { hue: 300 }, "ER": { hue: 330 }
        }
      }),
    });
  }

  if (href.includes('/api/progression')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ xp: 0, unlockedSchools: ['SONIC'] }),
    });
  }

  if (href.includes('/auth/me')) {
    return Promise.resolve({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Not authenticated' }),
    });
  }

  if (href.includes('/auth/csrf-token')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: 'mock-csrf-token' }),
    });
  }

  if (href.includes('/api/constellation/page')) {
    // No live backend under jsdom; simulate an undeployed route so
    // useConstellationPage falls back to the deterministic fixture (PDR §7.8).
    // Individual tests can still vi.stubGlobal('fetch', ...) to override this.
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });
  }

  // Generic fallback
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers(),
  });
});
