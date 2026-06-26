#!/usr/bin/env bash
set -euo pipefail

echo "=== Evidence Browser Test Setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed."; exit 1; }

# Environment variables
export NODE_ENV="test"
export DATABASE_URL="postgresql://test:test@localhost:5432/evidence_test"
export REDIS_URL="redis://localhost:6379/1"

# Start services
echo "Starting PostgreSQL container..."
docker compose -f docker-compose.test.yml up -d postgres redis

echo "Waiting for database readiness..."
until pg_isready -h localhost -p 5432 -U test 2>/dev/null; do
  sleep 1
done

# Run migrations
echo "Applying database migrations..."
npx prisma migrate deploy

# Seed test data
echo "Seeding test fixtures..."
npx tsx scripts/seed-test-data.ts

echo "=== Setup complete ==="
