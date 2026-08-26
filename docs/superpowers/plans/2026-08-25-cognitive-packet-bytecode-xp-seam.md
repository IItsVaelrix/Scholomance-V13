# Cognitive Packet to Bytecode XP Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a packet-gated seam that turns a validated Cognitive Bus packet and verified Bytecode diagnostic result into a persistentable Bytecode XP memory envelope.

**Architecture:** Add a server-side JavaScript service that invokes the repository's canonical Python validator through its machine-readable `admit` command, creates a health/error vaccine with stable packet provenance only after a verified-signature receipt, and delegates envelope construction/persistence to `QbitMemoryPersistence.js`. No caller-supplied verdict function or per-packet verification key is accepted.

**Tech Stack:** Node.js ESM, Vitest, existing Bytecode XP/QBIT modules, Python Cognitive Bus validator.

**Spec:** `docs/superpowers/specs/2026-08-25-cognitive-packet-bytecode-xp-seam-design.md`

## Global Constraints

- Do not invent a parallel Cognitive Bus packet schema.
- Do not create XP from a packet that fails admission.
- Do not treat BytecodeHealth as proof of the packet proposition; retain it as diagnostic evidence.
- Exclude timestamps and other volatile fields from deterministic identity.
- Persist only through the existing injected memory client.

---

### Task 1: Add failing seam tests

**Files:**
- Create: `tests/diagnostic/cognitivePacketBytecodeXP.test.js`
- Test: existing Bytecode XP and QBIT modules

**Interfaces:**
- Test the future `buildBytecodeXPFromCognitivePacket` and `persistCognitivePacketBytecodeXP` exports.

- [x] **Step 1: Write tests for valid health and error packet ingestion, real Python admission, deterministic provenance, exact-snapshot use, and persistence refusal.**
- [x] **Step 2: Run the focused test red before implementing the server service and validator fixes.**

### Task 2: Implement packet-gated vaccine construction

**Files:**
- Create: `codex/server/services/cognitivePacketBytecodeXP.service.js`
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/cognitive-bus/scripts/cognitive_packet.py`

**Interfaces:**
- `buildBytecodeXPFromCognitivePacket({ packet, diagnostic })` returns `{ admission, vaccine, envelope }`.
- `persistCognitivePacketBytecodeXP(memoryClient, input, options)` persists via `persistBytecodeXPMemoryEnvelope`.

- [x] **Step 1: Add fail-closed Python admission and diagnostic-shape checks.**
- [x] **Step 2: Add stable packet provenance and call the existing health/error vaccine encoder.**
- [x] **Step 3: Build the existing QBIT memory envelope from the server service.**
- [x] **Step 4: Run the focused real-validator seam tests until green.**

### Task 3: Run regression verification

**Files:**
- Modify: none unless test failures reveal a seam defect.

- [x] **Step 1: Run the diagnostic Vitest surface; report its count separately from Python.**
- [x] **Step 2: Run `python3 'docs/scholomance-encyclopedia/Scholomance LAW/cognitive-bus/tests/test_invariants.py'`; report mechanical and skipped rows separately.**
- [x] **Step 3: Inspect the scoped diff and preserve unrelated dirty work.**
