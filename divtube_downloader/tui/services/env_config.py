import os


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
