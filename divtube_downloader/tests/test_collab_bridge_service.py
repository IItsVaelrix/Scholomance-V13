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


if __name__ == "__main__":
    unittest.main()
