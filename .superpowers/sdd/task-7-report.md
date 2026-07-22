# Task 7 Report — The Directed Orthogonality Matrix

## File created

`tests/visual/phenotype-orthogonality.spec.ts` — written verbatim from the brief's
Step 1 code block (`.superpowers/sdd/task-7-brief.md`), no modifications to the
spec logic, assertions, baseline, or mutation table.

## Command 1

```
npx playwright test tests/visual/phenotype-orthogonality.spec.ts --project=chromium --workers=1 --reporter=line
```

Output:

```
Running 5 tests using 1 worker

[1/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:130:3 › Phenotype orthogonality matrix (spec §3.4) › baseline measures every live axis — no nulls to hide behind
[2/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:138:3 › Phenotype orthogonality matrix (spec §3.4) › each mutation actually moves its own axis
[3/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:152:3 › Phenotype orthogonality matrix (spec §3.4) › 30 directed checks: mutating A never changes B's block
[4/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:186:3 › Phenotype orthogonality matrix (spec §3.4) › slot 0 never moves under any evidence mutation
[5/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:197:3 › Phenotype orthogonality matrix (spec §3.4) › a clip-path leaves density unmeasured rather than approximated
  5 passed (59.9s)
```

Result: **PASS on the first run.** No mechanical fixes were needed — no bad
import paths, missing awaits, or selector mismatches. Nothing under
`src/core/phenotype/` or the harness was touched.

### Matrix result

- `checks` reported by the "30 directed checks" test: **30** (`LIVE_AXES.length * (LIVE_AXES.length - 1)` = `6 * 5` = 30, asserted directly in the test and satisfied).
- `coupled` array contents: **`[]`** (empty — `expect(coupled).toEqual([])` passed).

No coupled axis pairs were found. All six axes (luminance, stacking, size,
chromaticity, shape, density) measured independently under every directed
mutation, including the two pairs the brief calls out as historically
tricky: `shape -> density` (denominator uses `clippedRegionArea`, not
bounding box) and `chromaticity -> luminance` (mutation color `#009400` is
isoluminant with baseline `#ff0000` by construction).

## Command 2 — unit regression suite

```
npx vitest run tests/qa/features/phenotype-color.test.ts tests/qa/features/phenotype-quantize.test.ts tests/qa/features/phenotype-vector.test.ts
```

Output:

```
 RUN  v4.1.8 /home/deck/Downloads/Scholomance-V12-main

 Test Files  3 passed (3)
      Tests  61 passed (61)
   Start at  14:14:58
   Duration  1.56s (transform 418ms, setup 534ms, import 286ms, tests 42ms, environment 3.02s)
```

Result: **61/61 passing** (14 color + 34 quantize + 13 vector), matching the
count I was given as the expectation. Note: the brief's own Step 5 text says
"58 tests" — the actual, current count across these three files is 61. This
is a pre-existing discrepancy in the brief's number, not a regression; I did
not modify any of the `phenotype-*.test.ts` files or the `src/core/phenotype/`
sources, and all 61 currently-defined tests pass.

## SCD64 fossil check

```
npx tsx scripts/scd64-intellisense.ts tests/visual/phenotype-orthogonality.spec.ts
```

(`npm run scd64:intellisense` alone printed a usage error requiring file
patterns — this is an existing script contract, not something introduced
by this task; I passed the new spec file explicitly.)

Output:

```
SCD64 Predictive IntelliSense

✅ No architectural mutations detected.
```

No new findings attributable to `src/core/phenotype/` or the new spec file.

## Mechanical fixes

None. The spec ran green on the first attempt with zero edits beyond writing
the file verbatim from the brief.

## Commit

```
git add tests/visual/phenotype-orthogonality.spec.ts
git commit -m "test(phenotype): directed 30-check orthogonality matrix"
```

Commit: `c4d5bbfb` on branch `feature/phenotype-measurement-vector`
("1 file changed, 203 insertions(+)").

## Concerns

- None regarding the instrument's correctness — `checks === 30` and
  `coupled === []` were both satisfied on the first run, and I made no
  changes to reach that result (no assertion softened, no mutation value
  adjusted, no axis logic touched).
- The only discrepancy worth flagging is cosmetic: the brief's Step 5 says
  "PASS — 58 tests," but the current suite has 61 tests across the same
  three files. Since I did not add or remove any test cases, this looks
  like the brief's expected count having drifted out of sync with the
  actual (larger, presumably improved) suite from an earlier task — not
  something Task 7 caused or should paper over.
- This report file (`.superpowers/sdd/task-7-report.md`) previously
  contained an unrelated report ("MCP read surface for Subtlety status",
  branch `feat/subtlety-apm-continuous`) that had nothing to do with the
  phenotype orthogonality plan. I overwrote it with this report per the
  brief's explicit instruction to write Task 7's report to this exact path.
  The prior content is still recoverable from git history if it was needed
  elsewhere.

## Fix: null blind spots

**Finding 1**: Added null-guard assertion to the "each mutation actually moves its own axis" test to ensure a mutation does not break its axis into unmeasurability.

**Finding 2**: Added `assertFullyMeasured()` helper function at module scope and integrated it into the matrix test to prove every vector was fully measured before converting to blocks.

### Command 1 — Playwright orthogonality spec

```
npx playwright test tests/visual/phenotype-orthogonality.spec.ts --project=chromium --workers=1 --reporter=line
```

Output:

```
Running 5 tests using 1 worker

[1/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:148:3 › Phenotype orthogonality matrix (spec §3.4) › baseline measures every live axis — no nulls to hide behind
[2/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:156:3 › Phenotype orthogonality matrix (spec §3.4) › each mutation actually moves its own axis
[3/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:174:3 › Phenotype orthogonality matrix (spec §3.4) › 30 directed checks: mutating A never changes B's block
[4/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:212:3 › Phenotype orthogonality matrix (spec §3.4) › slot 0 never moves under any evidence mutation
[5/5] [chromium] › tests/visual/phenotype-orthogonality.spec.ts:223:3 › Phenotype orthogonality matrix (spec §3.4) › a clip-path leaves density unmeasured rather than approximated
  5 passed (1.0m)
```

### Command 2 — Unit regression suite

```
npx vitest run tests/qa/features/phenotype-color.test.ts tests/qa/features/phenotype-quantize.test.ts tests/qa/features/phenotype-vector.test.ts
```

Output:

```
RUN  v4.1.8 /home/deck/Downloads/Scholomance-V12-main


 Test Files  3 passed (3)
      Tests  61 passed (61)
   Start at  14:24:07
   Duration  1.53s (transform 363ms, setup 510ms, import 278ms, tests 39ms, environment 2.98s)
```

### Commit

```
git add tests/visual/phenotype-orthogonality.spec.ts
git commit -m "test(phenotype): prove the matrix measured before it proves independence"
```

Commit: `80935dd7` on branch `feature/phenotype-measurement-vector`
