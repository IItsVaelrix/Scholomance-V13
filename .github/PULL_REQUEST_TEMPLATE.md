<!--
One behaviour change per PR. Keep unrelated cleanup out.
Read CONTRIBUTING.md first; SECURITY.md if you touched a trust boundary.
-->

## What changes, and why

<!-- The problem, not the diff. A reviewer should understand this with files closed. -->

## Evidence

<!--
Say what you ran and what it proved. "Tests pass" is not evidence.

If you added or changed a guard, control-test it: break the invariant on
purpose and show the test actually goes red. Several guards in this repo
(assert on source text, scan a tree for literals) can pass vacuously, and a
guard that cannot fail is worse than no guard because it reads like coverage.
-->

| Check | Command | Result |
| --- | --- | --- |
| DivTube Python | `cd divtube_downloader && python -m pytest` | |
| Cockpit UI guards | `python -m pytest tests/tui -q` | |
| Lint | `cd divtube_downloader && python -m ruff check .` | |
| Java desktop | `gradle build` | |
| Android | `cd divtube_downloader/android && ./gradlew assembleDebug` | |
| Control test of new guard | | |

## Files needing legal review

<!--
Check every one that applies and say what you did. These need a human, not a
technical reviewer:
-->

- [ ] `LICENSE` or `NOTICE`
- [ ] `requirements-remote.txt` (new/changed third-party dependency + licence)
- [ ] `build.gradle` / `settings.gradle`
- [ ] `android/gradle/libs.versions.toml`
- [ ] `android/gradle/wrapper/gradle-wrapper.jar` — tracked deliberately so
      `gradlew` can bootstrap; if you changed it, confirm it is the unmodified
      Apache-2.0 artefact from the Gradle project and note its provenance

## Trust-boundary checklist

- [ ] New/changed remote tool parameters are checked against
      `FORBIDDEN_REMOTE_PARAMETERS` and stripped from the advertised schema
      **and** rejected server-side
- [ ] Untrusted input is parsed and validated (URI + host allowlist), never
      substring-matched
- [ ] No `catch`/`except` that swallows; `InterruptedException` restores the flag
- [ ] Fields shared between worker threads and the UI thread are `volatile` or locked
- [ ] No API added whose only implementation is a constant return — a predicate
      that always returns the same value is not a control, and it is actively
      harmful when a policy claim rests on it
- [ ] Every added comment describes something you verified about this code.
      Do not leave a comment asserting behaviour you have not proven — the next
      reader will trust it. If you wrote a justification and later found the
      premise was wrong, rewrite the comment before merging.

## Notes for reviewers

<!-- Known limitations, deferred follow-ups, intentional behaviour changes. -->
