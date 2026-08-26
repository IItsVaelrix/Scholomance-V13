"""What the target looked like when an answer was computed.

A recall is only sound if this key is unchanged AND it is computed from
everything the result actually depends on. Four kinds, from strongest to
weakest, and each is used only where it is actually sound:

  file        -> sha256 of the bytes. Airtight. mtime is NOT used: two writes
                 inside one filesystem timestamp tick are indistinguishable by
                 mtime, and a stale hit is worse than a miss.
  subtree     -> HEAD sha (read from .git directly, no subprocess) + the
                 dirty set under that path (one `git status` call). REJECTS
                 recall outright — not "conservative", refuses entirely — the
                 moment a symlink or an ignored path is found under the
                 subtree, because git-status cannot see content changes to
                 either and a stable key would then be lying.
  repo-clean  -> HEAD sha, valid ONLY when the ENTIRE working tree is clean.
                 This is the only sound key for a result that depends on
                 files outside its own target path — see WHY REFS NEEDS ITS
                 OWN KIND below. Narrower hit rate, by construction.
  none        -> not recallable at all.

WHY REFS NEEDS ITS OWN KIND. microscope(refs=true) cross-references a symbol
across the WHOLE REPO — its answer depends on every file that might reference
the target, not just the target file. A subtree key over the target file
alone is unsound: a call site added or removed in some other file changes
the true answer while leaving the key unchanged. The only key that actually
covers "everything this result depends on" is repo-clean. This costs hit
rate — repo-clean only matches immediately after a fresh commit with nothing
outstanding — but a narrow correct cache beats a wide wrong one.

WHY evaluate AND microscope(eval=true) ARE NEVER RECALLABLE. Both RUN code —
code_eval's own docstring says it is not deterministic and executes top-level
side effects. A stored return value is a record of what happened once, never
a prediction of what happens next. microscope's `eval` parameter is a second
entry point into the exact same execution path as the `evaluate` tool, so it
must be excluded by the same rule, not just by tool name.
"""

import hashlib
import os
import subprocess

KIND_FILE = "file-sha256"
KIND_SUBTREE = "git-subtree"
KIND_REPO_CLEAN = "repo-clean-head"
KIND_NONE = "none"


def is_recallable(tool_name, args):
    """False for anything that RUNS code rather than reading it.

    Checked on tool_name AND on args, because microscope's eval=true is a
    second door into the same non-deterministic execution evaluate guards
    against — excluding the tool name alone leaves that door open.
    """
    if tool_name == "evaluate":
        return False
    if tool_name == "microscope" and (args or {}).get("eval"):
        return False
    return True


