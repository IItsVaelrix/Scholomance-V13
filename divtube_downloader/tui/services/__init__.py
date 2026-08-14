"""tui.services — LAZY package facade.

This package used to eagerly import every service at import time:

    from .prompt_service import PromptService

so importing ANY member — including the pure-stdlib code lens used by the
atlas/lens tests — executed prompt_service's top-level `from openai import
APIStatusError` and the whole tool-service chain. The lens tests then
depended on a network SDK they never use (feedback report 2026-08-19, P2:
"Repair DivTube's eager service imports — lens tests run without the OpenAI
SDK").

Now the package declares its public names but imports a module only when the
name is actually accessed (PEP 562). Submodule imports
(`from tui.services import code_atlas`) are untouched — Python's normal
import machinery handles them — and the pure-stdlib lenses stay pure-stdlib
all the way down.
"""

_LAZY_SERVICES = {
    "CleriBridge": ".cleri_bridge",
    "BytecodeHealthBridge": ".bytecode_bridge",
    "ArchiveBridge": ".archive_bridge",
    "PromptService": ".prompt_service",
}

__all__ = list(_LAZY_SERVICES)


def __getattr__(name):
    if name in _LAZY_SERVICES:
        from importlib import import_module

        module = import_module(_LAZY_SERVICES[name], __name__)
        value = getattr(module, name)
        globals()[name] = value  # cache: pay the import cost once
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__():
    return sorted(set(globals()) | set(__all__))
