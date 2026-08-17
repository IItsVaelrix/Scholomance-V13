# OBSERVE — Phase 3B dark-ends census (complement relations)

ADDITIVE diagnostic. Frozen waterfall census untouched. TEST sealed.

- DEV ≤ 28 tokens: 1824 sentences, threw 0
- TRAIN terminal-mass pass: 10763 sentences, 606 needed lemmas

## Complement-relation decision edges: **6361**

| relation | edges | dark governor (left) | dark complement (right) |
|---|---|---|---|
| INFINITIVAL_COMPLEMENT | 1884 | 1700 | 1884 |
| PROPOSITIONAL_COMPLEMENT | 4477 | 4393 | 4477 |

- dark both ends: 6093 · lit both ends: 0

## Bond shapes projecting complement relations

| bond | edges |
|---|---|
| `S+SBAR->S` | 2034 |
| `VP+INF->VP` | 1305 |
| `SBAR+S->S` | 1245 |
| `VP+SBAR->VP` | 882 |
| `V+INF->VP` | 579 |
| `V+SBAR->VP` | 316 |

## Provider seed audit — can this type EVER light?

| type | any type-level light | lit kinds |
|---|---|---|
| INF | **NO** | — |
| S | **NO** | — |
| SBAR | **NO** | — |
| V | **NO** | — |
| VP | **NO** | — |

## Darkness by (relation, side, type)

| relation | side | type | edges | dark | dark% | distinct lemmas | top lemmas |
|---|---|---|---|---|---|---|---|
| PROPOSITIONAL_COMPLEMENT | right | SBAR | 3232 | 3232 | 100.0% | 140 | have:149 get:94 believe:85 do:73 drive:72 well:71 accurate:66 attack:64 feels:60 looking:58 out:55 flew:54 |
| PROPOSITIONAL_COMPLEMENT | left | S | 2034 | 2034 | 100.0% | 190 | have:131 going:52 wondering:50 based:48 give:48 want:43 interest:42 out:37 make:29 like:29 announced:28 close:28 |
| INFINITIVAL_COMPLEMENT | right | INF | 1884 | 1884 | 100.0% | 139 | do:101 see:59 go:55 have:51 get:47 know:45 drive:43 come:41 catch:41 take:40 make:35 determine:31 |
| INFINITIVAL_COMPLEMENT | left | VP | 1305 | 1305 | 100.0% | 182 | want:61 like:56 going:52 have:41 need:37 place:27 allowed:26 time:23 seems:22 used:22 wants:21 right:20 |
| PROPOSITIONAL_COMPLEMENT | left | SBAR | 1245 | 1245 | 100.0% | 108 | have:163 see:65 take:55 want:38 prefer:37 stall:37 spasms:35 strengthening:34 looking:34 brushing:27 expensive:27 check:26 |
| PROPOSITIONAL_COMPLEMENT | right | S | 1245 | 1245 | 100.0% | 180 | naming:42 need:26 during:26 check:24 help:21 based:21 storm:20 go:19 notify:18 contact:18 up:18 spot:18 |
| PROPOSITIONAL_COMPLEMENT | left | VP | 882 | 882 | 100.0% | 154 | based:43 have:28 get:21 give:20 married:19 know:19 happen:18 going:17 company:16 play:14 used:14 sources:13 |
| INFINITIVAL_COMPLEMENT | left | V | 579 | 395 | 68.2% | 89 | want:50 like:29 need:29 place:23 have:22 wants:21 threatened:20 going:18 used:16 tried:14 seems:13 time:12 |
| PROPOSITIONAL_COMPLEMENT | left | V | 316 | 232 | 73.4% | 79 | company:16 know:13 time:10 sources:10 play:10 understand:9 happen:9 announced:8 fire:8 interest:7 birding:7 place:7 |

## Top dark ends, ranked by decision cells affected

| relation | side | type | lemma | dark edges | cells | TRAIN terminal mass |
|---|---|---|---|---|---|---|
| PROPOSITIONAL_COMPLEMENT | right | SBAR | have | 149 | 124 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | have | 131 | 102 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | believe | 85 | 75 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | drive | 72 | 72 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | get | 94 | 67 | 0 |
| INFINITIVAL_COMPLEMENT | right | INF | do | 101 | 65 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | attack | 64 | 64 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | do | 73 | 63 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | well | 71 | 63 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | accurate | 66 | 63 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | feels | 60 | 56 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | looking | 58 | 52 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | going | 52 | 52 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | heading | 51 | 51 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | wondering | 50 | 50 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | SBAR | have | 163 | 49 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | air | 51 | 48 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | sort | 51 | 48 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | give | 48 | 48 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | strengthening | 46 | 46 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | referred | 46 | 46 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | flew | 54 | 45 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | out | 55 | 44 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | house | 44 | 44 | 0 |
| INFINITIVAL_COMPLEMENT | left | VP | want | 61 | 43 | 0 |
| INFINITIVAL_COMPLEMENT | left | VP | going | 52 | 42 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | interest | 42 | 42 | 0 |
| INFINITIVAL_COMPLEMENT | right | INF | see | 59 | 40 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | got | 44 | 40 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | keeps | 44 | 40 | 0 |
| INFINITIVAL_COMPLEMENT | left | VP | like | 56 | 39 | 0 |
| INFINITIVAL_COMPLEMENT | left | V | want | 50 | 39 | 130 |
| INFINITIVAL_COMPLEMENT | right | INF | go | 55 | 37 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | want | 43 | 37 | 0 |
| INFINITIVAL_COMPLEMENT | right | INF | come | 41 | 36 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | threatening | 39 | 36 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | based | 48 | 35 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | killed | 40 | 32 | 0 |
| INFINITIVAL_COMPLEMENT | left | VP | need | 37 | 32 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | party | 34 | 32 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | recruits | 34 | 32 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | travel | 32 | 32 | 0 |
| INFINITIVAL_COMPLEMENT | right | INF | catch | 41 | 31 | 0 |
| INFINITIVAL_COMPLEMENT | left | VP | have | 41 | 31 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | defend | 31 | 31 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | VP | based | 43 | 30 | 0 |
| INFINITIVAL_COMPLEMENT | right | INF | drive | 43 | 30 | 0 |
| INFINITIVAL_COMPLEMENT | right | INF | get | 47 | 29 | 0 |
| PROPOSITIONAL_COMPLEMENT | right | SBAR | attacks | 34 | 29 | 0 |
| PROPOSITIONAL_COMPLEMENT | left | S | make | 29 | 29 | 0 |
