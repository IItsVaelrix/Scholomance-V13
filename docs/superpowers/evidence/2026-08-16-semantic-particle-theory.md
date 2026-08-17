# RESULT — Semantic Particle Theory (gate chamber)

**This is not a promotion dossier.** Chamber = frozen 395-sentence treebank gate.
Sealed TEST was not opened. Holm-surviving effects here remain hypotheses.

- commit: `8495daa2103bf5c00ac65360244fbd79aa20e828`
- schema: 1.0.0 `966bff0e44a40097…`
- analysed 395, skipped 105, threw 0
- coverage off/on 29.9% / 29.9%
- gold containment off/on 18.0% / 18.0%
- forest fingerprint mismatches: 0
- determinism: report true / forest true
- chamber verdict: **CHAMBER_SAFE_NO_PROMOTION**

| Theory | n | Treatment | Control | p | Holm | Verdict |
|---|---:|---:|---:|---:|---:|---|
| T1 microfeatures | 1513 | 57.5% | derange 57.5% | — | — | NO_INFERENTIAL_TEST |
| T2 selectional | 22 | 22.7% | unigram 36.4% | 0.25 | 0.75 | CONTROL_WINS_OR_FLAT |
| T3 forest | 38 | 26.3% | first 23.7% | 1 | 1 | DIRECTION_ONLY |
| T4 capability | 1 | observer | standing law | — | — | OBSERVER_HELD |
| T5 reachability | 504 | 54.2% | shuffle p95 46.4% | 0 | 0 | BEATS_SHUFFLE |
| T6 probes | 80 | sep 15.88027 | matched swap | — | — | NO_INFERENTIAL_TEST |
| T7 bindings | 44 | exact 70.5% | bag 72.7% | 1 | 1 | CONTROL_WINS_OR_FLAT |
| T8 bottleneck | 4 | kept 4 | full inventory | — | — | NO_COMPRESSION |
| T9 catalyst | 6 | TO rank 1 | frequency | — | — | HISTORICAL_TO_RANKED_FIRST |
| T10 DPP | 17 | families 1 | top-k 1 | — | — | CEILING_PRESERVED |

T5 shuffle spread: mean 42.2%, sd 2.5%, p95 46.4%, permutation p = 0 over 100 draws.

T4 `Round!` still spans as S: true. Cycle census ok: true. Events identical: true. Rec-pres identical: true.

Reproduction: `node scripts/semantic-particle-theory-experiment.mjs`

