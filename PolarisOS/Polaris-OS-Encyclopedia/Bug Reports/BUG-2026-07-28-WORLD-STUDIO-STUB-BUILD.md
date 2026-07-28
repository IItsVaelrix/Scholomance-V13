# BUG-2026-07-28-WORLD-STUDIO-STUB-BUILD

## Bytecode Search Code
`POLARIS-BUG-WORLD-STUDIO-STUB-MANIFEST`

## Status
Fixed and verified on 2026-07-28.

## Bug Description
The repository-wide `npm run build` completed the implemented client build, then failed in `@polaris/world-studio` with Vite's `UNRESOLVED_ENTRY: Cannot resolve entry module index.html`.

## Impact
The canonical workspace build exited non-zero even though every implemented application compiled successfully. This obscured real build health and forced contributors to use a client-scoped workaround.

## Reproduction

```bash
cd PolarisOS
npm run build --workspace=apps/world-studio
```

Observed before the fix:

```text
[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.
```

The root `npm run build` reproduced the same failure after the client build.

## Root Cause
World Studio is intentionally documented as a future stub. Its workspace contained only `package.json` and an empty `src/` directory, but its manifest advertised runnable `dev: vite` and `build: vite build` scripts. Vite therefore treated the stub as a complete application and searched for the absent `index.html` entry.

The root build already uses `npm run build --workspaces --if-present`, so an unimplemented workspace is supported when it does not falsely advertise a build script.

## Resolution
Removed the invalid `dev` and `build` scripts from the World Studio stub. The root workspace build now skips it through npm's existing `--if-present` behavior. No placeholder HTML or fake UI was created; runnable scripts must return only when World Studio receives a real application entry.

## Alternatives Considered

### Add a placeholder `index.html`
Rejected. The README, white paper, and Milestone 1 PIR all classify World Studio as future work. A fake application entry would make the build green by presenting an empty scaffold as implemented product surface.

### Remove only `build`
Rejected. Leaving `dev: vite` would retain the same false runnable contract and fail for the same missing entry when invoked.

### Remove both runnable scripts
Selected. This matches the documented lifecycle state and the root monorepo's `--if-present` design.

## Changes Made

| File | Lines | Change |
|---|---:|---|
| `apps/world-studio/package.json` | 1-12 | Removed the invalid Vite `dev` and `build` scripts from the future stub. |
| `tests/workspaces/WorldStudioWorkspace.test.ts` | 1-25 | Added a transition invariant: World Studio exposes build/dev scripts exactly when its application entry exists. |
| `Polaris-OS-Encyclopedia/White Papers/POLARIS_OS_WHITE_PAPER.md` | 622-637 | Made root `npm run build` canonical and documented `--if-present` stub skipping; retained client-only build instructions. |

The regression was first placed under `tests/build/`, then moved before submission because the repository's `build/` ignore rule would have excluded it from version control. `git check-ignore` confirms the final `tests/workspaces/` path is not ignored.

## TDD Evidence

### RED

```bash
npm test -- tests/build/WorldStudioWorkspace.test.ts
```

Both tests failed with `expected true to be false`: the manifest exposed build and dev scripts while `index.html` was absent.

### GREEN
After removing the invalid scripts, the focused contract passed. It was then relocated to its final trackable path and re-run:

```text
Test Files  1 passed (1)
Tests       2 passed (2)
```

## Verification

| Check | Result |
|---|---|
| Root `npm run build` | Exit 0; `@polaris/client` transformed 724 modules and produced its production bundle; World Studio was lawfully skipped. |
| Focused workspace contract | 2/2 passed from the final `tests/workspaces/` path. |
| TypeScript | `npm run typecheck` exited 0. |
| ESLint | `npm run lint` exited 0. |
| Non-socket Vitest suites | 21 files passed; 172 tests passed. |
| Full-suite sandbox attempt | 21 files passed; only the three localhost-binding integration suites were blocked by sandbox `listen EPERM`; unsandbox approval timed out twice. |
| Most recent unsandboxed baseline before this manifest-only change | 23 files and 182 tests passed. |
| Immune System | Manifest, final regression, and white-paper update reported `CLEAN`. |
| Independent review | No remaining Critical, Important, or Minor findings; final assessment: ready to merge. |

## Rollback
Restore the two Vite scripts in `apps/world-studio/package.json` and remove the workspace-contract test. Without simultaneously implementing a real World Studio entry, this rollback reintroduces the reported root build failure.

## Lessons Learned
- Workspace scripts are executable contracts, not harmless placeholders.
- `--if-present` is the correct mechanism for carrying future workspaces in a buildable monorepo.
- Do not manufacture empty application surfaces merely to satisfy a build tool.
- Regression tests must be checked against ignore rules, not only executed locally.
