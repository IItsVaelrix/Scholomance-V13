#!/usr/bin/env python3
"""Release gate for the mobile coding partner's desktop-tool parity claim."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys


if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tui.remote.coding_policy import Availability, CapabilityClass, build_manifest
from tui.services.tool_service import ToolService


# A capability may be advertised as available only when this table names the
# bounded adapter and the direct test that proves its host-side postcondition.
_ADAPTER_TESTS = {
    # Every observe capability is executed only through the frozen agent task
    # catalog in MobileCodingAdapter; the test proves both schema narrowing
    # and the real ToolService/GateKeeper path.
    "__observe__": "tests/test_mobile_prompt_integration.py::test_phone_task_uses_live_safe_catalog_and_turns_agent_patch_into_a_proposal",
    "apply_patch": "tests/test_mobile_coding_adapter.py::test_approved_patch_applies_once_and_emits_authoritative_post_image_receipt",
    "test_run": "tests/test_mobile_execution_policy.py::test_named_verification_preset_emits_host_receipt_without_accepting_a_command",
}


@dataclass(frozen=True)
class MobileParityReport:
    blockers: tuple[str, ...]

    @property
    def release_ready(self) -> bool:
        return not self.blockers


def audit_mobile_parity(tools, *, supported: set[str] | None = None) -> MobileParityReport:
    """Return every concrete reason a "full parity" release must be blocked."""
    manifest = build_manifest(tools)
    active = supported if supported is not None else {
        name for name, entry in manifest.items()
        if entry.capability_class is CapabilityClass.OBSERVE and entry.availability is Availability.AVAILABLE
    } | {"apply_patch", "test_run"}
    blockers: list[str] = []
    for name in sorted(manifest):
        entry = manifest[name]
        if entry.availability is Availability.UNAVAILABLE:
            blockers.append(f"{name}: {entry.reason or 'unavailable'}")
        elif name not in active:
            blockers.append(f"{name}: available_without_mobile_adapter")
        elif name not in _ADAPTER_TESTS and entry.capability_class is not CapabilityClass.OBSERVE:
            blockers.append(f"{name}: adapter_without_linked_test")
    return MobileParityReport(tuple(blockers))


def main() -> int:
    report = audit_mobile_parity(ToolService().tools)
    if report.release_ready:
        print("mobile coding parity: ready")
        return 0
    print("mobile coding parity: BLOCKED")
    for blocker in report.blockers:
        print(f"- {blocker}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
