# Generalized Compiler/Rasterizer Engineering Patterns

Worked examples behind the six patterns in SKILL.md, all from one real audit-and-fix pass on `codex/core/pixelbrain/scdl/` (2026-08-30). Each generalizes past SCDL.

## 1. A "never throws" contract binds every error-array producer

`scdl.compiler.js` documents: *"Always returns a CompileResult — never throws."* Its final gate:

```js
const hasErrors = errors.some(e => e.isError() || (strict && e.isWarn()));
```

No ternary guard — every entry in `errors` must have a real `.isError()` method. `passes/lower-booleans.js` pushed a plain object on a malformed boolean op:

```js
// before — breaks the contract
if (errors) errors.push({ code: 'PB-SEM-ERR', message: `Boolean op ${boolOp} requires at least 2 targets.` });
```

One line of malformed source (`union a` — a single-token typo) threw `TypeError: e.isError is not a function` straight out of `compileSCDL`, uncaught by the CLI (which has no try/catch, trusting the contract). The 250-test suite stayed green because nothing exercised that op's error path.

Fix: every error producer goes through the same factory.

```js
// after
errors.push(scdlError(
  `Boolean op '${boolOp}' requires at least 2 targets, got ${targets.length}`,
  SCDL_ERROR_CODES.BOOLEAN_OP_ARITY, loc, { op: boolOp, partId: part.id, targets }
));
```

**Generalizes to:** any "this function always returns a result object" contract backed by a shared mutable collection — a linter's diagnostics array, a validation framework's issues list, a build tool's warnings sink. Grep every push-site before trusting the doc comment; add one test per push-site that exercises its trigger condition specifically.

## 2. Cross-entity operations need a two-phase pass

`union`/`subtract`/`intersect` need to read a *sibling* part's cells, but `expandVectorPass` processed one part at a time via `ast.parts.map(part => {...})` — no part could ever see another's output.

```js
// before — single phase, each part isolated
const newParts = ast.parts.map(part => {
  const newOps = [];
  for (const op of part.ops) { /* rasterize + immediately resolve booleans here */ }
  return { ...part, ops: newOps };
});
```

```js
// after — phase 1 rasterizes in isolation, deferring boolean ops
const rasterizedParts = ast.parts.map(part => {
  const newOps = [];
  for (const op of part.ops) {
    // ...
    case 'union': case 'subtract': case 'intersect':
      newOps.push(opWithContext); break; // resolved cross-part in phase 2
  }
  return { ...part, ops: newOps };
});
// phase 2: every part's shape now exists — safe to cross-reference
const newParts = resolveBooleanOpsPass(rasterizedParts, errors);
```

**Generalizes to:** a linker resolving symbols across compilation units, a scene builder resolving instance references across sibling nodes, a spreadsheet engine resolving cross-cell formulas — anything where entity B's op needs entity A's *finished* output can't run in the same pass that produces A.

## 3. Silhouette/single-owner vs. independent-overlap — pick the right ownership model

