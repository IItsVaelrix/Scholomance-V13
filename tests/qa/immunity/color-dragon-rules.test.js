/**
 * THE COLOR DRAGON PAIR — regression fixtures for ARCH-0F0D / ARCH-0F0E.
 *
 * One recurring failure, two rules, because each half recurs on its own.
 * Recorded in SCDNA as `BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK` at 0.98
 * confidence, which is the system saying it has seen this before.
 *
 * The origin, measured 2026-08-13:
 *
 *   `cmu.phoneme.engine.js:120` reads `typeof window !== "undefined"`, sets
 *   `_available = false` and returns `false` — so a BROWSER has no pronunciation
 *   dictionary. `truesightColor.ts` then calls `analyzeDeep` in the browser and
 *   colours words from heuristic letter-splitting. Same word, two truths:
 *
 *     SILENCE   server  S AY1 L AH0 N S
 *               browser S IH0 L EH1 N K
 *
 *   3 of 8 sampled words disagreed on vowel family, which is what drives colour.
 *
 * NOTHING COULD HAVE CAUGHT IT. The degradation is a deliberate branch rather
 * than a swallowed error, so no cleri-probe family reaches it; and the tests run
 * under jsdom, where `window` is defined, so the test environment reproduces the
 * broken branch and agrees with itself.
 *
 * These fixtures are the counter-pressure. Each rule is pinned against BOTH the
 * shape it must catch and the shape it must leave alone, because the first draft
 * of ARCH-0F0D convicted eleven honest capability probes to reach one broken
 * oracle.
 */

import { describe, expect, it } from 'vitest';
import { INNATE_RULES } from '../../../codex/core/immunity/innate.rules.js';
import { getRepair } from '../../../codex/core/immunity/repair.recommendations.js';

const rule = id => INNATE_RULES.find(item => item.id === id);
const fires = (id, source, path) => Boolean(rule(id).detector(source, path));

const ENGINE = 'codex/core/phonology/fake.engine.js';
const UI = 'src/pages/Fake/fakeColor.ts';

describe('ARCH-0F0D — an environment gate must not downgrade an authority', () => {
  it('catches the hoisted-flag shape, which is the original', () => {
    // The probe is a module constant 110 lines above the gate. A detector that
    // required them adjacent missed the very file it was written for.
    expect(fires('ARCH-0F0D', `
const isBrowser = typeof window !== "undefined";

class Engine {
  async init() {
    if (isBrowser) {
      this._available = false;
      return false;
    }
    const fs = await import("node:fs/promises");
    this._dict = await fs.readFile(DICT_PATH, "utf8");
    return true;
  }
}
`, ENGINE)).toBe(true);
  });

  it('catches the inline-probe shape', () => {
    expect(fires('ARCH-0F0D', `
async function load() {
  if (typeof window !== "undefined") {
    return null;
  }
  const fs = await import("node:fs/promises");
  return fs.readFile(PATH, "utf8");
}
`, ENGINE)).toBe(true);
  });

  it('leaves a capability probe alone, because that answer is CORRECT', () => {
    // `usePrefersReducedMotion` under SSR genuinely has no preference to report.
    // Convicting it would make the rule noise, and noise gets rules disabled.
    expect(fires('ARCH-0F0D', `
export function usePrefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
`, 'src/hooks/usePrefersReducedMotion.js')).toBe(false);
  });

  it('does not let a later function supply the data load', () => {
    // The lookahead stops at a function boundary. Unbounded, it convicted
    // AuthContext, whose SSR guard is correct and which merely sits above a fetch.
    expect(fires('ARCH-0F0D', `
function hasSessionHint() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

async function refreshCsrf() {
  const response = await fetch("/api/csrf");
  return response.json();
}
`, 'src/context/FakeContext.jsx')).toBe(false);
  });

  it('accepts a degradation the caller can SEE', () => {
    // Naming the reason is the cure. The rule must stand down once it is applied,
    // or it punishes the fix.
    expect(fires('ARCH-0F0D', `
const isBrowser = typeof window !== "undefined";
async function init() {
  if (isBrowser) {
    return { ok: false, reason: "dictionary unavailable in this runtime" };
  }
  const fs = await import("node:fs/promises");
  return fs.readFile(PATH, "utf8");
}
`, ENGINE)).toBe(false);
  });

  it('honours an explicit waiver', () => {
    expect(fires('ARCH-0F0D', `
// IMMUNE_ALLOW: environment-gated-authority — reviewed, both branches equivalent
const isBrowser = typeof window !== "undefined";
async function init() {
  if (isBrowser) { return false; }
  const fs = await import("node:fs/promises");
  return fs.readFile(PATH, "utf8");
}
`, ENGINE)).toBe(false);
  });
});

