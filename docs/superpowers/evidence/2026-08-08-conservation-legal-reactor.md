# Conservation-Legal Reactor — 2026-08-08

**Candidates:** only `synthesizeByProjection() − ACTIVE_CONSTRUCTIONS`  
**Count:** 3 (not the free-C 78)

## Candidates

- \`COP|VP|VP\` head=1 — project:auxiliary
- \`PP|PUNCT|PP\` head=0 — project:punct-absorb
- \`VP|PUNCT|VP\` head=0 — project:punct-absorb

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | 22.5% (451) | 22.9% (476) |
| Root | 613 | 644 |
| Ensemble | 138 | 130 |
| Span / nsubj | 76.26% / 88.88% | 75.65% / 88.28% |
| Mean events | 86.6 | 82.9 |

## DEV outcomes

| Signature | Fate | Δroot | Δens | Δcov | Δspan pp |
|---|---|---|---|---|---|
| \`COP|VP|VP\` | NO-GAIN | 0 | 0 | 0 | 0.00 |
| \`PP|PUNCT|PP\` | NO-GAIN | 0 | 0 | 0 | 0.00 |
| \`VP|PUNCT|VP\` | NO-GAIN | 0 | 0 | 0 | 0.00 |

## Held-out

| Signature | Result |
|---|---|
| _(no DEV survivors)_ | |

## Synthesized nuclei

_None._

## Verdict

No conservation-legal extra survived as a productive held-out nucleus. Projection physics already saturates the active chart for these pairs; remaining gains are elsewhere (closure families, not free result types).

## Repro

```bash
node scripts/conservation-legal-reactor.mjs
```
