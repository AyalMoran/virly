#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SIM_DIR="${SIM_DIR:-$ROOT_DIR/build/simulation}"
BIND_IP="${BIND_IP:-127.0.0.1}"
MINION_PORT="${MINION_PORT:-39124}"
CAPACITY_BYTES="${CAPACITY_BYTES:-4096}"
OFFSET="${OFFSET:-525}"
PAYLOAD_HEX="${PAYLOAD_HEX:-4179616C2046726F6D20494C5244}" # "Ayal FromILRD" in hex
TIMEOUT_MS="${TIMEOUT_MS:-2000}"
STORAGE_PATH="${STORAGE_PATH:-$SIM_DIR/minion0.bin}"

mkdir -p "$SIM_DIR"

if [[ ! -x "$ROOT_DIR/build/minion" || ! -x "$ROOT_DIR/build/master_sim" ]]; then
    make -C "$ROOT_DIR" minion master-sim
fi

rm -f "$STORAGE_PATH"

cleanup() {
    if [[ -n "${MINION_PID:-}" ]] && kill -0 "$MINION_PID" 2>/dev/null; then
        kill "$MINION_PID" 2>/dev/null || true
        wait "$MINION_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

"$ROOT_DIR/scripts/run_minion.sh" \
    --bind-ip "$BIND_IP" \
    --port "$MINION_PORT" \
    --storage-path "$STORAGE_PATH" \
    --capacity-bytes "$CAPACITY_BYTES" &
MINION_PID=$!

sleep 0.3

echo
echo "Running master simulation"
"$ROOT_DIR/scripts/run_master_sim.sh" \
    --minion-ip "$BIND_IP" \
    --minion-port "$MINION_PORT" \
    --offset "$OFFSET" \
    --payload-hex "$PAYLOAD_HEX" \
    --timeout-ms "$TIMEOUT_MS"

echo
echo "Backing file changed at: $STORAGE_PATH"
echo "Showing bytes near offset $OFFSET"

if command -v xxd >/dev/null 2>&1; then
    xxd -g 1 -s "$OFFSET" -l 64 "$STORAGE_PATH"
else
    od -An -tx1 -j "$OFFSET" -N 64 "$STORAGE_PATH"
fi
