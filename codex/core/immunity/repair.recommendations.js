/**
 * REPAIR RECOMMENDATIONS -- The Healing Layer
 *
 * Each repair entry follows the same shape as `getRecoveryHintsForError`
 * from `codex/core/pixelbrain/bytecode-error.js`, so downstream agents
 * (CI bot comments, dashboard, IDE bridges) can render them uniformly.
 *
 * Schema:
 *   {
 *     key:          string                  Stable lookup key (referenced by rules)
 *     title:        string                  One-line headline
 *     suggestions:  string[]                Concrete actionable steps
 *     constraints:  string[]                Invariants the fix must satisfy
 *     invariants:   string[]                Code-level predicates
 *     references:   string[]                Encyclopedia / bug-fix-plan links
 *     canonical:    string?                 Canonical replacement path/symbol (when known)
 *   }
 *
 * Reference: ARCH-2026-04-26-IMMUNE-SYSTEM.md § "Repair Recommendations"
 */

export const REPAIR_RECOMMENDATIONS = Object.freeze({
  'repair.math-random.seeded': {
    key: 'repair.math-random.seeded',
    title: 'Replace Math.random() with seeded RNG', // EXEMPT
    suggestions: [
      "Replace `Math.random()` with `seedrandom(seed)` from a deterministic source.", // EXEMPT
      "Combat seeds derive from `combatId + turn`. Visual seeds derive from session context.",
      "If this is intentional visual jitter, annotate with `// IMMUNE_ALLOW: math-random`.",
    ],
    constraints: [
      'Determinism: the same input must produce the same output across runs.',
      'No entropy may enter scoring or combat resolution paths.',
    ],
    invariants: ['typeof seed === "number" || typeof seed === "string"'],
    references: ['ARCH_CONTRACT_OVERLAY_INTEGRITY.md', 'ARCH-2026-04-26-IMMUNE-SYSTEM.md'],
    canonical: 'seedrandom(combatSeed)',
  },

  'repair.unseeded-clock.pipeline-context': {
    key: 'repair.unseeded-clock.pipeline-context',
    title: 'Use authoritative pipeline clock',
    suggestions: [
      'Use the `clock` provided by the pipeline context instead of `Date.now()` / `performance.now()`.', // EXEMPT
      'Cross-browser parity requires a single authoritative timesource.',
    ],
    constraints: [
      'Hot paths (scoring, rendering, resolve, compute) must use the pipeline clock.',
      'Test files are exempt.',
    ],
    invariants: ['ctx.clock !== undefined && typeof ctx.clock.now === "function"'],
    references: ['ARCH-2026-04-26-IMMUNE-SYSTEM.md'],
  },

  'repair.forbidden-import.bridge-via-lib': {
    key: 'repair.forbidden-import.bridge-via-lib',
    title: 'Move logic out of UI into Codex runtime',
    suggestions: [
      'Move the imported logic to `codex/runtime/<name>.pipeline.js`.',
      'Expose it via a `/api/...` endpoint mounted in `codex/server/index.js`.',
      'Consume from UI via `fetch` or via a thin adapter in `src/lib/`.',
    ],
    constraints: [
      'UI components must not reach into `codex/` directly.',
      '`src/lib/` is the only legal bridge surface.',
    ],
    invariants: [
      '!filePath.startsWith("src/components/") || !importPath.includes("/codex/")',
    ],
    references: ['CLAUDE.md § Architecture Contracts', 'AGENTS.md § Hard Stops'],
    canonical: 'src/lib/<adapter>.js → fetch("/api/...")',
  },

  'repair.environment-gated-authority.name-the-degradation': {
    key: 'repair.environment-gated-authority.name-the-degradation',
    title: 'An environment gate must not silently downgrade an authority',
    suggestions: [
      'Return a NAMED degraded state, not a bare `false` or a plausible value: `{ ok: false, reason: "no dictionary in this runtime" }`.',
      'Better: do not compute the authority here at all. Serve it from the backend and consume the served value.',
      'If the gate is a legitimate capability probe, the caller must be forced to read the reason — a boolean the caller can ignore is how this reaches production.',
      'If this branch is genuinely equivalent, annotate `// IMMUNE_ALLOW: environment-gated-authority` and say why it is equivalent.',
    ],
    constraints: [
      'The same input must not produce two different truths in two runtimes.',
      'A degraded path must be distinguishable from a healthy one BY THE CALLER, not only by reading this file.',
    ],
    invariants: [
      'typeof window === "undefined" gates a CAPABILITY, never a silent change of answer',
    ],
    references: [
      'ARCH_RULE_BACKEND_TRUTH_AUTHORITY',
      'BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK',
      'codex/core/phonology/cmu.phoneme.engine.js:120 — the original',
    ],
    canonical: 'if (isBrowser) return { ok: false, reason: "dictionary unavailable in browser" };',
  },

  'repair.ui-shadow-computation.consume-backend-truth': {
    key: 'repair.ui-shadow-computation.consume-backend-truth',
    title: 'The UI must consume backend truth, never recompute it',
    suggestions: [
      'Call the endpoint that already computes this and render what it returns.',
      'If no endpoint exists, add one; a shadow computation in the UI is not a substitute for the seam.',
      'A thin adapter in `src/lib/` may TRANSPORT the value. It may not derive it.',
    ],
    constraints: [
      'Frontend display reflects backend state and does not recompute it.',
      'A UI-side engine that degrades when its data source is absent will disagree with the backend silently, and the tests will agree with the UI because jsdom defines `window`.',
    ],
    invariants: [
      '!filePath.startsWith("src/") || !importsTruthEngine(importPath)',
    ],
    references: [
      'ARCH_RULE_BACKEND_TRUTH_AUTHORITY',
      'BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK',
      'src/pages/Visualiser/truesightColor.ts — the original',
    ],
    canonical: 'const { vowelFamily } = await fetch("/api/analysis/panels", ...)',
  },

  'repair.duplicate-path.canon': {
    key: 'repair.duplicate-path.canon',
    title: 'Reroute through the canonical path',
    suggestions: [
      'The shadow path was deleted in the Corruption Cleansing. Do not re-introduce it.',
      'Import from the canonical path declared in `DUPLICATE_PATH_CANON` (innate.rules.js).',
      'If you believe the canon is wrong, file an `IMMUNE_OVERRIDE` with `IMMUNE_AUTHORITY: Angel`.',
    ],
    constraints: [
      'Only one substrate per surface may exist.',
      'Re-resurrecting a deleted shadow requires Angel co-sign.',
    ],
    invariants: ['canonicalPath.exists && !forbiddenPaths.some(p => p.exists)'],
    references: ['dead-code.md', 'BUG-FIX-PLAN-2026-04-26-DISCONNECTED-LOGIC.md'],
  },

  'repair.known-violation.cleansing': {
    key: 'repair.known-violation.cleansing',
    title: 'Forbidden symbol -- replaced during cleansing',
    suggestions: [
      'This symbol was removed in the Corruption Cleansing of 2026-04-26.',
      'Look up the replacement in the linked encyclopedia entry.',
      'Do not re-introduce the symbol under a new name -- that is detected by Layer 2 (adaptive).',
    ],
    constraints: ['Purged symbols must not return.'],
    invariants: ['!forbiddenSymbols.some(s => content.includes(s))'],
    references: ['ARCH-2026-04-26-IMMUNE-SYSTEM.md', 'dead-code.md'],
  },

  'repair.session.save-uninitialized': {
    key: 'repair.session.save-uninitialized',
    title: 'Fastify session must initialize for guests',
    suggestions: [
      'Set `saveUninitialized: true` in Fastify session options.',
      'The `/auth/csrf-token` route requires a session object even for new guests; otherwise it 500s.',
    ],
    constraints: ['Guests must receive a CSRF token without 500s.'],
    invariants: ['fastifySessionOptions.saveUninitialized === true'],
    references: ['BUG-2026-CSRF-GUEST-500'],
    canonical: 'saveUninitialized: true',
  },

  'repair.recursion.alias-imports': {
    key: 'repair.recursion.alias-imports',
    title: 'Avoid infinite recursion via aliased imports',
    suggestions: [
      'Rename the imported function to avoid collision with the service method name.',
      'Use the `Internal` suffix for imports: `import { foo as fooInternal }`.',
      'Ensure the service method calls the `Internal` alias instead of itself.',
    ],
    constraints: [
      'Maximum recursion depth must be respected (Law 18 threshold).',
      'Names must be distinct within the local execution context.',
    ],
    invariants: ['importedSymbol !== localMethodName'],
    references: ['BUG-2026-04-27-RECURSIVE-SHADOW'],
    canonical: 'import { x as xInternal }',
  },

  'repair.infra.port-alignment': {
    key: 'repair.infra.port-alignment',
    title: 'Align infrastructure ports across environments',
    suggestions: [
      'The project is migrating from Render (port 3000) to Fly.io (port 8080).',
      'Update local .env and documentation to use 8080.',
      'Ensure Docker EXPOSE and Fastify PORT default to 8080.',
      'Sync all agent connection scripts to the new authoritative port.',
    ],
    constraints: [
      'Local development must mirror production networking topology.',
    ],
    invariants: ['Dockerfile.PORT === index.js.PORT === documentation.PORT'],
    references: ['ARCH-PDR-ZERO-COST-INFRA', 'BUG-2026-04-26-IPV6-PROXY-BLINDNESS'],
    canonical: 'PORT=8080',
  },

  'repair.handshake.centralized-csrf': {
    key: 'repair.handshake.centralized-csrf',
    title: 'Centralize CSRF handshake in useAuth hook',
    suggestions: [
      'Avoid calling getCsrfToken() manually in every component.',
      'The useAuth hook handles the initial handshake and token management.',
      'If a request fails with 403, use clearCsrfToken() and the next request will auto-refresh.',
      'Redundant fetches can cause race conditions during cookie rotation.',
    ],
    constraints: [
      'Handshake must be atomic to prevent session fragmentation.',
    ],
    invariants: ['Only useAuth.jsx initiates the primary handshake.'],
    references: ['BUG-2026-04-27-RECURSIVE-FRAGMENTATION'],
    canonical: 'const { token } = useAuth();',
  },

  'repair.phoneme.relative-bridge': {
    key: 'repair.phoneme.relative-bridge',
    title: 'Restore Phoneme Engine Bridge',
    suggestions: [
      'Fix the relative import depth in `vowelFamily.js`.',
      "Use `./vowelWheel.js` for sibling imports instead of reaching up to root.",
      "The 'Assonance Logic Collapse' occurs when family identities fail to resolve during analysis.",
    ],
    constraints: [
      'Core modules must use stable sibling/child relative paths.',
      'PhonemeEngine must resolve FAMILY_IDENTITY to produce resonant bytecode.',
    ],
    invariants: [
      'importPath === "./vowelWheel.js"',
    ],
    references: ['BUG-2026-05-09-PHONEME-SEVERANCE'],
    canonical: "import { FAMILY_IDENTITY } from './vowelWheel.js';",
  },

  'repair.color-authority.unify': {
    key: 'repair.color-authority.unify',
    title: 'Collapse competing color authorities to one source',
    suggestions: [
      'A per-school resolver that ignores its `school` argument is a dead skin: either honor the argument or delete the parameter and rename the function to reflect that the palette is school-invariant.',
      'The authoritative token color is `bytecode.color` from the `phonetic_color` amplifier plugin (family -> school -> hue). Treat it as the single source; reserve the rhyme resonance registry as the only override (rhyme mode).',
      'Retire redundant generators and the deep `color = a || b || c || d || e` fallback stack -- each fallback tier should resolve a distinct, documented case, not re-derive the same family hue.',
    ],
    constraints: [
      'One generator owns family -> color; overrides must be explicit and scoped (e.g. rhyme resonance), not silent fallbacks.',
      'No public API may advertise a parameter it ignores.',
      'Coloring output for non-rhyme words must be unchanged after unification (verify with the TrueSight color differential).',
    ],
    invariants: [
      'A `getX(arg)` whose body ignores `arg` must not ship; drop the param or honor it.',
    ],
    references: ['AUDIT-2026-06-04-COLOR-AUTHORITY-DISPARITY'],
    canonical: 'color = bytecode.color ?? resonanceColor(rhymeKey)  // single authority + scoped rhyme override',
  },

  'repair.overlay-metrics.inherit': {
    key: 'repair.overlay-metrics.inherit',
    title: 'Keep measured Truesight overlay-word glyph advance equal to the canvas measurement',
    suggestions: [
      'Signify rarity / emphasis on a measured overlay word with GLOW (text-shadow, color, filter) -- never with font-weight, letter-spacing, font-size, or text-transform, which change the rendered glyph advance the canvas measured.',
      'If a word class must carry a metric property, set it to `inherit` so the painted advance matches the wrapper base font (adaptiveWhitespaceGrid) the box was measured at.',
      'To style the non-word filler between words, target it through a `:not(.truesight-word):not(.grimoire-word)...` complement selector -- those spans are excluded from the measured lattice, so metric changes on them are safe.',
    ],
    constraints: [
      'A measured overlay word stays positioned by its canvas measureText() box; the painted glyphs must not drift out of it.',
      'Any advance-changing metric property on a measured-word selector must resolve to `inherit`.',
    ],
    invariants: [
      'measureText(word @ base font) === painted advance(word) -- boxes stay in sync, the whole word stays clickable, later words do not drift.',
    ],
    references: ['BUG-2026-06-20-TRUESIGHT-LATTICE-METRIC-DRIFT'],
    canonical: '.vb-rarity--rare { text-shadow: 0 0 4px currentColor; }  /* glow, not font-weight/letter-spacing */',
  },

  'repair.syntax-prion.sanitize': {
    key: 'repair.syntax-prion.sanitize',
    title: 'Remove stray characters that break syntax before the parser even runs',
    suggestions: [
      'Delete invisible / zero-width characters -- they are invisible in editors but break parsers.',
      'Replace smart quotes / em-dashes with ASCII equivalents (e.g. curly quotes -> straight, em-dash -> --).',
      'Check for copy-paste artifacts from LLMs or word processors that introduce typographic unicode.',
    ],
    constraints: [
      'All source files must consist of standard printable ASCII + expected Unicode for string literals.',
      'No zero-width, non-joiner, BOM, soft-hyphen, or bidirectional-override characters allowed.',
    ],
    invariants: [
      'No character in [\\u200B-\\u200F, \\uFEFF, \\u00AD, \\u2060-\\u2064]',
      'No character in [\\u201C\\u201D\\u2018\\u2019\\u2014\\u2013\\u00A0\\u2026]',
    ],
    references: ['ARCH-2026-04-26-IMMUNE-SYSTEM.md'],
    canonical: null,
  },
});

/**
 * Look up a repair recommendation by key.
 * Returns a frozen "unknown" stub if the key is not registered, so callers
 * never crash from missing entries.
 */
export function getRepair(key) {
  if (!key) return UNKNOWN_REPAIR;
  return REPAIR_RECOMMENDATIONS[key] || UNKNOWN_REPAIR;
}

const UNKNOWN_REPAIR = Object.freeze({
  key: 'repair.unknown',
  title: 'No repair recommendation registered',
  suggestions: [
    'File an encyclopedia entry describing the violation.',
    'Add a corresponding `repair.*` key to `repair.recommendations.js`.',
  ],
  constraints: [],
  invariants: [],
  references: ['ARCH-2026-04-26-IMMUNE-SYSTEM.md'],
});
