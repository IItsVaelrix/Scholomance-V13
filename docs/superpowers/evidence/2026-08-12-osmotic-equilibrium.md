# Osmotic Membrane Calibration

**Contract:** `PB-OSMOTIC-EQUILIBRIUM-v1`
**Trials:** 20,000 · **Percentile:** p90 · **Target clearance:** 10.0% ±10 points
**Derive seed:** `0x4f534d4f` · **Validate seed:** `0x484f4c44`

Each limit is derived at one seed and scored against a run at another. A
limit that does not survive a change of seed describes the run, not the
population.

| bank | atoms | min | median | max | limit | cleared (derive) | cleared (validate) | admissible |
|---|---|---|---|---|---|---|---|---|
| ritual | 44 | 0.634084 | 0.930270 | 0.941955 | `0.940172` | 10.2% | 11.7% | true |
| full | 56 | 0.445897 | 0.923975 | 0.935879 | `0.93436` | 10.2% | 7.4% | true |

## No limit is portable

This is why `osmosisConcentrationLimit` is a required option with no
default. Crowding is `h/(1+h)` over occupancy heat, and heat is a weighted
log of revisit counts — which are a function of how small the reachable
graph is. Heat measures graph size as much as it measures crowding.

| limit derived on | value | clears, on the other bank |
|---|---|---|
| ritual | `0.940172` | 0.0% of full |
| full | `0.93436` | 41.0% of ritual |

> Both limits transfer across seeds within their own bank, and neither transfers across banks.
