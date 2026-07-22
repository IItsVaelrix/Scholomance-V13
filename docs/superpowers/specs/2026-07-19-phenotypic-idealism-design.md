# Design: Phenotypic Idealism Force Multiplier

**Date:** 2026-07-19  
**Status:** approved  
**Author:** Damien + Cursor  
**Extends:** `docs/superpowers/specs/2026-07-17-tool-substrate-design.md` (capability packets as evidence)  
**Boon judgment:** `docs/scholomance-encyclopedia/Scholomance LAW/disparate-part-merge-skill.md`

## 1. Problem

DivTube Cockpit needs a TUI-native force multiplier: the AI should conceptualize latent **boons** (connective tissue, not neat refactors) from the TurboQuant codebase substrate, guided by SCDNA archaeology — without inventing capabilities that do not exist.

Word-keyed gene inject fails when the operator does not already know the answer vocabulary (tool-substrate §2). Artifact-keyed search + capability packets fix retrieval; Phenotypic Idealism turns that retrieval into a packet the AI can judge.

## 2. Solution

Compose pipeline (no LLM inside npm):

```text
query
  → TurboQuant / codebase search (npm)
  → SCDNA evidence attach (capabilities + genes)
  → phenotype gap (ideal vs observed)
  → PHENOTYPIC-IDEAL-v1 packet with boonSeeds[]
  → DivTube Cockpit /phenotypic + tool phenotypic_ideal
  → AI conceptualizes ranked boon report (must cite evidenceRefs)
```

Capability packets (`SCDNA-CAPABILITY-v1`) stay curated archaeology.  
`PHENOTYPIC-IDEAL-v1` is a **derived per-query** packet — not curated, not checksummed as law.

## 3. Packet contract — `PHENOTYPIC-IDEAL-v1`

| Field | Meaning |
|-------|---------|
| `contract` | `"PHENOTYPIC-IDEAL-v1"` |
| `version` | semver string |
| `query` | operator query |
| `scope` | `repo` \| `divtube` |
| `assembledAt` | ISO-8601 |
| `search.engine` | e.g. `float32-cosine-v1` |
| `search.hits[]` | `{ path, score, preview, chunkIndex }` |
| `evidence.capabilities[]` | matched capability packet summaries |
| `evidence.genes[]` | compact SCDNA gene strings |
| `phenotype.ideal` | what should already be connected / reused |
| `phenotype.observed` | what hits show is wired |
| `phenotype.gap` | structured delta |
| `boonSeeds[]` | heuristic seeds — not finished boon prose |

Each `boonSeed` requires:

- `titleHint`, `classification` (`cosmetic` \| `structural` \| `behavioral` \| `architectural`)
- `evidenceRefs[]` (indices into capabilities and/or hits — **mandatory, non-empty**)
- `suggestedBridge` (`adapter` \| `registry` \| `schema` \| `shared_util` \| `sync_layer`)
- `confidence` (0–1)

Empty `evidence.capabilities` is valid; seeds then cite hits only at lower confidence.

## 4. Surfaces

| Surface | Behavior |
|---------|----------|
| `npm run phenotypic:ideal -- "<query>" [--scope divtube\|repo]` | Emit JSON packet to stdout |
| Bridge `phenotypic-ideal` | Same compose for Cockpit |
| `/phenotypic <query>` · `/phenotypic last` | TUI control surface |
| Tool `phenotypic_ideal` | Cockpit agent toolbelt |
| MCP `mcp_scholomance_collab_phenotypic_ideal` | Collab MCP (aliases: `phenotypic_ideal`, `phenotypic`) — stdio + HTTP `/mcp` |
| `tui/skills/phenotypic_idealism.md` | AI handoff rules |

## 5. AI hard rules

1. Every boon must cite `evidenceRefs` from the packet.  
2. Do not invent capabilities absent from `evidence.capabilities`.  
3. Missing archaeology → optional **capability packet draft** (curation candidate), never claim as existing.  
4. Rank with merge-skill dimensions: Coherence / Velocity / Safety / Reuse / Future-proof.

## 6. Out of scope (v1)

- Auto-writing curated `SCDNA-CAPABILITY-v1` packets  
- LLM inside the npm script  
- Web UI for phenotypic results  
