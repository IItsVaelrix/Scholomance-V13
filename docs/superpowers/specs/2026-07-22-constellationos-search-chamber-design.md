# Design: ConstellationOS Search Chamber

**Date:** 2026-07-22  
**Status:** draft — awaiting owner review  
**Author:** Damien + Cursor  
**Product PDR:** `docs/scholomance-encyclopedia/PDR-archive/Constellation-OS-PDR.md`  
**Visual guardrail:** `docs/superpowers/specs/2026-07-22-visual-phenotype-calculus-design.md` (Plan 1 measurement vector + `/__immune/phenotype` harness)  
**Umbrella:** ConstellationOS for Nexus Wikipedia — Phase entry UI (search chamber → result shell)

---

## 1. Problem

Nexus today is a mastery archive (`NexusPage` + `NexusPanel` word grid). ConstellationOS requires a search-first literary atlas. The first user-facing surface must feel like a **magical search engine**: minimal elegance, Landing-page atmospheric philosophy, more cinematic stillness — beckoning someone to search whatever literary desire they hold.

Interpretation drift on the UI is the secondary risk: agents can restyle quickly and couple contrast, size, density, and stacking without noticing. The phenotype harness exists to catch that class of drift while we move fast.

---

## 2. Decision

Rebuild the Nexus UI from scratch as **ConstellationOS**.

| Concern | Decision |
|--------|----------|
| Approach | **Single-scene morph** — one full-bleed chamber; idle search → submitted rail + result shell |
| Brand | **ConstellationOS** (hero-level) |
| Route | `/constellation` replaces `/nexus`; `/nexus` redirects to `/constellation` |
| Nav | Label **Constellation** (hero on-page remains **ConstellationOS**) |
| Background | Constellation field (stars + sparse edge-lines), not Landing’s storm-orb |
| Submit | Stay on ConstellationOS; morph into fixture-driven result shell |
| Engines | Stubbed / fixture packet for v1 — no live Leximancy or Rhyme Astrology required |
| Mastery | Removed from this page; deferred to mastery overlay (PDR Phase later) |
| Guardrail | Phenotype measure-before-keep loop on declared visual axes |

---

## 3. Non-goals (this rebuild)

- Live ConstellationOS engine orchestration or HTTP `generate` API
- All ten §9 result panels (only Phase 1 skeleton)
- Live search suggestions / autocomplete
- Craft transformations / Open in Read
- GrimDesign school-responsive chrome beyond shared atmospheric tokens
- Claiming accessibility or literary correctness from phenotype measurements
- Plan 2/3 phenotype intent packets / sealed AuthorityProfile gates

---

## 4. Composition (idle)

One composition. Not a dashboard.

**Present:**
- Hero brand: **ConstellationOS**
- One short literary invitation line
- One dominant control: the search field
- Constellation backdrop: sparse star points, faint edges between a few nodes, slow parallax drift (static under `prefers-reduced-motion`)
- Void depth + amethyst/arc restraint shared with Landing palette philosophy

**Absent:**
- Scrying orb, watercolor dissolve, twin-gate ledger
- Mastery word grid, synergy cards, detail pane
- Multi-section marketing copy, stat strips, card grids in the first viewport

Stable measure targets (for phenotype / Playwright):
- `#constellation-search`
- `#constellation-stage` (full scene root)
- `#constellation-result-shell` (present after submit)

---

## 5. Search UX

Aligned with ConstellationOS PDR §8.1.

- Visible accessible `<label>` (not placeholder-only), e.g. **Search the literary sky**
- Rotating client-only placeholders from a small static literary set (e.g. `the bright wound of morning`, `words that rhyme with gravity but feel spiritual`)
- Typing client-side; **no network until submit**
- Submit via Enter or one subdued affordance; empty submit → gentle refusal, remain idle
- Multiline allowed (grow a few lines, then scroll inside the field)
- After submit: field morphs to a compact top rail; result shell occupies the freed space
- Reduced-motion: instant layout swap; no parallax or morph animation

---

## 6. Result shell (v1)

Same scene. Fixture packet drives content. Missing fields show quiet “awaiting engine” states (failure remains local — PDR §7.8). Evidence before explanation — no invented authoritative prose when fixture fields are null (PDR §7.3). Ambiguity is data (PDR §7.4).

**Sections (Phase 1 skeleton only):**

