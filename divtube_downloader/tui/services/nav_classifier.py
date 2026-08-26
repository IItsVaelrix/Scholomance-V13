"""Deterministic classification of WHY a navigation tool was called.

Pure by construction: the answer is a function of (tool_name, args,
recently_written) and nothing else — no clock, no database, no filesystem.
That is what makes it testable and what keeps two runs over the same
transcript in agreement.

The families are NOT invented here. They mirror NAV_FAMILIES in
src/core/scd64/glossary.ts, whose hexes are frozen; this module only
picks which authored family applies.
"""

NAV_ORIENT = "NAV_ORIENT"
NAV_LOCATE_DEFINITION = "NAV_LOCATE_DEFINITION"
NAV_VERIFY_USAGE = "NAV_VERIFY_USAGE"
NAV_RUNTIME_PROOF = "NAV_RUNTIME_PROOF"
NAV_EDIT_VERIFY = "NAV_EDIT_VERIFY"


def classify_nav(tool_name, args, recently_written=frozenset()):
    """Return the NAV family for one tool call.

    `recently_written` is the set of repo-relative paths this session has
    written. A look at a path we just edited is a DIFFERENT act from a cold
    look at the same path — it is checking our own work — and collapsing the
    two would erase the distinction the roadmap most wants to see.
    """
    args = args or {}
    path = args.get("path") or args.get("entry") or ""

    # Running code to prove behaviour is its own intent regardless of target.
    # microscope(eval=true) is a second door into the same execution path
    # evaluate uses (episode_staleness.is_recallable treats them identically
    # for caching); classification must agree, or NAV_RUNTIME_PROOF episodes
    # would undercount and a mined LOCATE_DEFINITION cluster would silently
    # include calls that actually ran code.
    if tool_name == "evaluate" or (tool_name == "microscope" and args.get("eval")):
        return NAV_RUNTIME_PROOF

    # Verifying our own edit outranks the shape of the query: the reason for
    # the look is the edit, not the symbol.
    if path and path in recently_written:
        return NAV_EDIT_VERIFY

    if tool_name == "microscope":
        if args.get("refs"):
            return NAV_VERIFY_USAGE
        if args.get("symbol") or args.get("line") is not None:
            return NAV_LOCATE_DEFINITION
        return NAV_ORIENT

    if tool_name == "atlas":
        # refs/prefix are usage questions; rollup/stale are orientation.
        return NAV_VERIFY_USAGE if args.get("action") in ("refs", "prefix") else NAV_ORIENT

    if tool_name == "read_file":
        return NAV_LOCATE_DEFINITION

    # telescope, and anything not otherwise classified.
    return NAV_ORIENT