describe('ARCH-0F0E — the UI must consume backend truth, not derive it', () => {
  it('catches a truth derivation in the UI layer', () => {
    expect(fires('ARCH-0F0E', 'const analysis = engine.analyzeDeep(word);', UI)).toBe(true);
    expect(fires('ARCH-0F0E', 'const a = phonemeEngine.analyzeWord(token);', UI)).toBe(true);
  });

  it('judges the CALL, not the import path', () => {
    // `src/lib/` is the sanctioned bridge, so importing an engine is legal and
    // an import-path rule would have missed the original entirely. Transporting
    // a computed value is fine; deriving one is not.
    const transport = `
import { PhonemeEngine } from '../../lib/engine.adapter.js';
export async function load(word) {
  const response = await fetch('/api/analysis/panels', { body: word });
  return response.json();
}`;
    expect(fires('ARCH-0F0E', transport, UI)).toBe(false);
  });

  it('leaves the same derivation alone outside the UI layer', () => {
    // The backend is where this SHOULD happen.
    expect(fires('ARCH-0F0E', 'const analysis = engine.analyzeDeep(word);', 'codex/server/services/x.js')).toBe(false);
  });

  it('honours an explicit waiver', () => {
    expect(fires('ARCH-0F0E', `
// IMMUNE_ALLOW: ui-shadow-computation — offline sketch mode, reviewed
const analysis = engine.analyzeDeep(word);`, UI)).toBe(false);
  });
});

describe('the premise that lets ranking stay off the derivation list', () => {
  it('orders tokens without consulting a locale', async () => {
    // ARCH-0F0E deliberately does NOT convict `rankGraphCandidates` in the UI,
    // on the grounds that pure ranking cannot diverge between runtimes. That is
    // only true while its tie-break is locale-free — and it was not: measured,
    // this comparison decides 492 of 757 judiciary ties, and `localeCompare`
    // ordered `ä` vs `z` differently under sv-SE and `i` vs `I` under tr-TR.
    // If this test goes, the ranking verbs go back on the list.
    const { stableTokenCompare } = await import('../../../codex/core/token-graph/types.js');

    for (const [left, right] of [['ä', 'z'], ['i', 'I'], ['resume', 'RESUME'], ['Æon', 'Aeon']]) {
      const byCodePoint = left === right ? 0 : (left < right ? -1 : 1);
      expect(stableTokenCompare(left, right), `${left} vs ${right} is not code-point ordered`)
        .toBe(byCodePoint);
    }
    expect(stableTokenCompare('a', 'a')).toBe(0);
  });
});

describe('both rules carry an executable repair', () => {
  it('resolves a registered repair, not the unknown placeholder', () => {
    for (const id of ['ARCH-0F0D', 'ARCH-0F0E']) {
      const repair = getRepair(rule(id).repairKey);
      expect(repair.key, `${id} has no registered repair`).not.toBe('repair.unknown');
      expect(repair.suggestions.length).toBeGreaterThan(0);
      expect(repair.title).toBeTruthy();
    }
  });

  it('is CRIT, because a silent fork of truth blocks a commit', () => {
    for (const id of ['ARCH-0F0D', 'ARCH-0F0E']) {
      expect(rule(id).severity).toBe('CRIT');
    }
  });
});
