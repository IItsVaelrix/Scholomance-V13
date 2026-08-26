#!/usr/bin/env python3
"""Seal, sign, and validate deterministic Cognitive Bus packets without dependencies.

Three guarantees, kept distinct on purpose:

* content addressing  -- ``packet_id`` and ``integrity.content_sha256`` are a
  deterministic function of the packet body. Reordering keys does not change
  them; changing one byte of content does.
* corruption detection -- an *unsigned* packet whose body no longer matches its
  recorded digest is rejected. This catches truncation, bad merges, and partial
  writes. It does NOT catch a party who edits the body and re-seals, because
  anyone can recompute a plain SHA-256.
* tamper detection     -- only when the packet carries an HMAC signature and the
  validator is given the key. ``--require-signature`` makes an unsigned packet a
  validation failure so a deployment can insist on the stronger guarantee.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import hmac
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "cognitive-bus.packet.v2"
ID_PREFIX = "cbp-"
ID_LENGTH = len(ID_PREFIX) + 24
HEX64 = re.compile(r"^[0-9a-f]{64}$")
KEY_ENV_VAR = "CBUS_PACKET_KEY"

INTENTS = {
    "OBSERVE",
    "PROPOSE",
    "CHALLENGE",
    "VERIFY",
    "DECIDE",
    "HANDOFF",
    "MEMORY_PROPOSAL",
    "RETRACT",
    "ABSTAIN",
    "SNAPSHOT",
}
ROLES = {"ORCHESTRATOR", "INVESTIGATOR", "CHALLENGER", "VERIFIER", "CURATOR", "EXECUTOR"}
STATUSES = {"UNVERIFIED", "SUPPORTED", "CONTESTED", "REFUTED", "CONFIRMED"}
BASES = {"MODEL_ONLY", "USER_SUPPLIED", "RETRIEVED", "INFERRED", "DIRECT", "CORROBORATED", "CONTRADICTED"}
STRATA = {"NONE", "EPISODIC", "SEMANTIC", "MNEMONIC", "PROCEDURAL"}
MEMORY_OPS = {"NONE", "STAGE", "PROMOTE", "REVISE", "RETIRE"}
RISKS = {"READ_ONLY", "REVERSIBLE", "MATERIAL", "DESTRUCTIVE"}
HEALTH = {"UNKNOWN", "PASS", "WARN", "FAIL"}
EVIDENCE_KINDS = {"SOURCE", "ARTIFACT", "EXECUTION", "OBSERVATION", "MEMORY", "MODEL_OUTPUT"}
VERIFICATION = {"UNVERIFIED", "VERIFIED", "FAILED", "STALE"}

# Kinds that can carry decisive weight. MEMORY is an index into evidence, not
# evidence; MODEL_OUTPUT is the thing the protocol exists to hold at arm's
# length. Neither may promote a status or count toward corroboration.
DECISIVE_KINDS = {"SOURCE", "ARTIFACT", "EXECUTION", "OBSERVATION"}

# A basis that is, by construction, not external support.
UNGROUNDED_BASES = {"MODEL_ONLY", "INFERRED"}

# SCD64 fingerprints must declare where they came from. A bare 64-character
# string is no longer accepted, which is what let a query hash sit in these
# fields under v1.
SCD64_PROVENANCE = {
    "scd64_predicted_static": "STATIC_ANALYSIS",
    "scd64_confirmed_runtime": "RUNTIME_TRACE",
}

TOP_REQUIRED = {
    "schema_version",
    "task_id",
    "packet_id",
    "logical_clock",
    "parent_ids",
    "sender",
    "intent",
    "proposition",
    "epistemic",
    "evidence",
    "assumptions",
    "memory",
    "authority",
    "diagnostics",
    "integrity",
}


# --------------------------------------------------------------------------
# canonical form, sealing, signing
# --------------------------------------------------------------------------


def canonical_basis(packet: dict[str, Any]) -> bytes:
    basis = copy.deepcopy(packet)
    basis.pop("packet_id", None)
    basis.pop("integrity", None)
    return json.dumps(basis, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(packet: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_basis(packet)).hexdigest()


def compute_mac(content_sha256: str, key_id: str, key: bytes) -> str:
    payload = "\0".join((SCHEMA_VERSION, "hmac-sha256", key_id, content_sha256)).encode("utf-8")
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


def seal(packet: dict[str, Any], key: bytes | None = None, key_id: str | None = None) -> dict[str, Any]:
    """Assign the deterministic id and integrity block, optionally signing it."""
    sealed = copy.deepcopy(packet)
    sealed["schema_version"] = SCHEMA_VERSION
    content_hash = digest(sealed)
    sealed["packet_id"] = f"{ID_PREFIX}{content_hash[:24]}"
    integrity: dict[str, Any] = {
        "algorithm": "sha256",
        "content_sha256": content_hash,
        "signature": None,
    }
    if key is not None:
        if not key_id:
            raise ValueError("signing requires a key_id")
        integrity["signature"] = {
            "algorithm": "hmac-sha256",
            "key_id": key_id,
            "mac": compute_mac(content_hash, key_id, key),
        }
    sealed["integrity"] = integrity
    return sealed


# --------------------------------------------------------------------------
# evidence helpers -- shared by the validator and by any adjudicator
# --------------------------------------------------------------------------


def is_decisive(item: Any) -> bool:
    """True when an evidence item may carry weight in a status decision."""
    return (
        isinstance(item, dict)
        and item.get("verification") == "VERIFIED"
        and _enum_member(item.get("kind"), DECISIVE_KINDS)
    )


def decisive_items(evidence: Any) -> list[dict[str, Any]]:
    if not isinstance(evidence, list):
        return []
    return [item for item in evidence if is_decisive(item)]


def corroboration(evidence: Any) -> int:
    """Count distinct decisive evidence lineages, not evidence items.

    Three agents citing one document under three prose summaries share one
    ``independence_key`` and count once. This is the function the protocol's
    'count lineages, not votes' rule refers to.
    """
    return len({
        item["independence_key"]
        for item in decisive_items(evidence)
        if isinstance(item.get("independence_key"), str)
    })


def has_execution_evidence(evidence: Any) -> bool:
    return any(item.get("kind") == "EXECUTION" for item in decisive_items(evidence))


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------


def _expect(errors: list[str], condition: bool, path: str, message: str) -> None:
    if not condition:
        errors.append(f"{path}: {message}")


def _enum_member(value: Any, allowed: set[str]) -> bool:
    """Enum membership that treats arrays/objects as invalid instead of crashing."""
    return isinstance(value, str) and value in allowed


def _nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _unique_strings(value: Any) -> bool:
    return isinstance(value, list) and all(_nonempty_string(item) for item in value) and len(value) == len(set(value))


def _validate_scd64(errors: list[str], diagnostics: dict[str, Any]) -> None:
    """SCD64 fields are null or {fingerprint, provenance}.

    The provenance tag is what keeps a static prediction from being passed off
    as a runtime confirmation, and what stops an arbitrary 64-hex value -- a
    query hash, say -- from occupying an SCD64 slot unremarked. It does not stop
    a caller who deliberately writes the wrong tag; it turns a silent reuse into
    a declared, auditable false statement.
    """
    for field, required_provenance in SCD64_PROVENANCE.items():
        value = diagnostics.get(field)
        path = f"diagnostics.{field}"
        if value is None:
            continue
        if not isinstance(value, dict):
            errors.append(f"{path}: must be null or an object with fingerprint and provenance")
            continue
        _expect(errors, set(value) == {"fingerprint", "provenance"}, path, "must contain only fingerprint and provenance")
        fingerprint = value.get("fingerprint")
        _expect(
            errors,
            isinstance(fingerprint, str) and bool(HEX64.fullmatch(fingerprint)),
            f"{path}.fingerprint",
            "must be 64 lowercase hex characters",
        )
        _expect(
            errors,
            value.get("provenance") == required_provenance,
            f"{path}.provenance",
            f"must equal {required_provenance}",
        )


def _validate_epistemic_coherence(errors: list[str], packet: dict[str, Any]) -> None:
    """Cross-field rules. This is where a status has to be paid for."""
    epistemic = packet.get("epistemic")
    if not isinstance(epistemic, dict):
        return
    status = epistemic.get("status")
    basis = epistemic.get("basis")
    evidence = packet.get("evidence")
    if not _enum_member(status, STATUSES) or not isinstance(evidence, list):
        return

    decisive = decisive_items(evidence)
    lineages = corroboration(evidence)

    if _enum_member(status, {"SUPPORTED", "CONFIRMED", "REFUTED"}):
        _expect(
            errors,
            len(decisive) >= 1,
            "epistemic.status",
            f"{status} requires at least one evidence item with verification VERIFIED "
            f"and kind in {sorted(DECISIVE_KINDS)}",
        )
        _expect(
            errors,
            not _enum_member(basis, UNGROUNDED_BASES),
            "epistemic.basis",
            f"{status} is incompatible with basis {basis}",
        )

    if status == "CONFIRMED":
        _expect(
            errors,
            has_execution_evidence(evidence) or lineages >= 2,
            "epistemic.status",
            "CONFIRMED requires decisive EXECUTION evidence or at least two distinct "
            f"independence_key lineages (found {lineages})",
        )

    if status == "CONTESTED":
        _expect(
            errors,
            basis == "CONTRADICTED" and lineages >= 2,
            "epistemic.status",
            "CONTESTED requires basis CONTRADICTED and at least two distinct decisive "
            f"lineages (found {lineages}); a parent id alone cannot establish disagreement",
        )

    if status == "REFUTED":
        _expect(
            errors,
            bool(packet.get("parent_ids")),
            "parent_ids",
            "REFUTED must cite the packet it refutes so the losing branch is preserved",
        )

    if packet.get("intent") == "ABSTAIN":
        _expect(
            errors,
            not _enum_member(status, {"SUPPORTED", "CONFIRMED"}),
            "epistemic.status",
            f"an ABSTAIN packet cannot carry status {status}",
        )


def _validate_memory_gate(errors: list[str], packet: dict[str, Any]) -> None:
    memory = packet.get("memory")
    epistemic = packet.get("epistemic")
    if not isinstance(memory, dict) or not isinstance(epistemic, dict):
        return
    operation = memory.get("operation")
    stratum = memory.get("stratum")

    if operation == "NONE":
        _expect(errors, stratum == "NONE", "memory.stratum", "must be NONE when operation is NONE")
    elif _enum_member(operation, MEMORY_OPS):
        _expect(errors, stratum != "NONE", "memory.stratum", f"must not be NONE when operation is {operation}")

    if operation == "PROMOTE":
        _expect(
            errors,
            stratum != "EPISODIC",
            "memory.stratum",
            "EPISODIC memory is staged, not promoted",
        )

    if operation == "PROMOTE" and _enum_member(stratum, {"SEMANTIC", "MNEMONIC", "PROCEDURAL"}):
        _expect(
            errors,
            _enum_member(epistemic.get("status"), {"SUPPORTED", "CONFIRMED"}),
            "memory.operation",
            f"PROMOTE to {stratum} requires status SUPPORTED or CONFIRMED",
        )
        _expect(
            errors,
            not _enum_member(epistemic.get("basis"), UNGROUNDED_BASES | {"USER_SUPPLIED"}),
            "memory.operation",
            f"PROMOTE to {stratum} requires an externally grounded basis, not "
            f"{epistemic.get('basis')}",
        )
        _expect(
            errors,
            _nonempty_string(memory.get("candidate_id")),
            "memory.candidate_id",
            "is required for a promotion",
        )


def validate(packet: Any, key: bytes | None = None, require_signature: bool = False) -> list[str]:
    errors: list[str] = []
    if not isinstance(packet, dict):
        return ["$: packet must be a JSON object"]

    missing = sorted(TOP_REQUIRED - set(packet))
    extra = sorted(set(packet) - TOP_REQUIRED)
    if missing:
        errors.append(f"$: missing fields: {', '.join(missing)}")
    if extra:
        errors.append(f"$: unknown fields: {', '.join(extra)}")

    _expect(errors, packet.get("schema_version") == SCHEMA_VERSION, "schema_version", f"must equal {SCHEMA_VERSION}")
    _expect(errors, _nonempty_string(packet.get("task_id")), "task_id", "must be a non-empty string")
    clock = packet.get("logical_clock")
    _expect(errors, isinstance(clock, int) and not isinstance(clock, bool) and clock >= 0, "logical_clock", "must be a non-negative integer")

    parents = packet.get("parent_ids")
    _expect(errors, isinstance(parents, list), "parent_ids", "must be an array")
    if isinstance(parents, list):
        _expect(errors, len(parents) == len(set(map(str, parents))), "parent_ids", "must be unique")
        for index, parent in enumerate(parents):
            _expect(errors, isinstance(parent, str) and len(parent) == ID_LENGTH and parent.startswith(ID_PREFIX), f"parent_ids[{index}]", "must be a packet id")

    sender = packet.get("sender")
    _expect(errors, isinstance(sender, dict), "sender", "must be an object")
    if isinstance(sender, dict):
        _expect(errors, set(sender) == {"agent_id", "role", "model_family", "run_id"}, "sender", "must contain only agent_id, role, model_family, run_id")
        for field in ("agent_id", "model_family", "run_id"):
            _expect(errors, _nonempty_string(sender.get(field)), f"sender.{field}", "must be a non-empty string")
        _expect(errors, _enum_member(sender.get("role"), ROLES), "sender.role", f"must be one of {sorted(ROLES)}")

    _expect(errors, _enum_member(packet.get("intent"), INTENTS), "intent", f"must be one of {sorted(INTENTS)}")

    proposition = packet.get("proposition")
    _expect(errors, isinstance(proposition, dict), "proposition", "must be an object")
    if isinstance(proposition, dict):
        _expect(errors, set(proposition) == {"statement", "scope", "method", "result"}, "proposition", "must contain only statement, scope, method, result")
        _expect(errors, _nonempty_string(proposition.get("statement")), "proposition.statement", "must be non-empty")
        _expect(errors, _nonempty_string(proposition.get("scope")), "proposition.scope", "must be non-empty")
        for field in ("method", "result"):
            _expect(errors, isinstance(proposition.get(field), str), f"proposition.{field}", "must be a string")

    epistemic = packet.get("epistemic")
    _expect(errors, isinstance(epistemic, dict), "epistemic", "must be an object")
    if isinstance(epistemic, dict):
        expected = {"status", "basis", "confidence_milli", "uncertainty_codes"}
        _expect(errors, set(epistemic) == expected, "epistemic", f"must contain only {sorted(expected)}")
        _expect(errors, _enum_member(epistemic.get("status"), STATUSES), "epistemic.status", f"must be one of {sorted(STATUSES)}")
        _expect(errors, _enum_member(epistemic.get("basis"), BASES), "epistemic.basis", f"must be one of {sorted(BASES)}")
        confidence = epistemic.get("confidence_milli")
        _expect(errors, isinstance(confidence, int) and not isinstance(confidence, bool) and 0 <= confidence <= 1000, "epistemic.confidence_milli", "must be an integer from 0 to 1000")
        _expect(errors, _unique_strings(epistemic.get("uncertainty_codes")), "epistemic.uncertainty_codes", "must be unique non-empty strings")

    evidence = packet.get("evidence")
    _expect(errors, isinstance(evidence, list), "evidence", "must be an array")
    if isinstance(evidence, list):
        evidence_ids: list[str] = []
        for index, item in enumerate(evidence):
            path = f"evidence[{index}]"
            _expect(errors, isinstance(item, dict), path, "must be an object")
            if not isinstance(item, dict):
                continue
            required = {"evidence_id", "kind", "reference", "claim", "independence_key", "verification"}
            allowed = required | {"digest_sha256"}
            _expect(errors, required <= set(item) and set(item) <= allowed, path, "has missing or unknown fields")
            for field in ("evidence_id", "reference", "claim", "independence_key"):
                _expect(errors, _nonempty_string(item.get(field)), f"{path}.{field}", "must be non-empty")
            if isinstance(item.get("evidence_id"), str):
                evidence_ids.append(item["evidence_id"])
            _expect(errors, _enum_member(item.get("kind"), EVIDENCE_KINDS), f"{path}.kind", f"must be one of {sorted(EVIDENCE_KINDS)}")
            _expect(errors, _enum_member(item.get("verification"), VERIFICATION), f"{path}.verification", f"must be one of {sorted(VERIFICATION)}")
            item_digest = item.get("digest_sha256")
            _expect(errors, item_digest is None or (isinstance(item_digest, str) and bool(HEX64.fullmatch(item_digest))), f"{path}.digest_sha256", "must be null or 64 lowercase hex characters")
        _expect(errors, len(evidence_ids) == len(set(evidence_ids)), "evidence", "evidence_id values must be unique")

    _expect(errors, _unique_strings(packet.get("assumptions")), "assumptions", "must be unique non-empty strings")

    memory = packet.get("memory")
    _expect(errors, isinstance(memory, dict), "memory", "must be an object")
    if isinstance(memory, dict):
        expected = {"stratum", "operation", "candidate_id", "retention_basis"}
        _expect(errors, set(memory) == expected, "memory", f"must contain only {sorted(expected)}")
        _expect(errors, _enum_member(memory.get("stratum"), STRATA), "memory.stratum", f"must be one of {sorted(STRATA)}")
        _expect(errors, _enum_member(memory.get("operation"), MEMORY_OPS), "memory.operation", f"must be one of {sorted(MEMORY_OPS)}")
        _expect(errors, memory.get("candidate_id") is None or _nonempty_string(memory.get("candidate_id")), "memory.candidate_id", "must be null or non-empty")
        _expect(errors, _unique_strings(memory.get("retention_basis")), "memory.retention_basis", "must be unique non-empty strings")

    authority = packet.get("authority")
    _expect(errors, isinstance(authority, dict), "authority", "must be an object")
    if isinstance(authority, dict):
        expected = {"mutation_requested", "risk", "authorization_ref"}
        _expect(errors, set(authority) == expected, "authority", f"must contain only {sorted(expected)}")
        _expect(errors, isinstance(authority.get("mutation_requested"), bool), "authority.mutation_requested", "must be boolean")
        _expect(errors, _enum_member(authority.get("risk"), RISKS), "authority.risk", f"must be one of {sorted(RISKS)}")
        _expect(errors, authority.get("authorization_ref") is None or _nonempty_string(authority.get("authorization_ref")), "authority.authorization_ref", "must be null or non-empty")
        if authority.get("mutation_requested") and _enum_member(authority.get("risk"), {"MATERIAL", "DESTRUCTIVE"}):
            _expect(errors, _nonempty_string(authority.get("authorization_ref")), "authority.authorization_ref", "is required for material or destructive mutation")
        if authority.get("mutation_requested"):
            _expect(errors, authority.get("risk") != "READ_ONLY", "authority.risk", "must describe mutation risk when mutation is requested")
        if not authority.get("mutation_requested"):
            _expect(errors, authority.get("risk") == "READ_ONLY", "authority.risk", "must be READ_ONLY when no mutation is requested")

    diagnostics = packet.get("diagnostics")
    _expect(errors, isinstance(diagnostics, dict), "diagnostics", "must be an object")
    if isinstance(diagnostics, dict):
        expected = {"bytecode_health", "codes", "scd64_predicted_static", "scd64_confirmed_runtime"}
        _expect(errors, set(diagnostics) == expected, "diagnostics", f"must contain only {sorted(expected)}")
        _expect(errors, _enum_member(diagnostics.get("bytecode_health"), HEALTH), "diagnostics.bytecode_health", f"must be one of {sorted(HEALTH)}")
        _expect(errors, _unique_strings(diagnostics.get("codes")), "diagnostics.codes", "must be unique non-empty strings")
        _validate_scd64(errors, diagnostics)

    _validate_epistemic_coherence(errors, packet)
    _validate_memory_gate(errors, packet)

    integrity = packet.get("integrity")
    _expect(errors, isinstance(integrity, dict), "integrity", "must be an object")
    if isinstance(integrity, dict):
        _expect(errors, set(integrity) == {"algorithm", "content_sha256", "signature"}, "integrity", "must contain only algorithm, content_sha256, signature")
        _expect(errors, integrity.get("algorithm") == "sha256", "integrity.algorithm", "must equal sha256")
        expected_digest = digest(packet)
        _expect(errors, integrity.get("content_sha256") == expected_digest, "integrity.content_sha256", f"does not match canonical content ({expected_digest})")
        expected_id = f"{ID_PREFIX}{expected_digest[:24]}"
        _expect(errors, packet.get("packet_id") == expected_id, "packet_id", f"does not match canonical content ({expected_id})")

        signature = integrity.get("signature")
        if signature is None:
            _expect(errors, not require_signature, "integrity.signature", "is required under --require-signature; this packet carries corruption detection only, not tamper detection")
        else:
            _expect(
                errors,
                not require_signature or key is not None,
                "integrity.signature",
                "a verification key is required under --require-signature",
            )
            _expect(errors, isinstance(signature, dict), "integrity.signature", "must be null or an object")
            if isinstance(signature, dict):
                _expect(errors, set(signature) == {"algorithm", "key_id", "mac"}, "integrity.signature", "must contain only algorithm, key_id, mac")
                _expect(errors, signature.get("algorithm") == "hmac-sha256", "integrity.signature.algorithm", "must equal hmac-sha256")
                _expect(errors, _nonempty_string(signature.get("key_id")), "integrity.signature.key_id", "must be a non-empty string")
                mac = signature.get("mac")
                _expect(errors, isinstance(mac, str) and bool(HEX64.fullmatch(mac)), "integrity.signature.mac", "must be 64 lowercase hex characters")
                if (
                    key is not None
                    and isinstance(mac, str)
                    and isinstance(integrity.get("content_sha256"), str)
                    and _nonempty_string(signature.get("key_id"))
                ):
                    _expect(
                        errors,
                        hmac.compare_digest(
                            mac,
                            compute_mac(integrity["content_sha256"], signature.get("key_id", ""), key),
                        ),
                        "integrity.signature.mac",
                        "does not verify against the supplied key",
                    )

    return errors


def validate_chain(packets: list[Any], key: bytes | None = None, require_signature: bool = False) -> list[str]:
    """Validate a ledger: every packet valid, every parent resolvable, clocks monotone."""
    errors: list[str] = []
    if not isinstance(packets, list) or not packets:
        return ["$: ledger must be a non-empty JSON array of packets"]

    by_id: dict[str, dict[str, Any]] = {}
    for index, packet in enumerate(packets):
        for error in validate(packet, key=key, require_signature=require_signature):
            errors.append(f"[{index}] {error}")
        if isinstance(packet, dict) and isinstance(packet.get("packet_id"), str):
            packet_id = packet["packet_id"]
            if packet_id in by_id:
                errors.append(f"[{index}] packet_id: duplicate {packet_id} in ledger")
            by_id[packet_id] = packet

    task_ids = {p.get("task_id") for p in packets if isinstance(p, dict)}
    _expect(errors, len(task_ids) == 1, "$", f"ledger mixes task_ids: {sorted(map(str, task_ids))}")

    for index, packet in enumerate(packets):
        if not isinstance(packet, dict):
            continue
        clock = packet.get("logical_clock")
        parent_ids = packet.get("parent_ids")
        if not isinstance(parent_ids, list):
            continue
        for parent_id in parent_ids:
            parent = by_id.get(parent_id)
            if parent is None:
                errors.append(f"[{index}] parent_ids: {parent_id} is not present in the ledger")
                continue
            parent_clock = parent.get("logical_clock")
            if isinstance(clock, int) and isinstance(parent_clock, int) and clock <= parent_clock:
                errors.append(
                    f"[{index}] logical_clock: {clock} must exceed parent {parent_id} clock {parent_clock}"
                )
    return errors


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def load_key(args: argparse.Namespace) -> bytes | None:
    if getattr(args, "key_file", None):
        return Path(args.key_file).read_bytes().strip()
    env_key = os.environ.get(KEY_ENV_VAR)
    if env_key:
        return env_key.encode("utf-8")
    return None


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read JSON: {error}") from error


def read_packet(path: Path) -> dict[str, Any]:
    value = read_json(path)
    if not isinstance(value, dict):
        raise ValueError("packet root must be a JSON object")
    return value


def write_packet(path: Path, packet: dict[str, Any]) -> None:
    rendered = json.dumps(packet, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(rendered, encoding="utf-8")
    temporary.replace(path)


def command_seal(args: argparse.Namespace) -> int:
    key = load_key(args)
    try:
        packet = seal(read_packet(args.packet), key=key, key_id=args.key_id if key else None)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    errors = validate(packet, key=key)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    if args.write:
        write_packet(args.packet, packet)
        signed = "signed" if packet["integrity"]["signature"] else "unsigned"
        print(f"sealed {args.packet} ({signed}): {packet['packet_id']}")
    else:
        print(json.dumps(packet, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def command_validate(args: argparse.Namespace) -> int:
    key = load_key(args)
    try:
        packet = read_packet(args.packet)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    errors = validate(packet, key=key, require_signature=args.require_signature)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    signature = packet.get("integrity", {}).get("signature")
    if signature is None:
        guarantee = "corruption detection only (unsigned)"
    elif key is None:
        guarantee = f"signed by {signature['key_id']}, NOT verified (no key supplied)"
    else:
        guarantee = f"signature verified against {signature['key_id']}"
    print(f"valid {args.packet}: {packet['packet_id']} -- {guarantee}")
    return 0


def command_admit(args: argparse.Namespace) -> int:
    """Machine-readable, fail-closed admission boundary for service callers."""
    key = load_key(args)
    try:
        packet = json.load(sys.stdin)
    except (OSError, json.JSONDecodeError) as error:
        print(json.dumps({"admitted": False, "signatureVerified": False, "errors": [f"$: cannot read JSON: {error}"]}))
        return 2

    errors = validate(packet, key=key, require_signature=True)
    integrity = packet.get("integrity") if isinstance(packet, dict) else None
    integrity = integrity if isinstance(integrity, dict) else {}
    signature = integrity.get("signature")
    content_sha256 = integrity.get("content_sha256")
    evidence = packet.get("evidence") if isinstance(packet, dict) else None
    evidence = evidence if isinstance(evidence, list) else []
    decisive = decisive_items(evidence)
    claimed_evidence_ids = sorted(
        item.get("evidence_id") for item in evidence or []
        if isinstance(item, dict) and _nonempty_string(item.get("evidence_id"))
    )
    claimed_lineages = sorted({
        item.get("independence_key") for item in evidence or []
        if isinstance(item, dict) and _nonempty_string(item.get("independence_key"))
    })
    decisive_evidence_ids = sorted(
        item.get("evidence_id") for item in decisive
        if _nonempty_string(item.get("evidence_id"))
    )
    decisive_lineages = sorted({
        item.get("independence_key") for item in decisive
        if _nonempty_string(item.get("independence_key"))
    })
    decisive_lineage_count = corroboration(evidence)
    signature_verified = key is not None and isinstance(signature, dict) and not any(
        error.startswith("integrity.signature") for error in errors
    )
    receipt = {
        "admitted": not errors and signature_verified,
        "signatureVerified": signature_verified,
        "packetId": packet.get("packet_id") if isinstance(packet, dict) else None,
        "contentSha256": content_sha256,
        "signatureKeyId": signature.get("key_id") if isinstance(signature, dict) else None,
        "claimedEvidenceIds": claimed_evidence_ids,
        "claimedEvidenceLineages": claimed_lineages,
        "decisiveEvidenceIds": decisive_evidence_ids,
        "decisiveEvidenceLineages": decisive_lineages,
        "decisiveLineageCount": decisive_lineage_count,
        "errors": errors,
    }
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0 if receipt["admitted"] else 1


def command_chain(args: argparse.Namespace) -> int:
    key = load_key(args)
    try:
        packets = read_json(args.ledger)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    errors = validate_chain(packets, key=key, require_signature=args.require_signature)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(f"valid chain {args.ledger}: {len(packets)} packets")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_key_args(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--key-file", help=f"HMAC key file; defaults to the {KEY_ENV_VAR} environment variable")

    seal_parser = subparsers.add_parser("seal", help="assign a deterministic id and integrity digest")
    seal_parser.add_argument("packet", type=Path)
    seal_parser.add_argument("--write", action="store_true", help="replace the input atomically")
    seal_parser.add_argument("--key-id", default="default", help="key identifier recorded in the signature")
    add_key_args(seal_parser)
    seal_parser.set_defaults(handler=command_seal)

    validate_parser = subparsers.add_parser("validate", help="validate structure, coherence, and integrity")
    validate_parser.add_argument("packet", type=Path)
    validate_parser.add_argument("--require-signature", action="store_true", help="reject unsigned packets")
    add_key_args(validate_parser)
    validate_parser.set_defaults(handler=command_validate)

    admit_parser = subparsers.add_parser("admit", help="read one packet from stdin and emit a signed-admission JSON receipt")
    add_key_args(admit_parser)
    admit_parser.set_defaults(handler=command_admit)

    chain_parser = subparsers.add_parser("chain", help="validate a ledger array: parents resolve, clocks monotone")
    chain_parser.add_argument("ledger", type=Path)
    chain_parser.add_argument("--require-signature", action="store_true", help="reject unsigned packets")
    add_key_args(chain_parser)
    chain_parser.set_defaults(handler=command_chain)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
