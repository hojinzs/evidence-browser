#!/usr/bin/env bash
# gh-symphony `hooks.after_create` — runs once when a fresh issue worktree is
# populated (SYMPHONY_REPOSITORY_PATH is the checkout). The daemon host must
# export SYMPHONY_ALLOW_WORKFLOW_HOOKS=1 for hooks to execute; otherwise the
# worker installs dependencies itself per WORKFLOW.md Runtime Contract 8.
set -euo pipefail

cd "${SYMPHONY_REPOSITORY_PATH:-$(pwd)}"

npm ci
npm run build:shared
