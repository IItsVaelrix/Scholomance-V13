from scripts.audit_mobile_coding_parity import audit_mobile_parity


def tool(name):
    return {"type": "function", "function": {"name": name}}


def test_audit_reports_unclassified_desktop_tool_as_a_release_blocker():
    report = audit_mobile_parity([tool("read_file"), tool("future_power")], supported={"read_file"})

    assert not report.release_ready
    assert "future_power: unclassified_capability" in report.blockers
