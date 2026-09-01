# VAELRIX_LAW.md
## The Source of Truth

> Read first: `SHARED_PREAMBLE.md` → this file. ARCH-PRIORITY: docs/skills loaded every new read of @VAELRIX_LAW

**Version: 1.17** | Status: Living Document | Arbiter: Angel (IItsVaelrix, repository owner/user)

All agents read this file before acting.
All agents reference `SCHEMA_CONTRACT.md` for data shapes.
This document supersedes all agent-specific instructions where they conflict.
If this document or any root-level agent doc conflicts with anything under `ARCHIVE REFERENCE DOCS/`, the root-level docs win.

---

## Global Law (All Agents Inherit This)

These rules cannot be overridden by any agent-specific instruction.

### 1. No Hierarchy Between Agents
No model outranks another. Domain boundaries are the law. Claude does not defer to Gemini. Gemini does not defer to Codex. Codex does not defer to Claude. Each agent is sovereign within its domain and has zero authority outside it.

### 2. Conflict Escalation Is Mandatory
If your work collides with another agent's domain, **STOP**. Write an `ESCALATION:` block (see format below) and deliver it to Angel. Do not resolve it yourself. Do not assume. Do not compromise without authorization.

### 3. Schema Is Sovereign
`SCHEMA_CONTRACT.md` defines all data shapes. If a shape you need doesn't exist, request it — do not invent it. No agent may create a parallel schema. No agent may modify `SCHEMA_CONTRACT.md` except Codex, with Angel's awareness.

### 4. Server Is Truth
Client previews decorative data. Server resolves, scores, and persists. Never make a client authoritative over a game mechanic outcome. `COMBAT_PREVIEW` is decoration. `COMBAT_RESOLVED` is law.

### 5. Pure Analysis Never Touches Effects
Scoring, phoneme, and combat logic has zero DOM, zero GSAP, zero audio imports. Ever. If a logic function touches the render layer, it is in the wrong layer. Escalate before proceeding.

### 6. Determinism Is Non-Negotiable
Same input → same output. No hidden randomness in scoring pipelines. No timestamp-seeded variation in heuristics. No environment-dependent scores. Gemini enforces this with the determinism battery on every scoring change.

### 7. Security Before Features
No new input surface ships without allow-list validation per `ARCH_CONTRACT_SECURITY.md`. No exceptions. No "we'll add validation later." Security review gates the PR, not the milestone.

**Quality Gates Are Mandatory:**
All code changes MUST pass the QA battery defined in `ENGINEERING_RULEBOOK.md`:
- Lint pass required
- Test pass required
- Performance budget required
- Accessibility compliance required
- Security scan required

No commit without lint. No merge without tests. No deploy without QA.

### 8. Bytecode Is Priority

All persistent state, exports, and interoperable data structures use bytecode encoding. Bytecode is the canonical representation — previews, renders, and UI surfaces are derived from bytecode, not the source of truth. When in doubt, encode to bytecode first.

**Immutability Is Default:**
All domain entities (VerseIR, bytecode, analysis results, grid coordinates) are immutable.
Functions return new values; they do not mutate inputs.

Exception: Performance-critical loops may use mutation with explicit
`// MUTATION: [reason]` comments.

**Bytecode Error System is Mandatory:**
- All errors use `PB-ERR-v1-{CATEGORY}-{SEVERITY}-{MODULE}-{CODE}-{CONTEXT_B64}-{CHECKSUM}` format
- All QA tests use bytecode assertions (`assertEqual`, `assertTrue`, `assertInRange`, `assertType`)
- All test failures produce AI-parsable bytecode errors
- Error codes defined in `docs/ByteCode Error System/02_Error_Code_Reference.md`
- QA integration per `docs/ByteCode Error System/04_QA_Integration_Guide.md`

**Approved Bytecode Schemas:**
- `PB-ERR-v1` — Error encoding (all categories: TYPE, VALUE, RANGE, STATE, HOOK, EXT, COORD, COLOR, NOISE, RENDER, CANVAS, FORMULA)
- `PB-RECURSE-v1` — Recursion bug detection
- `0xF`-prefixed — Pixel art formulas
- Lattice grids — Sprite coordinate systems

### 9. Component Instance Isolation

**Global mutable variables in UI components are prohibited.**

