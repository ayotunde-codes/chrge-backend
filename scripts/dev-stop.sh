#!/usr/bin/env bash
# dev-stop.sh — Stop and clean up the full local dev environment.
# Usage: npm run dev:down
set -e

echo "▶ Stopping NestJS dev server (if running)..."
pkill -f "ts-node\|nest start\|nodemon\|npm run dev" 2>/dev/null && echo "✓ Dev server stopped." || echo "  (no dev server process found)"

echo "▶ Stopping all Docker services (postgres, adminer, app)..."
docker compose down

echo "✓ All services stopped."
