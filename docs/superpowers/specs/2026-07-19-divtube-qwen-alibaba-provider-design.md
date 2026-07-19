# DivTube Qwen / Alibaba Provider Design

**Date:** 2026-07-19  
**Status:** Approved for planning  
**Scope:** Add Qwen Cloud (`qwencloud.com` / DashScope OpenAI-compatible APIs) as an LLM provider in `divtube_downloader`

## Goal

Let DivTube Cockpit users switch to Qwen Cloud via `/provider`, reuse the existing OpenAI-compatible client path, restore per-provider API keys, and list all models available to that key through the normal model picker.

Qwen Cloud docs use `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` for chat completions (not a `*.qwencloud.com` API host).

## Decisions

| Topic | Choice |
|-------|--------|
| Integration style | Mirror existing `PROVIDERS` table entries (same pattern as Groq/Gemini) |
| Default region for `qwen` / `alibaba` | International DashScope |
| China region | Separate canonical key `qwen-cn` |
| Default model | `qwen3.7-max` |
| Model catalog | Live `/models` from the provider (no hardcoded SKU list) |
| Secrets | Never commit API keys; user sets via `/apikey` |

## Architecture

### Provider registry

Extend `divtube_downloader/tui/services/env_config.py`:

| Canonical | Base / models URL | Default model |
|-----------|-------------------|---------------|
| `qwen` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen3.7-max` |
| `qwen-cn` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.7-max` |

### Aliases

| Alias | Resolves to |
|-------|-------------|
| `alibaba`, `dashscope`, `qwencloud`, `qwen-cloud`, `qwen-intl`, `alibaba-intl` | `qwen` |
| `alibaba-cn`, `dashscope-cn`, `qwen-china` | `qwen-cn` |

Aliases are case-insensitive via existing `resolve_provider` lowercasing.

### Runtime flow

1. `/provider qwen` (or alias) → `set_provider` writes `CUSTOM_API_BASE`, `CUSTOM_MODELS_URL`, `CUSTOM_PROVIDER`, and `OPENCODE_MODEL=qwen3.7-max`.
2. Restores `CUSTOM_API_KEY_QWEN` if saved; otherwise clears active key so the user is prompted for `/apikey`.
3. `/provider qwen-cn` uses the China URL and a separate per-provider key slug (`CUSTOM_API_KEY_QWEN_CN`).
4. Model picker continues to `GET {models_url}/models` and partitions free/paid with existing `classify_models` logic.
5. Chat/completions continue through `get_openai_client` — no new HTTP client.

### Wire-up points

- `divtube_downloader/tui/services/env_config.py` — `PROVIDERS` + `PROVIDER_ALIASES`
- `divtube_downloader/tui/ui/app.py` — `/provider` usage string
- `divtube_downloader/.env.example` — DashScope intl/cn example comments
- `divtube_downloader/INSTRUCTION_MANUAL.md` — provider table / command note
- `divtube_downloader/tests/test_model_picker.py` — alias + URL + default model assertions

## Out of scope

- New HTTP client or Anthropic-compatible DashScope path
- Hardcoded full Qwen model catalog
- Writing user API keys into the repo or tracked files
- Token-meter price rows for every Qwen SKU (optional follow-up)
- Workspace-scoped MaaS URLs (`{WorkspaceId}.{region}.maas.aliyuncs.com`)

## Error handling

No new error paths. Auth failures and empty model lists surface through existing provider/key UX (same as Groq/Gemini). Wrong-region keys may fail against the other region's endpoint; users switch with `/provider qwen` vs `/provider qwen-cn`.

## Testing

Automated:

- `qwen` / `alibaba` / `dashscope` → intl URL + default `qwen3.7-max`
- `qwen-cn` / `alibaba-cn` → China URL + default `qwen3.7-max`
- Case-insensitive alias coverage

Command:

```bash
cd divtube_downloader && python -m unittest tests.test_model_picker
```

Manual (local, user-supplied key only):

1. `/provider qwen`
2. `/apikey <dashscope-key>`
3. Confirm model picker lists models for that key and default is `qwen3.7-max`

## Success criteria

- `/provider qwen` and `/provider alibaba` select international DashScope with default `qwen3.7-max`
- `/provider qwen-cn` selects China DashScope with the same default
- Per-provider key restore works independently for intl vs China
- Unit tests for aliases and URLs pass
- No secrets land in git
