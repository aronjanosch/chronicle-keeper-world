#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# Enable debug mode by default in dev
export CHRONICLE_DEBUG="${CHRONICLE_DEBUG:-1}"

echo "=== Chronicle Keeper (dev) ==="
echo "Debug mode: CHRONICLE_DEBUG=${CHRONICLE_DEBUG}"
echo ""
echo "Starting backend at http://${BACKEND_HOST}:${BACKEND_PORT} (hot-reload)"
(cd "${ROOT_DIR}/backend" && uv run python -m uvicorn app.main:app \
  --host "${BACKEND_HOST}" \
  --port "${BACKEND_PORT}" \
  --reload \
  --reload-dir app \
  --log-level debug) &
BACKEND_PID=$!

echo "Starting frontend at http://127.0.0.1:${FRONTEND_PORT}"
(cd "${ROOT_DIR}/frontend" && python -m http.server "${FRONTEND_PORT}") &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti:"${BACKEND_PORT}" | xargs kill -9 2>/dev/null || true
    lsof -ti:"${FRONTEND_PORT}" | xargs kill -9 2>/dev/null || true
  fi
  kill "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo ""
echo "Backend:  http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo ""
echo "Servers running with hot-reload. Press Ctrl+C to stop."

sleep 1
if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${FRONTEND_PORT}"
fi
wait "${BACKEND_PID}" "${FRONTEND_PID}"
