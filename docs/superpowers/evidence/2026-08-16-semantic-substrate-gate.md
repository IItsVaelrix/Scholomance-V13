# RESULT — Semantic Substrate Gate

T3–T10 efficacy was not run. TEST was not opened.

- commit: `8495daa2103bf5c00ac65360244fbd79aa20e828`
- inventory 1.1.0, maxTokens 28
- chamber: 1091 ambiguous spanning sentences (dev 189, train 902)
- coverage 27.2%, containment 18.4%, threw 0
- fingerprints identical on 12 replay pairs: true

## T2 autopsy (gate replay)

3 charge-induced losses vs unigram. Repair: `none` (minSupport=0, cap=null, direction=both).

- `weblog-blogspot.com_thelameduck_20041119192207_ENG_20041119_192207-0009` gold {"subject":"that","verb":"seems"} unigram {"subject":"that","verb":"seems"} charge {"subject":null,"verb":"Right"}
  winner pairCount=undefined fwd=null inv=null goldAbstain=true goldPair=undefined
- `email-enronsent29_01-0038` gold {"subject":"it","verb":"CES"} unigram {"subject":"it","verb":"CES"} charge {"subject":"was","verb":"purchase"}
  winner pairCount=undefined fwd=null inv=null goldAbstain=true goldPair=undefined
- `answers-20111107173110AA0lVuB_ans-0002` gold {"subject":"we","verb":"going"} unigram {"subject":"we","verb":"going"} charge {"subject":"trip","verb":"going"}
  winner pairCount=undefined fwd=null inv=null goldAbstain=true goldPair=undefined

## T1 exposure

ambiguous 6933, evidence 27.1%, UNKNOWN 72.9%, score-disagree 1.6%, rank-disagree 7
exposure verdict: **INSUFFICIENT_EXPOSURE**
failures: minEvidenceRate, minScoreDisagreementRate, minRankDisagreements, maxAllUnknownRate
T1 first 52.2% real 59.8% derange 59.8%
paired 0/0 p=1
efficacy: **INSUFFICIENT_EXPOSURE**

## T2 tribunal

n=537 first 34.8% unigram 25.0% forward 38.4% inverse 38.4% both 38.4% shuffled 35.9% repaired 38.4%
both vs unigram 109/37 p=0

Reproduction: `node scripts/semantic-substrate-gate.mjs`

