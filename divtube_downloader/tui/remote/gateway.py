"""Authenticated TLS/JSON/WebSocket boundary for the Android companion."""

from __future__ import annotations

import asyncio
import inspect
import json
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Awaitable, Callable

from aiohttp import WSMsgType, web

from .config import RemoteCompanionConfig
from .coding_protocol import PROTOCOL_VERSION as CODING_PROTOCOL_VERSION, CodingProtocolError, V2ClientEnvelope
from .event_hub import RemoteEventHub
from .pairing import PairingError, PairingStore
from .protocol import ClientEnvelope, ProtocolError
from .tls import TLSIdentity, ensure_local_certificate


MAX_MESSAGE_BYTES = 32 * 1024
Dispatcher = Callable[[str, ClientEnvelope], Any | Awaitable[Any]]


class RemoteGateway:
    def __init__(
        self,
        config: RemoteCompanionConfig,
        pairing: PairingStore,
        event_hub: RemoteEventHub,
        state_dir: str | Path,
        *,
        port: int = 0,
        dispatcher: Dispatcher | None = None,
        coding_dispatcher: Dispatcher | None = None,
        coding_event_hub=None,
        snapshot_provider: Callable[[], tuple[dict[str, Any], list[dict[str, Any]]]] | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config
        self.pairing = pairing
        self.event_hub = event_hub
        self.state_dir = Path(state_dir)
        self.port = port
        self.dispatcher = dispatcher
        self.coding_dispatcher = coding_dispatcher
        self.coding_event_hub = coding_event_hub
        self.snapshot_provider = snapshot_provider
        self.clock = clock
        self.runner: web.AppRunner | None = None
        self.site: web.TCPSite | None = None
        self.bound_port: int | None = None
        self.tls_identity: TLSIdentity | None = None
        self._websockets: set[web.WebSocketResponse] = set()
        self._request_times: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def _current_snapshot(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Live cockpit state and active jobs for a status snapshot.

        Both snapshot paths previously hardcoded an idle cockpit and an empty
        job list, so a device reconnecting mid-download was told nothing was
        running until the next progress event happened to fire — the one
        moment a snapshot exists to cover.

        Degrades to the old constants on any provider failure: a snapshot is
        what a reconnecting client receives first, and it must never be the
        thing that breaks the reconnect.
        """
        if self.snapshot_provider is None:
            return {"state": "idle"}, []
        try:
            cockpit, active_jobs = self.snapshot_provider()
            return cockpit, list(active_jobs)
        except Exception:
            return {"state": "idle"}, []

    def _publish_snapshot(self, *, request_id: str | None = None) -> str:
        """Emit a status snapshot built from live state."""
        cockpit, active_jobs = self._current_snapshot()
        return self.event_hub.snapshot(cockpit=cockpit, active_jobs=active_jobs, request_id=request_id)

    @property
    def base_url(self) -> str:
        if self.bound_port is None:
            raise RuntimeError("gateway is not running")
        return f"https://127.0.0.1:{self.bound_port}"

    async def start(self) -> int | None:
        if not self.config.listener_enabled:
            return None
        if self.runner is not None:
            return self.bound_port
        bind_host = self.config.bind_host
        if bind_host is None:
            return None
        # Pass the real bind host, wildcard included. Collapsing "0.0.0.0"
        # to "127.0.0.1" here issued a certificate covering only loopback
        # even though the gateway was reachable (and advertised in the
        # pairing URI) on the LAN address — clients that dial that address
        # verify it against the SAN and reject the connection. tls.py knows
        # how to expand a wildcard into "loopback + this host's LAN IP".
        self.tls_identity = ensure_local_certificate(self.state_dir, bind_host)
        app = web.Application(client_max_size=MAX_MESSAGE_BYTES, middlewares=[self._errors])
        app.add_routes([
            web.post("/v1/pair", self._pair),
            web.get("/v1/status", self._status),
            web.get("/v1/events", self._events),
        ])
        self.runner = web.AppRunner(app, access_log=None)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, bind_host, self.port, ssl_context=self.tls_identity.context)
        await self.site.start()
        sockets = self.site._server.sockets if self.site._server else []
        self.bound_port = sockets[0].getsockname()[1]
        return self.bound_port

    async def stop(self) -> None:
        sockets = tuple(self._websockets)
        self._websockets.clear()
        for socket in sockets:
            await socket.close(code=1001, message=b"gateway stopping")
        if self.runner is not None:
            await self.runner.cleanup()
        self.runner = None
        self.site = None
        self.bound_port = None

    @web.middleware
    async def _errors(self, request: web.Request, handler):
        try:
            return await handler(request)
        except web.HTTPException:
            raise
        except (PairingError, ProtocolError) as exc:
            code = exc.code if isinstance(exc, ProtocolError) else "pairing_rejected"
            return web.json_response({"error": {"code": code, "message": str(exc)}}, status=400)

    async def _pair(self, request: web.Request) -> web.Response:
        data = await _read_json(request)
        if set(data) != {"offerToken", "deviceLabel"}:
            raise ProtocolError("invalid_pairing", "Invalid pairing request.")
        credentials = self.pairing.redeem(data["offerToken"], data["deviceLabel"])
        return web.json_response({
            "protocolVersion": "divtube-remote-v1",
            "deviceId": credentials.device_id,
            "bearerToken": credentials.device_id + ":" + credentials.token,
            "certificateFingerprint": self.tls_identity.fingerprint,
        })

    async def _status(self, request: web.Request) -> web.Response:
        device_id = self._authenticate(request)
        del device_id
        return web.Response(
            text=self._publish_snapshot(),
            content_type="application/json",
        )

    async def _events(self, request: web.Request) -> web.WebSocketResponse:
        device_id = self._authenticate(request)
        protocol_version = request.query.get("protocol", "divtube-remote-v1")
        if protocol_version == CODING_PROTOCOL_VERSION:
            if self.config.mode != "coding_partner" or self.coding_event_hub is None:
                raise web.HTTPForbidden(text="coding partner mode is unavailable")
            event_hub = self.coding_event_hub
        elif protocol_version == "divtube-remote-v1":
            event_hub = self.event_hub
        else:
            raise web.HTTPBadRequest(text="unsupported protocol version")
        socket = web.WebSocketResponse(max_msg_size=MAX_MESSAGE_BYTES, heartbeat=30)
        await socket.prepare(request)
        self._websockets.add(socket)
        queue = event_hub.attach(device_id)
        sender = asyncio.create_task(self._send_events(socket, queue))
        try:
            async for message in socket:
                if message.type == WSMsgType.TEXT:
                    if len(message.data.encode("utf-8")) > MAX_MESSAGE_BYTES:
                        await socket.close(code=1009, message=b"message too large")
                        break
                    await self._handle_client_message(device_id, message.data, protocol_version, event_hub)
                elif message.type in {WSMsgType.ERROR, WSMsgType.CLOSE, WSMsgType.CLOSED}:
                    break
        finally:
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)
            event_hub.detach(device_id)
            self._websockets.discard(socket)
        return socket

    async def _send_events(self, socket: web.WebSocketResponse, queue: asyncio.Queue[str]) -> None:
        while not socket.closed:
            await socket.send_str(await queue.get())

    async def _handle_client_message(self, device_id: str, raw: str, protocol_version: str, event_hub) -> None:
        try:
            if protocol_version == CODING_PROTOCOL_VERSION:
                envelope = V2ClientEnvelope.from_json(raw)
                dispatcher = self.coding_dispatcher
                message_type = envelope.message_type
                request_id = envelope.request_id
            else:
                envelope = ClientEnvelope.from_json(raw)
                dispatcher = self.dispatcher
                message_type = envelope.type
                request_id = envelope.requestId
            if not self._type_allowed(message_type, protocol_version):
                raise ProtocolError("mode_forbidden", "Request is disabled by the companion mode.")
            self._enforce_rate_limit(device_id, message_type)
            if message_type == "status.snapshot.request":
                self._publish_snapshot(request_id=request_id)
                return
            if message_type == "device.revoke" and protocol_version == CODING_PROTOCOL_VERSION:
                self.pairing.revoke(device_id)
                event_hub.detach(device_id)
                return
            if dispatcher is None:
                raise ProtocolError("unavailable", "Cockpit adapter is unavailable.")
            result = dispatcher(device_id, envelope)
            if inspect.isawaitable(result):
                await result
        except (ProtocolError, CodingProtocolError, ValueError) as exc:
            request_id = None
            try:
                value = json.loads(raw)
                if isinstance(value, dict) and isinstance(value.get("requestId"), str):
                    request_id = value["requestId"]
            except json.JSONDecodeError:
                pass
            code = exc.code if isinstance(exc, ProtocolError) else "invalid_coding_frame"
            event_hub.publish("error", {"code": code, "message": str(exc)}, request_id=request_id)

    def _type_allowed(self, message_type: str, protocol_version: str = "divtube-remote-v1") -> bool:
        if protocol_version == CODING_PROTOCOL_VERSION:
            return self.config.mode == "coding_partner"
        if message_type in {"session.hello", "status.snapshot.request"}:
            return True
        if message_type == "chat.turn.request":
            return self.config.mode in {"chat_read_only", "downloads_confirmed"}
        if message_type == "download.request":
            return self.config.mode == "downloads_confirmed"
        return False

    def _enforce_rate_limit(self, device_id: str, message_type: str) -> None:
        limit = (
            30 if message_type == "chat.turn.request" else
            6 if message_type == "download.request" else
            20 if message_type in {"task.snapshot.request", "capability.manifest.request", "session.hello"} else
            10 if message_type in {"task.create", "artifact.open.request"} else
            6 if message_type in {"action.approve", "action.reject", "action.cancel", "verification.start.request", "device.revoke"} else
            None
        )
        if limit is None:
            return
        now = self.clock()
        entries = self._request_times[(device_id, message_type)]
        while entries and entries[0] <= now - 60:
            entries.popleft()
        if len(entries) >= limit:
            raise ProtocolError("rate_limited", "Remote request rate limit exceeded.")
        entries.append(now)

    def _authenticate(self, request: web.Request) -> str:
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise web.HTTPUnauthorized(text="missing bearer credential")
        device_id, separator, token = header[7:].partition(":")
        if not separator or not self.pairing.authenticate(device_id, token):
            raise web.HTTPUnauthorized(text="invalid bearer credential")
        return device_id


async def _read_json(request: web.Request) -> dict[str, Any]:
    if request.content_type != "application/json":
        raise web.HTTPUnsupportedMediaType(text="application/json required")
    try:
        data = await request.json(loads=json.loads)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ProtocolError("invalid_json", "Request body must be valid JSON.")
    if not isinstance(data, dict):
        raise ProtocolError("invalid_json", "Request body must be a JSON object.")
    return data