All layout contexts, typographic caches, and caret measurements must be kept in component-local references (such as React's `useRef`) rather than module-scoped variables. This prevents side-by-side mounted instances from contaminating each other's styles, layout calculations, or interactions. Any helper function operating on these states must be pure and accept the instance cache context as its first parameter.

### 10. Stacking Sovereignty

**Hardcoded z-indexes are prohibited for values > 1.**

All stacking contexts must derive from semantic constants defined in `SCHEMA_CONTRACT.md` (e.g., `Z_BASE`, `Z_ABOVE`, `Z_OVERLAY`, `Z_SYSTEM`). Agents must ensure the render layer adheres to these tiers to prevent "layer drift" where interaction surfaces become occluded. If a new tier is required, it must be proposed via an escalation.

### 11. Scholomance Encyclopedia — Bug Fix Documentation

**All bug fixes must be documented in the Scholomance Encyclopedia upon Angel's command.**

When Angel issues the command **"BUG REPORT AUDIT"**, the agent responsible for the fix must:

1. **Reference the Scholomance Encyclopedia** using the bytecode search code: `SCHOL-ENC-BYKE-SEARCH`
2. **Create or update an entry** in `docs/scholomance-encyclopedia/` with:
   - Bug description and impact
   - Root cause analysis
   - Step-by-step thought process that led to the solution
   - Code changes made (files, lines, rationale)
   - Testing performed
   - Lessons learned

**Format:**
```markdown
# BUG-[YYYY-MM-DD]-[SHORT_NAME]

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-[BUG_CODE]`

## Bug Description
[What was broken, how it manifested, user impact]

## Root Cause
[Technical explanation of why the bug occurred]

## Thought Process
[Step-by-step reasoning:
  1. First observation that led to hypothesis
  2. Investigation path taken
  3. Dead ends encountered
  4. Breakthrough moment
  5. Solution derived]

## Changes Made
| File | Lines Changed | Rationale |
|------|---------------|-----------|
| `path/to/file.js` | 45-67 | [why this change] |

## Testing
[How the fix was verified]

## Lessons Learned
[What this teaches us about the system]
```

**Why This Exists:**

The Scholomance Encyclopedia is the living memory of the codebase. Every bug fixed is knowledge gained. Documentation is not optional — it is the bridge between fixing one bug and preventing a thousand future bugs.

**When Angel says "BUG REPORT AUDIT", you will:**
1. Stop current work
2. Open the relevant bug report
3. Trace the fix you implemented
4. Write the encyclopedia entry
5. Commit with the bytecode search code in the message

**No fix is complete without its story.**

### 12. Law Evolution Is Mandatory

**Any agent reading this document MUST evaluate whether the law itself requires updating.**

This is not optional. This is not "someone else's job." This is a core obligation.

**Evaluation Criteria:**

| Criterion | Question | Action |
|-----------|----------|--------|
| **Critical Nature** | Does a gap in this law enable architecture violations? | Propose update |
| **Structural Integrity** | Does new learning reveal a stronger pattern? | Propose update |
| **Contradiction** | Does practice contradict stated law? | Propose update |
| **Obsolescence** | Is a clause superseded by better architecture? | Propose update |

**Update Mechanism:**

If evaluation reveals need for update:

```
ESCALATION: LAW_UPDATE_PROPOSAL
- Clause: [which clause needs change]
- Current Text: [quote existing]
- Proposed Text: [quote replacement]
- Rationale: [why this strengthens the law]
- Critical Nature: [HIGH/MEDIUM/LOW]
- Structural Impact: [ARCHITECTURE/SECURITY/DETERMINISM/other]
- Needs: Angel's approval
```

**Why This Exists:**

This law is not scripture. It is **engineered constraint**. Like any engineered system, it must evolve when:
- New patterns prove stronger than old ones
- Gaps enable violations the law intended to prevent
- Practice reveals better formulations

**An agent that reads this law and does not evaluate it is violating Law 12.**

### 13. PDR Archive Is Mandatory

**All Product Design Requirements (PDRs) must be stored in `docs/scholomance-encyclopedia/PDR-archive/`.**

No PDR document may remain in the repository root or any location outside the designated archive.

**When creating a new PDR:**

1. Write the PDR using the standard template in `docs/scholomance-encyclopedia/PDR-archive/README.md`
2. Save the file directly to `docs/scholomance-encyclopedia/PDR-archive/[feature_name]_pdr.md`
3. Update the archive index `docs/scholomance-encyclopedia/PDR-archive/README.md` with the new PDR entry
4. Classify status: `Draft` | `Approved` | `In Progress` | `Implemented` | `Archived`

**When discovering a PDR outside the archive:**

1. Move it immediately to `docs/scholomance-encyclopedia/PDR-archive/`
2. Update the archive index if not already listed
3. Never leave PDRs in root or scattered directories

**Why This Exists:**

PDRs are architectural artifacts — they define major features before implementation. Scattered PDRs become:
- Lost or forgotten
- Outdated without notice
- Impossible to audit as a collection
- Difficult to reference in onboarding

Centralized archive ensures:
- All agents can find the complete PDR catalog
- Status tracking (Draft → Implemented) is visible
- Historical PDRs are preserved, not deleted
- Architecture decisions are auditable

**Related:** Scholomance Encyclopedia (`docs/scholomance-encyclopedia/`) documents bug fixes and architecture proposals post-implementation. PDRs document features pre-implementation.

### 14. Post-Implementation Report Is Mandatory

**Every implemented feature, fix, or architectural change MUST have a Post-Implementation Report (PIR).**

No change ships without its story. The PIR is the companion to the PDR — where the PDR documents intent before work begins, the PIR documents reality after work completes.

**When to write a PIR:**
- Any new endpoint, UI surface, or data model change
- Any behavioral change (user-facing or internal)
- Any cross-cutting change (multiple layers touched)
- Any security, persistence, or auth change
- Any performance-affecting change

**When a PIR is optional:**
- Pure styling changes (CSS-only, no structural change)
- Comment-only changes
- Test-only additions

**PIRs are stored in `docs/scholomance-encyclopedia/post-implementation-reports/` with naming convention: `PIR-[YYYYMMDD]-[SHORT_NAME].md`.**

**Template:**

```markdown
# Post-Implementation Report

## 1. Change Identity
- **Report ID:** PIR-YYYYMMDD-###
- **Feature / Fix Name:**
- **Author / Agent:**
- **Date:**
- **Branch / Environment:**
- **Related Task / Ticket / Prompt:**
- **Classification:** Cosmetic / Structural / Behavioral / Architectural
- **Priority:** Low / Medium / High / Critical

---

## 2. Executive Summary
Provide a 3 to 7 sentence summary of what was implemented.

Include:
- what changed
- why it was necessary
- whether the change was local or system-wide
- the highest-risk area touched
- current status: complete / partial / blocked / requires follow-up

**Summary:**
>

---

## 3. Intent and Reasoning
Describe the original problem, pressure, or opportunity.

### Problem Statement
> What was broken, missing, inefficient, unclear, or dangerous?

### Why This Change Was Chosen
> Why this implementation path over alternatives?

### Assumptions Made
> List assumptions explicitly. Do not hide them.

### Alternatives Considered
- Option A:
- Option B:
- Option C:

### Why Alternatives Were Rejected
>

---

## 4. Scope of Change
Define exactly what was in scope and out of scope.

### In Scope
-
-
-

### Out of Scope
-
-
-

### Change Type
- [ ] UI only
- [ ] Logic only
- [ ] Data model
- [ ] API contract
- [ ] Persistence layer
- [ ] Styling / layout
- [ ] Performance
- [ ] Accessibility
- [ ] Security
- [ ] Build / tooling
- [ ] Documentation
- [ ] Multi-layer / cross-cutting

---

## 5. Files and Systems Touched
List every meaningful file, service, module, or subsystem affected.

| Area | File / Module / Service | Type of Change | Risk Level | Notes |
|------|--------------------------|----------------|------------|-------|
| UI   |                          |                | Low/Med/High |      |
| Logic|                          |                | Low/Med/High |      |
| Data |                          |                | Low/Med/High |      |
| Infra|                          |                | Low/Med/High |      |

### Dependency Impact Check
Document shared dependencies and consumers that may be affected.

- **Imports changed:**
- **Shared state affected:**
- **Event flows affected:**
- **UI consumers affected:**
- **Data consumers affected:**
- **External services affected:**
- **Config/env affected:**

---

## 6. Implementation Details
Explain the implementation in plain language.

### Before
> Describe the prior behavior or structure.

### After
> Describe the new behavior or structure.

### Core Implementation Notes
-
-
-

### Architectural Notes
> Record any structural pattern introduced, reinforced, or violated.

### Tradeoffs Accepted
-
-
-

---

## 7. Behavior Changes
State clearly whether user-visible or system-visible behavior changed.

### User-Facing Behavior Changes
-
-
-

### Internal Behavior Changes
-
-
-

### Non-Behavioral Changes
- [ ] Refactor only
- [ ] Naming cleanup
- [ ] Documentation only
- [ ] Styling only
- [ ] Test only
- [ ] No runtime behavior changed

---

## 8. Risk Analysis
This section is mandatory.

### Primary Risks Introduced
- Risk 1:
- Risk 2:
- Risk 3:

### What Could Break
-
-
-

### Blast Radius
- [ ] Isolated
- [ ] Moderate
- [ ] Wide
- [ ] Unknown

### Risk Reduction Measures Taken
-
-
-

### Rollback Readiness
- [ ] Easy rollback
- [ ] Partial rollback possible
- [ ] Hard rollback
- [ ] Rollback not tested

### Rollback Method
> Describe exactly how to undo or disable the implementation.

---

## 9. Validation Performed
Document what was actually checked, not what should have been checked.

### Manual Validation
- [ ] Happy path tested
- [ ] Edge case tested
- [ ] Empty / null state tested
- [ ] Error state tested
- [ ] Mobile tested
- [ ] Desktop tested
- [ ] Slow network / async timing tested
- [ ] Accessibility spot-check performed
- [ ] Visual regression spot-check performed

### Automated Validation
- [ ] Unit tests passed
- [ ] Integration tests passed
- [ ] E2E tests passed
- [ ] Type checks passed
- [ ] Lint passed
- [ ] Build passed

### Exact Validation Notes
> Include exact scenarios tested and observed outcomes.

Example:
- Opened X page with Y data and confirmed Z behavior.
- Triggered failure state by doing A and observed B.
- Verified no layout shift between state C and state D.

---

## 10. Regression Checklist
Use this to prevent "one fix, three ghosts."

- [ ] No broken imports
- [ ] No orphaned state
- [ ] No duplicated logic introduced
- [ ] No hidden hard-coded IDs
- [ ] No contract mismatch between UI and data
- [ ] No accessibility regressions noticed
- [ ] No animation/layout instability introduced
- [ ] No console errors in tested paths
- [ ] No performance degradation noticed
- [ ] No styling leaks into adjacent components
- [ ] No schema drift introduced
- [ ] No unsafe fallback behavior introduced

### Specific Retest Areas
List exact areas that should be retested by the next agent or reviewer.

-
-
-

---

## 11. Performance and Stability Notes
Only fill this if relevant, but never omit if performance was part of the change.

### Performance Impact
- [ ] Improved
- [ ] Neutral
- [ ] Slightly worse
- [ ] Unknown

### Stability Impact
- [ ] Improved
- [ ] Neutral
- [ ] Risk introduced
- [ ] Unknown

### Metrics / Evidence
- Load time:
- Render behavior:
- Memory implications:
- Network implications:
- Animation smoothness:
- Other measurements:

---

## 12. Security / Safety / Data Integrity Review
Required for anything touching auth, persistence, external APIs, user data, or execution flow.

- **Auth impact:**
- **Permissions impact:**
- **Input validation impact:**
- **Data integrity concerns:**
- **Logging / audit trail concerns:**
- **Secrets / env exposure risk:**
- **Unsafe execution paths introduced?:**
- **Security follow-up needed?:**

---

## 13. Documentation Updates
List what documentation was updated to reflect reality.

- [ ] README updated
- [ ] ARCH updated
- [ ] API docs updated
- [ ] QA map updated
- [ ] User docs updated
- [ ] Internal comments updated
- [ ] No docs needed

### Notes
>

---

## 14. Known Gaps and Follow-Up Work
Be brutally honest here.

### Known Incomplete Areas
-
-
-

### Follow-Up Recommendations
-
-
-

### Deferred Work
-
-
-

---

## 15. Final Verdict
Choose one.

- [ ] Safe and complete
- [ ] Complete with acceptable risk
- [ ] Functionally complete but needs follow-up
- [ ] Partial implementation
- [ ] Blocked / unresolved

### Final Notes
> One final paragraph describing the true state of the implementation, without spin.
```

### 15. The Law of Antigen Regeneration

**Every agent MUST transition documented private "scars" into public antigens.**

When a bug is fixed and recorded in the private `memory/` folder, the agent responsible for the fix is obligated to prepare that finding for **Memory Cell Infusion**.

#### 16.1 The Infusion Ritual
1.  **Tag the Finding**: Use the `# INFUSION_ALLOW` tag in the memory file to mark the logic as safe for public extraction.
2.  **Describe the Signature**: Provide a concise summary of the "symptoms" and the "cure."
3.  **Trigger Infusion**: Execute `npm run memory:infuse` to vectorize the scar and inject it into the `clerical-raid` substrate.

#### 16.2 Prohibition of Silent Recurrence
No agent may ignore a documented fix in memory when encountering a regression. If the "genes light up" (semantic resonance detected), the agent must immediately halt work and seal the fracture using the documented cure.

**Why This Exists:**
Private memory is the agent's individual experience. Antigen Regeneration is the system's collective immunity. By sharing our scars, we ensure that the Scholomance never suffers the same wound twice.

### 16. Collab Login and MCP Access Protocol

**Any agent participating in coordinated work must use the collab control plane through approved login and MCP access paths.**

No agent may invent an alternate transport, bypass authentication on the HTTP surface, or access collab persistence directly as a substitute for the control plane.

#### 14.1 Transport split is explicit

There are two distinct access paths:

- **HTTP / CLI control plane**: authenticated routes under `/collab`, used by `scripts/connect-collab.js` and `scripts/collab-client.js`
- **MCP bridge**: local stdio server at `codex/server/collab/mcp-bridge-entry.js`, used by MCP-capable clients and agents

These paths serve different purposes:

- HTTP / CLI requires login and uses a session cookie
- MCP is a local process transport and does **not** use the browser/session login cookie
- Both paths must converge on the same collab service law

#### 14.2 Required boot order

Before any agent attempts to coordinate through the collab plane:

1. Start the local server:
   `npm run dev:server`
2. Start the MCP bridge if MCP access is needed:
   `npm run mcp:collab`
3. If using HTTP / CLI, log in first:
   `node scripts/connect-collab.js connect --agent-id <id> --name "<name>" --role <ui|backend|qa>`
4. If using MCP, connect the client to the stdio bridge and then register through MCP:
   call `mcp_scholomance_collab_agent_register`
5. After registration on either surface, keep presence alive with heartbeat:
   HTTP: `node scripts/connect-collab.js heartbeat --agent-id <id> --status online`
   MCP: call `mcp_scholomance_collab_agent_heartbeat`

If the server is not running, login and collab HTTP calls will fail.
If the MCP bridge is not running, MCP clients will not see `collab://*` resources or `mcp_scholomance_collab_*` tools.

#### 14.3 HTTP / CLI login path

**Primary login command**

```bash
node scripts/connect-collab.js connect \
  --agent-id <agent-id> \
  --name "<display-name>" \
  --role <ui|backend|qa> \
  --capabilities <comma,separated,capabilities>
```

**What this does**

- fetches a CSRF token
- logs in against `/auth/login`
- persists the session cookie to `COLLAB_COOKIE_FILE` (default: `/tmp/scholomance_cookie.txt`)
- registers the agent on `/collab/agents/register`

**Relevant environment variables**

- `API_BASE_URL` — defaults to `http://localhost:3000`
- `COLLAB_URL` — defaults to `http://localhost:3000/collab`
- `COLLAB_COOKIE_FILE` — defaults to `/tmp/scholomance_cookie.txt`
- `COLLAB_USER` / `COLLAB_PASS` — optional CLI login credentials
- `AGENT_ID` — used by `scripts/collab-client.js`

**Local default credentials**

The helper script currently defaults to:

- username: `test`
- password: `password`

These defaults are for local development only. If local auth has been changed, agents must use the current valid credentials instead of assuming the defaults still apply.

#### 14.4 MCP access path

**Canonical bridge command**

```bash
npm run mcp:collab
```

Equivalent direct invocation:

```bash
node --env-file=.env codex/server/collab/mcp-bridge-entry.js
```

**Canonical MCP client configuration**

```json
{
  "mcpServers": {
    "scholomance-collab": {
      "command": "node",
      "args": ["--env-file=.env", "codex/server/collab/mcp-bridge-entry.js"]
    }
  }
}
```

If an MCP host prefers npm wrappers, `npm run mcp:collab` is acceptable as the command target instead of the raw `node` invocation.

**Minimum MCP verification sequence**

1. Read `collab://status`
2. Call `mcp_scholomance_collab_status_get`
3. Call `mcp_scholomance_collab_agent_register`
4. Call `mcp_scholomance_collab_agent_heartbeat`

Some hosts present shortened aliases such as `collab_status_get`; the bridge registers canonical protocol names with the `mcp_scholomance_collab_` prefix.

**Required MCP resources**

- `collab://agents`
- `collab://tasks`
- `collab://locks`
- `collab://activity`
- `collab://pipelines`
- `collab://status`

**Required MCP tools**

- `mcp_scholomance_collab_agent_register`
- `mcp_scholomance_collab_agent_heartbeat`
- `mcp_scholomance_collab_task_create`
- `mcp_scholomance_collab_task_assign`
- `mcp_scholomance_collab_task_update`
- `mcp_scholomance_collab_task_delete`
- `mcp_scholomance_collab_lock_acquire`
- `mcp_scholomance_collab_lock_release`
- `mcp_scholomance_collab_pipeline_create`
- `mcp_scholomance_collab_pipeline_advance`
- `mcp_scholomance_collab_pipeline_fail`
- `mcp_scholomance_collab_status_get`
- `mcp_scholomance_collab_archive_board`
- `mcp_scholomance_collab_codebase_list_files`
- `mcp_scholomance_collab_codebase_hybrid_search`
- `mcp_scholomance_collab_codebase_get_neighbors`
- `mcp_scholomance_collab_immunity_scan_file`
- `mcp_scholomance_collab_immunity_get_status`
- `mcp_scholomance_collab_skill_vaelrix_law_audit`
- `mcp_scholomance_collab_skill_scholomance_feedback`

#### 14.5 Supported collab roles are currently narrow

The current collab schema supports only these roles:

- `ui`
- `backend`
- `qa`

Agents must **not** invent additional role strings during registration. In particular, `docs` may appear in older helper text, but it is **not** a valid collab schema role at this time.

Until schema support expands, agents whose domain does not map perfectly must choose the nearest lawful operational role.

#### 14.6 Canonical role map by agent

| Agent | Domain | Collab role | Canonical capabilities |
|-------|--------|-------------|------------------------|
| Claude | UI, visuals, accessibility | `ui` | `jsx,css,framer-motion,a11y` |
| Codex | schemas, layer law, engine architecture | `backend` | `schemas,architecture,layer-law,mcp` |
| Gemini | backend coding, debugging, tests, CI | `backend` | `node,fastify,vitest,playwright,ci,debugging` |
| Arbiter | verdicts, architecture review | `backend` | `architecture,review,verdicts` |
| Nexus | interactive debugging, repro traces | `backend` | `debugging,tracing,repro` |
| Unity | documentation synthesis, navigation | `backend` | `docs,synthesis,navigation` |
| Angel | arbitration, operator authority | `backend` | `override,arbitration,release` |

This role map is an operational transport mapping, not a redefinition of domain ownership.
Role choice grants access to the collab plane. It does **not** authorize edits outside the agent's actual domain.

#### 14.7 Canonical login examples by agent

```bash
# Claude
node scripts/connect-collab.js connect --agent-id claude-ui --name "Claude UI" --role ui --capabilities jsx,css,framer-motion,a11y

# Codex
node scripts/connect-collab.js connect --agent-id codex-architect --name "Codex Architect" --role backend --capabilities schemas,architecture,layer-law,mcp

# Gemini
node scripts/connect-collab.js connect --agent-id gemini-backend --name "Gemini Backend" --role backend --capabilities node,fastify,vitest,playwright,ci,debugging

# Arbiter
node scripts/connect-collab.js connect --agent-id arbiter-backend --name "Arbiter" --role backend --capabilities architecture,review,verdicts

# Nexus
node scripts/connect-collab.js connect --agent-id nexus-backend --name "Nexus" --role backend --capabilities debugging,tracing,repro

# Unity
node scripts/connect-collab.js connect --agent-id unity-backend --name "Unity" --role backend --capabilities docs,synthesis,navigation

# Angel
node scripts/connect-collab.js connect --agent-id angel-backend --name "Angel" --role backend --capabilities override,arbitration,release
```

#### 14.8 Lawful operating sequence after login or MCP attach

After access is established, agents should follow this sequence:

1. Register the agent if not already present
2. Send heartbeat when beginning work
3. Read current state:
   `collab://status`, `collab://tasks`, `collab://locks`, or HTTP equivalents
4. Create or claim a task before editing shared files
5. Respect ownership and lock conflicts instead of bypassing them casually
6. Update task state as work progresses
7. Mark completion and release locks through the control plane

No agent may treat "I can reach the repo" as sufficient substitute for "I am registered on the control plane."

#### 14.9 MCP access is not a privilege escalation path

MCP exists to expose the collab plane to agentic tools, not to bypass the law.

Therefore:

- MCP callers must register the same way any other agent does
- MCP callers must respect lock conflicts and ownership conflicts
- MCP callers must use collab tools instead of reaching into persistence or sqlite directly
- terminal pipeline states must be treated as terminal across all transports

Any agent that uses MCP as a shortcut around ownership, locking, or audit rules is violating this law.

#### 14.10 Remote agent key authentication

Agents connecting from remote machines (not the host running the server) authenticate via **bearer token keys**, not passwords.

**How it works:**

1. Angel generates an agent key: `node scripts/collab-admin.js generate-agent-key --agent-id <id> --role <ui|backend|qa>`
2. The plaintext key (`sk-scholomance-<id>-<hex>`) is shared out-of-band with the agent
3. The agent includes the key in every request: `Authorization: Bearer sk-scholomance-...`
4. The server validates the key against bcrypt-hashed entries in `collab_agent_keys`
5. On success, the agent identity is resolved and `X-Agent-ID` is set on the request
6. On failure, a generic 401 is returned — no key details leaked

**Key Management Commands:**

```bash
# Generate keys for ALL canonical agents
node scripts/collab-admin.js generate-canonical-keys --output tmp/agent-keys.txt --expires 90 --force

# Generate a specific key
node scripts/collab-admin.js generate-agent-key --agent-id <id> --role <ui|backend|qa>

# Rotate/Revoke keys
node scripts/collab-admin.js rotate-agent-key --agent-id <id>
node scripts/collab-admin.js revoke-agent-key --key-id <uuid>
node scripts/collab-admin.js list-agent-keys
```

**Remote agent CLI usage:**

```bash
# Any collab-client.js command with AGENT_KEY set
AGENT_KEY=sk-scholomance-qwen-code-... AGENT_ID=qwen-code \
  node scripts/collab-client.js heartbeat --status online

# Or set in .env file (Automatic Update Protocol)
AGENT_KEY=sk-scholomance-qwen-code-...
AGENT_ID=qwen-code
API_BASE_URL=https://your-live-site.com
```

#### 14.11 Automatic Secret Synchronization (Render)

To maintain parity between local development and the live server, a **pre-push hook** is mandatory for all operators with Render access.

**Automation Protocol:**
1. The hook is located at `.git/hooks/pre-push`.
2. It executes `npm run sync:render-secrets` before every `git push`.
3. It requires `RENDER_API_KEY` and `RENDER_SERVICE_ID` in the local `.env`.
4. If the secret sync fails, the code push is blocked to prevent environment drift.

**Manual Bypass (Emergency Only):**
`git push --no-verify`

**Security constraints:**

- Keys are bcrypt-hashed server-side — never stored or transmitted in plaintext after generation.
- **NEVER** commit `tmp/agent-keys.txt` or any file containing plaintext keys.
- Keys are never logged, never returned in API responses.
- Revoked or expired keys are rejected immediately.
- Rate limiting applies per agent key (same as session auth).
- HTTPS is mandatory for remote access — keys must never travel over plaintext HTTP.

**This is not a privilege escalation path.** Remote agent keys grant the same collab plane access as local session auth. They do not bypass ownership checks, lock conflicts, or audit rules.

#### 14.12 Render CLI — Production Service Management

The Render CLI (`render`) is installed at `~/.local/bin/render` (v0.1.11). It is the **only** tool authorized to interact with the live production service.

**Installation (already done):**

```bash
curl -sL https://github.com/render-oss/render-cli-deprecated/releases/download/v0.1.11/render-linux-x86_64 \
  -o ~/.local/bin/render && chmod +x ~/.local/bin/render
```

**Authentication:**

The CLI reads credentials from `~/.render/config.json`. Agents must **never** run `render login` manually — the config is managed by Angel. If authentication fails:

```
ESCALATION: RENDER_AUTH_EXPIRED
- Service: scholomance-app
- Action Required: Angel must re-authenticate CLI
- Impact: Cannot deploy, inspect env vars, or view logs
```

**Approved Operations:**

| Command | Purpose | Safe for Agents? |
|---------|---------|-----------------|
| `render services list` | List all services | ✅ Yes — read-only |
| `render services describe scholomance-app` | Get service details | ✅ Yes — read-only |
| `render deploys list --serviceId <id>` | List recent deploys | ✅ Yes — read-only |
| `render deploys describe --deployId <id>` | Get deploy details | ✅ Yes — read-only |
| `render env-vars list --serviceId <id>` | List env vars (values hidden) | ✅ Yes — read-only |
| `render logs follow --serviceId <id>` | Tail production logs | ✅ Yes — debugging only |
| `render env-vars set --serviceId <id> --var KEY=VAL` | Update env var | ⚠️ **Flag to Angel first** |
| `render services cancel-deploy --serviceId <id>` | Rollback deploy | ⚠️ **Flag to Angel first** |

**Forbidden Operations:**

| Command | Reason |
|---------|--------|
| `render config init` | Config is pre-configured — re-init breaks auth |
| `render services delete` | Destructive — Angel only |
| `render services create` | Infra provisioning — Angel only |
| `render custom-domains *` | DNS management — Angel only |

**Canonical service ID:**

```bash
# From .env
RENDER_SERVICE_ID=srv-d66g6rh4tr6s73al8qg0

# Verify
render services list
```

**Debugging production issues:**

```bash
# Tail live logs
render logs follow --serviceId "$RENDER_SERVICE_ID" --region oregon

# Inspect environment variables (values are redacted)
render env-vars list --serviceId "$RENDER_SERVICE_ID"

# Check recent deploys
render deploys list --serviceId "$RENDER_SERVICE_ID" --limit 5
```

**When to use Render CLI over dashboard:**

- Agents cannot access the Render web dashboard — the CLI is the only production interface.
- Use `render logs follow` for real-time debugging instead of guessing from local behavior.
- Use `render env-vars list` to verify secret sync parity (compare with `npm run sync:render-secrets` output).

### 17. The Evidence Mandate

**Never guess. Never assume. Never invent functionality, states, or architecture.**

You must always verify every claim you make with hard-coded evidence extracted directly from the system. If you cannot point to the specific file, schema, or byte of code that proves your claim, you must explicitly state that the evidence is missing or unknown. 

### 18. Canonical Law Rule

When asked about any numbered law, named law, schema clause, or contract rule, retrieve the canonical source before answering.

Never answer law questions from memory, inference, or theme.

Required format:
1. Canonical Text
2. Oracle Interpretation
3. Protected Invariant
4. Risk Reduced
5. Failure Protocol

If the canonical source is unavailable, say:
"The oracle cannot certify this law yet. The missing evidence is VAELRIX_LAW.md."

---

## Before Using PixelBrain: Essential Knowledge

**PixelBrain is a bytecode-driven visual synthesis engine, not a physics simulator.**

All animation is **pre-computed bytecode** read at runtime — never per-frame simulation.

### Core Principle: Bytecode → Render, Never Simulate → Render

```
❌ WRONG: Per-frame physics simulation
update(delta) {
  solveLaplace()      // Expensive computation
  growLightning()     // Physics simulation
  render()
}

✅ RIGHT: Bytecode lookup
update(time, delta) {
  const glow = getBytecodeAMP(time, GLOW)  // Instant lookup
  const flicker = getBytecodeAMP(time, FLICKER)
  sprite.setRotation(getRotationAtTime(time, bpm))  // Absolute time
}
```

### The Three Laws of PixelBrain Animation

**1. Absolute Time Is Sovereign**
- All rotation/animation uses **absolute time** (`time` parameter), never delta
- `rotation = radiansPerSecond * timeSeconds` — always smooth, frame-rate independent
- Delta-based animation accumulates error and chokes on frame drops

**2. Bytecode Channels Drive All Motion**
- `getBytecodeAMP(time, CHANNEL)` — O(1) lookup, zero simulation
- Channels: `ROTATION`, `GLOW`, `FLICKER`, `SCALE`, `OPACITY`
- AMP (Animation MicroProcessor) pre-computes all motion curves

**3. Pre-Generate, Never Compute Per-Frame**
- Patterns (lightning, particles, waves) are **pre-generated** and cached
- Runtime selects from cached patterns based on bytecode state
- One-time generation cost, zero per-frame cost

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────┐
│  PDR / Blueprint (Human Intent)                         │
│  "orb pulse with 4-way symmetry, 800ms period"          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Bytecode Blueprint Bridge (Compiler)                   │
│  - Parse blueprint                                      │
│  - Validate semantics                                   │
│  - Compile to bytecode + math formulas                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  AMP Runtime (Lookup Engine)                            │
│  - getBytecodeAMP(time, GLOW) → 0.73                    │
│  - getRotationAtTime(time, bpm) → 2.45 rad              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Phaser Renderer (Execution)                            │
│  - sprite.setRotation(rotation)                         │
│  - graphics.lineStyle(color, glow * alpha)              │
└─────────────────────────────────────────────────────────┘
```

### Performance Budget

| Operation | Budget | Actual |
|-----------|--------|--------|
| Bytecode lookup | <0.01ms | ✅ O(1) table read |
| Rotation calculation | <0.01ms | ✅ Single multiply |
| Sprite transform | <0.1ms | ✅ GPU batched |
| Graphics draw | <1ms | ✅ Vector paths |
| **Total per frame** | **<16ms** (60fps) | ✅ Typically 2-4ms |

### What PixelBrain Is NOT

- ❌ **Not a physics engine** — No per-frame collision, no rigidbody simulation
- ❌ **Not a particle simulator** — Particles are pre-generated patterns
- ❌ **Not a ray tracer** — Lighting is bytecode-driven glow values
- ❌ **Not a procedural generator** — Patterns are authored, not emergent

### What PixelBrain IS

- ✅ **A bytecode interpreter** — Reads pre-computed animation states
- ✅ **A deterministic renderer** — Same bytecode = same output
- ✅ **A game engine surface** — Phaser execution of authored intent
- ✅ **A visual synthesis layer** — Combines patterns, colors, motion

### Common Mistakes

```javascript
// ❌ MISTAKE: Simulating lightning every frame
update() {
  solveLaplace(15)  // 5-10ms per call
  growLightning()   // 2-5ms per call
  render()
}
// Result: 30-50fps, choppy animation

// ✅ CORRECT: Bytecode-driven glow
update(time) {
  const glow = getBytecodeAMP(time, GLOW)  // 0.01ms
  graphics.lineStyle(color, glow)          // Instant
  graphics.strokeCircle(...)               // GPU batched
}
// Result: 60fps, smooth animation
```

### The Rotation Formula (Memorize This)

```javascript
// Absolute time → rotation (radians)
export function getRotationAtTime(absoluteTimeMs, bpm, degreesPerBeat = 90) {
  const radiansPerSecond = (degreesPerBeat * π / 180) * (bpm / 60);
  const timeSeconds = absoluteTimeMs * 0.001;
  const rotation = radiansPerSecond * timeSeconds;
  return rotation % (2 * π);  // Normalize to [0, 2π)
}
```

**Why this works:**
- `rotation = speed × time` — linear, continuous, no accumulation
- No `delta` parameter — frame drops don't cause jumps
- Modulo wrap — never overflows, always smooth

### Bytecode Blueprint Syntax

```text
ANIM_START
ID orb-transmission-pulse
TARGET id player-orb
DURATION 800
EASE TOKEN IN_OUT_ARC
SCALE BASE 1.0 PEAK 1.05
GLOW BASE 0.0 PEAK 0.5
SYMMETRY TYPE radial ORDER 4
ANIM_END
```

**Compiles to:**
```json
{
  "formula": "scale(t) = 1.0 + 0.05 * sin(2πt/800)",
  "glow_envelope": { "kind": "pulse", "peak": 0.5, "duration": 800 },
  "symmetry": { "type": "radial", "order": 4 }
}
```

**Executes as:**
```javascript
sprite.setScale(1.0 + 0.05 * Math.sin(2 * Math.PI * time / 800));
graphics.lineStyle(color, getBytecodeAMP(time, GLOW));
```

### The PixelBrain Mantra

> **"Bytecode first. Render second. Never simulate."**

Before writing any PixelBrain code, ask:
1. Is this pre-computed as bytecode?
2. Am I using absolute time, not delta?
3. Is this a lookup, not a simulation?

If any answer is **no**, rewrite it.

---

## Escalation Block Format

When a domain conflict arises, any agent issues this block to Angel:

```
ESCALATION:
- Conflict: [what overlaps — name both domains explicitly]
- My domain says: [your position, grounded in your jurisdiction]
- Other domain says: [their likely position, grounded in their jurisdiction]
- Option A: [path + tradeoff]
- Option B: [path + tradeoff]
- Recommendation: [optional — clearly labeled as opinion, not decision]
- Needs: Angel's decision
```

An escalation is not a failure. It is the correct behavior when the law is ambiguous. Agents who resolve domain conflicts unilaterally without escalating are violating Vaelrix Law.

---

## Domain Map (Quick Reference)

| Domain | Owner | Hard Boundary |
|--------|-------|---------------|
| UI surface, components, CSS, animations | Claude | `src/pages/`, `src/components/`, `*.css` |
| Backend coding, debugging, tests, CI, encyclopedia | Gemini | `codex/server/`, `codex/runtime/`, `codex/services/`, `codex/core/` (impls), `tests/`, `.github/workflows/`, `docs/scholomance-encyclopedia/` |
| Schemas, layer law, engine architecture | Codex | `SCHEMA_CONTRACT.md`, `codex/` (architecture + schemas), `src/lib/` (contracts), `src/hooks/` (logic contracts), `src/data/`, `scripts/` |
| Law, arbitration, final decisions | Angel (repository owner/user) | This document |

Shared boundaries that require explicit coordination before any agent acts:
- Combat result rendering (Claude renders, Codex defines shape, Gemini implements)
- School theme generation (Claude consumes output, Codex defines the schema, Gemini runs/maintains the script)
- `src/data/` tuning (Codex publishes the schema/data contract; Gemini implements and tunes values)
- Visual regression baselines (Claude captures the baselines, Gemini gates the diff in CI)

---

## Agent Context Files

Each agent has a context file that inherits this law and specifies domain jurisdiction:

| Agent | Context File |
|-------|-------------|
| Claude (UI) | `CLAUDE.md` |
| Codex (Schemas / Architecture) | `CODEX.md` |
| Gemini (Backend Coder & Debugger) | `GEMINI.md` |
| All agents (schemas) | `SCHEMA_CONTRACT.md` |

---

## Glossary: Critical Variables & Terminology by Page

**Mandatory reading for all agents.** These are the variables, hooks, and terms you will encounter most frequently. Know them.

### Global / Shared

| Term | Type | Location | Description |
|------|------|----------|-------------|
| `verseIR` | Object | `src/lib/truesight/` | Canonical intermediate representation of analyzed text |
| `phonemeEngine` | Service | `src/hooks/usePhonemeEngine.jsx` | Returns phonetic analysis with vowel family colors |
| `getBytecodeAMP(time, channel)` | Function | `src/lib/ambient/bytecodeAMP.js` | O(1) lookup for animation values (GLOW, FLICKER, ROTATION, SCALE) |
| `getRotationAtTime(time, bpm, degPerBeat)` | Function | `src/lib/ambient/bytecodeAMP.js` | Absolute time → radians, always smooth |
| `useAnimationIntent(intent)` | Hook | `src/ui/animation/hooks/useAnimationIntent.ts` | Submit animation blueprint to AMP, returns resolved motion |
| `motionToFramerProps(motion)` | Function | `src/ui/animation/adapters/motionToFramerProps.ts` | Convert AMP output to Framer Motion props |
| `SCHOOLS` | Constant | `src/data/schools.js` | School definitions: SONIC, PSYCHIC, VOID, WILL, ALCHEMY |
| `generateSchoolColor(schoolId)` | Function | `src/data/schools.js` | Returns HSL string for school |
| `useSonicAnalysis()` | Hook | `src/hooks/useSonicAnalysis.ts` | Returns real-time sonic profile (rhythm, intensity) based on current audio state |
| `analyzeSonicProfile` | Function | `src/lib/sonic/analysis.js` | Core logic for extracting sonic features from station metadata and signal levels |
| `useAtmosphere()` | Hook | `src/hooks/useAtmosphere.js` | Manages environmental ambience, background particles, and scene-wide visual state |
| `useProgression()` | Hook | `src/hooks/useProgression.jsx` | Tracks player career advancement, transmuter levels, and unlocked doctrines |
| `useColorCodex()` | Hook | `src/hooks/useColorCodex.js` | Resolves school-specific color palettes and dynamic CSS variables for components |
| `usePredictor()` | Hook | `src/hooks/usePredictor.js` | AI-driven heuristic engine for input anticipation and sequence completion |

---

### Listen Page (`src/pages/Listen/`)

| Term | Type | Location | Description |
|------|------|----------|-------------|
| `SignalChamberConsole` | Component | `SignalChamberConsole.tsx` | React mount for Phaser console UI |
| `SignalChamberScene` | Phaser Scene | `scenes/SignalChamberScene.js` | Phaser scene for console rendering (zIndex: 100) |
| `AlchemicalLabBackground` | Component | `AlchemicalLabBackground.tsx` | Background hexagram + atmosphere (zIndex: 0) |
| `AlchemicalLabScene` | Phaser Scene | `scenes/AlchemicalLabScene.js` | Rotating hexagram, ambient particles |
| `CrystalBallVisualizer` | Component | `CrystalBallVisualizer.tsx` | Sacred geometry orb (ScholomanceStation) |
| `CrystalBallScene` | Phaser Scene | `scenes/CrystalBallScene.js` | Procedural orb art with school-specific patterns |
| `HolographicEmbed` | Component | `HolographicEmbed.jsx` | Music player UI overlay (zIndex: 25) |
| `ScholomanceStation` | Component | `ScholomanceStation.tsx` | Station selection menu (zIndex: 100) |
| `useAmbientPlayer()` | Hook | `src/hooks/useAmbientPlayer.ts` | Audio playback, school tuning, BPM |
| `useCurrentSong()` | Hook | `src/hooks/useCurrentSong.jsx` | Tracks the currently playing track metadata, playback progress, and album art |
| `OutputDeviceSelector` | Component | `src/pages/Listen/OutputDeviceSelector.tsx` | UI for managing audio output destinations and quality settings |
| `signalLevel` | Number | Ambient player | 0-1, drives visual intensity |
| `isPlaying` | Boolean | Ambient player | Audio active state |
| `isTuning` | Boolean | Ambient player | School transition state |
| `activeStation` | Object | Ambient player | Current school metadata |
| `triggerIgnition()` | Callback | `ListenPage.tsx` | Orb click handler → opens ScholomanceStation |
| `viewMode` | String | `ListenPage.tsx` | `'CHAMBER'` (console) or `'STATION'` (menu overlay) |

---

### Read Page (`src/pages/Read/`)

| Term | Type | Location | Description |
|------|------|----------|-------------|
| `ScrollEditor` | Component | `ScrollEditor.jsx` | Main text input surface with Truesight overlay |
| `IDE` | Component | `IDE.css` | Three-column layout container |
| `AnalysisPanel` | Component | `src/pages/Read/AnalysisPanel.jsx` | Side panel displaying phonetic, rhythmic, and linguistic breakdown of the scroll |
| `useVerseSynthesis` | Hook | `src/hooks/useVerseSynthesis.js` | Returns unified linguistic artifacts (rhyme, meter, phonemes) |
| `useScrolls` | Hook | `src/hooks/useScrolls.jsx` | Manages scroll state, autosave |
| `useWordLookup()` | Hook | `src/hooks/useWordLookup.jsx` | Interface for querying the Abyss lexicon and rhyme dictionary |
| `bytecodeRenderer` | Service | `src/pages/Read/bytecodeRenderer.js` | Renders bytecode-encoded visual effects directly onto the scroll surface |
| `Truesight` | Mode | `ScrollEditor.jsx` | Phonetic coloring overlay mode |
| `analyzedWords` | Array | `ScrollEditor.jsx` | Words with phonetic color data |
| `isTruesight` | Boolean | `ScrollEditor.jsx` | Truesight overlay active |
| `textarea.onScroll → overlay.scrollTop` | Pattern | `ScrollEditor.jsx` | Sync scroll between textarea and overlay |
| `color: transparent` on textarea | CSS | `ScrollEditor.jsx` | Hides native text when Truesight active |

---

### Combat Page (`src/pages/Combat/`)

| Term | Type | Location | Description |
|------|------|----------|-------------|
| `CombatPage` | Component | `CombatPage.jsx` | Main combat surface |
| `BattleScene` | Phaser Scene | `scenes/BattleScene.js` | WebGL combat rendering |
| `Spellbook` | Component | `components/Spellbook.jsx` | Player's verse library |
| `useCombatEngine` | Hook | `hooks/useCombatEngine.js` | Combat state machine |
| `useScoring` | Hook | `src/hooks/useScoring.js` | Returns combat scores from backend |
| `COMBAT_PREVIEW` | State | Client | Decorative only — never authoritative |
| `COMBAT_RESOLVED` | State | Server | Authoritative combat outcome |
| `battleLog` | Array | Combat engine | Turn-by-turn combat events |
| `playerDoctrines` | Array | Combat engine | Active player modifiers |
| `opponentDoctrines` | Array | Combat engine | Procedural opponent modifiers |

---

### CODEx Backend (`codex/`)

| Term | Type | Location | Description |
|------|------|----------|-------------|
| `combat.scoring.js` | Module | `codex/core/` | Combat score heuristics |
| `combat.profile.js" | Module | `codex/core/` | Player/opponent profile generation |
| `lexicon.abyss.js` | Module | `codex/core/` | Entropy scoring, linguistic depth |
| `speaking/prosody.js` | Module | `codex/core/` | Rhythm, stress pattern analysis |
| `microprocessors/` | Module | `codex/core/` | NLU + PixelBrain processor factory |
| `pixelbrain/symmetry-amp.js` | Module | `codex/core/` | Symmetry detection engine |
| `server/services/combatScore.service.js` | Service | `codex/server/` | Authoritative scoring |
| `server/services/panelAnalysis.service.js` | Service | `codex/server/` | VerseIR analysis backend |
| `server/persistence.adapter.js` | Adapter | `codex/server/` | SQLite (abyss.sqlite) adapter |

---

### Bytecode Error System (`docs/ByteCode Error System/`)

| Module | Purpose | Location |
|--------|---------|----------|
| Error codes | `PB-ERR-v1-{CATEGORY}-{SEVERITY}-{MODULE}-{CODE}` | `02_Error_Code_Reference.md` |
| QA assertions | `assertEqual`, `assertTrue`, `assertInRange`, `assertType` | `04_QA_Integration_Guide.md` |
| Approved schemas | `PB-ERR-v1`, `PB-RECURSE-v1`, `0xF`-prefixed formulas | `01_System_Overview.md` |

---

### Security Patterns (`ARCH_CONTRACT_SECURITY.md`)

| Pattern | Rule |
|---------|------|
| Input validation | Allow-list only, never deny-list |
| Output escaping | React default, sanitize if `dangerouslySetInnerHTML` |
| Auth tokens | httpOnly cookies only, never localStorage |
| No `eval()` | Never use `eval()`, `new Function()`, or inline handlers |
| CSRF | All mutating requests require CSRF token |

---

### 19. The Mandate of Semantic Search

**Standard string-matching tools (e.g., Grep) are prohibited for codebase analysis and forensic audits.**

Agents MUST use **TurboQuant Search** (`mcp_scholomance_collab_search_codebase`) or **Hybrid Search** (`mcp_scholomance_collab_codebase_hybrid_search`) as the primary mechanism for retrieval. Grep is a relic of linear syntax; semantic resonance is the tool of choice.

- **Lawful Retrieval**: Using semantic vectors and hybrid phonetic/literal signals to locate intent and related clusters.
- **Unlawful Retrieval**: Relying on brittle, syntax-dependent string matching that ignores the underlying World-Law.

Exception: `run_shell_command("grep ...")` is permitted only for low-level diagnostic operations on non-source files (e.g., logs, temporary files) when semantic indexing is unavailable.

### 20. The Immune System and Forensic Stasis

**No code modification shall be committed without a prior Immune System scan.**

Agents MUST use the **Immune System** (`mcp_scholomance_collab_immunity_scan_file`) to verify that their proposed changes do not introduce known pathogens or structural entropy.

- **Innate Immunity**: Rejects obvious entropy and security anti-patterns.
- **Adaptive Immunity**: Detects semantic similarity to known high-risk fractures (e.g., `RECURSIVE_SHADOW`).
- **Forensic Stasis**: If a scan reveals a violation, the agent must seal the fracture before proceeding with the implementation ritual.

### 21. Explicit Type Annotations Only — No `:=` Inference

**The `:=` static type inference operator is prohibited in all GDScript files.**

GDScript's `:=` operator tells the compiler to infer a static type from the assigned value. However, many Godot built-in functions (`abs()`, `dict.get()`, `JSON.parse_string()`, etc.) return `Variant` — Godot's dynamic union type. When `:=` is used with these functions, the compiler infers the type as `Variant`, which triggers a parse error under `warnings_as_errors` (enabled project-wide).

**The rule:**
- Always use explicit type annotations: `var swing: float = abs(sin(...))` — **never** `var swing := abs(sin(...))`
- This applies to all GDScript files (`.gd`) in the project
- No exceptions for "obvious" types — the compiler is the arbiter, not intuition

**Why this exists:**
`:=` is a recurring parse-error vector in this project. Explicit annotations remove compiler ambiguity, document intent, and prevent type-inference failures from blocking builds. An agent that uses `:=` in GDScript will cause the next agent to waste time on a known failure mode.

### 22. Vaelrix Daemon Retry Golden Standard — No Cold Boots

**The Vaelrix daemon MUST be accessed via HTTP retry with exponential backoff. Cold boots are prohibited.**

When the Vaelrix brain daemon (`brain_daemon.py` on `:9090`) is unreachable, the TUI client (`prompt_service.py`) MUST follow the golden retry ritual — it MUST NOT spawn a fresh `BrainBridge` process in the TUI thread (cold boot).

#### 20.1 The Golden Retry Ritual

The following pattern in `prompt_service.py` is the canonical reference. Every agent who modifies Vaelrix client code must preserve it:

1. **Cached client first**: Try `self._vaelrix_brain.ask(text)` — reuse the warm connection.
2. **Fresh connection with retry**: If cached fails, attempt `BrainBridgeClient(port=9090)`.
3. **Retry loop**: Loop up to **12 attempts** with **exponential backoff** (2s, 4s, 6s, …, capped at 20s). On each failure, emit a status message to the user.
4. **Agent cancel check**: Honor `controller.agent_cancelled(token)` inside the retry loop so the user can abort.
5. **Final failure message**: After 12 failures, emit an error telling the user how to start the daemon — do NOT cold boot.
6. **No cold boot path**: The old `BrainBridge(personality="Vaelrix")` in-process fallback is deleted and must never be reinstated.

#### 20.2 Retry Parameters (Golden Constants)

```
MAX_RETRIES = 12
BACKOFF_BASE = 2   # seconds; multiplies by attempt number
BACKOFF_CAP  = 20  # seconds; ceiling for backoff
```

#### 20.3 State Indicators During Retry

- **Before daemon query**: `set_state("thinking")` → shows "THINKING" in the UI border title.
- **During retry pause**: `set_state("idle")` → clears the border title, so the user sees the retry progress message.
- **After response**: `set_state("responding")` → shows "RESPONDING" during typewriter output.

#### 20.4 Daemon Lifecycle Is Systemd's Job

The Vaelrix daemon is managed by `scholomance-brain.service` (systemd `--user`). The TUI must never attempt to start, stop, or cold-boot the daemon itself. When the daemon is down, the user is told:

```
⚠ Vaelrix daemon down — retry 4/12 in 8s… (systemd will restart it)
```

After all retries are exhausted, the user sees:

```
✗ Vaelrix daemon unreachable after 12 retries.
  Start it:  systemctl --user start scholomance-brain.service
```

**Golden reference file**: `divtube_downloader/tui/services/prompt_service.py` — lines 128–201 (Vaelrix agent path).

**Why this exists:**
Cold boots spawn a fresh `BrainBridge` inside the TUI process. This loads the Ollama model from scratch, burns memory, blocks the TUI, and duplicates the daemon's role. The systemd service already manages the daemon lifecycle with `Restart=always`. Letting the TUI wait for systemd to revive the daemon is the correct pattern. An agent that reinstates the cold-boot path is reintroducing a known architecture failure.

---

## Online Reference Resources

**Mandatory bookmarks for all agents.** These resources provide essential reference data for bytecode-to-pixel conversions and typographic measurements.

| Resource | Purpose | URL |
|----------|---------|-----|
| **Points vs Pixels Calculator** | Interactive reference for converting typographic points to screen pixels at various DPIs. Essential for bytecode mathematical conversion when calculating glyph positioning and grid-fitting. | https://reeddesign.co.uk/test/points-pixels.html |
| **Google Fonts** | Web font library with metric data. Use for cross-platform font consistency (Crimson Pro = Georgia alternative for Linux). | https://fonts.google.com |
| **Can I Use** | Browser compatibility reference for CSS properties and APIs. | https://caniuse.com |
| **MDN Web Docs** | Authoritative reference for web APIs including Canvas `measureText()`, font properties, and text rendering. | https://developer.mozilla.org |

---

## Version Log

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-03-10 | Initial law established |
| 1.1 | 2026-03-10 | Split Gemini and Codex roles, clarified Angel authority, and established root-doc precedence over archive references |
| 1.2 | 2026-04-01 | Added "Before Using PixelBrain: Essential Knowledge" — bytecode-driven animation principles, absolute time formula, architecture pattern |
| 1.3 | 2026-04-01 | Added Law 9: "Law Evolution Is Mandatory" — requires agents to evaluate and propose law updates based on critical nature and structural integrity |
| 1.4 | 2026-04-01 | Added Law 10: "Stacking Sovereignty" — z-index must use semantic constants. Added `ENGINEERING_RULEBOOK.md` — mandatory QA gates for all code changes |
| 1.5 | 2026-04-01 | Added immutability clause to Law 8. Added dependency whitelisting rule to ENGINEERING_RULEBOOK.md |
| 1.6 | 2026-04-01 | Added "Agent Tool Reference" — comprehensive inventory of all hooks, utilities, services, and components. Mandatory reference for all agents to prevent parallel pattern invention |
| 1.7 | 2026-04-02 | Added Law 11: "Scholomance Encyclopedia — Bug Fix Documentation" — mandates documentation of all bug fixes with bytecode search codes upon Angel's "BUG REPORT AUDIT" command. Renumbered subsequent laws |
| 1.8 | 2026-04-02 | Added "Online Reference Resources" section — mandatory bookmarks for bytecode-to-pixel conversions, typography measurements, and web API references. Added Points vs Pixels calculator for DPI/DPR calculations |
| 1.9 | 2026-04-02 | Added Law 13: "PDR Archive Is Mandatory" — all Product Design Requirements must be stored in `docs/PDR-archive/`. Scattered PDRs prohibited |
| 1.10 | 2026-04-02 | Added Law 14: "Collab Login and MCP Access Protocol" — explicit boot order, login path, MCP bridge configuration, role mapping, and per-agent access instructions. Corrected stale top-level version header to match the actual law revision |
| 1.11 | 2026-04-03 | Expanded Law 14.10 with Key Management commands and added Law 14.11 "Automatic Secret Synchronization" for Render integration. |
| 1.12 | 2026-04-27 | Added Law 17: "The Mandate of Semantic Search" — Prohibits Grep in favor of TurboQuant semantic search for all agents. |
| 1.13 | 2026-04-27 | Integrated Archive of Dominance and Immune System tools into Law 14. Expanded Law 17 with Hybrid Search. Added Law 18: "The Immune System and Forensic Stasis" mandating immune scans before commits. |
| 1.14 | 2026-05-09 | Canonicalized encyclopedia-consolidated documentation paths: PDRs now live under `docs/scholomance-encyclopedia/PDR-archive/`, PIRs under `docs/scholomance-encyclopedia/post-implementation-reports/`, and root law files may act as compatibility entrypoints. |
| 1.15 | 2026-05-22 | Added Law 9 (Component Instance Isolation) to prohibit global mutable variables in UI files and enforce component-local useRef caching. Corrected Law 12's violation reference pointer. Renumbered Law 17 (Collab Login and MCP Access Protocol) to Law 14 to reconcile sub-heading numbers and resolve missing law gaps. |
| 1.16 | 2026-06-17 | Added Law 19: "Explicit Type Annotations Only — No `:=` Inference" — GDScript's `:=` operator is prohibited project-wide. Explicit type annotations (`var x: float = ...`) are required. Prevents recurring parse errors from Variant-inferred types under `warnings_as_errors`. |
| 1.17 | 2026-06-23 | Renumbered laws 14–22 to sequential order (no duplicate law numbers). Added Law 22: "Vaelrix Daemon Retry Golden Standard — No Cold Boots" — HTTP daemon retry with exponential backoff (12 attempts, 2s→20s capped) is mandatory. In-process cold boots (`BrainBridge` spawn in TUI thread) are permanently prohibited. Golden reference: `prompt_service.py:128–201`. |

---

*Arbiter: Angel (IItsVaelrix, repository owner/user). Final decisions on all escalations rest here.*
