# Skill: Phenotypic Idealism (DivTube Cockpit)

Use when the operator asks for latent boons, connective tissue, phenotypic idealism,
or runs `/phenotypic` / tool `phenotypic_ideal`.

## Pipeline

1. Call Cockpit tool `phenotypic_ideal` **or** MCP `mcp_scholomance_collab_phenotypic_ideal`
   (aliases: `phenotypic_ideal`, `phenotypic`) with the operator query
   (optional `scope`: `repo` | `divtube`).
2. Receive a `PHENOTYPIC-IDEAL-v1` packet (TurboQuant hits + SCDNA capabilities/genes + `boonSeeds`).
3. Conceptualize a **ranked Boon Report** from the seeds — do not invent archaeology.

## Hard rules

- Every boon **must cite** `evidenceRefs` from the packet (`hit` and/or `capability` indices).
- Do **not** invent capabilities absent from `evidence.capabilities`.
- If capabilities are empty: work from hit-only seeds at lower confidence; you may propose a
  **capability packet draft** (curation candidate) — never claim it as existing archaeology.
- Prefer additive, reversible bridges (adapter / registry / schema / shared util / sync layer).

## Boon report shape

For each ranked boon include:

| Field | Content |
|-------|---------|
| Rank + title | From `titleHint`, refined |
| Classification | cosmetic / structural / behavioral / architectural |
| Scores | Coherence · Velocity · Safety · Reuse · Future-proof (1–5) |
| Evidence | Paths + capability domains cited via evidenceRefs |
| Gap | Ideal vs observed (from `phenotype.gap`) |
| Smallest bridge | Concrete next step + files to touch |

## Related

- Design: `docs/superpowers/specs/2026-07-19-phenotypic-idealism-design.md`
- Merge skill: `docs/scholomance-encyclopedia/Scholomance LAW/disparate-part-merge-skill.md`
- CLI: `npm run phenotypic:ideal -- "<query>"`
