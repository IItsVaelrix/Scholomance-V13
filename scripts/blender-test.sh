#!/usr/bin/env bash
# blender-test.sh — run a Python test file inside Blender's embedded Python.
#
# Usage: ./scripts/blender-test.sh blender/tests/test_packet.py
#
# Always uses --factory-startup so behaviour never depends on user prefs.
# The addon path is added to sys.path so imports work.

set -euo pipefail

BLENDER="${BLENDER:-$HOME/opt/blender/blender}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ADDON_DIR="$REPO_ROOT/blender/addons"

if [ ! -x "$BLENDER" ]; then
    echo "ERROR: Blender not found at $BLENDER"
    echo "Set BLENDER env var to the correct path."
    exit 1
fi

if [ $# -lt 1 ]; then
    echo "Usage: $0 <test_file.py>"
    exit 1
fi

TEST_FILE="$1"

if [ ! -f "$TEST_FILE" ]; then
    echo "ERROR: test file not found: $TEST_FILE"
    exit 1
fi

echo "Running $TEST_FILE in Blender headless..."
# `set -e` aborts on a non-zero exit before $? can be read, so the FAIL branch
# below was unreachable: this harness could only ever print PASS. Guard the run
# so a failing suite is actually reported as failing.
# Blender returns exit 0 when a --python script raises an uncaught exception,
# so this harness reported PASS for a test file that never ran. sys.exit DOES
# propagate, so the file is executed via runpy inside a try/except that converts
# any exception into sys.exit(1). SystemExit is re-raised untouched, because the
# suites call sys.exit themselves and swallowing it would invert their verdict.
EXIT_CODE=0
"$BLENDER" -b --factory-startup --python-expr "
import sys, runpy, traceback
sys.path.insert(0, '$ADDON_DIR')
try:
    runpy.run_path('$TEST_FILE', run_name='__main__')
except SystemExit:
    raise
except BaseException:
    traceback.print_exc()
    sys.exit(1)
" 2>&1 || EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "PASS: $TEST_FILE"
else
    echo "FAIL: $TEST_FILE (exit $EXIT_CODE)"
fi
exit $EXIT_CODE
