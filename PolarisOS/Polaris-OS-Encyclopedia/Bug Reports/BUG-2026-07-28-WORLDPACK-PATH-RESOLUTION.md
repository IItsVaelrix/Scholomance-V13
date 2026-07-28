# BUG-2026-07-28-WORLDPACK-PATH-RESOLUTION

## Bytecode Search Code
`POLARIS-BUG-WORLDPACK-CWD-ENOENT`

## Status
Fixed and verified on 2026-07-28.

## Bug Description
Starting PolarisOS with `npm run dev:server` failed before Fastify could bind. The server attempted to open `PolarisOS/apps/server/worldpacks/shrine-demo/world.json`, which does not exist, and raised `ENOENT`. The authored demo world correctly lives at `PolarisOS/worldpacks/shrine-demo/world.json`.

## Impact
The documented development-server command could not start with its default configuration. Supplying an absolute `WORLDPACK_DIR` could work around the failure, but the bundled default worldpack was unusable.

## Reproduction

```bash
cd PolarisOS
DB_PATH=/tmp/polaris-repro.sqlite npm run dev:server
```

Observed failure:

```text
Error: ENOENT: no such file or directory, open '.../PolarisOS/apps/server/worldpacks/shrine-demo/world.json'
```

## Root Cause
`apps/server/src/main.ts` built the default path with `resolve(process.cwd(), "worldpacks/shrine-demo")`. npm runs the workspace script with `process.cwd()` equal to `PolarisOS/apps/server`, not the PolarisOS repository root. The path therefore acquired an incorrect `apps/server/` prefix.

Evidence gathered during diagnosis:

- `npm exec --workspace=apps/server -- node -p 'process.cwd()'` returned `.../PolarisOS/apps/server`.
- The only shrine-demo manifest is `PolarisOS/worldpacks/shrine-demo/world.json`.
- Running the non-watch server reproduced the same `ENOENT` at `loadWorldpack.ts:51` before the fix.

## Resolution
The default worldpack directory is now derived from `import.meta.url`, converted with Node's `fileURLToPath()`. Module-relative resolution is stable regardless of the shell or npm workspace working directory. `WORLDPACK_DIR` remains the highest-precedence override.

## Changes Made

| File | Lines | Change |
|---|---:|---|
| `apps/server/src/loadWorldpack.ts` | 56-59 | Added `resolveDefaultWorldpackDir()` using module-relative URL resolution. |
| `apps/server/src/main.ts` | 11-14 | Replaced the cwd-derived default with `resolveDefaultWorldpackDir()` while preserving `WORLDPACK_DIR`. |
| `tests/server/loadWorldpack.test.ts` | 1-18 | Added a regression test that mocks the exact `apps/server` workspace cwd, proves the old cwd-based candidate is wrong, and verifies the stable root worldpack path. |

## TDD Evidence

### RED
`npm test -- tests/server/loadWorldpack.test.ts` failed with:

```text
AssertionError: expected undefined to be type of 'function'
```

The failure demonstrated that the default resolver did not exist before the production change.

### GREEN
After the minimal implementation, the focused test passed. Code review then identified that the test needed to force the workspace cwd; the test was strengthened and passed again.

## Verification

| Check | Result |
|---|---|
| Exact `npm run dev:server` launch with `PORT=0` | Passed: logged `world=codex_vale_mvp` and bound port `33709`; process was then intentionally interrupted. |
| Focused regression | 1 test passed. |
| Full Vitest suite | 23 files passed; 182 tests passed. |
| TypeScript | `npm run typecheck` exited 0. |
| ESLint | `npm run lint` exited 0. |
| Immune System | `loadWorldpack.ts`, `main.ts`, and the final regression test all reported `CLEAN`. |
| Independent review | No Critical, Important, or Minor findings remained; final assessment: ready to merge. |

`npm run build` separately built `@polaris/client`, then stopped in the untouched `@polaris/world-studio` workspace because it has no `index.html`. This is a separate workspace build blocker and does not affect the verified server startup path.

## Rollback
Restore the former cwd-based expression in `main.ts`, remove `resolveDefaultWorldpackDir()` and its test. This rollback would intentionally reintroduce the reported npm-workspace startup failure and is not recommended.

## Lessons Learned
- npm workspace scripts must not assume `process.cwd()` is the monorepo root.
- Bundled assets should be resolved relative to a stable module or explicit configuration boundary.
- A path regression test must force the failing cwd; merely asserting the expected path from the default test cwd can allow the broken implementation to pass.