1. **Phrase Identity** — query, kind, token/grapheme counts; bytecode/versions as placeholders  
2. **Leximancy Meaning Field** — shell; alternate interpretations if fixture provides them  
3. **Rhyme Constellation** — accessible text/table required; visual star-chart stub may mirror fixture phonetics, never pure decoration  
4. **Phrase Genome** — compact structural summary shell  

New query from the rail replaces the shell in place. Route remains `/constellation`.

Out of v1 shell: Literary Device Observatory, Unified Atlas (full), Author/Era resonance, Corpus Evidence, Craft Routes, Nexus Mastery Overlay.

---

## 7. Architecture (UI)

```
/constellation
  ConstellationPage (scene root)
    ConstellationBackdrop (stars + edges)
    ConstellationBrand (idle / compressed with rail)
    ConstellationSearch (#constellation-search)
    ConstellationResultShell (#constellation-result-shell)  // mounted after submit
      PhraseIdentity
      LeximancyMeaningField
      RhymeConstellation
      PhraseGenome
```

**Data:** local fixture module (e.g. `src/pages/Constellation/fixtures/samplePagePacket.js`) shaped toward `ConstellationOSPage` from the PDR. Hook stub `useConstellationPage(query)` returns fixture for matching queries / a generic awaiting packet otherwise. No server dependency for v1.

**Routing:**
- Add `path: "constellation"` → `ConstellationPage`
- Redirect `nexus` → `constellation`
- Update Navigation production/dev link set
- Remove or gut `NexusPage` / `NexusPanel` from the active route (files may be deleted or left unreferenced until cleanup commit)

**Progression mastery data** may remain in `useProgression` for future overlay; it must not render on this page in v1.

---

## 8. Visual / motion

- Typography: expressive display for **ConstellationOS**; Georgia/serif for invitation and results body where literary; mono only for bytecode/diagnostics
- Color: CSS variables aligned with Landing portal tokens (amethyst, arc, gold as rare accent) — not purple-on-white generic AI chrome
- Motion: 2–3 intentional beats — (1) starfield drift, (2) search morph idle→rail, (3) result shell rise/fade
- Respect `prefers-reduced-motion` for all three
- No card grid in hero; results may use quiet section rhythm without boxed dashboard clutter

---

## 9. Phenotype guardrail loop

While coding visual changes:

1. Declare the intended axis (e.g. compacting search should move **size** only).
2. If the change is about geometry/contrast/ink/stacking, prototype the physical mutation on `/__immune/phenotype` first when isolation is unclear.
3. Apply the same physical intent on ConstellationOS measure targets.
4. Before/after: only the declared block may change; unexpected coupling → reject the CSS.
5. Re-run the orthogonality matrix only when quantizers change — not for every page CSS tweak.

This loop is the “quick coding with guardrails” method for this rebuild. It does not seal Plan 2 claims.

---

## 10. Acceptance criteria

- [ ] `/constellation` loads a single cinematic search chamber branded **ConstellationOS**
- [ ] Nav exposes Constellation; `/nexus` redirects to `/constellation`
- [ ] Idle first viewport contains brand, one invitation line, one search control, constellation backdrop — no mastery UI
- [ ] Submit with non-empty query morphs to rail + Phase 1 result shell from fixture
- [ ] Empty submit does not leave idle; announces refusal accessibly
- [ ] No network call on keystroke; no network required for fixture results
- [ ] Reduced-motion disables parallax and morph
- [ ] Stable ids `#constellation-search` and `#constellation-result-shell` exist for measurement
- [ ] Phenotype orthogonality suite still green if quantizers untouched
- [ ] Visual regression / smoke: chamber idle + one submitted state

---

## 11. Open points (resolved in this design)

| Question | Resolution |
|----------|------------|
| Approach | Single-scene morph |
| Depth | Entry chamber + Phase 1 result skeleton |
| Submit | Stay on page → result shell |
| Naming | ConstellationOS everywhere user-facing; route `/constellation` |
| Background | Constellation field |
| Guardrail | Phenotype before/after on declared axes |

---

## 12. Follow-ons (not this design)

- Wire `useConstellationPage` to real HTTP generate contract (PDR §17)
- Phase 2–7 sections and GrimDesign procedural chrome
- Mastery overlay
- Phenotype Plan 2/3 intent packets over ConstellationOS surfaces
