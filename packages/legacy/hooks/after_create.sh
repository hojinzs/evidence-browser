#!/usr/bin/env bash
set -euo pipefail

npm ci

if [ ! -f .env.local ]; then
  cp .env.example .env.local
fi

mkdir -p data/bundles
npm run seed
