#!/usr/bin/env bash
# Manage the DevDash PM2 process.
# Usage: ./scripts/start.sh {start|restart|stop}
#
# Reads PORT (default 50051) and APP_NAME (default devdash-local) from env.
# Ensures a production build exists before starting.

set -euo pipefail

PORT="${PORT:-50051}"
APP_NAME="${APP_NAME:-devdash-local}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Stop and delete any existing PM2 process with this name
pm2_cleanup() {
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    echo "Stopping existing PM2 process '$APP_NAME'..."
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
    sleep 1
  fi
}

# Kill anything holding the port that isn't managed by PM2
free_port() {
  local pids
  pids="$(lsof -ti:"$PORT" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Port $PORT busy — killing PID(s): $(echo "$pids" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 1
  else
    echo "Port $PORT is free"
  fi
}

ensure_build() {
  if [[ ! -f "$ROOT_DIR/.next/BUILD_ID" ]]; then
    echo "No production build found — running 'npm run build'..."
    npm run build
  else
    echo "Production build found (BUILD_ID: $(cat "$ROOT_DIR/.next/BUILD_ID"))"
  fi
}

cmd="${1:-}"
case "$cmd" in
  start)
    ensure_build
    pm2_cleanup
    free_port
    PORT="$PORT" APP_NAME="$APP_NAME" pm2 start ecosystem.config.cjs --update-env
    pm2 save >/dev/null
    pm2 status
    ;;
  restart)
    ensure_build
    pm2_cleanup
    free_port
    PORT="$PORT" APP_NAME="$APP_NAME" pm2 start ecosystem.config.cjs --update-env
    pm2 save >/dev/null
    pm2 status
    ;;
  stop)
    if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
      pm2 delete "$APP_NAME"
      pm2 save >/dev/null
    else
      echo "PM2 process '$APP_NAME' not found"
    fi
    free_port
    pm2 status
    ;;
  *)
    echo "Usage: $0 {start|restart|stop}" >&2
    echo "  start    free port and start PM2 app" >&2
    echo "  restart  free port and restart (or start) PM2 app" >&2
    echo "  stop     stop PM2 app and free port" >&2
    exit 1
    ;;
esac
