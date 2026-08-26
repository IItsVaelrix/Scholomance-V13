"""Hash-only, one-use credentials for the local DivTube companion."""

from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
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
_TOKEN_HASH_KEYS = {"algorithm", "salt", "digest"}
_OFFER_KEYS = {"host", "port", "certificateFingerprint", "expiresAt", "used", "tokenHash"}
_DEVICE_KEYS = {"deviceId", "label", "revoked", "failureTimes", "tokenHash"}
_HEX_FINGERPRINT = re.compile(r"^[0-9A-Fa-f]+$")


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
        host = _pairing_host(host)
        port = _pairing_port(port)
        certificate_fingerprint = _certificate_fingerprint(certificate_fingerprint)

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
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise PairingError("pairing state is unreadable") from exc
        if not isinstance(raw, dict) or set(raw) != {"offers", "devices"}:
            raise PairingError("pairing state is invalid")
        if not isinstance(raw["offers"], list) or not isinstance(raw["devices"], list):
            raise PairingError("pairing state is invalid")
        try:
            return {
                "offers": [_offer_record(record) for record in raw["offers"]],
                "devices": [_device_record(record) for record in raw["devices"]],
            }
        except PairingError:
            raise
        except (AttributeError, KeyError, TypeError, ValueError, UnicodeError) as exc:
            raise PairingError("pairing state is invalid") from exc

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


def _pairing_host(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 255 or any(ord(character) < 0x20 for character in value):
        raise PairingError("invalid pairing host")
    return value


def _pairing_port(value: Any) -> int:
    if type(value) is not int or not 1 <= value <= 65535:
        raise PairingError("invalid pairing port")
    return value


def _certificate_fingerprint(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise PairingError("invalid certificate fingerprint")
    parts = value.split(":")
    if any(len(part) != 2 or not _HEX_FINGERPRINT.fullmatch(part) for part in parts):
        raise PairingError("invalid certificate fingerprint")
    return value


def _token_hash_record(value: Any) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) != _TOKEN_HASH_KEYS or value.get("algorithm") != "scrypt":
        raise PairingError("pairing state is invalid")
    try:
        salt = _unb64(value["salt"])
        digest = _unb64(value["digest"])
    except (TypeError, ValueError) as exc:
        raise PairingError("pairing state is invalid") from exc
    if len(salt) != 16 or len(digest) != 32:
        raise PairingError("pairing state is invalid")
    return {"algorithm": "scrypt", "salt": value["salt"], "digest": value["digest"]}


def _timestamp_record(value: Any) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise PairingError("pairing state is invalid")
    return float(value)


def _offer_record(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != _OFFER_KEYS or type(value.get("used")) is not bool:
        raise PairingError("pairing state is invalid")
    return {
        "host": _pairing_host(value["host"]),
        "port": _pairing_port(value["port"]),
        "certificateFingerprint": _certificate_fingerprint(value["certificateFingerprint"]),
        "expiresAt": _timestamp_record(value["expiresAt"]),
        "used": value["used"],
        "tokenHash": _token_hash_record(value["tokenHash"]),
    }


def _device_record(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != _DEVICE_KEYS or type(value.get("revoked")) is not bool:
        raise PairingError("pairing state is invalid")
    device_id = value["deviceId"]
    if not isinstance(device_id, str) or not device_id or len(device_id) > 128 or any(ord(character) < 0x20 for character in device_id):
        raise PairingError("pairing state is invalid")
    failure_times = value["failureTimes"]
    if not isinstance(failure_times, list):
        raise PairingError("pairing state is invalid")
    return {
        "deviceId": device_id,
        "label": _device_label(value["label"]),
        "revoked": value["revoked"],
        "failureTimes": [_timestamp_record(item) for item in failure_times],
        "tokenHash": _token_hash_record(value["tokenHash"]),
    }


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: Any) -> bytes:
    if not isinstance(value, str) or not value or "=" in value:
        raise ValueError("not base64")
    try:
        return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    except (ValueError, UnicodeError) as exc:
        raise ValueError("not base64") from exc
