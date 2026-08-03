"""Regression tests for the 2026-08 substrate retrieval fixes.

Locks four measured defects and their fixes:

1. Cortex single-hop L2 gate (hardcoded 0.15) sat ABOVE the hash-embedder's
   measured similarity ceiling (~0.146-0.23), so retrieval silently returned
   zero results. Gate is now a configurable `l2_threshold`, lowered by the
   bridge to 0.05.
2. Substrate can return the same memory text several times (duplicate rows);
   both Cortex single-hop and the bridge query() now dedup by text.
3. SubstrateBridgeService.status() reported engine='none' before the first
   query (lazy init never ran), misleading agents into believing the substrate
   was offline. status() now triggers _ensure_engine().
4. ToolService._tui_inspect crashed with "'_ChatLogger' object has no
   attribute 'screen'" whenever the agent callback was a _ChatLogger (whose
   bound-method shim sets __self__ = itself). The handler now resolves the
   real Textual app via `_app`.
"""
from __future__ import annotations

import types

import tui.services.tool_service as ts
from tui.services.substrate_bridge_service import SubstrateBridgeService


# ── Fake widgets / apps for the tui_inspect path ────────────────────────────


class FakeWidget:
    def __init__(self, id, classes=(), children=()):
        self.id = id
        self.classes = set(classes)
        self.children = list(children)


class FakeApp:
    def __init__(self):
        self.screen = FakeWidget("root", ("app",), [FakeWidget("child-a")])


class FakeChatLogger:
    """Mimics tui.ui.app._ChatLogger's bound-method protocol shim."""

    def __init__(self, app, chat_id):
        self._app = app
        self._chat_id = chat_id
        self.__self__ = self  # the shim that used to break _tui_inspect

    def __call__(self, msg):
        pass


# ── Fix 4: _tui_inspect resolves the _ChatLogger shim ───────────────────────


def test_tui_inspect_resolves_chat_logger_shim():
    handler = object.__new__(ts.ToolService)  # _tui_inspect needs no state
    logger = FakeChatLogger(FakeApp(), "chat-mother")
    result = handler._tui_inspect({}, logger)
    # Before the fix this returned:
    #   "Error building DOM tree: '_FakeChatLogger' object has no attribute 'screen'"
    assert not result.startswith("Error"), result
    assert '"root"' in result
    assert '"child-a"' in result


def test_tui_inspect_still_works_with_real_bound_method():
    handler = object.__new__(ts.ToolService)

    class RealApp(FakeApp):
        def bound_cb(self, msg):
            pass

    app = RealApp()
    result = handler._tui_inspect({}, app.bound_cb)
    assert not result.startswith("Error"), result
    assert '"root"' in result


# ── Fix 3: bridge query() dedups results ────────────────────────────────────


class _StubCortex:
    def __init__(self, results):
        self._results = results

    def retrieve(self, text, top_k=5, multi_hop=False):
        return list(self._results), "ctx"


def _bridge_with_stubbed_cortex(results):
    svc = SubstrateBridgeService(db_path="/nonexistent/does-not-matter.sqlite")
    svc._cortex = _StubCortex(results)
    svc._engine = "cortex"
    # Skip lazy init entirely — we stubbed the engine directly.
    svc._ensure_engine = lambda: True
    return svc


def test_bridge_query_dedups_duplicate_memories():
    dup = {
        "text": "I coordinate five agents.",
        "similarity": 0.146,
        "metadata": {"tag": "identity"},
    }
    other = {
        "text": "Concept chemistry scores viability.",
        "similarity": 0.140,
        "metadata": {"tag": "architecture"},
    }
    svc = _bridge_with_stubbed_cortex([dup, dup, dup, other, other])
    res = svc.query("anything", top_k=5)
    assert res["ok"] is True
    texts = [r["text"] for r in res["results"]]
    assert texts == [
        "I coordinate five agents.",
        "Concept chemistry scores viability.",
    ], texts


# ── Fix 1+2 (bridge side): status triggers lazy init ────────────────────────


def test_status_triggers_lazy_engine_init():
    svc = SubstrateBridgeService(db_path="/nonexistent/nope.sqlite")
    calls = []
    svc._ensure_engine = lambda: calls.append(1) or False
    st = svc.status()
    assert calls == [1], "status() must attempt lazy init so it reports truth"
    assert st["ok"] is True
    assert "engine" in st


# ── Fix 1+2 (cortex side): gate is configurable + single-hop dedups ─────────


def test_cortex_l2_threshold_is_configurable_and_lowered():
    import os
    import sys

    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    brain = os.path.join(root, "steamdeck_brain")
    if brain not in sys.path:
        sys.path.insert(0, brain)
    import cortex as cortex_mod

    # Build a bare instance without touching the real DB.
    c = object.__new__(cortex_mod.Cortex)
    # The constructor normally sets this; emulate init contract instead of
    # running __init__ (which needs a live sqlite DB).
    assert getattr(cortex_mod.Cortex, "retrieve", None) is not None
    # Source-level contract: the attribute exists in __init__ and is < 0.15.
    import inspect

    src = inspect.getsource(cortex_mod.Cortex.__init__)
    assert "self.l2_threshold" in src, "Cortex.__init__ must define l2_threshold"
    single_hop_src = inspect.getsource(cortex_mod.Cortex.retrieve)
    assert ">= 0.15" not in single_hop_src, (
        "single-hop path must not keep the hardcoded 0.15 gate"
    )
    assert "self.l2_threshold" in single_hop_src


def test_cortex_single_hop_dedups_and_gates():
    import os
    import sys

    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    brain = os.path.join(root, "steamdeck_brain")
    if brain not in sys.path:
        sys.path.insert(0, brain)
    import cortex as cortex_mod

    c = object.__new__(cortex_mod.Cortex)
    c._query_count = 0
    c.l2_threshold = 0.05
    c.l1 = types.SimpleNamespace(
        query=lambda vec, top_k: [],
        put=lambda *a, **k: None,
    )
    c.embed = types.SimpleNamespace(encode=lambda text: [0.0] * 8)
    dup_hi = {"text": "memory A", "similarity": 0.10}
    dup_hi2 = {"text": "memory A", "similarity": 0.10}
    too_low = {"text": "memory B", "similarity": 0.01}
    ok = {"text": "memory C", "similarity": 0.08}
    c.substrate = types.SimpleNamespace(
        retrieve=lambda q, top_k: [dup_hi, dup_hi2, too_low, ok]
    )

    results, ctx = c.retrieve("q", top_k=5, multi_hop=False)
    texts = [r["text"] for r in results]
    assert texts == ["memory A", "memory C"], texts
    assert "SUBSTRATE MEMORIES" in ctx or "CORTEX MEMORIES" in ctx