def _sha256_file(abs_path):
    h = hashlib.sha256()
    try:
        with open(abs_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
    except OSError:
        return None
    return h.hexdigest()


def _resolve_git_dirs(project_root):
    """Return (worktree_git_dir, common_git_dir).

    A plain repo: <root>/.git is a directory; both are that directory.

    A linked worktree (created via `git worktree add`, which is how this
    repo commonly develops features): <root>/.git is a FILE containing
    `gitdir: <worktree_git_dir>`. HEAD inside worktree_git_dir is the
    worktree's OWN current ref pointer (per-worktree, read from here).
    refs/heads/* (loose refs) and packed-refs live in the COMMON git dir,
    found via a `commondir` file inside worktree_git_dir (usually a
    relative path, e.g. "../.."); if commondir is absent, the worktree git
    dir IS the common dir.

    On any OSError or unrecognized shape, return (None, None) — fail closed,
    same philosophy as _read_head_sha's own docstring below.
    """
    try:
        dot_git = os.path.join(project_root, ".git")
        if os.path.isdir(dot_git):
            return dot_git, dot_git
        if not os.path.isfile(dot_git):
            return None, None
        with open(dot_git, "r", encoding="utf-8") as fh:
            first_line = fh.readline().strip()
        if not first_line.startswith("gitdir:"):
            return None, None
        raw = first_line.split(":", 1)[1].strip()
        worktree_git_dir = raw if os.path.isabs(raw) else os.path.normpath(os.path.join(project_root, raw))
        commondir_path = os.path.join(worktree_git_dir, "commondir")
        if os.path.isfile(commondir_path):
            with open(commondir_path, "r", encoding="utf-8") as fh:
                raw_common = fh.read().strip()
            common_git_dir = (
                raw_common if os.path.isabs(raw_common)
                else os.path.normpath(os.path.join(worktree_git_dir, raw_common))
            )
        else:
            common_git_dir = worktree_git_dir
        return worktree_git_dir, common_git_dir
    except OSError:
        return None, None


def _read_head_sha(project_root):
    """Current HEAD sha via direct .git file reads — no subprocess.

    Handles the common ref case (refs/heads/<branch>, packed or loose), a
    detached HEAD (a bare sha in HEAD), and a linked git worktree (where
    .git is a file, not a directory — see _resolve_git_dirs). HEAD itself is
    read from the worktree-specific git dir (it is per-worktree); a `ref:`
    pointer is resolved against the COMMON git dir, where refs/heads/* and
    packed-refs actually live (this is also the conceptually correct
    resolution for a plain repo, where the two dirs happen to coincide).
    Any shape this doesn't recognize (submodule quirks, etc.) returns None,
    and the caller MUST treat that as 'do not recall' rather than guessing.
    """
    try:
        worktree_git_dir, common_git_dir = _resolve_git_dirs(project_root)
        if worktree_git_dir is None or common_git_dir is None:
            return None
        head_path = os.path.join(worktree_git_dir, "HEAD")
        with open(head_path, "r", encoding="utf-8") as fh:
            head = fh.read().strip()
        if not head.startswith("ref:"):
            return head or None  # detached HEAD: a bare sha
        ref = head.split(":", 1)[1].strip()
        loose = os.path.join(common_git_dir, ref)
        if os.path.isfile(loose):
            with open(loose, "r", encoding="utf-8") as fh:
                return fh.read().strip() or None
        packed = os.path.join(common_git_dir, "packed-refs")
        if os.path.isfile(packed):
            with open(packed, "r", encoding="utf-8") as fh:
                for line in fh:
                    if line.strip().endswith(" " + ref):
                        return line.split()[0]
        return None
    except OSError:
        return None


def _subtree_dirty_and_ignored(project_root, rel_path):
    """One git call for both signals: tracked dirt AND ignored-file presence.

    --ignored=matching is the fix for the ignored-mutation gap: git status
    without it is silent about ignored paths, so a content change inside a
    gitignored file leaves the dirty-lines output byte-identical before and
    after — empirically confirmed (git status --porcelain gave identical
    empty output before and after editing a gitignored file's content). With
    --ignored=matching an ignored path at least APPEARS in the output, which
    is enough to refuse recall on sight without needing to trust its content.
    Returns (dirty_lines, saw_ignored) or (None, None) on any failure.
    """
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain", "--ignored=matching", "--", rel_path],
            cwd=project_root, capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return None, None
    except (OSError, subprocess.SubprocessError):
        return None, None
    lines = [ln for ln in result.stdout.splitlines() if ln.strip()]
    saw_ignored = any(ln.startswith("!!") for ln in lines)
    dirty = sorted(ln.strip() for ln in lines if not ln.startswith("!!"))
    return dirty, saw_ignored


def _has_symlink(abs_path):
    for root, dirs, files in os.walk(abs_path):
        for name in dirs + files:
            if os.path.islink(os.path.join(root, name)):
                return True
    return False


def _git_subtree_key(project_root, abs_path, rel_path):
    head = _read_head_sha(project_root)
    if head is None:
        return None
    if _has_symlink(abs_path):
        return None  # a symlink's target can change without git noticing
    dirty, saw_ignored = _subtree_dirty_and_ignored(project_root, rel_path)
    if dirty is None or saw_ignored:
        return None  # git failed, OR an ignored path lives under this subtree
    payload = head + "\n" + "\n".join(dirty)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _repo_clean_key(project_root):
    head = _read_head_sha(project_root)
    if head is None:
        return None
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"], cwd=project_root,
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0 or result.stdout.strip():
            return None  # anything outstanding anywhere voids repo-clean
    except (OSError, subprocess.SubprocessError):
        return None
    return head


def staleness_for(tool_name, args, project_root, rel_path):
    """Return (kind, key). key is None when no sound key can be computed,
    which callers MUST treat as 'do not recall'."""
    if not is_recallable(tool_name, args) or not rel_path:
        return KIND_NONE, None

    # refs cross-references the whole repo — see the module docstring.
    if tool_name == "microscope" and (args or {}).get("refs"):
        return KIND_REPO_CLEAN, _repo_clean_key(project_root)

    abs_path = os.path.normpath(os.path.join(project_root, rel_path))
    if not abs_path.startswith(project_root):
        return KIND_NONE, None
    if os.path.islink(abs_path):
        return KIND_NONE, None

    if os.path.isfile(abs_path):
        return KIND_FILE, _sha256_file(abs_path)
    if os.path.isdir(abs_path):
        return KIND_SUBTREE, _git_subtree_key(project_root, abs_path, rel_path)
    return KIND_NONE, None
