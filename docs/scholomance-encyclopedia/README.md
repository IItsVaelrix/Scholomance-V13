# Scholomance Encyclopedia

## The Living Memory of the Codebase

> "No fix is complete without its story."

**Global Search Anchor:** `SCHOL-ENC-BYKE-SEARCH`

---

## Purpose

The Scholomance Encyclopedia is the canonical repository of bug fix documentation, architectural decisions, product design requirements, post-implementation reports, verdicts, handoffs, and operational knowledge.

This is not a changelog. This is deep technical narrative: what changed, why it changed, what broke, what was learned, and what future agents must not forget.

---

## Hygiene

Run the encyclopedia hygiene audit after adding, moving, or renaming entries:

```bash
node docs/scholomance-encyclopedia/tools/audit-hygiene.mjs
```

The audit checks root law entrypoints, archive index coverage, missing files, and zero-byte encyclopedia artifacts.

---

## Search

- **Global audit:** search for `SCHOL-ENC-BYKE-SEARCH`.
- **Bug-specific audit:** search for `SCHOL-ENC-BUG-`.
- **CLI:** `rg "SCHOL-ENC-(BYKE-SEARCH|BUG-)" docs/scholomance-encyclopedia`

---

## Orders of Knowledge

### Scholomance LAW

Foundational mandates and contracts that govern agents and systems.

- [`AGENTS.md`](./Scholomance%20LAW/AGENTS.md)
- [`ARCH_CONTRACT_OVERLAY_INTEGRITY.md`](./Scholomance%20LAW/ARCH_CONTRACT_OVERLAY_INTEGRITY.md)
- [`Bar Exam Skill.txt`](./Scholomance%20LAW/Bar%20Exam%20Skill.txt)
- [`Bar Exam Study Guide.txt`](./Scholomance%20LAW/Bar%20Exam%20Study%20Guide.txt)
- [`CLAUDE.md`](./Scholomance%20LAW/CLAUDE.md)
- [`CODEX.md`](./Scholomance%20LAW/CODEX.md)
- [`CURSOR.md`](./Scholomance%20LAW/CURSOR.md)
- [`ENGINEERING_RULEBOOK.md`](./Scholomance%20LAW/ENGINEERING_RULEBOOK.md)
- [`GEMINI.md`](./Scholomance%20LAW/GEMINI.md)
- [`SCHEMA_CONTRACT.md`](./Scholomance%20LAW/SCHEMA_CONTRACT.md)
- [`SHARED_PREAMBLE.md`](./Scholomance%20LAW/SHARED_PREAMBLE.md)
- [`UNITY.md`](./Scholomance%20LAW/UNITY.md)
- [`VAELRIX_LAW.md`](./Scholomance%20LAW/VAELRIX_LAW.md)
- [`forensic-search.skill`](./Scholomance%20LAW/forensic-search.skill)
- [`modular-defragmentation.md`](./Scholomance%20LAW/modular-defragmentation.md)
- [`PIR-skill.md`](./Scholomance%20LAW/PIR-skill.md)
- [`RESONANCE_LAW.md`](./Scholomance%20LAW/RESONANCE_LAW.md)
- [`animation-archeology-skill.md`](./Scholomance%20LAW/animation-archeology-skill.md)
- [`disparate-part-merge-skill.md`](./Scholomance%20LAW/disparate-part-merge-skill.md)
- [`law-enforcer-skill.md`](./Scholomance%20LAW/law-enforcer-skill.md)
- [`professional-ui-architect-skill.md`](./Scholomance%20LAW/professional-ui-architect-skill.md)
- [`school-completeness-guard-skill.md`](./Scholomance%20LAW/school-completeness-guard-skill.md)
- [`scholomance-feedback.md`](./Scholomance%20LAW/scholomance-feedback/scholomance-feedback.md)
- [`vaelrix-law-debug.skill`](./Scholomance%20LAW/vaelrix-law-debug.skill)
- [`vaelrix-law.skill`](./Scholomance%20LAW/vaelrix-law.skill)
- [`Screenshot_20260620_091832.png`](./Scholomance%20LAW/Screenshot_20260620_091832.png)

### Scholomance Bug Reports

The forensic record of failures, fixes, and lessons learned.

