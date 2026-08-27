import pytest

from tui.remote.coding_policy import (
    Availability,
    CapabilityClass,
    PolicyError,
    audit_manifest,
    build_manifest,
)


def tool(name, *, coding=False):
    return {
        "type": "function",
        "is_coding_action": coding,
        "function": {"name": name, "description": name, "parameters": {"type": "object", "properties": {}}},
    }


def test_unclassified_desktop_tool_is_unavailable_not_silently_omitted():
    """A new Cockpit tool must not become remotely callable by omission."""
    manifest = build_manifest([tool("future_power")])

    assert set(manifest) == {"future_power"}
    assert manifest["future_power"].availability is Availability.UNAVAILABLE
    assert manifest["future_power"].reason == "unclassified_capability"


def test_manifest_declares_patch_as_explicit_approval_bound_apply_action():
    """Removing the phone approval gate from a mutation must fail this test."""
    entry = build_manifest([tool("apply_patch", coding=True)])["apply_patch"]

    assert entry.capability_class is CapabilityClass.APPLY
    assert entry.availability is Availability.APPROVAL_REQUIRED


def test_policy_audit_rejects_a_manifest_that_omits_a_live_desktop_tool():
    """A stale generated manifest may not claim desktop parity."""
    with pytest.raises(PolicyError, match="manifest parity"):
        audit_manifest([tool("read_file")], {})


def test_duplicate_desktop_tool_names_are_rejected_before_manifest_generation():
    """A duplicate tool name would make policy selection ambiguous."""
    with pytest.raises(PolicyError, match="duplicate"):
        build_manifest([tool("read_file"), tool("read_file")])
