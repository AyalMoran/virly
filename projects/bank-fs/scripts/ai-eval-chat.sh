#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/server"

MODE="${1:-deterministic}"

npx tsx src/ai/evals/cli.ts --mode "$MODE"
