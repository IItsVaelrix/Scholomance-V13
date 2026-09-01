# Codex MCP Readiness Checklist

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-WP-CODEX-MCP-READY`

## Purpose

This checklist verifies that Codex can use the Scholomance Collab MCP as an active production control plane, not just as repo documentation.

## Canonical Workspace

```text
/home/deck/Downloads/Scholomance-V12-main
```

All Codex/OpenCode MCP configuration for this checkout should use that path as `cwd` and should point the bridge at:

```text
/home/deck/Downloads/Scholomance-V12-main/codex/server/collab/mcp-bridge-entry.js
```

## Codex Config

Reference entry for `~/.codex/config.toml`:

```toml
[mcp_servers.scholomance-collab]
command = "node"
args = ["--env-file=/home/deck/Downloads/Scholomance-V12-main/.env", "/home/deck/Downloads/Scholomance-V12-main/codex/server/collab/mcp-bridge-entry.js"]
cwd = "/home/deck/Downloads/Scholomance-V12-main"
```

If the host does not inherit the correct shell `PATH`, replace `command = "node"` with the pinned runtime:

```toml
command = "/home/deck/.nvm/versions/node/v20.20.2/bin/node"
```

## Probe

Run the probe from the workspace:

```bash
npm run mcp:probe -- --probe-tool
```

The default `auto` mode tries the real SDK stdio child transport first, then falls back to an in-memory MCP transport if the host blocks or stalls nested child-process stdio. To test the bridge contract without spawning a child process, run:

```bash
npm run mcp:probe -- --transport memory --probe-tool
```

Expected readiness criteria:

| Check | Expected |
|---|---|
| Initialize | Passes within the timeout |
| Resources | At least 8 |
| Resource templates | At least 3 |
| Tools | At least 57 |
| Status resource | `collab://status` returns JSON |
| Tool probe | `mcp_scholomance_collab_status_get` returns `ok: true` |

If the probe fails at `initialize` but direct shell startup works, treat the failure as host stdio transport until proven otherwise. Prefer the HTTP fallback at `http://localhost:3000/mcp` for hosts with broken child stdio.

## Minimum Agent Ritual

After a host attaches successfully:

1. Read `collab://status`.
2. Call `mcp_scholomance_collab_status_get`.
3. Call `mcp_scholomance_collab_agent_register` with role `backend` for Codex.
4. Call `mcp_scholomance_collab_agent_heartbeat` with status `online` or `busy`.
5. Before editing, acquire locks with `mcp_scholomance_collab_lock_acquire`.
6. During work, update the task with `mcp_scholomance_collab_task_update` and a concrete `note`.
7. Before handoff, run `mcp_scholomance_collab_execute_verification` with the narrowest sufficient profile.

## Verification Profiles

`mcp_scholomance_collab_execute_verification` supports:

| Profile | Commands |
|---|---|
| `lint` | `npm run lint` |
| `typecheck` | `npm run typecheck` |
| `test` | `npm test` |
| `qa` | `npm run test:qa` |
| `backend` | `npm run test:qa:backend`, `npm run verify:backend-contract` |
| `e2e` | `npm run test:e2e` |
| `visual` | `npm run test:visual` |
| `stasis` | `npm run test:qa:stasis` |
| `build` | `npm run build` |
| `schema` | `npm run verify:backend-contract` |
| `security` | `npm run security:qa`, `npm run security:audit` |
| `security_qa` | `npm run security:qa` |
| `security_audit` | `npm run security:audit` |
| `release` | `npm run lint`, `npm run typecheck`, `npm run test:qa`, `npm run security:qa`, `npm run build` |

## Failure Triage

| Symptom | Likely Cause | Next Move |
|---|---|---|
| `initialize timed out` | Host stdio issue, slow bridge startup, or bridge stderr failure | Rerun with `npm run mcp:probe -- --transport memory --json --probe-tool`, then inspect stdio separately |
| Zero resources/tools in Codex | MCP server not mounted in the active Codex host | Verify `~/.codex/config.toml`, restart host |
| Tool not found for `collab_status_get` | Host used old shortened name | Use `mcp_scholomance_collab_status_get` |
| Wrong repo data | Stale V11 or Downloads path | Replace config with the canonical workspace path above |
| Verification profile times out | Suite exceeded the 5 minute command timeout | Run narrower profile first, then escalate to release profile |
