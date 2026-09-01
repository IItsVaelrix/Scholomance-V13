# Scholomance MCP VS Code Integration Guide

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-WP-MCP-INTEGRATION`

## Required Boot Order
Law 14 requires the local authority server to be running before the bridge is started.

1. Start the local server: `npm run dev:server`
2. Start the bridge in a second terminal: `npm run mcp:collab`
3. Attach the MCP client
4. Verify the session by reading `collab://status`, then calling `mcp_scholomance_collab_status_get`, `mcp_scholomance_collab_agent_register`, and `mcp_scholomance_collab_agent_heartbeat`

MCP is a local stdio transport. It does not use the HTTP login cookie used by `scripts/connect-collab.js`.

## Canonical Configuration
To connect VS Code AI extensions such as Roo Code, Cline, or Claude Desktop to the Scholomance Collab Control Plane, use the pinned Node runtime and explicit workspace cwd.

```json
{
  "mcpServers": {
    "scholomance-collab": {
      "command": "/home/deck/.nvm/versions/node/v20.20.2/bin/node",
      "args": [
        "--env-file=/home/deck/Downloads/Scholomance-V12-main/.env",
        "/home/deck/Downloads/Scholomance-V12-main/codex/server/collab/mcp-bridge-entry.js"
      ],
      "cwd": "/home/deck/Downloads/Scholomance-V12-main",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

This matches the workspace task and the MCP examples in the repo. Avoid relying on bare `node` lookup from editor-hosted MCP clients unless you have verified that the extension inherits the same PATH as your shell.

## VS Code Quick Access
The workspace includes `.vscode/tasks.json` entries:

- `Scholomance: Start Collab Server`
- `Scholomance: Start Collab MCP Bridge`
- `Scholomance: Start Collab Stack`
- `Scholomance: Probe Collab MCP Bridge`

Run them from `Tasks: Run Task` to launch the server, launch the bridge, launch both in lawful order, or execute the standalone bridge probe with the same pinned runtime used above.

## Verification
Once connected, a client should be able to:

- Start from the lawful order: `npm run dev:server` before `npm run mcp:collab`
- Run `npm run mcp:probe -- --probe-tool` successfully
- Read `collab://status`
- Call `mcp_scholomance_collab_status_get`
- Call `mcp_scholomance_collab_agent_register`
- Call `mcp_scholomance_collab_agent_heartbeat`

The bridge currently exposes a broader surface than the minimal handshake tools, including bug report, memory, filesystem, verification, and pipeline operations.

## HTTP Fallback
If your MCP host supports Streamable HTTP and has unreliable stdio child-process behavior, use the authority server endpoint instead:

- Local development: `http://localhost:3000/mcp`
- Remote deployment: `https://your-live-site.com/mcp`

This route is served by `npm run dev:server` / `codex/server/index.js` and exposes the same collab MCP surface as the stdio bridge.
For Render or any production deployment, the server must boot with `ENABLE_COLLAB_API=true` or `/mcp` will not be registered.

## Troubleshooting
If an editor MCP client still fails to connect:

1. Use the pinned absolute Node path shown above.
2. Set `cwd` to `/home/deck/Downloads/Scholomance-V12-main`.
3. Run `npm run mcp:probe -- --json --probe-tool` or the `Scholomance: Probe Collab MCP Bridge` task first. Auto mode verifies the canonical bridge command when child stdio works and falls back to in-memory contract verification when the host blocks nested child stdio.
4. Start the bridge from VS Code with the workspace task and inspect the task terminal for stderr output.
5. If the probe passes but an editor MCP client still hangs during initialize, treat that as a host/client stdio transport problem until proven otherwise.
6. If the probe fails in a host with broken child stdio, prefer the `/mcp` Streamable HTTP endpoint instead of continuing to debug stdio in the repo.

## Notes

- This guide covers the canonical stdio setup plus the supported HTTP fallback for hosts with broken child stdio.
- Operational task IDs do not belong in the canonical setup guide.
- The authoritative collab law and bridge inventory live in `VAELRIX_LAW.md` and `AGENTS.md`.
