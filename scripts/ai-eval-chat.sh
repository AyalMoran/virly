#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/server"

MODE="${1:-deterministic}"

if [[ "$MODE" == "-h" || "$MODE" == "--help" || "$MODE" == "help" ]]; then
  cat <<'USAGE'
Usage:
  ./scripts/ai-eval-chat.sh deterministic
  ./scripts/ai-eval-chat.sh llm-dev
  ./scripts/ai-eval-chat.sh seeded-mongo
  ./scripts/ai-eval-chat.sh llm-seeded-mongo

Modes:
  deterministic  Uses deterministic/fake LLM behavior where possible. Default.
  llm-dev        Uses the configured live OpenAI provider for LLM calls.
  seeded-mongo   Uses a dedicated seeded Mongo eval database.
  llm-seeded-mongo
                 Uses live OpenAI calls plus a dedicated seeded Mongo database.

Live LLM requirements:
  OPENAI_API_KEY
  VIRLY_AI_MODEL
  VIRLY_AI_EVAL_ENABLE_LLM_DEV=true

Seeded Mongo example for the local Docker Mongo service:
  VIRLY_AI_EVAL_ENABLE_MONGO=true \
  VIRLY_AI_EVAL_MONGO_URI='mongodb://127.0.0.1:27017/virly_ai_eval?directConnection=true' \
  ./scripts/ai-eval-chat.sh seeded-mongo

Live LLM plus seeded Mongo:
  VIRLY_AI_EVAL_ENABLE_LLM_DEV=true \
  VIRLY_AI_EVAL_ENABLE_MONGO=true \
  VIRLY_AI_EVAL_MONGO_URI='mongodb://127.0.0.1:27017/virly_ai_eval?directConnection=true' \
  ./scripts/ai-eval-chat.sh llm-seeded-mongo

Leave seeded collections available for MongoDB Compass after the run:
  VIRLY_AI_EVAL_KEEP_MONGO=true \
  VIRLY_AI_EVAL_ENABLE_LLM_DEV=true \
  VIRLY_AI_EVAL_ENABLE_MONGO=true \
  VIRLY_AI_EVAL_MONGO_URI='mongodb://127.0.0.1:27017/virly_ai_eval?directConnection=true' \
  ./scripts/ai-eval-chat.sh llm-seeded-mongo

Compass URI:
  mongodb://127.0.0.1:27017/virly_ai_eval?directConnection=true

The script runs from server/, so server/.env is loaded by the eval CLI.
USAGE
  exit 0
fi

if [[ -x ./node_modules/.bin/tsx ]]; then
  ./node_modules/.bin/tsx src/ai/evals/cli.ts --mode "$MODE"
else
  npx tsx src/ai/evals/cli.ts --mode "$MODE"
fi
