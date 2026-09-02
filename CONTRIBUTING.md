# Contributing

Scholomance is a monorepo: a React/Vite game client, a Fastify backend, the
CODEx linguistic engines, a Godot runtime, the Vaelrix Cortex ForceField, and
the DivTube pipeline. Read this first if your change touches more than one.

For the security model of the remote companion and the rights posture of the
downloader, see [SECURITY.md](SECURITY.md).

## Layout

| Path | What it is |
| --- | --- |
| `divtube_downloader/` | DivTube cockpit: Textual TUI, agent tools, remote companion server |
| `divtube_downloader/src/main/java/` | Desktop Java module (`divtube.*`) — URL validation, `yt-dlp` provider, process runner |
| `divtube_downloader/android/` | Kotlin/Compose phone companion that pairs with the gateway over TLS |
| `steamdeck_brain/vaelrix_forcefield/` | Deterministic multi-brain routing layer |
| `codex/` | CODEx linguistic engines, PixelBrain, SCDL compiler |

`divtube_downloader/android` is a **separate Gradle build** from
`divtube_downloader/build.gradle`. They need different Gradle versions on
purpose: the desktop module builds on Gradle 8.5 (Java 21 toolchain), the
Android module needs Gradle 9.x because AGP 9.2.0 requires it. Do not "unify"
them.

## Environment

- **Python 3.13.** Use the venv; do not install into the system interpreter.
- **Java 21** (Temurin). `run.sh` resolves `JAVA_HOME` dynamically because
  hard-coding the VSCode extension JDK path broke on every extension update —
  keep that resolution, don't hard-code a JDK path.
- Android builds need an SDK; `android/local.properties` is machine-local and
  gitignored.

### DivTube

```bash
cd divtube_downloader
./run.sh                       # creates .venv, installs deps, launches the cockpit

# or manually
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-remote.txt
python -m pytest               # 750+ tests; pytest.ini sets testpaths & pythonpath
```

`requirements-remote.txt` is fully `==`-pinned. **Keep it pinned** — CI runs
`pip-audit` against it, and an unpinned line makes that audit meaningless.

One dependency is intentionally absent: `anthropic`. `intel/report/prose.py`
imports it inside a `try` and degrades to templated prose if it's missing, so it
is optional and only needed for LLM-written critique prose.

### Java (desktop module)

```bash
cd divtube_downloader
gradle build        # or ./gradle-8.5/bin/gradle --offline build
```

### Android companion

```bash
cd divtube_downloader/android
./gradlew assembleDebug
```

`gradle/wrapper/gradle-wrapper.jar` is **tracked deliberately**. `gradlew` has
nothing to bootstrap without it, so ignoring it makes a fresh clone
unbuildable. If you are tempted to add it back to `.gitignore`, don't.

## Tests

Everything gates on the test suites staying green.

| Area | Command | Notes |
| --- | --- | --- |
| DivTube Python | `cd divtube_downloader && python -m pytest` | 760 tests, 77 files |
| Cockpit UI guards | `python -m pytest tests/tui -q` | run from the **repo root** |
| Java desktop | `gradle build` | includes JUnit 5 table-driven validator tests |
| ForceField | `PYTHONPATH=steamdeck_brain python -m pytest steamdeck_brain/vaelrix_forcefield/tests/ -q` | pure stdlib; pytest only. Includes the latency/structural guards that fail CI on O(repo) file-walk regressions |
| Game client / backend | `npm ci && npm run lint && npm run test -- --run` | vitest + Playwright, covered by `test.yml` |

Before pushing, `npm run test:prepush` runs determinism verification
(10,000 iterations × 52 checks) plus the immunity-bypass and combat-replay
suites.

## Style

- **Don't add a second implementation of something that already exists.** If a
  capability looks missing, find out whether it is a bug before building a
  parallel path.
- **Every new feature gets a happy-path test.** For safety-critical code, add
  the adversarial case too.
- Prefer declarative pixel transforms and existing JSON configs over hand-written
  runtime code.
- Comments must describe the code they sit next to. A comment that asserts a
  behaviour the code cannot prove is worse than no comment.

### Guard rails that will reject your code

Some invariants are enforced by tests rather than review, so read the failure
message rather than working around it:

- **No raw hex colour literals in cockpit surfaces.** `tests/tui/
  test_cockpit_ui.py` scans `tui/ui` **and** `tui/screens`; colours must resolve
  through `theme.palette()` / `$tokens` so a theme switch actually switches.
- **The remote agent profile stays read-only.** Any parameter that turns a
  read-only tool into an execution path belongs in
  `FORBIDDEN_REMOTE_PARAMETERS` and must be stripped from the advertised schema
  *and* rejected server-side. A tool is only as safe as its narrowest surface.
- **Determinism-sensitive metrics** must be checked against exact arithmetic.
  See `tests/test_osmosis_concentration_coupling.py` for the pattern: a
  behavioural test cannot see a clamp/threshold that drifted apart, so assert
  on the source too.

## Code conventions

The Java and SQL layers follow the Alibaba Java Coding Guidelines (P3C). The
rules we actually enforce:

- No empty `catch` blocks and no swallowed `InterruptedException` — restore the
  interrupt flag (`Thread.currentThread().interrupt()`) and log with context.
- Don't wrap a large `try` in `catch (Exception)`; catch what you can handle.
  Re-wrapping an exception you threw yourself loses the type at the UI boundary.
- Validate untrusted input by parsing it, not by substring matching. A URL is a
  `URI` with an authority checked against an allowlist, not `url.contains(...)`.
- Shared mutable state across threads needs `volatile` or a lock. Fields written
  on a worker thread and read from the UI thread are not safe otherwise.
- Named, pooled threads. No bare `new Thread(...)`.
- `Path.of(...)` / `File.separator`, never a hard-coded `"/"` — we ship a
  Windows installer.
- No API surface that exists only to return a constant. A predicate that always
  returns `false` is not a control, and it is actively harmful when a policy
  class's user-facing claim depends on it.

## Pull requests

1. Branch from `main`.
2. One behaviour change per PR; keep unrelated cleanup out.
3. Include the test evidence in the description — say what you ran and what it
   proved, and for guard rails say how you control-tested them.
4. If you touch `requirements-remote.txt`, `build.gradle`,
   `libs.versions.toml`, `LICENSE`, `NOTICE`, or the Android module, say so
   explicitly: those files need legal review, not just technical review.

## Commits

Conventional Commits (`feat`, `fix`, `chore`, `docs`), imperative, ≤72 chars.

```
fix(remote): reject replayed pairing codes

- Bind codes to a device ID, reject if already claimed
- Tests added for happy path and replay attack
```
