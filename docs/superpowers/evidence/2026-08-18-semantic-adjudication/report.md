# Gold adjudication pilot

Contract: `PB-SEMANTIC-ADJUDICATION-v1`
MIN_COVERAGE_SPLIT remains 0.01 (not retuned).
Ballistics did not enter warranting.

## Collection

- seed queries considered: 656
- opportunities frozen: 560
- unbound: 1
- not opportunity: 95
  - warranted: 60
  - unexposed-measurement: 23
  - flat-unwarranted: 10
  - dark: 2
- stratified sample: 250
- discovery / development / holdout: 150 / 50 / 50

## Gold (discovery + development only in this table)

- labeled: 200
- rubric agreement: 84
- unresolved disagreement: 0
- recoverable gold: 16
- AMBIGUOUS: 125
- INSUFFICIENT_CONTEXT: 58
- BAD_CANDIDATE_SET: 1
- TYPE_I_PROBE_HOLE: 14
- TYPE_II_BALLISTICS_ARTIFACT: 183
- TYPE_III_CANDIDATE_GENERATION: 1
- TYPE_IV_UNUSED_EVIDENCE: 2
- holdout packets sealed: 50 (ids only in this report)

The dominant layer is Type II: both rubrics refuse to name a unique sense.
That is a Ballistics-geometry finding, not a Calculus warranting failure.
Type I counts below are the residual recoverable-sense holes only.

## Hole ledger (Type I + Type IV only)

| Predicate family | Cases | Gold recoverable | Ballistics aligned | Existing probe support |
|---|---:|---:|---:|---:|
| LOCATION | 5 | 5 | 2 | 0 |
| MATERIALITY | 4 | 4 | 1 | 0 |
| ENTITY_TYPE | 2 | 2 | 0 | 0 |
| CONCRETENESS | 1 | 1 | 0 | 0 |
| DOMAIN | 2 | 2 | 1 | 0 |
| SYNTACTIC_FRAME | 2 | 2 | 1 | 2 |

## Type I examples (discovery, rubric gold)

- `they lie in the grass` → LOCATION (moderate, Ballistics aligned)
- `they mine the ore` → MATERIALITY (moderate, Ballistics aligned)
- `the harbor was still` → LOCATION (weak, Ballistics aligned)
- `the seal swam near the ice` → LOCATION (strong)
- `blood stored in the bank` → ENTITY_TYPE (very-strong)
- `judge in the court` → ENTITY_TYPE (strong)
- `firm belief in the cause` → CONCRETENESS (strong)
- `credit at the bank` → DOMAIN (strong, Ballistics aligned)
- `a glass of water` → MATERIALITY (strong)
- `glass of the greenhouse` → MATERIALITY (strong)
- `teller at the bank` → DOMAIN (strong)
- `a fold in the cloth` → MATERIALITY (moderate)
- `mole of the harbor` → LOCATION (strong)

These golds are rubric recoveries, not a second human pass. Inspect before promoting any family.

## Human inspection of Type I recoveries

Survives inspection as a real recoverable distinction:

- `they mine the ore` — excavation vs other mine readings
- `the seal swam near the ice` — marine mammal vs wax/stamp
- `credit at the bank` / `teller at the bank` — institution vs landform
- `a glass of water` — drinking vessel
- `a fold in the cloth` — crease vs enclosure
- `mole of the harbor` — breakwater vs animal/spy

Does not survive as stated gold:

- `firm belief in the cause` — rubric picked a bodily-steadiness adjective
- `glass of the greenhouse` — rubric picked the drinking-vessel sense
- `they lie in the grass` — rubric picked a locative copula, not the reclining verb
- `the harbor was still` — rubric picked refuge, not the port
- `blood stored in the bank` — may be a missing blood-bank / reserve candidate (Type III), not financial `ENTITY_TYPE`

`judge in the court` is genuinely close: room vs judicial assembly.

After inspection the strongest recurring families remain **LOCATION**, **MATERIALITY**, and **ENTITY_TYPE**. Counts are small. That is the result, not a license to implement all three.

## Top recurring Type I holes

1. **LOCATION** — 4 discovery cases, 4 lemmas, opportunity 4.500
   lemmas: harbor, lie, mole, seal
2. **MATERIALITY** — 4 discovery cases, 3 lemmas, opportunity 3.250
   lemmas: fold, glass, mine
3. **ENTITY_TYPE** — 2 discovery cases, 2 lemmas, opportunity 2.400
   lemmas: bank, court

Stop. Do not implement these. The next experiment, if any, is one preregistered predicate on the sealed holdout, with false warrant measured explicitly.

## Secondary Ballistics calibration (discovery, recoverable gold only)

| Split band | n | P(top = gold) |
|---|---:|---:|
| weak | 1 | 1.000 |
| moderate | 3 | 0.667 |
| strong | 8 | 0.125 |
| very-strong | 1 | 0.000 |

Holdout calibration is written to a sealed file and was not used to rank predicates.

## QA checklist

- only-measured-unwarranted-exposed-enters
- gold-annotators-cannot-see-ballistics
- refusal-labels-are-legal
- candidate-generation-separated-from-probe
- unused-evidence-is-its-own-class
- missing-predicates-labeled-without-ballistics
- discovery-separated-from-holdout
- proposed-predicate-cannot-read-ballistics
- false-warrant-measured-explicitly
- receipt-determinism-stays-green
- flipping-ballistics-cannot-change-selection
- holdout-sealed-until-design-freeze

No predicate was implemented. MIN_COVERAGE_SPLIT was not changed.

