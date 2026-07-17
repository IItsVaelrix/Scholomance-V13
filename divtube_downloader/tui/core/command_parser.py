import shlex
import os

# ── project root detection ──────────────────────────────────────────
_PROJECT_ROOT = None

def _get_project_root():
    global _PROJECT_ROOT
    if _PROJECT_ROOT is not None:
        return _PROJECT_ROOT
    # walk up from this file's location to find project root
    current = os.path.dirname(os.path.abspath(__file__))
    markers = (".git", "package.json", "build.gradle", "pyproject.toml")
    for _ in range(10):
        if any(os.path.exists(os.path.join(current, m)) for m in markers):
            _PROJECT_ROOT = current
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    _PROJECT_ROOT = os.getcwd()
    return _PROJECT_ROOT


def resolve_at_references(raw: str, log_fn=None) -> str:
    """Scan *raw* for ``@filepath`` tokens, resolve them, and rewrite.

    For every token starting with ``@`` (and not followed by a space or
    already inside quotes handled by shlex):
      1. Try to resolve the path relative to the project root.
      2. If the file exists, read its content and pass it to *log_fn*
         (if provided) so the UI can display it.
      3. Replace the ``@token`` with the resolved *absolute* path so that
         downstream command handlers receive a concrete path.

    Returns the rewritten input string.
    """
    if "@" not in raw:
        return raw

    root = _get_project_root()
    parts = raw.split()
    resolved = []

    for token in parts:
        if token.startswith("@") and len(token) > 1:
            rel = token[1:]  # strip leading @

            # try relative to project root first
            full = os.path.join(root, rel)
            if not os.path.isfile(full):
                # fallback: try as absolute / cwd-relative
                full = rel if os.path.isabs(rel) else os.path.abspath(rel)

            if os.path.isfile(full):
                # read & display content
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except Exception as exc:
                    content = None
                    if log_fn:
                        log_fn(f"[#FF5C7A]✗ Cannot read [bold]{full}[/]: {exc}[/]")

                if content is not None and log_fn:
                    ext = os.path.splitext(full)[1].lower()
                    {"js": "js", "jsx": "jsx", "ts": "ts",
                            "tsx": "tsx", "py": "python", "json": "json",
                            "md": "markdown", "css": "css", "html": "html",
                            "yml": "yaml", "yaml": "yaml",
                            "gradle": "groovy", "java": "java",
                            "sql": "sql", "sh": "bash"}.get(ext.lstrip("."), "")
                    short = os.path.relpath(full, root)
                    log_fn(f"\n[bold #B388FF]📎 @{short}[/] [#6A5A6A]({len(content)} B)[/]")
                    log_fn("[#8B5CF6]━━━ file ━━━[/]")
                    log_fn(f"[#E2E8F0]{content[:3000]}[/]")
                    if len(content) > 3000:
                        log_fn(f"[#6A5A6A]… ({len(content) - 3000} more bytes) — use full path in command to process it[/]")
                    log_fn("[#8B5CF6]━━━━━━━━━━━[/]\n")

                # replace @token with the absolute path
                resolved.append(full)
            else:
                # file not found — leave token as-is but warn
                if log_fn:
                    log_fn(f"[#FFD166]⚠ @{rel} not found (tried: {full})[/]")
                resolved.append(token)
        else:
            resolved.append(token)

    return " ".join(resolved)


class CommandRegistry:
    def __init__(self):
        self.commands = {}

    def register(self, name, handler, desc, usage):
        self.commands[name] = {
            "handler": handler,
            "desc": desc,
            "usage": usage
        }

    def parse_and_execute(self, raw_input, ui_context):
        raw_input = raw_input.strip()
        if not raw_input:
            return

        # Handle space after slash, e.g. "/ polish" -> "/polish"
        if raw_input.startswith("/") and len(raw_input) > 1 and raw_input[1].isspace():
            raw_input = "/" + raw_input[1:].lstrip()

        # ── resolve @file references before command parsing ──────────
        raw_input = resolve_at_references(raw_input, ui_context.log_msg)

        # Quote-aware tokenization so commands can take multi-word arguments,
        # e.g.  /score-title "My New Title" --curve speedrun-god
        try:
            parts = shlex.split(raw_input)
        except ValueError:
            # Unbalanced quotes — fall back to naive split rather than crashing.
            parts = raw_input.split()
        if not parts:
            return
        cmd = parts[0]
        args = parts[1:]

        if cmd in self.commands:
            self.commands[cmd]["handler"](ui_context, args)
        elif cmd.startswith("/"):
            # Forward unrecognized slash commands to the AI agent natively
            ui_context.log_msg(f"[#6A5A6A]Forwarding {cmd} to Vaelrix...[/]")
            if "/prompt" in self.commands:
                self.commands["/prompt"]["handler"](ui_context, [raw_input])
            else:
                ui_context.log_msg(f"[#FF5C7A]Unknown command: {cmd}. Type /help.[/]")
        else:
            ui_context.log_msg(f"[#FF5C7A]Unknown command: {cmd}. Type /help.[/]")
