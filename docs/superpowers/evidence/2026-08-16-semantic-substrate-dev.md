# RESULT — Semantic Substrate DEV tribunal

TEST was not opened. T3 was not run. T1 accuracy is omitted unless exposure passes.

- commit `8495daa2103bf5c00ac65360244fbd79aa20e828`
- T1 exposure: **INSUFFICIENT_EXPOSURE**
  ambiguous 8073, evidence 46.6%, UNKNOWN 53.4%, score-disagree 10.5%, rank-disagree 148
  failures: minEvidenceRate, maxAllUnknownRate
- T1 accuracy: withheld (exposure gate)
- T2 n=189 fallback=first-if-abstain
  first 26.5% unigram 23.8% forward 28.0% inverse 28.0% both 28.0%
  role-shuffle 27.5% pred-shuffle 27.0% filler-shuffle 27.5% null 26.5%
  both vs first 8/5 p = 0.5811; vs unigram 30/22 p = 0.3317; vs role-shuffle 6/5 p = 1
  forward present 26/189, inverse present 26/189, forward=both 189/189, inverse=both 189/189
- protection coverage 32.1% containment 20.8% threw 0 fingerprints true

Reproduction: `node scripts/semantic-substrate-dev.mjs`

