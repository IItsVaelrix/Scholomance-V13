#!/bin/sh
# Install the Code Atlas post-commit refresh.
#
# .git/hooks is not version-controlled and this repo already ships a
# hand-written pre-commit plus a git-lfs post-commit, so this installer
# CHAINS rather than overwrites: the atlas call is inserted immediately
# after the shebang, ahead of any `exit` an existing hook may take.
# Idempotent — re-running is a no-op.
#
#   sh scripts/git-hooks/install.sh

set -e

ROOT=$(git rev-parse --show-toplevel)
HOOK_DIR=$(git rev-parse --git-path hooks)
HOOK="$HOOK_DIR/post-commit"
MARKER="scholomance-code-atlas"
CALL='[ -x "$(git rev-parse --show-toplevel)/scripts/git-hooks/post-commit-atlas" ] && "$(git rev-parse --show-toplevel)/scripts/git-hooks/post-commit-atlas" || true'

chmod +x "$ROOT/scripts/git-hooks/post-commit-atlas"

if [ -f "$HOOK" ] && grep -q "$MARKER" "$HOOK"; then
    echo "post-commit: atlas refresh already installed"
    exit 0
fi

mkdir -p "$HOOK_DIR"

if [ ! -f "$HOOK" ]; then
    printf '#!/bin/sh\n# %s\n%s\n' "$MARKER" "$CALL" > "$HOOK"
else
    # Insert after the shebang so we run even if the existing body exits
    # early (the git-lfs hook does exactly that when git-lfs is missing).
    awk -v marker="# $MARKER" -v call="$CALL" '
        NR == 1 { print; if ($0 ~ /^#!/) { print marker; print call; done = 1 } next }
        !done && NR == 2 { print marker; print call; done = 1 }
        { print }
    ' "$HOOK" > "$HOOK.atlas-tmp"
    cat "$HOOK.atlas-tmp" > "$HOOK"
    rm -f "$HOOK.atlas-tmp"
fi

chmod +x "$HOOK"
echo "post-commit: atlas refresh installed at $HOOK"
