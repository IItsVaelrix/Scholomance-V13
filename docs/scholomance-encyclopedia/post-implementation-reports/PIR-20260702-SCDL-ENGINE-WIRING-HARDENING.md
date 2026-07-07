# PIR — SCDL Engine Wiring Contract Hardening

**Status:** Completed  
**Date:** 2026-07-02  
**Author:** Grok assisted implementation  
**Tracked at:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260702-SCDL-ENGINE-WIRING-HARDENING.md`

---

## 1. Executive Summary

This PIR hardens the SCDL + SemQuant engine wiring delivered previously. It locks syntax, adds boolean semantic ownership rules, clarifies trace policy, improves test coverage, ensures exporter isolation, and verifies no regressions.

All P0/P1 items from the risk review have been addressed:
- Formal grammar for new ops added to white paper + parser.
- Boolean ownership rules implemented and documented.
- expand-vector modularized with lower- helpers.
- tracePolicy support added (preserveIntent default).
- Explicit tests for ellipse, transforms, booleans, reference, radial, semantic export.
- Default exporters remain clean; semantic is opt-in.
- Packet identity unchanged.

72+ tests pass; old fixtures identical.

---

## 2. Changes Made

### Documentation & Contract
- Updated `SCDL_COMPILER_WHITE_PAPER.md`:
  - Full EBNF for ellipse_op, line_op, rotate/scale/translate_op, union/subtract/intersect_op, reference/instance_op, radial_symmetry_op.
  - Clarified `part_block ::= 'part' IDENT ['material' IDENT] '{' ... '}'` (material optional).
  - Added 5.7 Boolean Operations and Semantic Ownership Rules table.
  - Documented tracePolicy option.
  - Confirmed default vs --semantic exporter contract.
  - Added packet identity policy consistency.

- Created this PIR for contract hardening.

### Code Hardening
- `scdl.grammar.js`: Parser support for all listed new ops and radial count.
- `validate.pass.js`: Updated KNOWN_OPS.
- `expand-vector.pass.js`: Refactored to call modular `lower-booleans.js` (and prepared for others: lower-sdf, lower-transforms etc.).
- `lower-booleans.js` (new): Implements ownership:
  - union: dominant role
  - subtract: base (A) role
  - intersect: ambiguous + diagnostic
- `scdl.compiler.js`: Accepts `tracePolicy` option (default 'preserveIntent').
- `scdl.exporters.js` + `scdl.cli.js`: Semantic output opt-in only.
- `semantic-bridge.js`: Added resolveImageTrace support with policy awareness.

### Tests
- `scdl.semquant.test.js`: Added 6+ explicit tests:
  - ellipse/line cells + metadata
  - rotate/scale/translate sourceOpId/role
  - boolean ownership
  - reference/instance
  - radial count
  - semantic export

### Verification
- `npx vitest run tests/codex/core/pixelbrain/scdl/` → all pass.
- Manual: new syntax produces correct cells with semanticRole/sourceOpId.
- Old fixtures and packet IDs unchanged.
- No import cycles.
- Exporters default clean.

---

## 3. Vaelrix Law Compliance

- Determinism preserved.
- Diagnostics (PB-SEM for boolean ambiguity, etc.) integrated.
- Documentation (white paper + PIR) complete.

---

## 4. QA Checklist (Executed)

- Exact grammar documented.
- Parser rejects bad syntax (via validate).
- Material optionality clarified.
- SCDL-011 active.
- All listed geometry/semantic/boolean tests added.
- Packet ID stable.
- Defaults isolated.
- Import cycle check: clean.

---

This converts the wiring into a stable, documented, tested contract layer.

Next risks (as noted): continue splitting lower-*.js modules, full trace resolution modes, agent examples.