# Frozen corpus fixtures

Real repository files, copied here and frozen, **selected by measurement rather
than by taste**. Each one was found by mutating a decision point in
`_js_body_end` and asking which files the mutant then answered differently on,
across a 2,098-file held-out corpus judged by `@babel/parser`.

| file | branch it distinguishes | delta when broken |
|---|---|---|
| `encodeMotionBytecode.ts` | regex-after-`=>`, regex closes on line, template hole, type continuation, const `;` | all five |
| `visemeMapping.js` | a regex literal must close on its own line | −520 symbols |
| `json-schemas.ts` | a type literal is not the body | −17 |
| `character-to-svg.js` | a regex may follow `=>` | −5 |
| `ast-topography.js` | a const declaration ends at its `;` | −6 |
| `construction-autopsy.mjs` | `}` leaves a template hole | −4 |

They exist because the hand-written fixtures next door did not do this job.
Run against them, `antigen-witness` returned WITNESSED on 8 of 9 decision
points: the suite could not tell the logic was broken. Every fixture written by
hand had balanced braces, a semicolon, a block body and a `.js` extension, so a
mis-lexed region still landed on the same envelope and the TypeScript path —
the one that took three attempts to get right — was never entered at all.

Frozen, not referenced in place, so a later edit to the original cannot quietly
change what this suite asserts. Expected line ranges live in `../expected.json`
and are written by `scripts/gen-envelope-fixture.mjs`, never by hand.
