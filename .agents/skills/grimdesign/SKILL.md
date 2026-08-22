---
name: grimdesign
description: Generate Scholomance world-law UI specs from natural-language design intent. Use when asked for GrimDesign, /grimdesign, a phonemic UI/component design spec, a Scholomance UI surface whose color/glow/motion should be derived from CODEx analysis, or implementation guidance from docs/scholomance-encyclopedia/PDR-archive/grimdesign_pdr.md.
---

# GrimDesign

Generate UI SPEC output where the visual treatment is computed from Scholomance phonemic signals, not chosen by preference.

## Workflow

1. Read the active Scholomance law files if you have not already in this turn:
   `SHARED_PREAMBLE.md`, `VAELRIX_LAW.md`, `SCHEMA_CONTRACT.md`, and the active agent contract.
2. Treat `docs/scholomance-encyclopedia/PDR-archive/grimdesign_pdr.md` as the product source.
3. Get a `GrimSignal` and `GrimDesignDecisions` for the user intent:
   ```bash
   node .Codex/skills/grimdesign/scripts/grimdesign.mjs "VOID cooldown indicator"
   ```
4. Use the script output as the basis for the response or implementation. If editing UI, still produce the repo-required UI SPEC before changing files.
5. Respect ownership boundaries:
   - Codex owns `codex/core/grimdesign/*` and `codex/server/routes/grimdesign.routes.js`.
   - Codex/UI owns `.Codex/skills/grimdesign/*`, `.Codex/commands/grimdesign.md`, `src/hooks/useGrimDesign.js`, and `src/pages/Read/GrimDesignPanel.*`.
   - Do not invent schema fields outside `SCHEMA_CONTRACT.md`.

## Signal Source

Prefer the server route:

```http
POST http://localhost:3000/api/grimdesign/analyze
Content-Type: application/json

{ "intent": "<design intent>" }
```

If the server is unavailable, use local CODEx modules:

- `codex/core/grimdesign/intentAnalyzer.js`
- `codex/core/grimdesign/decisionEngine.js`

If local imports fail, use a clearly marked heuristic fallback. The fallback may scan for school keywords (`VOID`, `SONIC`, `PSYCHIC`, `ALCHEMY`, `WILL`, `NECROMANCY`, `ABJURATION`, `DIVINATION`) and should label the result `[HEURISTIC - server not running]`.

## Output Contract

Return this structure:

```markdown
## [ComponentName] - GrimDesign Output

CLASSIFICATION: [new component / style change / layout / animation]
WHY: [decisions.worldLawReason]
WORLD-LAW CONNECTION: [dominantSchool/effectClass/blendedHsl provenance]

SIGNAL PROVENANCE:
  [signal.provenance lines]

DESIGN DECISIONS:
  color:        [decisions.color]
  glow:         [none OR 0 0 <glowRadius>px <decisions.glowColor>]
  border:       1px solid hsla(...)
  animation:    [none OR <animationClass> <animationDurationMs>ms ease-in-out]
  atmosphere:   [atmosphereLevel][ + scanlines]
  complexity:   [componentComplexity] ([description])
  transition:   [transitionMs]ms

CODE:
[JSX skeleton using --grim-color, --grim-glow, --grim-border,
--grim-transition, --grim-font-size, --grim-font-weight]

CSS DELTA:
[Scoped CSS classes and keyframes. Wrap motion in
@media (prefers-reduced-motion: no-preference).]

HANDOFF TO BLACKBOX:
[visual baselines affected]

QA CHECKLIST:
- [ ] No logic imported from codex/ or src/lib/
- [ ] State via hooks/context only
- [ ] ARIA labels present
- [ ] Reduced motion respected
- [ ] School CSS variables consumed, not hardcoded
- [ ] No inline styles for state
- [ ] dangerouslySetInnerHTML sanitized if used
```

Complexity meanings:

- `1`: single surface
- `2`: header + body
- `3`: header + body + footer/meta row
- `4`: full card with multiple sections

## Implementation Rules

- Keep outputs traceable: every color, glow, border, motion, atmosphere, and complexity decision should cite `signal` or `decisions`.
- Use existing CSS variables and school theming. Avoid hardcoded school palettes in component code.
- Use `@media (prefers-reduced-motion: no-preference)` for generated animation classes.
- Do not put gameplay/scoring authority in the UI. GrimDesign consumes analysis output; it does not resolve game mechanics.
- For ambiguous or empty intent, say the output is fallback/low-confidence rather than silently producing generic UI.
