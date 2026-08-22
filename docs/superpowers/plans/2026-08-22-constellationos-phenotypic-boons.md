# ConstellationOS Phenotypic Boons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan with review checkpoints.

**Goal:** Implement all five approved ConstellationOS boons with deterministic evidence and measured boundaries.

**Architecture:** Preserve `Server -> Runtime -> Services -> Core`; keep parser evaluation offline; place pure evidence and path policy in Core; leave orchestration and degradation policy in the Server service.

**Tech Stack:** Node.js ESM, Vitest, Python/pytest, SCDNA capability compiler, Scholomance vector index.

**Spec:** `docs/superpowers/specs/2026-08-22-constellationos-phenotypic-boons-design.md`

## Global constraints

- Do not wire `composePacked` into the live page request path.
- Do not treat coverage as parse accuracy or product behavior.
- Do not emit raw input text, timestamps, or environment values in evidence.
- Preserve unrelated dirty-worktree changes.
- Add a failing test before each implementation change and verify focused tests before integration.

---

## Task 1: Bound the classic parser smoke

**Files:**

- Modify: `tests/qa/features/constellation-treebank.test.js`

- [ ] Confirm the current corpus smoke exceeds its timeout.
- [ ] Replace fixture-file loading with one hand-authored CoNLL-U record and bounded POS map.
- [ ] Correct the stale comment about the default parser.
- [ ] Run the focused treebank test and confirm completion.

## Task 2: Build deterministic evaluation evidence

**Files:**

- Create: `tests/qa/features/constellation-evaluation-evidence.test.js`
- Create: `codex/core/constellation/evaluation-evidence.js`
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`

- [ ] Specify output shape, ordering, redaction, checksum, immutability, and validation in tests.
- [ ] Implement the pure canonical report adapter and recursive freeze.
- [ ] Register `SCHOL-CONSTELLATION-EVALUATION-EVIDENCE-v1` and version 1.47.
- [ ] Run focused evidence and schema tests.

## Task 3: Overlap independent page channels

**Files:**

- Modify: `tests/qa/features/constellationPage.service.test.js`
- Modify: `codex/server/services/constellationPage.service.js`

- [ ] Add a red test proving async rhyme starts before synchronous leximancy lookup.
- [ ] Start both channel runs before awaiting their fixed-order pair.
- [ ] Preserve stable degradation ordering and downstream dependencies.
- [ ] Run focused page-service and runtime tests.

## Task 4: Clean the semantic index

**Files:**

- Create: `tests/unit/codebase-path-policy.test.js`
- Create: `codex/core/codebase-path-policy.js`
- Modify: `scripts/index_codebase_vectors.js`
- Modify: `codex/server/services/codebaseSearch.service.js`

- [ ] Add red policy tests for `venv`, `.venv*`, `.worktrees`, caches, and generated directories.
- [ ] Implement one shared pure ignore policy.
- [ ] Wire both vector indexing and lexical fallback traversal to it.
- [ ] Run focused path/search tests, rebuild the index, and prove excluded paths are absent.

## Task 5: Compile the ConstellationOS capability

**Files:**

- Create: `steamdeck_brain/vaelrix_forcefield/tests/test_constellation_capability_packet.py`
- Create: `docs/superpowers/evidence/2026-08-22-constellation-os.capability.draft.json`
- Generate: `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/constellation-os.capability.json`

- [ ] Add a red repository test for domain, surfaces, needs, paths, and checksum.
- [ ] Author a curated draft with verified symbols and explicit forbidden boundaries.
- [ ] Dry-run, compile, and validate the packet.
- [ ] Re-run phenotypic discovery and confirm the capability is discoverable.

## Task 6: Integrated verification and UX report

- [ ] Run all focused tests together.
- [ ] Run schema, Constellation QA, and capability verification gates.
- [ ] Review `git diff --check`, status, and scope against the unrelated dirty files.
- [ ] Release collaboration locks and mark the agent offline.
- [ ] Report implementation outcomes and the UX of phenotypic idealism, microscope, telescope, Atlas, collaboration, tests, compiler, and indexer.
