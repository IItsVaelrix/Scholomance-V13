#!/usr/bin/env bash
# SCDNA proactive gene injection — multi-agent hook.
# Supports Claude Code (stdin JSON hook) and CLI for Grok, Codex, Gemini, OpenCode.
#
# CLI usage:
#   ./scripts/scdna-gene-inject.sh --prompt "your task" --agent grok|codex|gemini|opencode|claude
#
# For Claude Code: pipe the UserPromptSubmit JSON.
# Reads from stdin or args; emits context or JSON. Exits 0.

cd "$(dirname "$0")/../steamdeck_brain" 2>/dev/null || exit 0

if [[ "$1" == "--prompt" ]]; then
  PROMPT="$2"
  AGENT="${4:-grok}"
  PYTHONPATH=. python3 -m vaelrix_forcefield.scdna.inject --prompt "$PROMPT" --agent "$AGENT"
else
  # Assume hook mode for Claude etc.
  exec python3 -m vaelrix_forcefield.scdna.inject
fi
