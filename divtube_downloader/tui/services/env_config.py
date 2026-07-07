import os
import re


# Known providers → (base_url, models_url, default_model)
PROVIDERS = {
    "openai":   ("https://api.openai.com/v1", "https://api.openai.com/v1", "gpt-4o"),
    "xai":      ("https://api.x.ai/v1", "https://api.x.ai/v1", "grok-4.3"),
    "opencode": ("https://opencode.ai/zen/v1", "https://opencode.ai/zen/v1", "big-pickle"),
    "router":   ("https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1", "google/gemini-2.5-pro"),
    "blackbox": ("https://api.blackbox.ai/v1", "https://api.blackbox.ai/v1", "blackboxai"),
    "groq":     ("https://api.groq.com/openai/v1", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "gemini":   ("https://generativelanguage.googleapis.com/v1beta/openai",
                 "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
}
# Friendly/brand names users actually type → canonical provider key above.
PROVIDER_ALIASES = {
    "google": "gemini",
    "grok": "xai",        # brand name for x.ai's models
    "x.ai": "xai",
    "x": "xai",
    "openrouter": "router",
}


def _provider_slug(name):
    """Stable per-provider .env key, e.g. 'openai' -> CUSTOM_API_KEY_OPENAI,
    'https://foo.com/v1' -> CUSTOM_API_KEY_HTTPS_FOO_COM_V1."""
    safe = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()
    return f"CUSTOM_API_KEY_{safe}"


def _env_path():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")


def get_config():
    api_key = os.environ.get("CUSTOM_API_KEY")
    base_url = os.environ.get("CUSTOM_API_BASE")
    models_url = os.environ.get("CUSTOM_MODELS_URL")

    env_path = _env_path()
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                if key == "CUSTOM_API_KEY" and not api_key:
                    api_key = value
                elif key == "CUSTOM_API_BASE" and not base_url:
                    base_url = value
                elif key == "CUSTOM_MODELS_URL" and not models_url:
                    models_url = value

    if not base_url:
        base_url = "https://opencode.ai/zen/v1"
    if not models_url:
        models_url = base_url

    if not api_key:
        api_key = os.environ.get("OPENCODE_API_KEY")
        if not api_key and os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if line.startswith("OPENCODE_API_KEY="):
                        api_key = line.split("=", 1)[1].strip()
                        break

    return api_key, base_url, models_url


_OPENAI_CLIENTS = {}


def get_openai_client(base_url, api_key):
    """Cached OpenAI SDK client per (base_url, api_key) so switching providers
    mid-session never reuses stale credentials. base_url already ends in /v1 (or a
    provider's OpenAI-compat path); the SDK appends /chat/completions itself.

    openai is imported lazily so merely importing env_config (done widely across
    the TUI) never hard-fails if the SDK isn't installed yet."""
    key = (base_url, api_key)
    client = _OPENAI_CLIENTS.get(key)
    if client is None:
        from openai import OpenAI
        client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            # OpenRouter reads these for app attribution/ranking; harmless elsewhere.
            default_headers={
                "HTTP-Referer": "https://github.com/DivTube",
                "X-Title": "DivTube Cockpit",
            },
        )
        _OPENAI_CLIENTS[key] = client
    return client


def get_model():
    model = os.environ.get("OPENCODE_MODEL")
    if model:
        return model
    env_path = _env_path()
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("OPENCODE_MODEL="):
                    model = line.split("=", 1)[1].strip()
                    if model:
                        return model
    return None


def _read_env_value(key):
    """Read a single value from the live environment, falling back to .env."""
    val = os.environ.get(key)
    if val:
        return val
    env_path = _env_path()
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                if k.strip() == key:
                    v = v.strip()
                    if v:
                        return v
    return None


def get_active_provider():
    """Name of the currently selected provider, or None."""
    return _read_env_value("CUSTOM_PROVIDER")


def get_provider_key(name):
    """The saved API key for a specific provider, or None."""
    if not name:
        return None
    return _read_env_value(_provider_slug(name))


def set_active_key(key):
    """Save an API key for the currently active provider AND make it the active
    key. The per-provider copy lets us restore it automatically on the next
    switch back, so the user only types each key once."""
    provider = get_active_provider()
    if provider:
        write_key(_provider_slug(provider), key)
    write_key("CUSTOM_API_KEY", key)
    return provider


def resolve_provider(name):
    """Map a provider name/alias/URL to (canonical_name, base_url, models_url,
    default_model). Unknown names are treated as a custom base URL."""
    raw = (name or "").strip()
    canonical = PROVIDER_ALIASES.get(raw.lower(), raw.lower())
    if canonical in PROVIDERS:
        base_url, models_url, default_model = PROVIDERS[canonical]
        return canonical, base_url, models_url, default_model
    # Custom base URL — identify the provider by the URL itself.
    return raw, raw, raw, ""


def set_provider(name):
    """Switch the active provider: persist its URLs, remember the selection, and
    restore that provider's previously-saved API key (if any). Returns
    (canonical_name, base_url, models_url, default_model, key_restored)."""
    provider, base_url, models_url, default_model = resolve_provider(name)
    write_key("CUSTOM_API_BASE", base_url)
    write_key("CUSTOM_MODELS_URL", models_url)
    write_key("CUSTOM_PROVIDER", provider)

    saved_key = get_provider_key(provider)
    if saved_key:
        write_key("CUSTOM_API_KEY", saved_key)
        key_restored = True
    else:
        # No key for this provider yet — clear the active key so we surface a
        # friendly "set a key" message instead of sending the previous
        # provider's key and erroring out with an auth failure.
        write_key("CUSTOM_API_KEY", "")
        key_restored = False

    if default_model:
        write_key("OPENCODE_MODEL", default_model)

    return provider, base_url, models_url, default_model, key_restored


def write_key(key, value):
    _write_env(key, value)
    os.environ[key] = value


def _write_env(key, value):
    env_path = _env_path()
    if not os.path.exists(env_path):
        open(env_path, "w").close()

    with open(env_path, "r") as f:
        lines = f.readlines()

    found = False
    with open(env_path, "w") as f:
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(f"{key}="):
                f.write(f"{key}={value}\n")
                found = True
            else:
                f.write(line)
        if not found:
            f.write(f"{key}={value}\n")
