"""Boon 1: registry ↔ sidebar parity — command invisibility is a bug class.

Every command registered in ``tui/ui/app.py`` must be EITHER
  * surfaced as a sidebar button (``SECTIONS``), or
  * explicitly listed in ``EXEMPT_ALIASES`` with its canonical command —
    and that canonical command must itself have a button.

The reverse holds too: no ghost buttons (every SECTIONS command must be
registered), and every button must carry a truthful tooltip in COMMAND_HINTS.

Extraction is by AST, not by regex, and is keyed on the ONE fact that makes it
complete: ``CommandRegistry.register`` (tui/core/command_parser.py) is the only
way a command can enter ``registry.commands``. So we capture *every* call to
anything named ``register``, plus every local alias bound to a ``.register``
attribute (this is what picks up ``r = self.registry.register``), no matter what
the receiver is called.

That leaves exactly one hole, and it is closed by failing loudly rather than
silently: a ``register()`` call whose command name is not a literal string. Such
a call must name its enclosing function in ``DYNAMIC_FACTORIES``, whose call
sites are then extracted instead. Anything else is a hard error, so a sixth
registration idiom cannot slip past this test by being invisible to it.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

from tui.ui.widgets.sidebar import SECTIONS, COMMAND_HINTS, EXEMPT_ALIASES

APP_PY = Path(__file__).resolve().parent.parent / "tui" / "ui" / "app.py"

# Functions that register a command whose name is computed rather than literal.
# The value is the argument index of the command name at the FACTORY's call
# sites. Adding an entry here is a deliberate act with a reviewable diff.
DYNAMIC_FACTORIES = {"create_python_check_command": 0}


def _func_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    return None


def _parse_app() -> tuple[dict[str, str], list[str]]:
    """Return ({command: handler-expression}, [problems])."""
    src = APP_PY.read_text(encoding="utf-8")
    tree = ast.parse(src)

    # Map each node to its INNERMOST enclosing function so a dynamic register
    # call is attributed to the factory that owns it, not to an outer scope.
    # ast.walk is breadth-first, so nested functions are visited after their
    # parents and overwrite them — do not change this to setdefault.
    enclosing: dict[int, str] = {}
    for fn in ast.walk(tree):
        if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for child in ast.walk(fn):
                enclosing[id(child)] = fn.name

    # Aliases: any `x = <something>.register`.
    aliases: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Attribute):
            if node.value.attr == "register":
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        aliases.add(t.id)

    commands: dict[str, str] = {}
    problems: list[str] = []
    factories_seen: set[str] = set()

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _func_name(node.func)

        # A call site of a known dynamic factory.
        if name in DYNAMIC_FACTORIES:
            idx = DYNAMIC_FACTORIES[name]
            if len(node.args) <= idx or not isinstance(node.args[idx], ast.Constant):
                problems.append(f"line {node.lineno}: {name}() called with a non-literal command name")
                continue
            raw = node.args[idx].value
            cmd = raw if str(raw).startswith("/") else f"/{raw}"
            commands[cmd] = f"<{name}>"
            continue

        if name != "register" and name not in aliases:
            continue
        if not node.args:
            problems.append(f"line {node.lineno}: register() called with no arguments")
            continue

        first = node.args[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            cmd = first.value if first.value.startswith("/") else f"/{first.value}"
            handler = ast.unparse(node.args[1]) if len(node.args) > 1 else "<none>"
            commands[cmd] = handler
            continue

        # Non-literal command name: only legal inside a declared factory.
        owner = enclosing.get(id(node))
        if owner in DYNAMIC_FACTORIES:
            factories_seen.add(owner)
            continue
        problems.append(
            f"line {node.lineno}: register() with a computed command name inside "
            f"{owner or '<module>'}() — a command this test cannot see is a command "
            f"it cannot protect. Add {owner!r} to DYNAMIC_FACTORIES."
        )

    for declared in DYNAMIC_FACTORIES:
        if declared not in factories_seen:
            problems.append(
                f"DYNAMIC_FACTORIES declares {declared!r} but no dynamic register() "
                f"call was found inside it — the exemption is stale."
            )

    # Backstop: every `.register` mentioned in the file must have been consumed
    # as a call or as an alias assignment. Catches partial(), dict dispatch, etc.
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == "register":
            parent_is_call = False
            for c in ast.walk(tree):
                if isinstance(c, ast.Call) and c.func is node:
                    parent_is_call = True
                    break
                if isinstance(c, ast.Assign) and c.value is node:
                    parent_is_call = True
                    break
            if not parent_is_call:
                problems.append(
                    f"line {node.lineno}: `.register` is referenced without being "
                    f"called or aliased — extraction may be incomplete."
                )

    return commands, problems


def registered_commands() -> set[str]:
    commands, problems = _parse_app()
    assert not problems, "app.py registration extraction is unsound:\n  " + "\n  ".join(problems)
    return set(commands)


def sidebar_commands() -> set[str]:
    cmds: set[str] = set()
    for _, entries in SECTIONS:
        cmds.update(entries)
    return cmds


def test_extraction_is_sound() -> None:
    """The parity tests below are only as good as this. Fail here, not silently."""
    commands, problems = _parse_app()
    assert not problems, "\n  ".join(problems)
    assert len(commands) > 50, (
        f"only {len(commands)} commands extracted from app.py — extraction has "
        f"broken and every parity test below is now vacuous."
    )


def test_every_registered_command_is_visible_or_exempt() -> None:
    registered = registered_commands()
    visible = sidebar_commands()
    for cmd in sorted(registered - visible):
        assert cmd in EXEMPT_ALIASES, (
            f"{cmd} is registered in app.py but has no sidebar button and no "
            f"exemption — command invisibility. Add it to SECTIONS (with a "
            f"COMMAND_HINTS line) or list it in EXEMPT_ALIASES with its canonical."
        )
        canonical = "/" + EXEMPT_ALIASES[cmd].lstrip("/")
        assert canonical in visible, (
            f"{cmd} is exempt as an alias of {canonical}, but {canonical} "
            f"itself has no sidebar button."
        )


def test_no_ghost_buttons() -> None:
    ghosts = sidebar_commands() - registered_commands()
    assert not ghosts, (
        f"sidebar buttons with no registered handler: {sorted(ghosts)} — "
        f"a button that forwards to the AI as 'unknown command' is a lie."
    )


def test_every_button_has_a_truthful_hint() -> None:
    missing = sorted(sidebar_commands() - set(COMMAND_HINTS))
    assert not missing, (
        f"buttons without a COMMAND_HINTS tooltip: {missing} — the user "
        f"must never need /help to know what a button does."
    )


def test_exempt_aliases_are_true_aliases() -> None:
    """An exemption is only honest if it really shares its canonical handler."""
    commands, _ = _parse_app()
    for alias, canonical in EXEMPT_ALIASES.items():
        canonical = "/" + canonical.lstrip("/")
        assert alias in commands, f"{alias} is exempted but is not registered at all"
        assert canonical in commands, f"{canonical} (canonical of {alias}) is not registered"
        assert commands[alias] == commands[canonical], (
            f"{alias} is exempt as an alias of {canonical} but they register "
            f"different handlers ({commands[alias]} vs {commands[canonical]})."
        )


def test_every_generated_widget_id_is_textual_legal() -> None:
    """A section title is user-facing prose; it must never be able to crash compose.

    Textual ids admit only letters, digits, underscores and hyphens, and may not
    start with a digit. Adding the heading "DEV & OPS" raised BadIdentifier at
    compose time and took down the whole cockpit — every sidebar test that
    instantiates the app failed at once. The parity tests above are static and
    structurally cannot see this, so it is pinned here.
    """
    from tui.ui.widgets.sidebar import _btn_id, _heading_id

    legal = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_-]*$")
    for heading, cmds in SECTIONS:
        hid = _heading_id(heading)
        assert legal.match(hid), f"heading {heading!r} yields illegal widget id {hid!r}"
        for cmd in cmds:
            bid = _btn_id(cmd)
            assert legal.match(bid), f"command {cmd!r} yields illegal widget id {bid!r}"


def test_generated_ids_are_unique() -> None:
    """Slugging collapses punctuation, so two headings could map to one id."""
    heads = [_heading_id_for(h) for h, _ in SECTIONS]
    dupes = {h for h in heads if heads.count(h) > 1}
    assert not dupes, f"section headings collide on widget id: {sorted(dupes)}"

    btns = [_btn_id_for(c) for c in sorted(sidebar_commands())]
    bdupes = {b for b in btns if btns.count(b) > 1}
    assert not bdupes, f"commands collide on widget id: {sorted(bdupes)}"


def _heading_id_for(h: str) -> str:
    from tui.ui.widgets.sidebar import _heading_id

    return _heading_id(h)


def _btn_id_for(c: str) -> str:
    from tui.ui.widgets.sidebar import _btn_id

    return _btn_id(c)
