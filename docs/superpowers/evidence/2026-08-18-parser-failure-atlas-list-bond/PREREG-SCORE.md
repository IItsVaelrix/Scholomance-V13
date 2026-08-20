# SCORE — preregistered `list (NUM → NUM)` bond

Contract: `PB-PARSER-FAILURE-ATLAS-v1`
Date: 2026-08-18
Splits: EWT train + dev. TEST sealed.
Baseline: `docs/superpowers/evidence/2026-08-18-parser-failure-atlas/`
This run: this directory.

## Why this pair is a list, not two NUMs

Every adjacent DATE+CLOCK pair in EWT train+dev is gold `list`, left-headed
(175/175). Adjacent NUM NUM that is `compound` is right-headed (122) and has
different orthography. AM/PM is gold `nmod:unmarked` on the clock, which is
why 166/172 sole-cause list spans were `05:17 PM`, not `07/30/2001 05:17`.

The chart types are DATE / CLOCK / MERIDIAN. There is no generic NUM+NUM bond.

## Predictions

| # | Claim | Result |
|---|---|---|
| 1 | `list (NUM → NUM)` promisedUnblock drops by ≥ 150 | **HOLD.** 172 → 0 (−172) |
| 2 | Coverage may rise. Not the claim. | Gate coverage unchanged (29.87%). Atlas does not score coverage. |
| 3 | Containment must not fall. Inversion stays CONTAINMENT_MISS or becomes contained. | **HOLD.** CONTAINMENT_MISS 411 → 411. `From the AP comes this story` remains CONTAINMENT_MISS. |
| 4 | OVERGENERATED must not rise by more than 1% of scored DEV sentences. | **HOLD.** DEV OVERGENERATED 286 → 286 (+0). Combined 1614 → 1614. |
| 5 | Other interiors' promisedUnblock change by ≤ 10 each. | **MISS by 1.** `obl (NUM → PROPN)` 0 → 11. Punct interiors +0. See below. |

Falsifier (OVERGENERATED or CONTAINMENT_MISS past bounds) did not fire.

## Plate movement

| Plate | Before | After | Δ |
|---|---:|---:|---:|
| LEXICAL | 234 | 234 | 0 |
| GRAMMAR | 7801 | 7647 | −154 |
| ROOT_TYPE_MISMATCH | 1128 | 1282 | +154 |
| CONTAINMENT_MISS | 411 | 411 | 0 |
| OVERGENERATED | 1614 | 1614 | 0 |

154 GRAMMAR timestamps now span as leftover `DATE`. Illumination is not
admission. DATE is not a root.

Accounting on the 172 sole-cause list sentences:

- 154 → spanning DATE (ROOT_TYPE_MISMATCH)
- 11 → `obl (NUM → PROPN)` sole-cause (`X@y.com on 01/25/2002 03:13:58 PM`)
- 7 remain `list` failures, none sole-cause (addresses, `25 Oct 2004 18:32 PDT`)

## The +11 is the next hole, not a punct harvest

All 11 new `obl (NUM → PROPN)` sole-causes are email-on-timestamp lines.
The list-dependent clock is now built. The date's gold subtree still includes
the case-marking `on`, and there is no `P + DATE → PP`. That is a missing
case-wrap, not a list law, and not a punct-absorb.

Punct interiors did not move:

| Interior | promisedUnblock Δ |
|---|---:|
| punct (PUNCT → NOUN) | 0 |
| punct (PUNCT → PROPN) | 0 |
| punct (PUNCT → VERB) | 0 |
| advmod (PART → VERB) | 0 |
| nmod (NOUN → NOUN) | 0 |

Other interior moves inside the cap: `obl (NUM → VERB)` +5,
`nmod:unmarked (NUM → PROPN)` −4.

## What was not done

- No `PUNCT + X → X` absorption
- No hyphen join
- No NUM leftover admission
- No DATE root doorway
- Inversion family not edited
- TEST not opened
