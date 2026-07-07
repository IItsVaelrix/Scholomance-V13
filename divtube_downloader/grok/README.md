# Grok Workspace

Local workspace for Grok-specific DivTube Cockpit intermediates.

- `mcp-bridge-entry.mjs` is the DivTube Cockpit MCP wrapper used by
  `divtube_downloader/mcp.json`.
- `scratch/` and `output/` live under the cockpit scratch root (`grok/divtube/...`).
- When operating from this cockpit, Grok has **full access** to the entire Scholomance codebase (all directories at project root), not just `divtube_downloader/`.
- Persistent cross-session facts belong in `memory_set` with `agent_id=grok`.

Do not store secrets, API keys, raw downloaded media, or user-private drafts here.
