"""Tests for CollabBridgeService (TUI ↔ scholomance-collab)."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

from tui.services.collab_bridge_service import CollabBridgeService, render_result


# Reusable test fixtures ---------------------------------------------------

class _RecorderHandler(BaseHTTPRequestHandler):
    """HTTP handler that records each request and returns a canned response."""

    recorder = None  # set per-test
    response_status = 200
    response_body = b"{}"
    response_headers = {}

    def do_GET(self):  # noqa: N802
        if _RecorderHandler.recorder is not None:
            _RecorderHandler.recorder.append({
                "method": "GET",
                "path": self.path,
                "headers": dict(self.headers),
            })
        self.send_response(_RecorderHandler.response_status)
        for k, v in _RecorderHandler.response_headers.items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_RecorderHandler.response_body)

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""
        if _RecorderHandler.recorder is not None:
            _RecorderHandler.recorder.append({
                "method": "POST",
                "path": self.path,
                "headers": dict(self.headers),
                "body": body,
            })
        self.send_response(_RecorderHandler.response_status)
        for k, v in _RecorderHandler.response_headers.items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_RecorderHandler.response_body)

    def do_DELETE(self):  # noqa: N802
        if _RecorderHandler.recorder is not None:
            _RecorderHandler.recorder.append({
                "method": "DELETE",
                "path": self.path,
                "headers": dict(self.headers),
            })
        self.send_response(_RecorderHandler.response_status)
        for k, v in _RecorderHandler.response_headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b"")

    def log_message(self, format, *args):  # silence stderr
        pass


def _start_mock_server():
    """Start a mock HTTP server on a free port; return (port, recorder, shutdown)."""
    recorder = []
    _RecorderHandler.recorder = recorder
    _RecorderHandler.response_status = 200
    _RecorderHandler.response_body = b"{}"
    _RecorderHandler.response_headers = {}

    server = HTTPServer(("127.0.0.1", 0), _RecorderHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def shutdown():
        server.shutdown()
        server.server_close()

    return port, recorder, shutdown


# Task 1 tests -------------------------------------------------------------

class TestServiceInit(unittest.TestCase):
    def test_defaults_read_from_env(self):
        with mock.patch.dict(os.environ, {
            "SCHOLOMANCE_COLLAB_URL": "http://example:4000",
            "SCHOLOMANCE_COLLAB_KEY": "k-123",
            "SCHOLOMANCE_COLLAB_AGENT_ID": "divtube-test",
        }, clear=False):
            svc = CollabBridgeService()
        self.assertEqual(svc.base_url, "http://example:4000")
        self.assertEqual(svc.key, "k-123")
        self.assertEqual(svc.agent_id, "divtube-test")

    def test_explicit_kwargs_override_env(self):
        with mock.patch.dict(os.environ, {"SCHOLOMANCE_COLLAB_KEY": "env-key"}, clear=False):
            svc = CollabBridgeService(key="explicit-key")
        self.assertEqual(svc.key, "explicit-key")


class TestAuthGating(unittest.TestCase):
    def setUp(self):
        # Always clear the env vars for auth tests so explicit kwargs are the only source.
        self._env_patch = mock.patch.dict(os.environ, {
            "SCHOLOMANCE_COLLAB_KEY": "",
            "SCHOLOMANCE_COLLAB_AGENT_ID": "",
        }, clear=False)
        self._env_patch.start()

    def tearDown(self):
        self._env_patch.stop()

    def test_auth_error_when_key_missing(self):
        svc = CollabBridgeService()
        self.assertIsNotNone(svc.auth_error())
        self.assertIn("SCHOLOMANCE_COLLAB_KEY", svc.auth_error())

    def test_auth_error_none_when_key_present(self):
        svc = CollabBridgeService(key="k-1", agent_id="a-1")
        self.assertIsNone(svc.auth_error())


class TestIsAvailable(unittest.TestCase):
    def test_true_when_health_endpoint_responds_200(self):
        port, recorder, shutdown = _start_mock_server()
        try:
            svc = CollabBridgeService(base_url=f"http://127.0.0.1:{port}", key="k")
            self.assertTrue(svc.is_available())
        finally:
            shutdown()

    def test_false_when_connection_refused(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        self.assertFalse(svc.is_available())


class TestSessionLifecycle(unittest.TestCase):
    def test_initialize_sends_no_session_id_and_captures_response_header(self):
        port, recorder, shutdown = _start_mock_server()
        try:
            _RecorderHandler.response_status = 200
            _RecorderHandler.response_body = json.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {"name": "scholomance-collab", "version": "0.2.0"},
                    "capabilities": {},
                },
            }).encode()
            _RecorderHandler.response_headers = {"Mcp-Session-Id": "sess-A"}

            svc = CollabBridgeService(base_url=f"http://127.0.0.1:{port}", key="k", agent_id="a")
            svc._ensure_session()

            self.assertEqual(svc._session_id, "sess-A")
            self.assertEqual(svc._server_info["name"], "scholomance-collab")
            # Only the initialize POST should have hit the server.
            posts = [r for r in recorder if r["method"] == "POST"]
            self.assertEqual(len(posts), 1)
            body = json.loads(posts[0]["body"])
            self.assertEqual(body["method"], "initialize")
            self.assertNotIn("mcp-session-id", {k.lower() for k in posts[0]["headers"]})
        finally:
            shutdown()

    def test_subsequent_call_includes_session_id(self):
        port, recorder, shutdown = _start_mock_server()
        try:
            # First response: initialize, sets session.
            _RecorderHandler.response_status = 200
            _RecorderHandler.response_body = json.dumps({
                "jsonrpc": "2.0", "id": 1, "result": {"serverInfo": {"name": "x"}},
            }).encode()
            _RecorderHandler.response_headers = {"Mcp-Session-Id": "sess-B"}

            svc = CollabBridgeService(base_url=f"http://127.0.0.1:{port}", key="k", agent_id="a")
            captured = []
            svc.call_tool("status_get", {}, lambda r: captured.append(r))
            # call_tool dispatches to a thread; wait for it.
            import time
            for _ in range(50):
                if captured:
                    break
                time.sleep(0.05)
            self.assertTrue(captured, "call_tool did not invoke callback within 2.5s")
            posts = [r for r in recorder if r["method"] == "POST"]
            self.assertEqual(len(posts), 2)  # initialize + tools/call
            tools_call = posts[1]
            self.assertEqual(tools_call["headers"].get("Mcp-Session-Id"), "sess-B")
            self.assertEqual(tools_call["headers"].get("Authorization"), "Bearer k")
            self.assertEqual(tools_call["headers"].get("X-Agent-Id"), "a")
            body = json.loads(tools_call["body"])
            self.assertEqual(body["method"], "tools/call")
            self.assertEqual(body["params"]["name"], "status_get")
        finally:
            shutdown()

    def test_jsonrpc_error_surfaces_message(self):
        port, recorder, shutdown = _start_mock_server()
        try:
            _RecorderHandler.response_status = 200
            _RecorderHandler.response_body = json.dumps({
                "jsonrpc": "2.0", "id": 1, "result": {"serverInfo": {"name": "x"}},
            }).encode()
            _RecorderHandler.response_headers = {"Mcp-Session-Id": "sess-C"}

            svc = CollabBridgeService(base_url=f"http://127.0.0.1:{port}", key="k")
            # Override the response for the next call (tools/call).
            def second_response(recorder_list):
                _RecorderHandler.response_status = 200
                _RecorderHandler.response_body = json.dumps({
                    "jsonrpc": "2.0", "id": 2,
                    "error": {"code": -32600, "message": "Tool not found: bogus"},
                }).encode()
            second_response(recorder)
            captured = []
            svc.call_tool("bogus", {}, lambda r: captured.append(r))
            import time
            for _ in range(50):
                if captured:
                    break
                time.sleep(0.05)
            self.assertTrue(captured)
            self.assertIn("Tool not found", captured[0])
        finally:
            shutdown()

    def test_close_sends_delete_with_session(self):
        port, recorder, shutdown = _start_mock_server()
        try:
            _RecorderHandler.response_body = json.dumps({
                "jsonrpc": "2.0", "id": 1, "result": {"serverInfo": {"name": "x"}},
            }).encode()
            _RecorderHandler.response_headers = {"Mcp-Session-Id": "sess-D"}
            svc = CollabBridgeService(base_url=f"http://127.0.0.1:{port}", key="k")
            svc._ensure_session()
            recorder.clear()
            svc.close()
            deletes = [r for r in recorder if r["method"] == "DELETE"]
            self.assertEqual(len(deletes), 1)
            self.assertEqual(deletes[0]["headers"].get("Mcp-Session-Id"), "sess-D")
            self.assertIsNone(svc._session_id)
        finally:
            shutdown()


class TestForcefieldMethods(unittest.TestCase):
    """Assert each typed method builds the correct ``tools/call`` payload."""

    def _capture(self, svc, method_name, *args, **kwargs):
        """Run a typed method, return the captured JSON body of the POST."""
        port, recorder, shutdown = _start_mock_server()
        try:
            _RecorderHandler.response_body = json.dumps({
                "jsonrpc": "2.0", "id": 1, "result": {"serverInfo": {"name": "x"}},
            }).encode()
            _RecorderHandler.response_headers = {"Mcp-Session-Id": "sess-X"}
            svc.base_url = f"http://127.0.0.1:{port}"
            method = getattr(svc, method_name)
            method(*args, **kwargs)
            import time
            for _ in range(50):
                if len(recorder) >= 2:
                    break
                time.sleep(0.05)
            tools_call = [r for r in recorder if r["method"] == "POST"][1]
            return json.loads(tools_call["body"])
        finally:
            shutdown()

    def test_forcefield_ask(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "forcefield_ask", "explain X", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_brain_forcefield_ask")
        self.assertEqual(body["params"]["arguments"], {"query": "explain X"})

    def test_list_brains(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "list_brains", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_brain_list")
        self.assertEqual(body["params"]["arguments"], {})

    def test_run_brain(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "run_brain", "CODE_BRAIN", "find the bug", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_brain_run")
        self.assertEqual(body["params"]["arguments"], {"name": "CODE_BRAIN", "query": "find the bug"})

    def test_get_scdna_genes(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "get_scdna_genes", "code", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_brain_scdna_genes")
        self.assertEqual(body["params"]["arguments"], {"domain": "code"})

    def test_scholomance_feedback(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(
            svc, "scholomance_feedback", "spec X", "B", "some context", lambda r: None
        )
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_skill_scholomance_feedback")
        self.assertEqual(
            body["params"]["arguments"],
            {"subject": "spec X", "mode": "B", "context": "some context"},
        )

    def test_scholomance_knowledge(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "scholomance_knowledge", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_skill_scholomance_knowledge")
        self.assertEqual(body["params"]["arguments"], {})


class TestControlMethods(unittest.TestCase):
    def _capture(self, svc, method_name, *args, **kwargs):
        port, recorder, shutdown = _start_mock_server()
        try:
            _RecorderHandler.response_body = json.dumps({
                "jsonrpc": "2.0", "id": 1, "result": {"serverInfo": {"name": "x"}},
            }).encode()
            _RecorderHandler.response_headers = {"Mcp-Session-Id": "sess-Y"}
            svc.base_url = f"http://127.0.0.1:{port}"
            getattr(svc, method_name)(*args, **kwargs)
            import time
            for _ in range(50):
                if len(recorder) >= 2:
                    break
                time.sleep(0.05)
            tools_call = [r for r in recorder if r["method"] == "POST"][1]
            return json.loads(tools_call["body"])
        finally:
            shutdown()

    def test_status_get(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "status_get", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_status_get")
        self.assertEqual(body["params"]["arguments"], {})

    def test_task_list_with_filter(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "task_list", "in_progress", 25, lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_task_list")
        self.assertEqual(body["params"]["arguments"], {"status": "in_progress", "limit": 25})

    def test_task_list_omits_none(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "task_list", None, 50, lambda r: None)
        self.assertEqual(body["params"]["arguments"], {"limit": 50})

    def test_task_get(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "task_get", "t-42", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_task_get")
        self.assertEqual(body["params"]["arguments"], {"id": "t-42"})

    def test_task_update_requires_note(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(
            svc, "task_update", "t-42", "Refactored useProgression hook", None, None, lambda r: None
        )
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_task_update")
        self.assertEqual(
            body["params"]["arguments"],
            {"id": "t-42", "note": "Refactored useProgression hook"},
        )

    def test_task_update_short_circuits_on_empty_note(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        captured = []
        svc.task_update("t-1", "", None, None, lambda r: captured.append(r))
        # No thread, no HTTP — should be synchronous.
        import time
        time.sleep(0.1)
        self.assertEqual(len(captured), 1)
        self.assertIn("note is required", captured[0])
        self.assertIn("Rule 12", captured[0])

    def test_lock_list(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "lock_list", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_lock_list")
        self.assertEqual(body["params"]["arguments"], {})

    def test_agent_list_with_filters(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(svc, "agent_list", "ui", "online", lambda r: None)
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_agent_list")
        self.assertEqual(body["params"]["arguments"], {"role": "ui", "status": "online"})

    def test_forensic_search_camel_case(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(
            svc, "forensic_search", "vaelrix", True, False, "*.py", None, 50, lambda r: None
        )
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_forensic_search")
        args = body["params"]["arguments"]
        self.assertEqual(args["query"], "vaelrix")
        self.assertEqual(args["isRegex"], True)
        self.assertEqual(args["caseSensitive"], False)
        self.assertEqual(args["includePattern"], "*.py")
        # Both pattern args were None except includePattern; excludePattern
        # must be omitted (Zod's .optional() rejects null).
        self.assertNotIn("excludePattern", args)
        self.assertEqual(args["limit"], 50)

    def test_immunity_scan_file(self):
        svc = CollabBridgeService(base_url="http://127.0.0.1:1", key="k")
        body = self._capture(
            svc, "immunity_scan_file", "import os", "x.py", lambda r: None
        )
        self.assertEqual(body["params"]["name"], "mcp_scholomance_collab_immunity_scan_file")
        self.assertEqual(body["params"]["arguments"], {"content": "import os", "filePath": "x.py"})


class TestRenderers(unittest.TestCase):
    def test_render_list_brains(self):
        raw = json.dumps({
            "structuredContent": {
                "brains": [
                    {"id": "CODE_BRAIN", "description": "Code analysis"},
                    {"id": "LORE_BRAIN", "description": "Lore knowledge"},
                ]
            }
        })
        out = render_result("mcp_scholomance_collab_brain_list", raw)
        self.assertIn("CODE_BRAIN", out)
        self.assertIn("LORE_BRAIN", out)
        self.assertIn("Code analysis", out)

    def test_render_status_get(self):
        raw = json.dumps({
            "structuredContent": {
                "agents": {"online": ["a", "b"], "busy": ["c"]},
                "tasks": {"in_progress": 3, "backlog": 5},
                "locks": 1,
            }
        })
        out = render_result("mcp_scholomance_collab_status_get", raw)
        self.assertIn("online=2", out)
        self.assertIn("in_progress=3", out)
        self.assertIn("locks=1", out)

    def test_render_forensic_search(self):
        raw = json.dumps({
            "structuredContent": {
                "hits": [
                    {"file": "a.py", "line": 12, "snippet": "vaelrix = 1"},
                    {"file": "b.py", "line": 7, "snippet": "import vaelrix"},
                ]
            }
        })
        out = render_result("mcp_scholomance_collab_forensic_search", raw)
        self.assertIn("a.py:12", out)
        self.assertIn("b.py:7", out)

    def test_render_unknown_tool_returns_pretty_json(self):
        raw = json.dumps({"hello": "world"})
        out = render_result("mcp_scholomance_collab_anything", raw)
        self.assertIn("hello", out)
        self.assertIn("world", out)

    def test_render_invalid_json_returns_verbatim(self):
        out = render_result("mcp_scholomance_collab_anything", "not json")
        self.assertEqual(out, "not json")


if __name__ == "__main__":
    unittest.main()
