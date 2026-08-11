# Cyclotron C-Sensor — Design

**Contract:** `PB-CYCLOTRON-SENSOR-v1`
**Date:** 2026-08-11
**Status:** design approved, not implemented

## Provenance — where this shape came from

The Semantic Valence Cyclotron emitted 26 nuclei across three distinct atom compositions
(reproduced at report checksum `cyclotron1:f8c456d471d2140188adddabb52a71df`, seed `0x5c4010`,
100k trials, bank + config identical to the control arm of `scripts/null-substrate-attack.mjs`).

Composition **C** — 2 nuclei, 1 topology, final score 0.7683–0.7688:

    cyclotron-reactor    --experiment-receipt--> evidence-ledger
    evidence-ledger      --structure----------> canonical-serializer
    canonical-serializer --artifact-----------> bytecode-seal
    canonical-serializer --artifact-----------> schema-verifier

C is the only composition of the three that closes its own input: `canonical-serializer`
seeks `structure`, and `evidence-ledger` is the only atom in any nucleus that offers it.
Compositions A and B start from an external input; C is a loop.

Its three open ports are informative, not defects:

| open port | atom | who offers it in the bank |
|---|---|---|
| `candidate-frontier` | cyclotron-reactor | `molecule-generator`, `valence-compiler`, `lexical-graph` |
| `feasibility-score` | cyclotron-reactor | `concept-chemistry` |
| `validation-verdict` | evidence-ledger | `holdout-validator` |

The first two are supplied by an actual cyclotron run and arrive inside the report. The third
is where **baseline approval** enters the design.

All five atoms in C resolve to files that exist — verified 2026-08-11. C carries no
aspirational evidence path, unlike composition A2, whose `diagnostic-event-bus` atom cites
`codex/runtime/event-bus.js`, which does not exist.

## Why build it

`subtlety-fingerprint-apm.js` states the law this follows: *"Sensors, then immune response —
in that order (PDR §4.5)."* `subtlety-closed-loop.js` describes the APM becoming "a sensor for
the immune system": observe, fingerprint, surface a structured deviation, **never auto-heal**.

On 2026-08-11 a scoring change silently altered every downstream benchmark number, and it was
caught by a hand calculation. `scripts/evidence-integrity-harness.mjs` (built from composition
A2) now audits artifacts **at rest** — it detects that a file changed. It cannot detect that
the *reactor* changed while the files were rewritten legitimately. That is the gap C fills.

**A2 audits artifacts. C audits the process that produces them.**

## Architecture

Two files.

### `codex/core/pixelbrain/cyclotron-sensor.js` — pure

No file I/O, no wall clock, no randomness. Each stage is a named function carrying its atom's
port contract, following the house style established by the A2 harness.

    [RX]     experimentReceipt(report, provenance) -> receipt
               offers experiment-receipt; seeks candidate-frontier + feasibility-score
    [LEDGER] ledgerStructure(receipt, approvedBaseline) -> structure
               offers structure; seeks experiment-receipt + validation-verdict
    [SER]    canonicalArtifact(structure) -> artifact
    [SEAL]   sealArtifact(artifact) -> "cyclosensor1:<sha256>"
    [VER]    verifyReceiptSchema(structure) -> verdict

Public surface: `buildReceipt(report, provenance)`, `assess(receipt, baseline)`,
`sealReceipt(receipt)`, and the contract constant. `sealReceipt` is the composition of the
`[SER]` and `[SEAL]` stages — it canonicalizes the receipt and returns
`{ artifact, checksum }`. The five stage functions are module-internal.

### `scripts/cyclotron-sensor.mjs` — the shell

Reads an already-written cyclotron report artifact, calls the core, writes the ledger, sets the
exit code. It does **not** run the cyclotron. That keeps the core unit-testable without 100k
trials and lets the sensor compose with any run — the 100k ritual, the occupancy benchmark, or
the null-substrate control arm.

    node scripts/cyclotron-sensor.mjs --report=<path>
    node scripts/cyclotron-sensor.mjs --report=<path> --record
    node scripts/cyclotron-sensor.mjs --report=<path> --approve --reason="<why>"

### Two deliberate deviations from the nucleus

1. **The seal uses `sha256Hex` / `stableStringify` from
   `codex/core/immunity/cleri-probe/canonical-report.js`, not the `canonical-json.js` that the
   `canonical-serializer` atom cites.** A2 verifies self-seals by recomputing
   `sha256Hex(body-minus-checksum)`, which is `JSON.stringify(sortKeys(…))`. `canonical-json.js`
   implements a different canonical form (Python float repr, for `.pbrain` packets); using it
   would make every receipt fail A2's `SELF_CHECKSUM_MISMATCH` check. The atom's path is real
   but is the wrong tool for this seal.
2. **The ledger is a single content-addressed artifact** at
   `docs/superpowers/evidence/CYCLOTRON-SENSOR-LEDGER.json`, so the shipped A2 harness audits
   the sensor's own records for free.

## The reading

### Input class

