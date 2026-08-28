"""Host-authoritative patch proposal and receipt path for phone coding work."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
import subprocess
import threading
import time
from typing import Any, Callable
import uuid
from datetime import datetime, timezone
import copy

from tui.remote.action_journal import ActionJournal, ActionStateError
from tui.remote.coding_policy import Availability, CapabilityClass, build_manifest

logger = logging.getLogger(__name__)


class MobileCodingError(ValueError):
    """A phone-request failure that has caused no unreported host effect."""


# Condensed from docs/scholomance-encyclopedia/Scholomance LAW/
# DIVTUBE_MOBILE_CODING_AGENT.md — embedded directly rather than left for the
# agent to read_file() on its own turn budget (the whole point is turn
# economy). Root cause this exists to fix: a 50-turn task that never
# finished, spending nearly all its turns calling microscope with symbol=
# one name at a time against a single ~3,700-line file, having never called
# that file's own plain microscope/telescope first to get its shape in one
# call. Full law (patch-protocol edge cases, jurisdiction rationale) lives
# in that file if a future revision needs to reference it from here.
_MOBILE_SYSTEM_HINT = (
    "You are the paired-phone coding agent. You are not a shell and cannot run code — "
    "run_command/bash_session/python_exec/evaluate are not in your catalog and never will be. "
    "You are not the desktop agent either: it may be working in this same codebase concurrently.\n\n"
    "LENS ORDER — use these tools in this order, not interchangeably:\n"
    "1. telescope on the relevant directory/file FIRST — structural map, one call.\n"
    "2. microscope with NO symbol= on a specific file — its full symbol index, one call.\n"
    "3. microscope WITH symbol= — only for the specific symbols step 2 told you matter. "
    "This is the expensive one-name-at-a-time call; don't reach for it before 1-2.\n"
    "4. atlas — only after telescope, when you need a symbol's true home or subtree freshness.\n\n"
    "SCOPE DISCIPLINE — stay in the task's own files plus their real dependencies (an import, "
    "a caller, something atlas actually named) — not sibling subsystems that merely sound related, "
    "not .venv/node_modules/build output, not law_get/raid_query/substrate_query/diagnostic_* "
    "unless the task is specifically about those. If you've opened more than 6 distinct files and "
    "still can't converge, stop expanding scope: summarize what's missing or answer with what you have.\n\n"
    "TURN ECONOMY — every tool call is a full round-trip with a real cost; both a turn cap and a "
    "token budget will end this task if crossed. Once you can state your proposed change in one "
    "sentence, stop exploring and propose it. 'I don't have enough to safely propose a change' is "
    "a complete, honest outcome — cheaper than more guessing.\n\n"
    "PATCH PROTOCOL — to request one carefully reviewed edit, call mobile_propose_patch with a "
    "logical relative path and exactly one SEARCH\\n---\\nREPLACE patch (search must match exactly "
    "one location). Never claim a patch was applied: await the host receipt."
)


class MobileCodingAdapter:
    """Narrow mobile effect adapter; never exposes generic Cockpit dispatch."""

    def __init__(
        self,
        workspace_root: str | Path,
        journal: ActionJournal,
        event_hub,
        *,
        now: Callable[[], float] = time.time,
        verification_executor: Callable[[str, Path], tuple[bool, str]] | None = None,
        prompt_service=None,
    ) -> None:
        self._root = Path(workspace_root).resolve()
        self._journal = journal
        self._event_hub = event_hub
        self._now = now
        self._verification_executor = verification_executor or _run_verification_preset
        self._prompt_service = prompt_service
        self._lock = threading.RLock()
        self._tasks: dict[str, dict[str, str]] = {}

    @property
    def tasks(self) -> dict[str, dict[str, str]]:
        """Read-only snapshot for host tests and task-bound orchestration."""
        return {task_id: dict(task) for task_id, task in self._tasks.items()}

    def dispatch(self, device_id: str, envelope) -> None:
        """Route only typed V2 operations; no desktop dispatcher escapes here."""
        message_type, payload, request_id = envelope.message_type, envelope.payload, envelope.request_id
        if message_type == "task.create":
            task_id = "task-" + uuid.uuid4().hex
            title = payload["text"].splitlines()[0].strip()[:120]
            self._tasks[task_id] = {"taskId": task_id, "title": title, "state": "planning", "summary": "Host queued a bounded coding task."}
            self._sync_snapshot()
            self._event_hub.publish("task.activity", {"taskId": task_id, "state": "planning"}, request_id)
            if self._prompt_service is not None:
                self._start_agent_task(device_id, task_id, payload["text"], request_id)
        elif message_type == "task.snapshot.request":
            self._sync_snapshot()
        elif message_type == "task.cancel":
            task = self._tasks.get(payload["taskId"])
            if task is None:
                raise MobileCodingError("unknown task")
            task["state"] = "cancelled"; task["summary"] = "Cancelled from paired phone."
            self._sync_snapshot()
            self._event_hub.publish("task.activity", {"taskId": task["taskId"], "state": "cancelled"}, request_id)
        elif message_type == "action.approve":
            self.approve_patch(device_id, payload["taskId"], payload["actionId"], payload["proposalDigest"])
        elif message_type == "verification.start.request":
            task = self._tasks.get(payload["taskId"])
            if task is None:
                raise MobileCodingError("unknown task")
            preset = payload["preset"]
            self._event_hub.publish("verification.progress", {
                "taskId": task["taskId"], "preset": preset, "state": "running", "summary": "Host started the named verification preset.",
            }, request_id)
            passed, summary = self._verification_executor(preset, self._root)
            self._event_hub.publish("verification.receipt", {
                "taskId": task["taskId"], "preset": preset, "state": "passed" if passed else "failed", "summary": _safe_summary(summary),
            }, request_id)
        elif message_type == "device.revoke":
            self._event_hub.publish("device.notice", {"state": "revocation_requested"}, request_id)
        else:
            raise MobileCodingError("mobile operation is not available")

    def _start_agent_task(self, device_id: str, task_id: str, text: str, request_id: str) -> None:
        """Run a host agent with a fixed, mobile-safe catalog for this task."""
        task_tools = self._task_tools(text)
        self._set_task(task_id, state="exploring", summary="Host agent is inspecting the codebase.")
        self._event_hub.publish("task.activity", {"taskId": task_id, "state": "exploring"}, request_id)

        def callback(value: Any) -> None:
            message = _sanitize_phone_text(value)
            if message:
                self._event_hub.publish("task.message", {"taskId": task_id, "text": message}, request_id)

        agent_id = f"mobile:{device_id}:{task_id}"

        def execute(name: str, arguments: dict[str, Any], _callback) -> Any:
            if name == "mobile_propose_patch":
                return self.propose_patch(device_id, task_id, arguments)
            return self._execute_observe(name, arguments, agent_id=agent_id)

        def finished(ok: bool, detail: str) -> None:
            state = "completed" if ok else "failed"
            summary = "Host agent completed the bounded task." if ok else _safe_summary(detail)
            self._set_task(task_id, state=state, summary=summary)
            self._event_hub.publish("task.completed", {"taskId": task_id, "summary": summary}, request_id)

        self._prompt_service.prompt(
            text,
            callback,
            system_hint=_MOBILE_SYSTEM_HINT,
            agent_id=agent_id,
            tools=task_tools,
            tool_executor=execute,
            on_finished=finished,
        )

    # Always-available lens/navigation tools regardless of task — mirrors
    # PromptService.CORE_TOOL_NAMES's reasoning, restricted to what
    # capability_policy actually classifies OBSERVE for mobile.
    _CORE_OBSERVE_NAMES = frozenset({
        "read_file", "telescope", "microscope", "atlas", "list_directory", "find_file", "search_code",
    })
    _RECOMMEND_TOP_K = 10

    def _task_tools(self, task_text: str) -> list[dict[str, Any]]:
        """Core lens/nav tools plus the recommender's top picks for this
        task's text, out of the OBSERVE-classified catalog only — plus one
        proposal-only patch schema, always.

        Was a frozen 36-tool catalog on every task regardless of relevance,
        bypassing the same AdaptiveToolRecommender PromptService already
        uses for the desktop path — see DIVTUBE_MOBILE_CODING_AGENT.md's
        "Lens Methodology" section for the failure mode this caused.
        Capability_policy's OBSERVE/AVAILABLE classification stays
        authoritative: the recommender only ranks WITHIN that safe set, it
        never adds a tool policy excluded.
        """
        catalog = self._prompt_service.tools.tools
        manifest = build_manifest(catalog)
        observe_tools = {
            tool["function"]["name"]: tool
            for tool in catalog
            if manifest[tool["function"]["name"]].capability_class is CapabilityClass.OBSERVE
            and manifest[tool["function"]["name"]].availability is Availability.AVAILABLE
        }

        wanted = set(self._CORE_OBSERVE_NAMES)
        try:
            recommender = self._prompt_service._get_adaptive_recommender()
            ranked = recommender.recommend(task_text, top_k=self._RECOMMEND_TOP_K)
            wanted |= {r["tool"] for r in ranked}
        except Exception:
            logger.warning(
                "mobile tool recommendation failed, falling back to core-only tools", exc_info=True
            )

        safe = [
            _strip_mobile_unsafe_parameters(tool)
            for name, tool in observe_tools.items()
            if name in wanted
        ]
        safe.append(_mobile_patch_schema())
        return safe

    def _execute_observe(self, name: str, arguments: dict[str, Any], agent_id: str) -> Any:
        manifest = build_manifest(self._prompt_service.tools.tools)
        entry = manifest.get(name)
        if entry is None or entry.capability_class is not CapabilityClass.OBSERVE or entry.availability is not Availability.AVAILABLE:
            raise MobileCodingError("mobile capability unavailable")
        # This is the real Cockpit ToolService route: GateKeeper and the
        # desktop handler stay authoritative. The phone cannot name a tool;
        # only the frozen task catalog can invoke this function.
        # agent_id scopes GateKeeper state to this task, not the desktop's
        # shared bucket — without it, a desktop tool call moments earlier
        # can spuriously COOLDOWN-block this unrelated phone task (live-
        # reproduced root cause of a task starting and then stalling).
        return self._prompt_service.tools.execute_tool(name, arguments, lambda _value: None, agent_id=agent_id)

    def _set_task(self, task_id: str, *, state: str, summary: str) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            task["state"] = state
            task["summary"] = summary
            self._sync_snapshot()

    def propose_patch(self, device_id: str, task_id: str, request: dict[str, Any]) -> dict[str, Any]:
        """Build a reviewable patch proposal without touching the target file."""
        path, before, search, replacement = self._patch_request(request)
        action_id = "action-" + uuid.uuid4().hex
        target_digests = {path: _sha256(before)}
        proposal_digest = _canonical_digest({
            "capability": "apply_patch", "taskId": task_id, "path": path,
            "search": search, "replacement": replacement, "targetDigests": target_digests,
        })
        record = self._journal.propose({
            "deviceId": device_id, "taskId": task_id, "actionId": action_id,
            "capability": "apply_patch", "proposalDigest": proposal_digest,
            "targetDigests": target_digests, "expiresAt": self._now() + 300,
            "summary": f"Apply reviewed patch to {path}",
            "operation": {"kind": "search_replace", "path": path, "search": search, "replacement": replacement},
            "state": "pending_approval",
        })
        self._event_hub.publish("action.proposed", {
            "taskId": task_id, "actionId": action_id, "capability": "apply_patch", "proposalDigest": proposal_digest,
            "state": "pending_approval", "summary": record["summary"], "expiresAt": _expires_at(record["expiresAt"]),
            "risk": "review_required", "targets": [path],
        })
        return {**record, "review": {"path": path, "before": before, "after": before.replace(search, replacement, 1)}}

    def approve_patch(self, device_id: str, task_id: str, action_id: str, proposal_digest: str) -> dict[str, Any]:
        """Approve once, revalidate the reviewed pre-image, and apply locally."""
        with self._lock:
            try:
                approved = self._journal.approve(device_id, task_id, action_id, proposal_digest, now=self._now())
            except ActionStateError as exc:
                raise MobileCodingError(str(exc)) from exc
            current = {path: _sha256(self._safe_file(path).read_text(encoding="utf-8")) for path in approved["targetDigests"]}
            try:
                checked = self._journal.invalidate_if_stale(action_id, current)
            except ActionStateError as exc:
                raise MobileCodingError(str(exc)) from exc
            if checked["state"] == "invalidated":
                self._event_hub.publish("action.invalidated", {
                    "taskId": task_id, "actionId": action_id, "proposalDigest": proposal_digest,
                    "state": "invalidated", "summary": "Reviewed file changed on the host.",
                })
                raise MobileCodingError("proposal is stale and was invalidated")
            try:
                self._journal.start(action_id)
                path, before, search, replacement = self._proposal_patch(approved)
                if before.count(search) != 1:
                    raise MobileCodingError("reviewed patch target is no longer unique")
                after = before.replace(search, replacement, 1)
                target = self._safe_file(path)
                target.write_text(after, encoding="utf-8")
                post = target.read_text(encoding="utf-8")
                if post != after:
                    raise MobileCodingError("host post-image verification failed")
                terminal = self._journal.record_receipt(action_id, "applied")
            except (ActionStateError, OSError, UnicodeError) as exc:
                try:
                    self._journal.record_receipt(action_id, "failed")
                except ActionStateError:
                    pass
                raise MobileCodingError(str(exc)) from exc
            receipt = {
                "taskId": task_id, "actionId": action_id, "proposalDigest": proposal_digest,
                "state": terminal["state"], "changedFiles": [path],
                "postImageDigests": {path: _sha256(post)}, "summary": "Patch applied and post-image verified.",
            }
            self._event_hub.publish("action.receipt", {
                "taskId": task_id, "actionId": action_id, "proposalDigest": proposal_digest,
                "state": "applied", "postDigest": _wire_digest(_sha256(post)), "summary": receipt["summary"],
            })
            return receipt

    def _sync_snapshot(self) -> None:
        self._event_hub.set_snapshot({"tasks": list(self._tasks.values())})

    def _patch_request(self, request: dict[str, Any]) -> tuple[str, str, str, str]:
        if not isinstance(request, dict) or set(request) != {"path", "patch"}:
            raise MobileCodingError("patch request contains missing or extra keys")
        path = request["path"]
        if not isinstance(path, str):
            raise MobileCodingError("invalid patch path")
        target = self._safe_file(path)
        if not isinstance(request["patch"], str) or request["patch"].count("\n---\n") != 1:
            raise MobileCodingError("patch must contain one SEARCH newline-dash separator")
        search, replacement = request["patch"].split("\n---\n", 1)
        if not search:
            raise MobileCodingError("patch search must not be empty")
        before = target.read_text(encoding="utf-8")
        if before.count(search) != 1:
            raise MobileCodingError("patch search must match exactly one host location")
        return path, before, search, replacement

    def _proposal_patch(self, proposal: dict[str, Any]) -> tuple[str, str, str, str]:
        operation = proposal["operation"]
        path, search, replacement = operation["path"], operation["search"], operation["replacement"]
        target = self._safe_file(path)
        before = target.read_text(encoding="utf-8")
        return path, before, search, replacement

    def _safe_file(self, logical_path: str) -> Path:
        if not logical_path or logical_path.startswith("/") or "\\" in logical_path or ".." in logical_path.split("/"):
            raise MobileCodingError("invalid logical path")
        target = (self._root / logical_path).resolve()
        if not target.is_relative_to(self._root) or not target.is_file():
            raise MobileCodingError("target is not a file inside the workspace")
        return target


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _canonical_digest(value: dict[str, Any]) -> str:
    return _sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True))


def _wire_digest(value: str) -> str:
    return "sha256:" + value


def _expires_at(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _run_verification_preset(preset: str, root: Path) -> tuple[bool, str]:
    """Run a fixed local test suite; no phone text can affect this command."""
    if preset != "test_run":
        raise MobileCodingError("verification preset is unavailable")
    try:
        result = subprocess.run(
            ["uv", "run", "--with-requirements", "requirements-remote.txt", "pytest", "tests/test_mobile_*.py", "tests/test_remote_*.py", "-q"],
            cwd=root, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"Named verification could not complete: {exc.__class__.__name__}."
    return result.returncode == 0, f"Named verification {'passed' if result.returncode == 0 else 'failed'} (exit {result.returncode})."


def _safe_summary(value: str) -> str:
    if not isinstance(value, str):
        return "Verification returned an invalid summary."
    return " ".join(value.replace("\x00", "").split())[:1024] or "Verification completed."


def _strip_mobile_unsafe_parameters(tool: dict[str, Any]) -> dict[str, Any]:
    """Keep read tools read-only even when their desktop schema has an eval seam."""
    copy_tool = copy.deepcopy(tool)
    parameters = copy_tool["function"].get("parameters") or {}
    properties = parameters.get("properties") or {}
    forbidden = {"args", "command", "eval", "code", "script", "shell"}
    parameters["properties"] = {key: value for key, value in properties.items() if key not in forbidden}
    if "required" in parameters:
        parameters["required"] = [key for key in parameters["required"] if key not in forbidden]
    copy_tool["function"]["parameters"] = parameters
    return copy_tool


def _mobile_patch_schema() -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": "mobile_propose_patch",
            "description": "Propose one reviewable SEARCH/REPLACE patch. This never writes the file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Logical workspace-relative file path."},
                    "patch": {"type": "string", "description": "SEARCH\\n---\\nREPLACE; search must match exactly once."},
                },
                "required": ["path", "patch"],
            },
        },
    }


def _sanitize_phone_text(value: Any) -> str:
    raw = str(value)
    # Keep protocol/UI events textual and remove absolute host paths.
    import re
    raw = re.sub(r"(?<![\w.-])/(?:[^\s/]+/)+[^\s]+", "[local path]", raw)
    raw = re.sub(r"\b[A-Za-z]:\\(?:[^\s\\]+\\)+[^\s]+", "[local path]", raw)
    raw = "".join(char for char in raw if char in "\n\t" or ord(char) >= 0x20)
    return raw[:8000]
