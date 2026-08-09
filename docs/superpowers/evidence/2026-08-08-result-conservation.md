# Result Conservation Screen — 2026-08-08

**Law:** A bond's result must lie on a licensed projection path of its head,
under the operation performed by the non-head.

**C is derived, not hypothesized.**

## Rediscovery (projection + construction chemistry)

| | ACTIVE |
|---|---|
| Projected candidates | 71 |
| Gold | 68 |
| Signature hits | **68** (100.0%) |
| Full hits | **68** (100.0%) |
| Missed | 0 |
| Viable ≥40 | **YES** |

### Missed

_none_

### Head mismatches

_none_

## Old free-C extras (78) under Result Conservation

| | n |
|---|---|
| In | 78 |
| **Conserved** | **3** |
| **Rejected** | **75** |

### Rejection reasons

| Reason | n |
|---|---|
| result-not-licensed | 37 |
| no-pair-affinity | 29 |
| head-mismatch | 9 |

### Conserved extras (reactor-eligible only)

- \`COP|VP|VP\` h=1 ← project:auxiliary
- \`PP|PUNCT|PP\` h=0 ← project:punct-absorb
- \`VP|PUNCT|VP\` h=0 ← project:punct-absorb

## Soft-reactor fake nuclei

| Signature | Fate |
|---|---|
| \`V|NP|V\` | KILLED |
| \`NP|VP|NP\` | KILLED |
| \`ADV|S|ADV\` | KILLED |
| \`PP|S|PP\` | KILLED |
| \`NP|PUNCT|S\` | KILLED |
| \`DET|N|N\` | KILLED |
| \`ADJ|N|ADJ\` | KILLED |
| \`V|NPO|V\` | KILLED |
| \`V|PP|V\` | KILLED |
| \`ADV|VP|ADV\` | KILLED |

**Killed: 10/10**

## Verdict

**VALIDATED — known grammar regenerates; soft-reactor fakes die under Result Conservation**

## Architecture

```
L × R → affinity → operation → head → projection law → C
```

Not:

```
L × R × C × HEAD   (C free → Honda Civics)
```

## Repro

```bash
node scripts/result-conservation-screen.mjs
```
