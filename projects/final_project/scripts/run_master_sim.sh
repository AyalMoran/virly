#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MINION_IP="${MINION_IP:-127.0.0.1}"
MINION_PORT="${MINION_PORT:-39124}"
MASTER_BIND_IP="${MASTER_BIND_IP:-127.0.0.1}"
MASTER_PORT="${MASTER_PORT:-0}"
OFFSET="${OFFSET:-128}"
PAYLOAD_HEX="${PAYLOAD_HEX:-cafebabe}"
TIMEOUT_MS="${TIMEOUT_MS:-2000}"
MASTER_SIM_BIN="${MASTER_SIM_BIN:-$ROOT_DIR/build/master_sim}"

usage() {
    cat <<USAGE
usage: $0 [--minion-ip ip] [--minion-port port] [--master-bind-ip ip] [--master-port port] [--offset n] [--payload-hex hex] [--timeout-ms n]

Environment overrides: MINION_IP, MINION_PORT, MASTER_BIND_IP, MASTER_PORT, OFFSET, PAYLOAD_HEX, TIMEOUT_MS, MASTER_SIM_BIN
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --minion-ip)
            MINION_IP="$2"
            shift 2
            ;;
        --minion-port)
            MINION_PORT="$2"
            shift 2
            ;;
        --master-bind-ip)
            MASTER_BIND_IP="$2"
            shift 2
            ;;
        --master-port)
            MASTER_PORT="$2"
            shift 2
            ;;
        --offset)
            OFFSET="$2"
            shift 2
            ;;
        --payload-hex)
            PAYLOAD_HEX="$2"
            shift 2
            ;;
        --timeout-ms)
            TIMEOUT_MS="$2"
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

exec "$MASTER_SIM_BIN" \
    --minion-ip "$MINION_IP" \
    --minion-port "$MINION_PORT" \
    --master-bind-ip "$MASTER_BIND_IP" \
    --master-port "$MASTER_PORT" \
    --offset "$OFFSET" \
    --payload-hex "$PAYLOAD_HEX" \
    --timeout-ms "$TIMEOUT_MS"