`sha256` over the canonical form of:

    { contract, schemaVersion, atomBankChecksum, groundingIndexChecksum,
      chemistryProvenance(), configuration, seed, requestedTrials }

Change any of those and the run belongs to a different class.

### Output fingerprint

- every field of `counts`
- `control.bar`
- `meanFinalScore`, `meanEnergy`, `meanNovelty`, `meanGrounding`, `meanChemistryFeasibility`,
  each rounded to 12 decimal places
- `shortlistDigest` — `sha256` over the ordered list of `(sorted atomIds, finalScore)`
- `report.checksum`

`report.checksum` is the **detector**: if inputs match and it matches, nothing moved. The other
fields are the **localizer** — they exist so a deviation reports *what* moved rather than only
*that* something did. `shortlistDigest` is what catches a ranking change that leaves the means
untouched.

### Verdicts

| verdict | condition | exit |
|---|---|---|
| `NO_BASELINE` | no approved baseline for this input class | 0 |
| `ABSTAIN` | baseline exists, inputs differ — names which input fields differ | 0 |
| `STABLE` | inputs match, outputs match | 0 |
| `DEVIATION` | inputs match, outputs differ — names which output fields moved | 1 |

The cyclotron is deterministic, so identical inputs must produce identical outputs and the
false-positive rate of `DEVIATION` is zero by construction. When inputs differ the sensor
**abstains** rather than guessing — a channel with no evidence must abstain, not pay half
credit.

Baselines are promoted only by explicit `--approve --reason=…`, never rolled forward from the
previous run. `assess()` never mutates a baseline. This is propose-only, per PDR §7.4: heal
against an approved baseline, not the previous checksum, or the monitoring system becomes an
automated regression engine.

## Failure modes and refusals

1. **Report fails `verifySemanticCyclotronReport`** → throw. Never seal an unverified report;
   a sensor that seals a corrupt reading launders it.
2. **Incomplete provenance** (missing `atomBankChecksum`, missing `groundingIndexChecksum`, or
   `chemistryProvenance()` unresolvable) → refuse, exit 2. Silently omitting a field from the
   input class would merge two different classes and manufacture both false `DEVIATION`s and
   false `STABLE`s.
3. **Ledger absent** → `NO_BASELINE`, exit 0. Never create a baseline implicitly.
4. **Ledger self-seal mismatch** → hard error, exit 2, no verdict. A sensor whose own record
   has been tampered with must not be able to report `STABLE`.
5. **Baseline approved under a different sensor `contract` / `schemaVersion`** → `ABSTAIN` with
   `SENSOR_CONTRACT_CHANGED`, never `DEVIATION`. Changing which fields the fingerprint covers
   must make old baselines abstain, not fire.

## Testing

### Unit — synthetic reports, no 100k runs

- **`DEVIATION` reachable, parameterized over every output field.** Perturb one field; assert
  the verdict fires and names that field. A field that can be perturbed without changing the
  verdict fails the test and is deleted. This is the guard against a fingerprint field that
  cannot move the answer being read as evidence — the `strengthPreserved` and
  `pairwiseRealized` failure.
- **`ABSTAIN` reachable, parameterized over every input-class field.** Perturb one; assert
  `ABSTAIN` naming it, and explicitly not `DEVIATION`.
- `STABLE` reachable; `NO_BASELINE` reachable.
- **Seal interop** — recompute `sha256Hex(body minus checksum)` through the same code path the
  A2 harness uses and assert it matches the receipt's claimed suffix.
- **Determinism** — `buildReceipt` twice over one report yields a byte-identical artifact and
  seal.
- **Immutability** — `assess()` leaves the baseline deep-equal to its prior state.
- **Sensor-contract change** — a baseline from a different sensor contract yields `ABSTAIN`.

### Integration — the break-it-on-purpose proof

This section is a preregistration: the runs and their expected outcomes are declared here
before any code exists.

    1. cyclotron TRIALS=2000, fixed seed, run twice        -> STABLE     (no false positive)
    2. scratch copy, change ONE concept-chemistry weight   -> DEVIATION  (it can fail)
    3. revert the weight                                   -> STABLE     (no sticky state)

Recorded to `docs/superpowers/evidence/2026-08-11-cyclotron-sensor-proof.md` with repro
commands, so A2's `NO_REPRO_COMMAND` does not fire on it. Step 2 is what decides whether the
sensor is real. Until it has been observed failing on purpose, no claim that it works may be
made.

## Out of scope for v1

- Wrapping `runSemanticValenceCyclotron` so every call emits automatically. Rejected: it would
  put I/O and ledger state inside a pure core function and make the reactor's tests depend on
  the ledger.
- RAID symptom emission and auto-heal. Sensors first, immune response separately.
- Tolerance bands on statistics. The band would be a free parameter chosen after seeing data.
- Any UI surface.

## Jurisdiction note

`Scholomance LAW/CLAUDE.md` assigns `codex/` and `scripts/` to Codex rather than to the UI
agent whose mandate that file carries. The whole cyclotron line has been built in those
directories; this spec follows that precedent rather than the letter of the ownership table.