`geometry-amp.js`'s `buildPartMask(partOf, partId)` reads a shared `{x,y} -> partId` map and returns that part's cells. It was built for item-foundry construction specs, where parts are *designed* as exclusive, non-overlapping territory (a pauldron and a chestplate don't share pixels). Naively reusing it for SCDL parts — which are independently authored and can legitimately overlap — silently broke `intersect`:

```js
// before — ONE map shared across the whole asset
const partOf = new Map();
for (const part of parts) for (const op of part.ops) if (op.op==='cell') partOf.set(key(op), part.id);
// part b (declared after a) writes the SAME coordinates a already owns —
// the shared map now says those coordinates belong to b, not a.
```

Test that caught it: two concentric circles, `part a` (radius 3), `part b` (radius 1, fully inside a), `part c { intersect a b }`. Expected 5 cells (b's full area, since b ⊆ a). Got **0** — because by the time `intersect` ran, the shared map had already reassigned every one of a's cells under b's footprint away from `a`, so `a`'s "shape" no longer included the very region being intersected.

```js
// after — one map PER PART, built only from that part's own cells
function ownPartOf(part) {
  const partOf = new Map();
  for (const op of part.ops) if (op.op === 'cell') partOf.set(cellKey(op), part.id);
  return partOf;
}
function shapeKeysOf(part) {
  return new Set(buildPartMask(ownPartOf(part), part.id).map(cellKey));
}
```

**Generalizes to:** any occupancy/ownership map (a game's tile-ownership grid, a layout engine's z-order hit-testing, a CAD tool's face-ownership map). Before reusing one, ask: *are the entities in my case contractually disjoint, or can they legitimately overlap?* If the latter, the map must be scoped per-entity, never shared.

## 4. Trust a helper's contract, not its name

`buildPartMask` is a perfectly good, reusable "get me this part's shape" primitive — the *bug* wasn't reusing it, it was feeding it the wrong kind of map (see #3). The fix kept the same function call, just changed what was built to feed it. When reusing a helper across domains, read what it actually requires from its input (here: "a map where you've already resolved ownership the way you want"), not just what its output looks like.

## 5. Duplicate tokenizers/parsers drift silently

`scdl.grammar.js` had two full tokenizer implementations: the private `_tokenizeFull` actually used by `parseSCDL`, and a separately hand-written, exported `tokenize()` that two test files called directly. They were kept in sync only by comments cross-referencing each other ("See _tokenizeFull: a bare '-' is an illegal character...").

```js
// before — two independent ~120-line implementations
export function tokenize(source, issues = null) { /* ...its own full lexer... */ }
function _tokenizeFull(source, issues = null) { /* ...a DIFFERENT full lexer... */ }
```

```js
// after — one implementation; the export is a wrapper
export function tokenize(source, issues = null) {
  return _tokenizeFull(source, issues);
}
```

Both happened to agree at audit time (verified empirically before touching anything), but nothing enforced that — a fix landed in one could regress the other invisibly, behind a green "tokenizer test" suite that was actually testing the *unused* copy.

**Generalizes to:** any "reference implementation kept in sync by discipline" — a mock that duplicates real logic instead of wrapping it, a second validation function for "just the UI layer." If a test imports something the production path doesn't call, that test is not testing production.

## 6. SVG-style tokenizers need a flag-digit special case

A generic number regex (`-?\d*\.?\d+`) greedily consumes digit runs. SVG's arc command legally omits separators between its two single-digit flags and the following coordinate: `A rx ry rot large-arc sweep x y` can be written `A3 3 0 013 4` (flags `0`,`1`, then x=`3`, y=`4`). The generic regex reads `013` as one number, silently fusing both flags with the start of the next coordinate and desyncing every token afterward (observed: NaN coordinates propagating into a polygon's bounding box, which then rasterizes as a completely empty region).

Fix: a dedicated pre-pass over the *raw string* (not the token stream) that recognizes arc commands and re-emits their flag characters as explicit, individually space-separated tokens before generic tokenization ever runs:

```js
function _normalizeArcFlags(d) {
  // ...walks the string; on 'A'/'a', reads rx/ry/rotation as normal numbers,
  // then consumes exactly ONE character each for large-arc-flag and
  // sweep-flag (only if it's '0' or '1'), inserting a space after each...
}
const tokens = _normalizeArcFlags(String(d || '')).match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
```

Verified with a parity test: a compact-flag arc (`"A3 3 0 013 4"`) and its fully spaced-out equivalent (`"A3 3 0 0 1 3 4"`) must rasterize to the identical cell set.

**Generalizes to:** any format with context-sensitive fixed-width tokens embedded in a free-form numeric stream (fixed-width flag fields, bitfields packed next to variable-width numbers). Don't patch the generic tokenizer's regex — normalize the ambiguous region to an unambiguous form first, in its own pass.
