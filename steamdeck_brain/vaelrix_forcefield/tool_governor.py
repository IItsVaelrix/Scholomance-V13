"""
Vaelrix Cortex ForceField — Tool Governor.

Gates every non-search tool call (read_file, replace_file_content, run_tests,
etc.) so that the ForceField prevents tool-call spirals, unauthorized brain
tool use, repeated identical calls, and high-risk destructive operations.
"""

from __future__ import annotations

from copy import deepcopy

from .steer_emitter import emit_deflection
from .types import ToolCallField, ToolCallRequest, ToolDecision, VaelrixCortexForceField


def _emit_tool_deflection(
    category: str,
    tier: str,
    tool: str,
    args: dict,
    decision: ToolDecision,
) -> None:
    """
    PHASE 0 (Pressure Field Governor PDR): record the deflection in the
    steer ledger. EMIT ONLY — never influences the decision, and every
    failure is swallowed inside emit_deflection.
    """
    key = normalize_tool_call(tool, args)
    emit_deflection(
        governor="tool",
        category=category,
        tier=tier,
        utterance=key,
        candidate_key=f"tool:{key}",
        suggested_alternative=decision.suggestedAlternative,
    )


# Tools that can materially change the codebase or runtime.
_DESTRUCTIVE_TOOLS = {
    "replace_file_content",
    "write_file",
    "delete_file",
    "run_command",
    "execute",
}

# Tools that are read-only.
_READ_ONLY_TOOLS = {
    "read_file",
    "search_code",
    "codebase_search",
    "archive_search",
    "forensic_search",
    "find_file",
    "list_files",
    "diagnostic_scan",
}


def normalize_tool_call(tool: str, args: dict) -> str:
    """Create a stable key for detecting repeated identical tool calls."""
    from json import dumps

    # Keep only deterministic args; ignore reason/timestamp/free-form notes.
    stable_args = {k: v for k, v in sorted(args.items()) if k not in {"reason", "note"}}
    return f"{tool}:{dumps(stable_args, sort_keys=True, ensure_ascii=False)}"


def should_allow_tool_call(
    field: VaelrixCortexForceField,
    tool: str,
    args: dict,
    reason: str,
    *,
    allowed_tools: set[str] | None = None,
    max_calls_per_phase: int | None = None,
    require_reason: bool = True,
) -> ToolDecision:
    """
    Decide whether a proposed tool call is allowed.

    Checks:
      - The tool is in the active brain's allowed tool set (if provided).
      - A reason is provided when required.
      - The per-phase tool-call budget is not exhausted.
      - The exact same call was not already made this phase.
      - Destructive calls are flagged with elevated risk.
    """
    from .scdna import emit_health_signal

    def _tool_signal(tier: str, detail: str) -> str:
        return emit_health_signal(
            severity="yellow" if tier.startswith("Y") else "red",
            component="TOOL_GOVERNOR",
            stable_id=tool,
            tier=tier,
            detail=detail[:200],
        )

    if allowed_tools is not None and tool not in allowed_tools:
        decision = ToolDecision(
            allowed=False,
            reason=f"Tool '{tool}' is not in the active brain's allowed tool set",
            suggestedAlternative="Use a tool listed in the brain's allowedTools",
            riskLevel="blocked",
            tieredSignals=[_tool_signal("R2", f"Tool {tool} not in allowed set")],
        )
        _emit_tool_deflection("TOOL_NOT_ALLOWED", "R2", tool, args, decision)
        return decision

    if require_reason and not reason.strip():
        decision = ToolDecision(
            allowed=False,
            reason="Tool call blocked because no reason was provided",
            suggestedAlternative="Provide a reason explaining what unknown this resolves",
            riskLevel="blocked",
            tieredSignals=[_tool_signal("R2", "Tool call missing reason")],
        )
        _emit_tool_deflection("TOOL_MISSING_REASON", "R2", tool, args, decision)
        return decision

    budget = max_calls_per_phase if max_calls_per_phase is not None else field.tools.maxCallsPerPhase
    if field.tools.callsThisPhase >= budget:
        decision = ToolDecision(
            allowed=False,
            reason="Tool call blocked because the current phase budget is exhausted",
            suggestedAlternative="Escalate to the Council Arbiter or end the phase",
            riskLevel="blocked",
            tieredSignals=[_tool_signal("Y3", "Tool-call budget exhausted")],
        )
        _emit_tool_deflection("TOOL_BUDGET_EXHAUSTED", "Y3", tool, args, decision)
        return decision

    key = normalize_tool_call(tool, args)
    for past in field.tools.lastCalls:
        if past.get("_key") == key:
            decision = ToolDecision(
                allowed=False,
                reason="Tool call blocked because this exact call was already made",
                suggestedAlternative="Use the prior result or refine the arguments",
                riskLevel="blocked",
                tieredSignals=[_tool_signal("Y2", "Repeated identical tool call")],
            )
            _emit_tool_deflection("REPEATED_TOOL_CALL", "Y2", tool, args, decision)
            return decision

    risk_level = "high" if tool in _DESTRUCTIVE_TOOLS else "low"
    if tool in _READ_ONLY_TOOLS:
        risk_level = "low"

    tiered_signals: list[str] = []
    if risk_level == "high":
        tiered_signals.append(
            _tool_signal("Y3", f"Destructive tool {tool} allowed with elevated risk")
        )

    return ToolDecision(
        allowed=True,
        reason=f"Tool '{tool}' allowed within budget and permission set",
        riskLevel=risk_level,
        tieredSignals=tiered_signals,
    )


def record_tool_call(
    field: VaelrixCortexForceField,
    tool: str,
    args: dict,
    reason: str,
) -> VaelrixCortexForceField:
    """Record an allowed tool call in the ForceField."""
    new_field = deepcopy(field)
    new_field.tools.callsThisPhase += 1
    new_field.tools.lastCalls.append(
        {
            "tool": tool,
            "args": args,
            "reason": reason,
            "_key": normalize_tool_call(tool, args),
        }
    )
    return new_field


def filter_allowed_tool_calls(
    field: VaelrixCortexForceField,
    requests: list[ToolCallRequest],
    allowed_tools: set[str] | None = None,
) -> tuple[list[ToolCallRequest], list[ToolDecision]]:
    """
    Given a list of tool-call requests, return only those that pass the Tool
    Governor, plus a parallel list of decisions for diagnostics.
    """
    allowed: list[ToolCallRequest] = []
    decisions: list[ToolDecision] = []

    for request in requests:
        decision = should_allow_tool_call(
            field,
            request.tool,
            request.args,
            request.reason,
            allowed_tools=allowed_tools,
        )
        decisions.append(decision)
        if decision.allowed:
            allowed.append(request)
            field = record_tool_call(field, request.tool, request.args, request.reason)

    return allowed, decisions
