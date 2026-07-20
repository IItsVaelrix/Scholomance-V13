"""Tests for CollabBridgeService (TUI ↔ scholomance-collab)."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

from tui.services.collab_bridge_service import CollabBridgeService


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


if __name__ == "__main__":
    unittest.main()
