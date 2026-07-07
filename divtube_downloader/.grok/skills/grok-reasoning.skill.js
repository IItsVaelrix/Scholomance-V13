const registrationPayload = Object.freeze({
  id: "grok",
  name: "Grok DivTube",
  role: "backend",
  framework_origin: "xai-grok",
  capabilities: Object.freeze([
    "divtube",
    "youtube-intel",
    "seo-analysis",
    "xai-reasoning",
    "memory",
    "mcp",
  ]),
  metadata: Object.freeze({
    display_role: "grok",
    grok_role: "divtube_downloader_agent",
    framework_origin: "xai-grok",
    scratch_root: "grok/divtube",
    skill: "grok-reasoning",
  }),
});

const memoryHooks = Object.freeze({
  agent_id: "grok",
  get: Object.freeze({
    tool: "memory_get",
    parameters: Object.freeze({
      agent_id: "grok",
      key: "<key>",
    }),
  }),
  set: Object.freeze({
    tool: "memory_set",
    parameters: Object.freeze({
      agent_id: "grok",
      key: "<key>",
      value: "<value>",
    }),
  }),
});

const scratch = Object.freeze({
  root: "grok/divtube",
  scratch_dir: "grok/divtube/scratch",
  output_dir: "grok/divtube/output",
});

export default Object.freeze({
  id: "grok-divtube-reasoning",
  agent_id: "grok",
  scope: "divtube_downloader",
  registration: Object.freeze({
    tool: "mcp_scholomance_collab_agent_register",
    payload: registrationPayload,
  }),
  heartbeat: Object.freeze({
    tool: "mcp_scholomance_collab_agent_heartbeat",
    payload: Object.freeze({
      id: "grok",
      status: "online",
    }),
  }),
  memory: memoryHooks,
  scratch,
  operating_rules: Object.freeze([
    "Register with lawful collab role backend and keep Grok identity in metadata.display_role.",
    "Use memory_get and memory_set with agent_id=grok for persistent context.",
    "Use divtube_downloader/grok/scratch for large intermediates and divtube_downloader/grok/output for handoffs.",
    "Never persist secrets, API keys, raw downloaded media, or user-private drafts.",
  ]),
});

export { registrationPayload, memoryHooks, scratch };
