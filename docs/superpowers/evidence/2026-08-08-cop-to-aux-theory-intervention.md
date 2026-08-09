# COP → AUX Theory Intervention — 2026-08-08

**Goal:** Improve linguistic fidelity without changing parse performance.  
**Architectural proof:** Construction Registry can migrate theory independently of chart metrics.

## Change

| Before | After |
|---|---|
| Be-forms typed **COP only** | Be-forms emit **COP and AUX** |
| `COP + VP → VP` active in BONDS | **Deprecated** — not projected into BONDS |
| Progressive/passive via COP | Progressive/passive via **`AUX + VP → VP`** (status: grammar) |
| Head index | **Unchanged** (1 = lexical VP) |

Grimoire: `cop-vp-mislabel` → `status: deprecated`.  
`aux-vp` promoted to `status: grammar` (still one AUX+VP for perfect/do/prog/pass — subtypes later).

## Predicted

Coverage, containment, casting, headship flat.  
COP+VP use on correct paths → 0.  
Critical path flag mass drops.

## Measured (EWT dev, packed)

| Metric | Before (ultimate diagnostic) | After |
|---|---|---|
| Coverage | 21.7% (435/2001) | **21.7% (435/2001)** |
| Gold-in-ensemble (scoreable) | 52.2% (133/255) | **52.2% (133/255)** |
| Headship-clean paths | 85.7% (114/133) | **85.7% (114/133)** |
| COP+VP on correct paths | 30 | **0** |
| AUX+VP with gold be-aux | (mixed via COP) | **18** (same sentences, correct category) |
| Critical path hits | 36 (27.1%) | **6 (4.5%)** |
| Active BONDS | 68 | **67** |

**Verdict: CONFIRMED theory-only intervention.**  
Performance flat. Theory cleanliness improved. Registry migration works.

## Tests

135/135 green (grimoire, anatomy, compose, packed).

## Lesson

Do this class of change **before** grammar growth. It banks confidence that:

1. Grimoire is the real control plane  
2. Headship can stay fixed while category theory moves  
3. Later closure work won't confuse theory wins with coverage wins  
