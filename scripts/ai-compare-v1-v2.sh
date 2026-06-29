#!/usr/bin/env bash
# Collect a v1-vs-v2 comparison dataset for the Virly assistant.
#   bash scripts/ai-compare-v1-v2.sh             # correctness + latency (fast, no tracing)
#   WITH_COST=1 bash scripts/ai-compare-v1-v2.sh # + token/cost via LangSmith
#   AI_COMPARE_OUT_DIR=/tmp/virly-compare bash scripts/ai-compare-v1-v2.sh
# Run from repo root. Reads server/.env (OPENAI_API_KEY, VIRLY_AI_MODEL, LANGSMITH_*).
# Writes run artifacts under server/artifacts/ai-compare/<timestamp>/ by default.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server" || exit 1
SUITE="src/ai/evals/v2/v2-conformance.test.ts"
WITH_COST="${WITH_COST:-0}"
BASE_OUT="${AI_COMPARE_OUT_DIR:-$ROOT/server/artifacts/ai-compare}"
case "$BASE_OUT" in
  /*) ;;
  *) BASE_OUT="$ROOT/$BASE_OUT" ;;
esac
STAMP_BASE="$(date -u +%Y%m%dT%H%M%SZ)"
STAMP="$STAMP_BASE"
RUN_INDEX=2
mkdir -p "$BASE_OUT" || exit 1
OUT="$BASE_OUT/$STAMP"
while ! mkdir "$OUT" 2>/dev/null; do
  STAMP="${STAMP_BASE}-$RUN_INDEX"
  RUN_INDEX=$((RUN_INDEX + 1))
  OUT="$BASE_OUT/$STAMP"
done
START_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
ln -sfnT "$STAMP" "$BASE_OUT/latest" 2>/dev/null || printf '%s\n' "$OUT" > "$BASE_OUT/latest.txt"

printf 'version|tests|pass|fail|skipped|todo|wall_clock_s|runner_exit|langsmith_project|tap_file|failure_file\n' > "$OUT/summary.psv"
printf 'version|total_tokens|prompt_tokens|completion_tokens|cost_usd|note\n' > "$OUT/cost.psv"

tap_stat () {
  local KEY="$1" FILE="$2" VALUE
  VALUE=$(grep -m1 "^# $KEY " "$FILE" | grep -oE '[0-9]+([.][0-9]+)?' | head -n1 || true)
  printf '%s\n' "${VALUE:-0}"
}

write_failures () {
  local VER="$1" TAP="$2" FAILURE_FILE="$OUT/$VER.failures.txt"
  if grep -Eq '^[[:space:]]+not ok [0-9]+ - ' "$TAP"; then
    grep -E '^[[:space:]]+not ok [0-9]+ - ' "$TAP" \
      | sed -E 's/^[[:space:]]+not ok [0-9]+ - /- /' \
      > "$FAILURE_FILE"
  elif grep -Eq '^not ok [0-9]+ - ' "$TAP"; then
    grep -E '^not ok [0-9]+ - ' "$TAP" \
      | sed -E 's/^not ok [0-9]+ - /- /' \
      > "$FAILURE_FILE"
  else
    printf 'No failing subtests detected.\n' > "$FAILURE_FILE"
  fi
}

run_version () {
  local VER="$1" TRACE="$2" PROJECT="virly-cmp-${1}-${STAMP}"
  local TAP="$OUT/$VER.tap.txt" FAILURE_FILE="$VER.failures.txt"
  echo "=== suite @ VIRLY_AI_GRAPH_VERSION=$VER (trace=$TRACE) ==="
  echo "    tap: $TAP"
  local t0 t1; t0=$(date +%s)
  local STATUS=0
  VIRLY_AI_V2_EVAL=1 VIRLY_AI_GRAPH_VERSION="$VER" \
  LANGSMITH_TRACING="$TRACE" LANGCHAIN_TRACING_V2="$TRACE" LANGSMITH_PROJECT="$PROJECT" \
    npx tsx --test --test-reporter=tap "$SUITE" > "$TAP" 2>&1 || STATUS=$?
  t1=$(date +%s)
  write_failures "$VER" "$TAP"
  local TESTS PASS FAIL SKIPPED TODO
  TESTS=$(tap_stat tests "$TAP")
  PASS=$(tap_stat pass "$TAP")
  FAIL=$(tap_stat fail "$TAP")
  SKIPPED=$(tap_stat skipped "$TAP")
  TODO=$(tap_stat todo "$TAP")
  echo "$VER|$TESTS|$PASS|$FAIL|$SKIPPED|$TODO|$(( t1 - t0 ))|$STATUS|$PROJECT|$VER.tap.txt|$FAILURE_FILE" >> "$OUT/summary.psv"
  [ "$WITH_COST" = "1" ] && [ "$TRACE" = "true" ] && scrape_langsmith "$PROJECT" "$VER"
}

scrape_langsmith () {
  local PROJECT="$1" VER="$2"
  local BASE="${LANGSMITH_ENDPOINT:-https://api.smith.langchain.com}"
  if [ -z "${LANGSMITH_API_KEY:-}" ]; then
    echo "$VER|NA|NA|NA|NA|LANGSMITH_API_KEY unset" >> "$OUT/cost.psv"
    return
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "$VER|NA|NA|NA|NA|jq not found" >> "$OUT/cost.psv"
    return
  fi
  # NOTE: verify endpoint paths/fields against your LangSmith API version.
  local SID
  SID=$(curl -s -H "x-api-key: ${LANGSMITH_API_KEY}" \
        "$BASE/sessions?name=$PROJECT" | jq -r '.[0].id // empty')
  if [ -z "$SID" ]; then echo "$VER|NA|NA|NA|NA|no LangSmith session; quota or ingestion delay" >> "$OUT/cost.psv"; return; fi
  sleep 5  # let trace ingestion settle
  curl -s -H "x-api-key: ${LANGSMITH_API_KEY}" -H 'content-type: application/json' \
       -X POST "$BASE/runs/stats" -d "{\"session\":[\"$SID\"],\"run_type\":\"llm\"}" \
    | jq -r --arg v "$VER" '"\($v)|\(.total_tokens // "NA")|\(.prompt_tokens // "NA")|\(.completion_tokens // "NA")|\(.total_cost // "NA")|"' \
    >> "$OUT/cost.psv"
}

TRACE=false; [ "$WITH_COST" = "1" ] && TRACE=true
run_version v1 "$TRACE"
run_version v2 "$TRACE"

{
  END_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "# v1 vs v2"
  echo
  echo "- Run: \`$STAMP\`"
  echo "- Started: $START_UTC"
  echo "- Finished: $END_UTC"
  echo "- Suite: \`$SUITE\`"
  echo "- Model: \`${VIRLY_AI_MODEL:-from server/.env}\`"
  echo "- Cost tracing: \`$WITH_COST\`"
  echo "- Output directory: \`$OUT\`"
  echo
  echo "## Correctness & latency"
  echo "| Version | Tests | Pass | Fail | Skipped | Todo | Runner exit | Wall-clock (s) | LangSmith project | TAP |"
  echo "|---|---:|---:|---:|---:|---:|---:|---:|---|---|"
  sed '1d' "$OUT/summary.psv" | while IFS='|' read -r V T P F S TD D X PR TAP FAILURE; do
    echo "| $V | $T | $P | $F | $S | $TD | $X | $D | $PR | [$TAP]($TAP) |"
  done
  echo
  echo "## Failed subtests"
  sed '1d' "$OUT/summary.psv" | while IFS='|' read -r V _T _P _F _S _TD _D _X _PR _TAP FAILURE; do
    echo
    echo "### $V"
    sed -n '1,40p' "$OUT/$FAILURE"
  done
  if [ "$WITH_COST" = "1" ]; then
    echo; echo "## Token cost (incl. judge overhead — constant across versions)"
    echo "| Version | Total tokens | Prompt | Completion | Cost (USD) | Note |"
    echo "|---|---:|---:|---:|---:|---|"
    sed '1d' "$OUT/cost.psv" | while IFS='|' read -r V T P C X NOTE; do echo "| $V | $T | $P | $C | $X | $NOTE |"; done
  fi
} > "$OUT/results.md"

echo "Wrote $OUT/results.md"
echo "Latest pointer: $BASE_OUT/latest"
echo "Artifacts: $OUT/{v1,v2}.tap.txt, $OUT/{v1,v2}.failures.txt, $OUT/summary.psv, $OUT/cost.psv"
