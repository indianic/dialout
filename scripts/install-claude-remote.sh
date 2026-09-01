#!/usr/bin/env bash
#
# install-claude-remote.sh
#
# Installs a `claude()` shell wrapper that auto-enables Claude Code Remote
# Control for interactive sessions, naming each session <current-dir>-<date>-<time>
# (e.g. devdash-20260611-075606). This lets the session be driven from the
# Claude mobile/web app.
#
# The wrapper passes through untouched for:
#   - subcommands (mcp, update, plugin, ...)
#   - print mode (-p / --print)
#   - help/version flags (-h/--help, -v/--version)
#   - an explicit --remote-control flag you already supplied
#
# Usage:
#   ./install-claude-remote.sh            # install into your login shell's rc
#   ./install-claude-remote.sh --zsh      # force ~/.zshrc
#   ./install-claude-remote.sh --bash     # force ~/.bashrc
#   ./install-claude-remote.sh --uninstall
#
# Safe to re-run: an existing wrapper block is replaced, not duplicated.

set -euo pipefail

BEGIN_MARKER="# >>> claude remote-control wrapper >>>"
END_MARKER="# <<< claude remote-control wrapper <<<"

target=""
mode="install"

# ---- parse args ------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --zsh)        target="$HOME/.zshrc" ; SHELL_KIND="zsh" ;;
    --bash)       target="$HOME/.bashrc"; SHELL_KIND="bash" ;;
    --uninstall)  mode="uninstall" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown option: $arg (use --help)" >&2
      exit 1 ;;
  esac
done

# ---- detect shell / rc file if not forced ----------------------------------
if [ -z "$target" ]; then
  case "${SHELL:-}" in
    *zsh)  target="$HOME/.zshrc" ; SHELL_KIND="zsh" ;;
    *bash) target="$HOME/.bashrc"; SHELL_KIND="bash" ;;
    *)
      # Fallback: prefer zsh rc if it exists, else bash.
      if [ -f "$HOME/.zshrc" ]; then
        target="$HOME/.zshrc"; SHELL_KIND="zsh"
      else
        target="$HOME/.bashrc"; SHELL_KIND="bash"
      fi ;;
  esac
fi

# ---- build the wrapper block for the detected shell ------------------------
build_block() {
  echo "$BEGIN_MARKER"
  echo "# Auto-start Claude Code with Remote Control so sessions can be driven"
  echo "# from the Claude mobile/web app. Session name = <dir>-<date>-<time>."
  echo "# Managed by devdash scripts/install-claude-remote.sh — edits may be overwritten."
  if [ "$SHELL_KIND" = "zsh" ]; then
    cat <<'ZSH_BLOCK'
claude() {
  emulate -L zsh
  case "$1" in
    agents|auth|auto-mode|doctor|install|mcp|plugin|plugins|project|setup-token|ultrareview|update|upgrade)
      command claude "$@"; return ;;
  esac
  local arg
  for arg in "$@"; do
    case "$arg" in
      -p|--print|-v|--version|-h|--help|--remote-control|--remote-control=*)
        command claude "$@"; return ;;
    esac
  done
  command claude --remote-control "${PWD:t}-$(date +%Y%m%d-%H%M%S)" "$@"
}
ZSH_BLOCK
  else
    cat <<'BASH_BLOCK'
claude() {
  case "$1" in
    agents|auth|auto-mode|doctor|install|mcp|plugin|plugins|project|setup-token|ultrareview|update|upgrade)
      command claude "$@"; return ;;
  esac
  local arg
  for arg in "$@"; do
    case "$arg" in
      -p|--print|-v|--version|-h|--help|--remote-control|--remote-control=*)
        command claude "$@"; return ;;
    esac
  done
  command claude --remote-control "$(basename "$PWD")-$(date +%Y%m%d-%H%M%S)" "$@"
}
BASH_BLOCK
  fi
  echo "$END_MARKER"
}

# ---- strip any existing managed block --------------------------------------
strip_existing() {
  [ -f "$target" ] || return 0
  if grep -qF "$BEGIN_MARKER" "$target"; then
    # Delete everything between (and including) the markers.
    sed -i.bak "/$(printf '%s' "$BEGIN_MARKER" | sed 's/[][\/.^$*]/\\&/g')/,/$(printf '%s' "$END_MARKER" | sed 's/[][\/.^$*]/\\&/g')/d" "$target"
    # Collapse a trailing blank line left behind, if any.
  fi
}

# ---- run -------------------------------------------------------------------
touch "$target"

if [ "$mode" = "uninstall" ]; then
  strip_existing
  echo "✅ Removed claude remote-control wrapper from $target (backup: $target.bak)"
  echo "   Restart your shell or run: unset -f claude 2>/dev/null; source $target"
  exit 0
fi

strip_existing
{
  printf '\n'
  build_block
} >> "$target"

echo "✅ Installed claude remote-control wrapper ($SHELL_KIND) into $target"
[ -f "$target.bak" ] && echo "   Previous version backed up to $target.bak"
echo "   Activate now with:  source $target"
echo "   Verify with:        type claude"
