# BUG-2026-09-03-SYLLABLE-GUTTER-MULTILINE

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-001`

## Provenance

This report was recovered from a tracked file at
`divtube_downloader/right-or-wrong?` — a 538-byte "CSV" whose name and contents
are both artifacts of a shell typo. Someone pasted a message intended for
Vaelrix into a terminal where an earlier `>` redirect was still open, so the
text (including the Textual border glyphs `▎ ▊ ╰───────╯` it was copied from)
landed in a file named after the fragment of UI that followed it.

The file had been in git since **2026-06-24**. The bug it describes was never
filed, never triaged, and is not mentioned anywhere in this repo or its docs.
That is the actual finding here: **~11 weeks of a live defect sitting in a
filename nobody would ever search for.**

Verbatim, stripped of the captured UI chrome:

> So, Vaelrix, there is an issue with the syllable gutter in TrueSight. The
> visual does not stay in the positioning that it does when it is without
> multiple lines in the text area. At this point, when more than one line is
> typed, the gutter makes the line indicator magnify. Try to find the reason
> why that bug is happening

## Bug Description

The syllable gutter in TrueSight mode mis-positions when the text area contains
more than one line. With a single line the gutter renders at its normal size and
alignment; adding a second line causes the line indicator to **magnify** and the
gutter to leave its anchored position.

**Manifestation:**
- Single-line content: gutter positioned correctly, indicator at normal scale
- Multi-line content: line indicator grows / renders at the wrong scale
- Gutter no longer tracks the visual line it annotates
- Report names `/cleri-scan` and `/cleri-diagnose` as the commands in use when it
  was noticed, so the trigger may be scan-driven re-rendering rather than plain
  typing — unconfirmed.

**User Impact:**
- Syllable-level phonetic annotation cannot be trusted on any multi-line input
- Multi-line input is the normal case for this surface, so the gutter is
  effectively broken for real use

## Likely Mechanism (unverified — starting point, not a conclusion)

This is the second-member instance of a failure mode this codebase has already
documented. See **BUG-2026-04-02-WHITESPACE-ALIGNMENT**, which was the same
geometry error one layer over:

> Overlay words positioned as if no wrap occurred

Both reports describe an overlay that computes position from **logical** text
lines while the surface renders **visual** lines. A gutter that magnifies its
indicator specifically on the transition from one line to many points at a
per-line scale or line-height derived from a count that assumes a single row —
e.g. an index or offset used as a multiplier where it should be a modulo, or a
row height taken from the whole container rather than from one wrapped line.

Treat this as a hypothesis to test against `BUG-2026-04-02`'s fix, not as a
diagnosis.

## Status

**Open — unfixed.** Filed 2026-09-03 from a report made 2026-06-24 or earlier.

## Process Note

The remediation that surfaced this did not set out to find it. The original
cleanup was about pytest collecting non-test files; `right-or-wrong?` was one of
two tracked shell-typo artifacts found in the same sweep.

The other was `_vectorizeAndQuantizeSCD(scdFull, meta =`, which initially looked
like the only surviving copy of an orphaned method — and was nearly filed to
`Archive/Prototypes/` on that basis, with this author's grep as the supposed
evidence. It was neither. The method is **live** at
`codex/core/immunity/spatial-immune-orchestrator.js:1054` with four call sites,
and the stray file was a stale mid-edit extraction that predates the
`saveSCD64Index()` persistence call at line 1119. It was deleted, not archived.

The grep was scoped to `divtube_downloader/`; the method lives in `codex/`. A
"this exists nowhere else" claim is only as wide as the directory it was checked
in, and `Archive/Prototypes/README.md` promises its contents are "not dead code…
dormant infrastructure" awaiting reconnection — so filing a stale duplicate of a
live method there would have manufactured a regression vector: someone
"reconnecting" it would have silently removed the persistence call.

Two hours of a user's debugging request were lost into a filename for three
months because nothing checks what the shell accidentally created. The durable
fix is not "read that file" but "notice when a file cannot have been created
deliberately".

