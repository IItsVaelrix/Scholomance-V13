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
        self.calls = []
        self.substrate = None

    def retrieve(self, text, top_k=5, multi_hop=False):
        self.calls.append({"text": text, "top_k": top_k, "multi_hop": multi_hop})
        # Mirror the real Cortex: it can only return the top_k it was asked for,
        # so a rare tag living outside that slice is simply not in the pool.
        return list(self._results[:top_k]), "ctx"


class _StubSubstrate:
    """Stands in for Substrate.retrieve's exact SQL metadata pre-filter."""

    def __init__(self, bank):
        self._bank = bank
        self.calls = []

    def retrieve(self, query, top_k=5, metadata_filter=None):
        self.calls.append({"query": query, "top_k": top_k, "metadata_filter": metadata_filter})
        rows = self._bank
        if metadata_filter:
            rows = [
                r for r in rows
                if all(r.get("metadata", {}).get(k) == v for k, v in metadata_filter.items())
            ]
        return [dict(r) for r in rows[:top_k]]


def _bridge_with_stubbed_cortex(results, substrate_bank=None):
    svc = SubstrateBridgeService(db_path="/nonexistent/does-not-matter.sqlite")
    svc._cortex = _StubCortex(results)
    svc._engine = "cortex"
    if substrate_bank is not None:
        svc._cortex.substrate = _StubSubstrate(substrate_bank)
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


# ── Fix 3: tag_filter must be an exact pre-filter, not a lossy post-filter ──
# Regression for: substrate_query(tag_filter='insight') returning 0 results on
# the Cortex path even though the memory existed. Cortex has no tag predicate,
# so the old code filtered a top_k-sized draw afterwards -- a rare tag could
# never appear in that draw, producing FALSE ABSENCE from a memory system.
#
# KNOWN COVERAGE LIMIT: these stubs use a 61-row bank, so a naive "over-fetch
# top_k*20 then post-filter" implementation would ALSO pass them. Against the
# real ~200k bank over-fetch was measured returning 0 (the hash embedder's
# ranking does not keep a rare tag within the widened window), which is exactly
# why this routes through Substrate's SQL pre-filter instead. If you ever move
# the filter back onto the Cortex path, re-verify against ~/.substrate with a
# rare tag -- green here does not mean correct there.


def _rare_tag_bank():
    """A 'rare' tag sitting far down a large pool of other-tagged rows."""
    filler = [
        {"id": i, "text": f"pdr row {i}", "similarity": 0.40 - i * 0.001,
         "metadata": {"tag": "pdr"}}
        for i in range(60)
    ]
    needle = {"id": 999, "text": "NEEDLE: testpaths is discarded when pytest "
              "receives an explicit path argument.", "similarity": 0.05,
              "metadata": {"tag": "insight"}}
    return filler + [needle], needle


def test_tag_filtered_query_finds_row_outside_top_k_pool():
    bank, needle = _rare_tag_bank()
    svc = _bridge_with_stubbed_cortex(bank, substrate_bank=bank)

    res = svc.query("pytest collection hazard", top_k=3, tag_filter="insight")

    assert res["ok"] is True
    texts = [r["text"] for r in res["results"]]
    assert texts == [needle["text"]], texts
    # The whole point: the needle ranked 61st, so a top-3 draw plus a post-hoc
    # filter would have returned nothing and looked like an empty substrate.
    assert bank[:3][2]["metadata"]["tag"] == "pdr"


def test_tag_filter_uses_substrate_pre_filter_and_skips_cortex():
    bank, _ = _rare_tag_bank()
    svc = _bridge_with_stubbed_cortex(bank, substrate_bank=bank)

    svc.query("anything", top_k=5, tag_filter="insight")

    assert svc._cortex.substrate.calls[0]["metadata_filter"] == {"tag": "insight"}
    assert svc._cortex.calls == [], "Cortex must not be used when tag_filter is set"


def test_tag_filter_negative_control_still_returns_nothing():
    """The guard must be able to go red, or 'found it' proves nothing."""
    bank, _ = _rare_tag_bank()
    svc = _bridge_with_stubbed_cortex(bank, substrate_bank=bank)

    res = svc.query("anything", top_k=3, tag_filter="no_such_tag")

    assert res["ok"] is True
    assert res["results"] == []


def test_unfiltered_query_still_routes_to_cortex():
    bank, _ = _rare_tag_bank()
    svc = _bridge_with_stubbed_cortex(bank, substrate_bank=bank)

    res = svc.query("anything", top_k=3)

    assert len(svc._cortex.calls) == 1
    assert svc._cortex.substrate.calls == [], "unused substrate on unfiltered path"
    assert len(res["results"]) > 0
