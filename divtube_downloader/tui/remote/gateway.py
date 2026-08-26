"""Authenticated TLS/JSON/WebSocket boundary for the Android companion."""

from __future__ import annotations

import asyncio
import inspect
import json
from pathlib import Path
from typing import Any, Awaitable, Callable

from aiohttp import WSMsgType, web

from .config import RemoteCompanionConfig
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
    ) -> None:
        self.config = config
        self.pairing = pairing
        self.event_hub = event_hub
        self.state_dir = Path(state_dir)
        self.port = port
        self.dispatcher = dispatcher
        self.runner: web.AppRunner | None = None
        self.site: web.TCPSite | None = None
        self.bound_port: int | None = None
        self.tls_identity: TLSIdentity | None = None
        self._websockets: set[web.WebSocketResponse] = set()

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
        self.tls_identity = ensure_local_certificate(self.state_dir, "127.0.0.1" if bind_host == "0.0.0.0" else bind_host)
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
            text=self.event_hub.snapshot(cockpit={"state": "idle"}, active_jobs=[]),
            content_type="application/json",
        )

    async def _events(self, request: web.Request) -> web.WebSocketResponse:
        device_id = self._authenticate(request)
        socket = web.WebSocketResponse(max_msg_size=MAX_MESSAGE_BYTES, heartbeat=30)
        await socket.prepare(request)
        self._websockets.add(socket)
        queue = self.event_hub.attach(device_id)
        sender = asyncio.create_task(self._send_events(socket, queue))
        try:
            async for message in socket:
                if message.type == WSMsgType.TEXT:
                    if len(message.data.encode("utf-8")) > MAX_MESSAGE_BYTES:
                        await socket.close(code=1009, message=b"message too large")
                        break
                    await self._handle_client_message(device_id, message.data)
                elif message.type in {WSMsgType.ERROR, WSMsgType.CLOSE, WSMsgType.CLOSED}:
                    break
        finally:
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)
            self.event_hub.detach(device_id)
            self._websockets.discard(socket)
        return socket

    async def _send_events(self, socket: web.WebSocketResponse, queue: asyncio.Queue[str]) -> None:
        while not socket.closed:
            await socket.send_str(await queue.get())

    async def _handle_client_message(self, device_id: str, raw: str) -> None:
        try:
            envelope = ClientEnvelope.from_json(raw)
            if not self._type_allowed(envelope.type):
                raise ProtocolError("mode_forbidden", "Request is disabled by the companion mode.")
            if envelope.type == "status.snapshot.request":
                self.event_hub.snapshot(cockpit={"state": "idle"}, active_jobs=[], request_id=envelope.requestId)
                return
            if self.dispatcher is None:
                raise ProtocolError("unavailable", "Cockpit adapter is unavailable.")
            result = self.dispatcher(device_id, envelope)
            if inspect.isawaitable(result):
                await result
        except ProtocolError as exc:
            request_id = None
            try:
                value = json.loads(raw)
                if isinstance(value, dict) and isinstance(value.get("requestId"), str):
                    request_id = value["requestId"]
            except json.JSONDecodeError:
                pass
            self.event_hub.publish("error", {"code": exc.code, "message": exc.message}, request_id=request_id)

    def _type_allowed(self, message_type: str) -> bool:
        if message_type in {"session.hello", "status.snapshot.request"}:
            return True
        if message_type == "chat.turn.request":
            return self.config.mode in {"chat_read_only", "downloads_confirmed"}
        if message_type == "download.request":
            return self.config.mode == "downloads_confirmed"
        return False

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
