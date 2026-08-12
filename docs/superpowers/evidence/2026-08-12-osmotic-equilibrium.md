# Osmotic Membrane Calibration

**Contract:** `PB-OSMOTIC-EQUILIBRIUM-v1`
**Substrate:** ritual bank, 44 atoms, 20,000 trials
**Derive seed:** `0x4f534d4f`  ·  **Validate seed:** `0x484f4c44`

The limit is derived at one seed and scored against a run at another. A
limit that does not survive a change of seed describes the run, not the
population.

| statistic | derive | validate (governed) |
|---|---|---|
| samples | 256 | 256 |
| min crowding | 0.686620 | 0.257374 |
| median crowding | 0.931141 | 0.930981 |
| max crowding | 0.941956 | 0.941927 |
| cleared by limit | 10.2% | 12.1% |

**Derived limit (p90):** `0.940198`
**Target clearance:** 10.0% ±10 percentage points
**Admissible:** true

> The limit transfers: it clears a minority of the governed run, at the declared target, at a seed it was not derived from.
