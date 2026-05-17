#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BIND_IP="${BIND_IP:-127.0.0.1}"
PORT="${PORT:-39124}"
STORAGE_PATH="${STORAGE_PATH:-$ROOT_DIR/build/simulation/minion0.bin}"
CAPACITY_BYTES="${CAPACITY_BYTES:-4194304}"
PLUGINS_DIR="${PLUGINS_DIR:-}"
MINION_BIN="${MINION_BIN:-$ROOT_DIR/build/minion}"

usage() {
    cat <<USAGE
usage: $0 [--bind-ip ip] [--port port] [--storage-path path] [--capacity-bytes n] [--plugins-dir dir]

Environment overrides: BIND_IP, PORT, STORAGE_PATH, CAPACITY_BYTES, PLUGINS_DIR, MINION_BIN
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --bind-ip)
            BIND_IP="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --storage-path)
            STORAGE_PATH="$2"
            shift 2
            ;;
        --capacity-bytes)
            CAPACITY_BYTES="$2"
            shift 2
            ;;
        --plugins-dir)
            PLUGINS_DIR="$2"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

mkdir -p "$(dirname "$STORAGE_PATH")"

args=(
    "$MINION_BIN"
    --bind-ip "$BIND_IP"
    --port "$PORT"
    --storage-path "$STORAGE_PATH"
    --capacity-bytes "$CAPACITY_BYTES"
)

if [[ -n "$PLUGINS_DIR" ]]; then
    args+=(--plugins-dir "$PLUGINS_DIR")
fi

echo "Starting minion on $BIND_IP:$PORT"
echo "Storage backing file: $STORAGE_PATH"
exec "${args[@]}"