- [`BUG-2026-03-28-INITIAL-AUDIT.md`](./Scholomance%20Bug%20Reports/BUG-2026-03-28-INITIAL-AUDIT.md)
- [`BUG-2026-03-29-SKITTLES.md`](./Scholomance%20Bug%20Reports/BUG-2026-03-29-SKITTLES.md)
- [`BUG-2026-04-02-WHITESPACE-ALIGNMENT.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-02-WHITESPACE-ALIGNMENT.md)
- [`BUG-2026-04-03-DEV-MISSING-BACKEND.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-03-DEV-MISSING-BACKEND.md)
- [`BUG-2026-04-03-LOCK-SYNC-SPLIT.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-03-LOCK-SYNC-SPLIT.md)
- [`BUG-2026-04-03-PB-SANI-FINGERPRINTING.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-03-PB-SANI-FINGERPRINTING.md)
- [`BUG-2026-04-03-SYSTEM-STABILIZATION.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-03-SYSTEM-STABILIZATION.md)
- [`BUG-2026-04-26-IPV6-PROXY-BLINDNESS.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-26-IPV6-PROXY-BLINDNESS.md)
- [`BUG-2026-04-27-COGNITIVE-BUS-MISAPPROPRIATION.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-27-COGNITIVE-BUS-MISAPPROPRIATION.md)
- [`BUG-2026-04-27-RECURSIVE-SHADOW.md`](./Scholomance%20Bug%20Reports/BUG-2026-04-27-RECURSIVE-SHADOW.md)
- [`BUG-2026-05-08-CARET-STICKING-DRIFT.md`](./Scholomance%20Bug%20Reports/BUG-2026-05-08-CARET-STICKING-DRIFT.md)
- [`BUG-2026-05-08-INPUT-LAG-COMPLETIONS.md`](./Scholomance%20Bug%20Reports/BUG-2026-05-08-INPUT-LAG-COMPLETIONS.md)
- [`BUG-2026-05-08-TRUESIGHT-SEMANTIC-AMBIGUITY.md`](./Scholomance%20Bug%20Reports/BUG-2026-05-08-TRUESIGHT-SEMANTIC-AMBIGUITY.md)
- [`BUG-2026-05-09-MISSING-VIEWPORT-BYTECODE.md`](./Scholomance%20Bug%20Reports/BUG-2026-05-09-MISSING-VIEWPORT-BYTECODE.md)
- [`BUG-2026-05-09-REJECTED-WATER-SOURCE.md`](./Scholomance%20Bug%20Reports/BUG-2026-05-09-REJECTED-WATER-SOURCE.md)
- [`BUG-2026-06-04-VECTOR-AMP-FIDELITY-ALIGNMENT.md`](./Scholomance%20Bug%20Reports/BUG-2026-06-04-VECTOR-AMP-FIDELITY-ALIGNMENT.md)
- [`BUG-2026-06-03-SQLITE-BUSY-STATE-DRIFT.md`](./Scholomance%20Bug%20Reports/BUG-2026-06-03-SQLITE-BUSY-STATE-DRIFT.md)
- [`BUG-2026-06-20-TRUESIGHT-LATTICE-METRIC-DRIFT.md`](./Scholomance%20Bug%20Reports/BUG-2026-06-20-TRUESIGHT-LATTICE-METRIC-DRIFT.md)
- [`BUG-FIX-PLAN-2026-04-26-DISCONNECTED-LOGIC.md`](./Scholomance%20Bug%20Reports/BUG-FIX-PLAN-2026-04-26-DISCONNECTED-LOGIC.md)
- [`BUG-TEMPLATE.md`](./Scholomance%20Bug%20Reports/BUG-TEMPLATE.md)

### PDR Archive

Product Design Requirements: intent before implementation.

- [`README.md`](./PDR-archive/README.md)

The PDR archive README is the exhaustive PDR index.

### Post-Implementation Reports

Reality after implementation.

- [`DEVELOPER_PRODUCTIVITY_METRICS_WEEK_13_2026.md`](./post-implementation-reports/DEVELOPER_PRODUCTIVITY_METRICS_WEEK_13_2026.md)
- [`PIR-2026-04-26-TURBOQUANT-ASCENSION.md`](./post-implementation-reports/PIR-2026-04-26-TURBOQUANT-ASCENSION.md)
- [`PIR-20260405-LEXORACLE-S1-S2.md`](./post-implementation-reports/PIR-20260405-LEXORACLE-S1-S2.md)
- [`PIR-20260419-THOROUGH-AI-COMBAT.md`](./post-implementation-reports/PIR-20260419-THOROUGH-AI-COMBAT.md)
- [`PIR-20260424-IDE-ATMOSPHERE-MICROPROCESSORS.md`](./post-implementation-reports/PIR-20260424-IDE-ATMOSPHERE-MICROPROCESSORS.md)
- [`PIR-20260526-GODOT-EXPORT-PHASE-1.md`](./post-implementation-reports/PIR-20260526-GODOT-EXPORT-PHASE-1.md)
- [`PIR-20260526-GODOT-EXPORT-PHASE-2.md`](./post-implementation-reports/PIR-20260526-GODOT-EXPORT-PHASE-2.md)
- [`PIR-20260526-GODOT-EXPORT-PHASE-3.md`](./post-implementation-reports/PIR-20260526-GODOT-EXPORT-PHASE-3.md)
- [`PIR-20260526-GODOT-EXPORT-PHASE-4.md`](./post-implementation-reports/PIR-20260526-GODOT-EXPORT-PHASE-4.md)
- [`PIR-20260526-GODOT-EXPORT-PHASE-5.md`](./post-implementation-reports/PIR-20260526-GODOT-EXPORT-PHASE-5.md)
- [`PIR-20260603-GRIMDESIGN-SKILL.md`](./post-implementation-reports/PIR-20260603-GRIMDESIGN-SKILL.md)
- [`PIR-20260603-LANDING-PHONEME-SIGIL-RING.md`](./post-implementation-reports/PIR-20260603-LANDING-PHONEME-SIGIL-RING.md)
- [`PIR-20260603-PHOTONIC-RETINA-PHASE-3.md`](./post-implementation-reports/PIR-20260603-PHOTONIC-RETINA-PHASE-3.md)
- [`PIR-20260604-DIAGNOSTIC-A-GRADE-HARDENING.md`](./post-implementation-reports/PIR-20260604-DIAGNOSTIC-A-GRADE-HARDENING.md)
- [`PIR-20260604-DIAGNOSTIC-SUBSYSTEM-TIGHTENING.md`](./post-implementation-reports/PIR-20260604-DIAGNOSTIC-SUBSYSTEM-TIGHTENING.md)
- [`PIR-20260604-CCCB-PHASE-1.md`](./post-implementation-reports/PIR-20260604-CCCB-PHASE-1.md)
- [`PIR-20260604-BYTECODE-XP-VACCINE-PHASE-2.md`](./post-implementation-reports/PIR-20260604-BYTECODE-XP-VACCINE-PHASE-2.md)
- [`PIR-20260604-QBIT-PULSE-PHASE-3.md`](./post-implementation-reports/PIR-20260604-QBIT-PULSE-PHASE-3.md)
- [`PIR-20260604-QBIT-PROBE-ENRICHMENT-PHASE-4.md`](./post-implementation-reports/PIR-20260604-QBIT-PROBE-ENRICHMENT-PHASE-4.md)
- [`PIR-20260604-QBIT-MEMORY-PERSISTENCE-PHASE-5.md`](./post-implementation-reports/PIR-20260604-QBIT-MEMORY-PERSISTENCE-PHASE-5.md)
- [`PIR-20260604-DIAGNOSTIC-MEMORY-SCAN-WRITES.md`](./post-implementation-reports/PIR-20260604-DIAGNOSTIC-MEMORY-SCAN-WRITES.md)
- [`PIR-20260604-VECTOR-AMP-SAVAGE-AUDIT-FIXES.md`](./post-implementation-reports/PIR-20260604-VECTOR-AMP-SAVAGE-AUDIT-FIXES.md)
- [`PIR-20260604-LISTEN-SAVAGE-AUDIT-FIXES.md`](./post-implementation-reports/PIR-20260604-LISTEN-SAVAGE-AUDIT-FIXES.md)
- [`PIR-20260604-WAND-PHOTONIC-BRIDGE-INTEGRATION.md`](./post-implementation-reports/PIR-20260604-WAND-PHOTONIC-BRIDGE-INTEGRATION.md)
- [`PIR-20260606-COMBAT-COHERENCE-PATCH.md`](./post-implementation-reports/PIR-20260606-COMBAT-COHERENCE-PATCH.md)
- [`PIR-20260606-COMPOSITE-CHILD-ROTATION.md`](./post-implementation-reports/PIR-20260606-COMPOSITE-CHILD-ROTATION.md)
- [`PIR-20260606-SHADER_FORGE.md`](./post-implementation-reports/PIR-20260606-SHADER_FORGE.md)
- [`PIR-20260606-VERSEIR-COMBAT-CONNECTION.md`](./post-implementation-reports/PIR-20260606-VERSEIR-COMBAT-CONNECTION.md)
- [`PIR-20260611-ASSONANCE-COLOR-HYGIENE.md`](./post-implementation-reports/PIR-20260611-ASSONANCE-COLOR-HYGIENE.md)
- [`PIR-20260611-CHROMATIC-TRANSMUTATION-AMP.md`](./post-implementation-reports/PIR-20260611-CHROMATIC-TRANSMUTATION-AMP.md)
- [`PIR-20260611-GRIMOIRE-LIBRARY-FINALIZATION.md`](./post-implementation-reports/PIR-20260611-GRIMOIRE-LIBRARY-FINALIZATION.md)
- [`PIR-20260611-IDE-TRUESIGHT-VISUALISER-COLOR.md`](./post-implementation-reports/PIR-20260611-IDE-TRUESIGHT-VISUALISER-COLOR.md)
- [`PIR-20260611-KNOWN-COLOR-MICROPROCESSORS.md`](./post-implementation-reports/PIR-20260611-KNOWN-COLOR-MICROPROCESSORS.md)
- [`PIR-20260611-LATTICE-GRID-FEATURE.md`](./post-implementation-reports/PIR-20260611-LATTICE-GRID-FEATURE.md)
- [`PIR-20260611-PIXELBRAIN-CONNECTIVE-TISSUE-SEVEN-SYSTEMS.md`](./post-implementation-reports/PIR-20260611-PIXELBRAIN-CONNECTIVE-TISSUE-SEVEN-SYSTEMS.md)
- [`PIR-20260611-PIXELBRAIN-SQUARE-SHARPNESS-CONTRAST-AMP.md`](./post-implementation-reports/PIR-20260611-PIXELBRAIN-SQUARE-SHARPNESS-CONTRAST-AMP.md)
- [`PIR-20260611-PIXELBRAIN-TEMPLATE-LATTICE.md`](./post-implementation-reports/PIR-20260611-PIXELBRAIN-TEMPLATE-LATTICE.md)
- [`PIR-20260612-FOUNDRY-ASEPRITE-BRIDGE.md`](./post-implementation-reports/PIR-20260612-FOUNDRY-ASEPRITE-BRIDGE.md)
- [`PIR-20260612-PIXELBRAIN-DETERMINISTIC-PRO-CHESTPLATE.md`](./post-implementation-reports/PIR-20260612-PIXELBRAIN-DETERMINISTIC-PRO-CHESTPLATE.md)
- [`PIR-20260612-PIXELBRAIN-1TO1-ASEPRITE.md`](./post-implementation-reports/PIR-20260612-PIXELBRAIN-1TO1-ASEPRITE.md)
- [`PIR-20260612-PIXELBRAIN-SHAPE-GRAMMAR-ROUTER.md`](./post-implementation-reports/PIR-20260612-PIXELBRAIN-SHAPE-GRAMMAR-ROUTER.md)
- [`PIR-20260612-VOID-CHESTPLATE.md`](./post-implementation-reports/PIR-20260612-VOID-CHESTPLATE.md)
- [`PIR-20260613-MCP-STDIO-HYGIENE.md`](./post-implementation-reports/PIR-20260613-MCP-STDIO-HYGIENE.md)
- [`PIR-20260613-SCHOLOTIME-TYPOGRAPHY-MOVIES.md`](./post-implementation-reports/PIR-20260613-SCHOLOTIME-TYPOGRAPHY-MOVIES.md)
- [`PIR-20260613-STARBOUND-ESPER-CHIBI-STYLE.md`](./post-implementation-reports/PIR-20260613-STARBOUND-ESPER-CHIBI-STYLE.md)
- [`PIR-20260617-VOIDMETAL-CAVE-WASD.md`](./post-implementation-reports/PIR-20260617-VOIDMETAL-CAVE-WASD.md)
- [`PIR-20260617-VOXEL-BLOCK-IDENTITY.md`](./post-implementation-reports/PIR-20260617-VOXEL-BLOCK-IDENTITY.md)
- [`PIR-20260617-VOXEL-CHARACTER-SWEPT-AABB.md`](./post-implementation-reports/PIR-20260617-VOXEL-CHARACTER-SWEPT-AABB.md)
- [`PIR-20260618-VOID-SCHOLAR-ALT-C.md`](./post-implementation-reports/PIR-20260618-VOID-SCHOLAR-ALT-C.md)
- [`PIR-20260619-BROWSER-AMP-FIREFOX.md`](./post-implementation-reports/PIR-20260619-BROWSER-AMP-FIREFOX.md)
- [`PIR-20260611-SCROLL-SAVE-AUTOSAVE.md`](./post-implementation-reports/PIR-20260611-SCROLL-SAVE-AUTOSAVE.md)
- [`PIR-20260611-TRUESIGHT-ANNOTATION-LAYER.md`](./post-implementation-reports/PIR-20260611-TRUESIGHT-ANNOTATION-LAYER.md)
- [`PIR-20260611-TRUESIGHT-PUNCTUATION-WHITE.md`](./post-implementation-reports/PIR-20260611-TRUESIGHT-PUNCTUATION-WHITE.md)
- [`PIR-20260611-TRUESIGHT-WORDTOOLTIP-HIERARCHY.md`](./post-implementation-reports/PIR-20260611-TRUESIGHT-WORDTOOLTIP-HIERARCHY.md)
- [`PIR-20260611-WAND-PIXELBRAIN-BRIDGE-HARDENING.md`](./post-implementation-reports/PIR-20260611-WAND-PIXELBRAIN-BRIDGE-HARDENING.md)
- [`PIR-20260611-embedded-truesight-tooltips.md`](./post-implementation-reports/PIR-20260611-embedded-truesight-tooltips.md)
- [`PIR-20260620-COLLAB-GRIMDESIGN-CONSOLE.md`](./post-implementation-reports/PIR-20260620-COLLAB-GRIMDESIGN-CONSOLE.md)
- [`PIR-20260620-LOCAL-OAUTH-MOCK-DISABLE.md`](./post-implementation-reports/PIR-20260620-LOCAL-OAUTH-MOCK-DISABLE.md)
- [`PIR-20260620-MCP-OAUTH-COMPAT.md`](./post-implementation-reports/PIR-20260620-MCP-OAUTH-COMPAT.md)
- [`PIR-20260620-MCP-OAUTH-LLM-CLIENTS.md`](./post-implementation-reports/PIR-20260620-MCP-OAUTH-LLM-CLIENTS.md)
- [`PIR-20260620-MEMORY-CELL-OSMOSIS.md`](./post-implementation-reports/PIR-20260620-MEMORY-CELL-OSMOSIS.md)
- [`PIR-20260620-NAV-LOGOUT.md`](./post-implementation-reports/PIR-20260620-NAV-LOGOUT.md)
- [`PIR-20260620-OAUTH-DISABLED-ROUTE.md`](./post-implementation-reports/PIR-20260620-OAUTH-DISABLED-ROUTE.md)
- [`dead-code.md`](./post-implementation-reports/dead-code.md)
- [`Wand_RAID_UX_Audit_Report.md`](./Wand_RAID_UX_Audit_Report.md)
- [`UX Report/Scrying_Orb_Landing_UX_Report.md`](./UX%20Report/Scrying_Orb_Landing_UX_Report.md)
- [`UX Report/Wand_RAID_UX_Audit_Report.md`](./UX%20Report/Wand_RAID_UX_Audit_Report.md)
- [`PIR-20260616-QBIT-VOXEL-LEVEL3.md`](./post-implementation-reports/PIR-20260616-QBIT-VOXEL-LEVEL3.md)

### Architecture Docs

Canonical architecture entries and system decisions.

- [`ARCH-2026-04-02-FONT-ORACLE.md`](./ARCH%20Scholomance%20Docs/ARCH-2026-04-02-FONT-ORACLE.md)
- [`ARCH-2026-04-02-SOVEREIGN-EDITOR.md`](./ARCH%20Scholomance%20Docs/ARCH-2026-04-02-SOVEREIGN-EDITOR.md)
- [`ARCH-2026-04-26-IMMUNE-SYSTEM.md`](./ARCH%20Scholomance%20Docs/ARCH-2026-04-26-IMMUNE-SYSTEM.md)
- [`ARCH-2026-04-26-TURBOQUANT-VECTOR-BRIDGE.md`](./ARCH%20Scholomance%20Docs/ARCH-2026-04-26-TURBOQUANT-VECTOR-BRIDGE.md)
- [`ARCH-2026-04-27-ARCHIVE-OF-DOMINANCE.md`](./ARCH%20Scholomance%20Docs/ARCH-2026-04-27-ARCHIVE-OF-DOMINANCE.md)
- [`ARCH-2026-04-27-COGNITIVE-BUS.md`](./ARCH%20Scholomance%20Docs/ARCH-2026-04-27-COGNITIVE-BUS.md)
- [`IDE_Runtime_Stasis_Promotion_Plan.md`](./IDE_Runtime_Stasis_Promotion_Plan.md)
- [`phaser4-runtime-decoupling-walkthrough.md`](./phaser4-runtime-decoupling-walkthrough.md)
- [`wand.md`](./wand.md)

### Scholomance White Papers

Deep technical analysis, operating manuals, and specialist briefs.

- [`IMMUNE-SYSTEM-WHITE-PAPER.md`](./Scholomance%20White%20Papers/IMMUNE-SYSTEM-WHITE-PAPER.md)
- [`CAREER_RESONANCE_ALIGNMENT_WHITE_PAPER.md`](./Scholomance%20White%20Papers/CAREER_RESONANCE_ALIGNMENT_WHITE_PAPER.md)
- [`MCP_INTEGRATION_GUIDE.md`](./Scholomance%20White%20Papers/MCP_INTEGRATION_GUIDE.md)
- [`TURBOQUANT-SERVICE-MANUAL.md`](./Scholomance%20White%20Papers/TURBOQUANT-SERVICE-MANUAL.md)
- [`TURBOQUANT_WHITE_PAPER.md`](./Scholomance%20White%20Papers/TURBOQUANT_WHITE_PAPER.md)
- [`TURBOQUANT-WHITE-PAPER.md`](./Scholomance%20White%20Papers/TURBOQUANT-WHITE-PAPER.md)
- [`SCD64_White_Paper.md`](./Scholomance%20White%20Papers/SCD64_White_Paper.md)
- [`opencode.md`](./Scholomance%20White%20Papers/opencode.md)
- [`BEGINNER_GUIDE_TO_SCHOLOMANCE_ENGINE.md`](./Scholomance%20White%20Papers/BEGINNER_GUIDE_TO_SCHOLOMANCE_ENGINE.md)
- [`SHADER_FORGE_WHITE_PAPER.md`](./Scholomance%20White%20Papers/SHADER_FORGE_WHITE_PAPER.md)
- [`SONIC_EXCHANGE_WHITE_PAPER.md`](./Scholomance%20White%20Papers/SONIC_EXCHANGE_WHITE_PAPER.md)
- [`TRUESIGHT_ROBUSTNESS_LAW_AUDIT_WHITE_PAPER.md`](./Scholomance%20White%20Papers/TRUESIGHT_ROBUSTNESS_LAW_AUDIT_WHITE_PAPER.md)
- [`PIXELBRAIN_CONNECTIVE_TISSUE_WHITE_PAPER.md`](./Scholomance%20White%20Papers/PIXELBRAIN_CONNECTIVE_TISSUE_WHITE_PAPER.md)
- [`PIXELBRAIN_AGENT_OPERATING_MANUAL.md`](./Scholomance%20White%20Papers/PIXELBRAIN_AGENT_OPERATING_MANUAL.md)
- [`PIXELBRAIN_LANGUAGE_WHITE_PAPER.md`](./Scholomance%20White%20Papers/PIXELBRAIN_LANGUAGE_WHITE_PAPER.md)
- [`Screenshot_20260606_144816.png`](./Scholomance%20White%20Papers/Screenshot_20260606_144816.png)
- [`Screenshot_20260606_163127.png`](./Scholomance%20White%20Papers/Screenshot_20260606_163127.png)

### Scholomance Verdicts

Structured product reviews and judgment of ratified canon.

- [`README.md`](./Scholomance-Verdicts/README.md)
- [`VERDICT-2026-04-27-COGNITIVE-BUS-claude-ui.md`](./Scholomance-Verdicts/VERDICT-2026-04-27-COGNITIVE-BUS-claude-ui.md)
- [`VERDICT-2026-04-27-IMMUNE-SYSTEM.md`](./Scholomance-Verdicts/VERDICT-2026-04-27-IMMUNE-SYSTEM.md)
- [`VERDICT-2026-05-09-CELL-WALL-INFRA.md`](./Scholomance-Verdicts/VERDICT-2026-05-09-CELL-WALL-INFRA.md)
- [`VERDICT-2026-06-05-PHASER4-MIGRATION.md`](./Scholomance-Verdicts/VERDICT-2026-06-05-PHASER4-MIGRATION.md)

### Changes

- [`CHANGE-2026-04-02-PASSWORDLESS-AGENT.md`](./Scholomance%20Changes/CHANGE-2026-04-02-PASSWORDLESS-AGENT.md)

### Handoffs

- [`HANDOFF-2026-05-08-RHYME-CONSTELLATION-P1-P2.md`](./Scholomance%20Hand%20Offs/HANDOFF-2026-05-08-RHYME-CONSTELLATION-P1-P2.md)

### Studies

- [`study1.md`](./study1.md)

### Skills and Manuals

- [`BLUEPRINT-AMP-OPERATING-MANUAL.md`](./BLUEPRINT-AMP-OPERATING-MANUAL.md)
- [`SKILL.md`](./SKILL.md)

### UX Reports

- [`2026-06-10-toolchain-field-report.md`](./UX%20Report/2026-06-10-toolchain-field-report.md)

### Scholomance Bible

Current-state synthesis artifacts live beside the encyclopedia.

- [`SCHOLOMANCE_BIBLE.md`](../scholomance-bible/SCHOLOMANCE_BIBLE.md)
- [`BIBLE_BYTECODE_INDEX.md`](../scholomance-bible/BIBLE_BYTECODE_INDEX.md)

---

## Entry Format

Bug reports follow this structure:

```markdown
# BUG-[YYYY-MM-DD]-[SHORT_NAME]

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-[BUG_CODE]`

## Bug Description
[What was broken, how it manifested, user impact]

## Root Cause
[Technical explanation of why the bug occurred]

## Thought Process
[Step-by-step reasoning]

## Changes Made
| File | Lines Changed | Rationale |
|------|---------------|-----------|
| `path/to/file.js` | 45-67 | [why this change] |

## Testing
[How the fix was verified]

## Lessons Learned
[What this teaches us about the system]
```

---

*The Scholomance Encyclopedia grows with every battle fought. Each entry is a lesson for the next agent who walks this path.*

## Automatically Restored Links

- [`settings.local.json`](./.claude/settings.local.json)
- [`FAILURE_TRIBUNAL_2026-05-10.md`](./FAILURE_TRIBUNAL_2026-05-10.md)

- [`BUG-2026-05-09-TEST-INFRASTRUCTURE-CRITIQUE.md`](./Scholomance%20Bug%20Reports/BUG-2026-05-09-TEST-INFRASTRUCTURE-CRITIQUE.md)
- [`comb-initialize.skill`](./Scholomance%20LAW/comb-initialize.skill)
- [`SKILL.md`](./Scholomance%20LAW/comb-initialize/SKILL.md)
- [`comb-reports.md`](./Scholomance%20LAW/comb-initialize/references/comb-reports.md)
- [`file-categories.md`](./Scholomance%20LAW/comb-initialize/references/file-categories.md)
- [`production_polish.md`](./Scholomance%20LAW/production_polish.md)
- [`bytecode-schema.md`](./Scholomance%20LAW/scholomance-feedback/references/bytecode-schema.md)
- [`fit-matrix.md`](./Scholomance%20LAW/scholomance-feedback/references/fit-matrix.md)
- [`vaelrix_law_debug.md`](./Scholomance%20LAW/vaelrix_law_debug.md)
- [`5⁄21⁄2026 Report.png`](./Scholomance%20System%20Report%20Cards/5%E2%81%8421%E2%81%842026%20Report.png)
- [`BYTECODE_DIAGNOSTIC_SYNTHESIS_WHITE_PAPER.md`](./Scholomance%20White%20Papers/BYTECODE_DIAGNOSTIC_SYNTHESIS_WHITE_PAPER.md)
- [`BYTECODE_HEALTH_WHITE_PAPER.md`](./Scholomance%20White%20Papers/BYTECODE_HEALTH_WHITE_PAPER.md)
- [`CLERICAL_RAID_WHITE_PAPER.md`](./Scholomance%20White%20Papers/CLERICAL_RAID_WHITE_PAPER.md)
- [`CODEX_MCP_READINESS.md`](./Scholomance%20White%20Papers/CODEX_MCP_READINESS.md)
- [`SCHOLOMANCE-DIV-WAND-v1.md`](./Scholomance%20White%20Papers/SCHOLOMANCE-DIV-WAND-v1.md)
- [`VERDICT-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE.md`](./Scholomance-Verdicts/VERDICT-2026-05-09-DIAGNOSTIC-CELL-INFRASTRUCTURE.md)
- [`VERDICT-2026-05-09-TRUESIGHT-MEASUREMENT-GATE.md`](./Scholomance-Verdicts/VERDICT-2026-05-09-TRUESIGHT-MEASUREMENT-GATE.md)
- [`VERDICT-2026-05-10-BIBLE-SYNTHESIS-FUNCTIONALITY.md`](./Scholomance-Verdicts/VERDICT-2026-05-10-BIBLE-SYNTHESIS-FUNCTIONALITY.md)
- [`VERDICT-2026-05-10-BIBLE-SYNTHESIS-SKILL.md`](./Scholomance-Verdicts/VERDICT-2026-05-10-BIBLE-SYNTHESIS-SKILL.md)
- [`VERDICT-2026-05-10-DIAGNOSTIC-STASIS.md`](./Scholomance-Verdicts/VERDICT-2026-05-10-DIAGNOSTIC-STASIS.md)
- [`VERDICT-2026-05-22-IDE-STASIS-CALIBRATION.md`](./Scholomance-Verdicts/VERDICT-2026-05-22-IDE-STASIS-CALIBRATION.md)
- [`VERDICT-2026-05-24-8-MONTH-SOLO-ACHIEVEMENT.md`](./Scholomance-Verdicts/VERDICT-2026-05-24-8-MONTH-SOLO-ACHIEVEMENT.md)
- [`VERDICT-2026-05-24-COGNITIVE-BUS-codex-partial.md`](./Scholomance-Verdicts/VERDICT-2026-05-24-COGNITIVE-BUS-codex-partial.md)
- [`VERDICT-2026-05-24-COGNITIVE-BUS-gemini-partial.md`](./Scholomance-Verdicts/VERDICT-2026-05-24-COGNITIVE-BUS-gemini-partial.md)
- [`VERDICT-2026-05-24-COGNITIVE-BUS-reconciliation.md`](./Scholomance-Verdicts/VERDICT-2026-05-24-COGNITIVE-BUS-reconciliation.md)
- [`VERDICT-2026-05-24-IMMUNE-SYSTEM-codex-partial.md`](./Scholomance-Verdicts/VERDICT-2026-05-24-IMMUNE-SYSTEM-codex-partial.md)
- [`VERDICT-2026-05-24-IMMUNE-SYSTEM-gemini-partial.md`](./Scholomance-Verdicts/VERDICT-2026-05-24-IMMUNE-SYSTEM-gemini-partial.md)
- [`VERDICT-2026-05-24-IMMUNE-SYSTEM-reconciliation.md`](./Scholomance-Verdicts/VERDICT-2026-05-24-IMMUNE-SYSTEM-reconciliation.md)
- [`IDE_Stasis_Promotion_UX_Report.md`](./UX%20Report/IDE_Stasis_Promotion_UX_Report.md)
- [`amp-vector-wiring-implementation-plan.md`](./amp-vector-wiring-implementation-plan.md)
- [`amp-vector-wiring-task.md`](./amp-vector-wiring-task.md)
- [`amp-vector-wiring-walkthrough.md`](./amp-vector-wiring-walkthrough.md)
- [`PIR-20260508-TS-DECOUPLE.md`](./post-implementation-reports/PIR-20260508-TS-DECOUPLE.md)
- [`PIR-20260521-IDE-STASIS-PROMOTION-S.md`](./post-implementation-reports/PIR-20260521-IDE-STASIS-PROMOTION-S.md)
- [`PIR-20260521-LINUX_SETUP_SCRIPT.md`](./post-implementation-reports/PIR-20260521-LINUX_SETUP_SCRIPT.md)
- [`PIR-20260521-MCP-PROBE-FALLBACK.md`](./post-implementation-reports/PIR-20260521-MCP-PROBE-FALLBACK.md)
- [`PIR-20260521-MCP-TOOL-ALIASES.md`](./post-implementation-reports/PIR-20260521-MCP-TOOL-ALIASES.md)
- [`PIR-20260526-DEV-COLLAB-REUSE.md`](./post-implementation-reports/PIR-20260526-DEV-COLLAB-REUSE.md)
- [`PIR-20260526-GODOT-BRIDGE-CONNECTOR.md`](./post-implementation-reports/PIR-20260526-GODOT-BRIDGE-CONNECTOR.md)
- [`PIR-20260526-GODOT-FRAME-PRINTER-STEPS-1-10.md`](./post-implementation-reports/PIR-20260526-GODOT-FRAME-PRINTER-STEPS-1-10.md)
- [`PIR-20260527-GODOT-FRAME-PRINTER-AUDIT-PASS-2.md`](./post-implementation-reports/PIR-20260527-GODOT-FRAME-PRINTER-AUDIT-PASS-2.md)
- [`PIR-20260527-GODOT-PAINTING-DOCK-PHASES-0-3.md`](./post-implementation-reports/PIR-20260527-GODOT-PAINTING-DOCK-PHASES-0-3.md)
- [`BUG-REPORT-2026-05-10-ZOD-API-CORRUPTION.md`](./reports/BUG-REPORT-2026-05-10-ZOD-API-CORRUPTION.md)
- [`scholomance_collab.sqlite`](./scholomance_collab.sqlite)
- [`test_output.log`](./test_output.log)
- [`SCHOLOMANCE-FAIRLY-ODD-WAND-v1(1).md`](./SCHOLOMANCE-FAIRLY-ODD-WAND-v1%281%29.md)
