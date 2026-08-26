"""Hash-only, one-use credentials for the local DivTube companion."""

from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import tempfile
import threading
import time
from collections.abc import Callable
from typing import Any


OFFER_LIFETIME_SECONDS = 10 * 60
AUTH_FAILURE_WINDOW_SECONDS = 60
AUTH_FAILURE_LIMIT = 5
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1


@dataclass(frozen=True)
class PairingError(Exception):
    """A pairing request that is invalid, expired, or already consumed."""

    message: str

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)


@dataclass(frozen=True)
class PairingOffer:
    token: str
    host: str
    port: int
    certificate_fingerprint: str
    expires_at: float


@dataclass(frozen=True)
class PairingCredentials:
    device_id: str
    token: str


class PairingStore:
    """Persists only salted password hashes, never a bearer token itself."""

    def __init__(
        self,
        state_dir: str | Path,
        *,
        now: Callable[[], float] = time.time,
        token_factory: Callable[[int], str] = secrets.token_urlsafe,
        random_bytes: Callable[[int], bytes] = secrets.token_bytes,
    ) -> None:
        self._state_dir = Path(state_dir)
        self._state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self._state_dir, 0o700)
        self._state_path = self._state_dir / "pairings.json"
        self._now = now
        self._token_factory = token_factory
        self._random_bytes = random_bytes
        self._lock = threading.RLock()

    @property
    def state_path(self) -> Path:
        return self._state_path

    def create_offer(self, host: str, port: int, certificate_fingerprint: str) -> PairingOffer:
        if not isinstance(host, str) or not host or len(host) > 255:
            raise PairingError("invalid pairing host")
        if type(port) is not int or not 1 <= port <= 65535:
            raise PairingError("invalid pairing port")
        if not isinstance(certificate_fingerprint, str) or not certificate_fingerprint:
            raise PairingError("invalid certificate fingerprint")

        token = self._new_token()
        created_at = self._timestamp()
        offer = PairingOffer(token, host, port, certificate_fingerprint, created_at + OFFER_LIFETIME_SECONDS)
        with self._lock:
            state = self._load()
            state["offers"].append({
                "host": host,
                "port": port,
                "certificateFingerprint": certificate_fingerprint,
                "expiresAt": offer.expires_at,
                "used": False,
                "tokenHash": self._hash_token(token),
            })
            self._write(state)
        return offer

    def redeem(self, offer_token: str, device_label: str) -> PairingCredentials:
        if not isinstance(offer_token, str) or not offer_token:
            raise PairingError("invalid pairing offer")
        label = _device_label(device_label)
        with self._lock:
            state = self._load()
            offer = self._matching_offer(state["offers"], offer_token)
            if offer is None:
                raise PairingError("unknown pairing offer")
            if offer["used"]:
                raise PairingError("pairing offer already used")
            if self._timestamp() >= offer["expiresAt"]:
                raise PairingError("pairing offer expired")

            credential_token = self._new_token()
            device_id = self._new_device_id(state["devices"])
            offer["used"] = True
            state["devices"].append({
                "deviceId": device_id,
                "label": label,
                "revoked": False,
                "failureTimes": [],
                "tokenHash": self._hash_token(credential_token),
            })
            self._write(state)
        return PairingCredentials(device_id, credential_token)

    def authenticate(self, device_id: str, credential_token: str) -> bool:
        if not isinstance(device_id, str) or not isinstance(credential_token, str):
            return False
        with self._lock:
            state = self._load()
            device = next((item for item in state["devices"] if item["deviceId"] == device_id), None)
            if device is None or device["revoked"]:
                return False

            now = self._timestamp()
            failures = [value for value in device["failureTimes"] if value > now - AUTH_FAILURE_WINDOW_SECONDS]
            if len(failures) >= AUTH_FAILURE_LIMIT:
                device["failureTimes"] = failures
                self._write(state)
                return False

            if self._verify_token(credential_token, device["tokenHash"]):
                if failures:
                    device["failureTimes"] = []
                    self._write(state)
                return True

            failures.append(now)
            device["failureTimes"] = failures
            self._write(state)
            return False

    def revoke(self, device_id: str) -> bool:
        if not isinstance(device_id, str):
            return False
        with self._lock:
            state = self._load()
            device = next((item for item in state["devices"] if item["deviceId"] == device_id), None)
            if device is None or device["revoked"]:
                return False
            device["revoked"] = True
            device["failureTimes"] = []
            self._write(state)
            return True

    def _load(self) -> dict[str, list[dict[str, Any]]]:
        if not self._state_path.exists():
            return {"offers": [], "devices": []}
        try:
            raw = json.loads(self._state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise PairingError("pairing state is unreadable") from exc
        if not isinstance(raw, dict) or set(raw) != {"offers", "devices"}:
            raise PairingError("pairing state is invalid")
        if not isinstance(raw["offers"], list) or not isinstance(raw["devices"], list):
            raise PairingError("pairing state is invalid")
        return raw

    def _write(self, state: dict[str, list[dict[str, Any]]]) -> None:
        descriptor, temporary = tempfile.mkstemp(prefix=".pairings-", dir=self._state_dir)
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(state, handle, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._state_path)
            os.chmod(self._state_path, 0o600)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _matching_offer(self, offers: list[dict[str, Any]], token: str) -> dict[str, Any] | None:
        for offer in offers:
            token_hash = offer.get("tokenHash")
            if isinstance(token_hash, dict) and self._verify_token(token, token_hash):
                return offer
        return None

    def _new_token(self) -> str:
        token = self._token_factory(32)
        if not isinstance(token, str) or not token:
            raise PairingError("token generator returned an invalid token")
        return token

    def _new_device_id(self, devices: list[dict[str, Any]]) -> str:
        for _ in range(8):
            candidate = "device-" + _b64(self._random_bytes(12))
            if all(item.get("deviceId") != candidate for item in devices):
                return candidate
        raise PairingError("could not allocate device identity")

    def _hash_token(self, token: str) -> dict[str, str]:
        salt = self._random_bytes(16)
        if not isinstance(salt, bytes) or len(salt) < 16:
            raise PairingError("random source returned insufficient bytes")
        digest = hashlib.scrypt(
            token.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32,
        )
        return {"algorithm": "scrypt", "salt": _b64(salt), "digest": _b64(digest)}

    def _verify_token(self, token: str, stored: dict[str, Any]) -> bool:
        if not isinstance(token, str) or stored.get("algorithm") != "scrypt":
            return False
        try:
            salt = _unb64(stored["salt"])
            expected = _unb64(stored["digest"])
            actual = hashlib.scrypt(
                token.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32,
            )
        except (KeyError, TypeError, ValueError):
            return False
        return hmac.compare_digest(actual, expected)

    def _timestamp(self) -> float:
        value = self._now()
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise PairingError("clock returned an invalid timestamp")
        return float(value)


def _device_label(value: str) -> str:
    if not isinstance(value, str):
        raise PairingError("invalid device label")
    label = value.strip()
    if not label or len(label) > 64 or any(ord(character) < 0x20 for character in label):
        raise PairingError("invalid device label")
    return label


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: Any) -> bytes:
    if not isinstance(value, str):
        raise ValueError("not base64")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
