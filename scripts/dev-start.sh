#!/usr/bin/env bash
# dev-start.sh — Start the full local dev environment in one command.
# Usage: npm run dev:up
set -e

echo "▶ Starting database and Adminer..."
docker compose up -d postgres adminer

echo "⏳ Waiting for Postgres to be ready..."
until docker compose exec -T postgres pg_isready -U chrge -d chrge_dev -q 2>/dev/null; do
  sleep 1
done
echo "✓ Postgres is ready."

echo "▶ Applying migrations..."
npx prisma migrate deploy

echo "▶ Generating Prisma client..."
npx prisma generate

echo "▶ Starting API with hot reload..."
echo "   API  → http://localhost:3000/api/v1"
echo "   Docs → http://localhost:3000/docs"
echo "   DB   → http://localhost:8080 (Adminer)"
echo ""
npm run dev
