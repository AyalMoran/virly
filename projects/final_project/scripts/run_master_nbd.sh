#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NBD_DEVICE="${NBD_DEVICE:-/dev/nbd0}"
DEVICE_SIZE_BYTES="${DEVICE_SIZE_BYTES:-16777216}"
BLOCK_SIZE="${BLOCK_SIZE:-4096}"
MINION_IP="${MINION_IP:-127.0.0.1}"
MINION_PORT="${MINION_PORT:-39124}"
MINION_CAPACITY_BYTES="${MINION_CAPACITY_BYTES:-}"
MASTER_BIND_IP="${MASTER_BIND_IP:-127.0.0.1}"
MASTER_PORT="${MASTER_PORT:-0}"
PLUGINS_DIR="${PLUGINS_DIR:-}"
MASTER_NBD_BIN="${MASTER_NBD_BIN:-$ROOT_DIR/build/master_nbd}"
RUN_WITH_SUDO="${RUN_WITH_SUDO:-auto}"
declare -a MINION_ENDPOINTS=()
PENDING_MINION_IP=""
PENDING_MINION_PORT=""

usage() {
    cat <<USAGE
usage: $0 [--nbd-device /dev/nbdX] [--device-size-bytes n] [--block-size n] [--minion ip:port:capacity]... [--master-bind-ip ip] [--master-port port] [--plugins-dir dir] [--sudo|--no-sudo]

The master NBD process needs permission to open and configure /dev/nbdX.
RUN_WITH_SUDO accepts auto, 1, or 0. auto uses sudo when not already root.

Environment overrides: NBD_DEVICE, DEVICE_SIZE_BYTES, BLOCK_SIZE, MINION_IP, MINION_PORT, MINION_CAPACITY_BYTES, MASTER_BIND_IP, MASTER_PORT, PLUGINS_DIR, MASTER_NBD_BIN, RUN_WITH_SUDO
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --nbd-device)
            NBD_DEVICE="$2"
            shift 2
            ;;
        --device-size-bytes)
            DEVICE_SIZE_BYTES="$2"
            shift 2
            ;;
        --block-size)
            BLOCK_SIZE="$2"
            shift 2
            ;;
        --minion-ip)
            PENDING_MINION_IP="$2"
            shift 2
            ;;
        --minion-port)
            PENDING_MINION_PORT="$2"
            shift 2
            ;;
        --minion-capacity)
            if [[ -z "$PENDING_MINION_PORT" ]]; then
                echo "--minion-capacity requires a preceding --minion-port" >&2
                exit 1
            fi
            MINION_ENDPOINTS+=("${PENDING_MINION_IP:-$MINION_IP}:$PENDING_MINION_PORT:$2")
            PENDING_MINION_IP=""
            PENDING_MINION_PORT=""
            shift 2
            ;;
        --minion)
            MINION_ENDPOINTS+=("$2")
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
        --plugins-dir)
            PLUGINS_DIR="$2"
            shift 2
            ;;
        --sudo)
            RUN_WITH_SUDO="1"
            shift
            ;;
        --no-sudo)
            RUN_WITH_SUDO="0"
            shift
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

if [[ -n "$PENDING_MINION_IP" || -n "$PENDING_MINION_PORT" ]]; then
    echo "--minion-ip/--minion-port requires a matching --minion-capacity" >&2
    exit 1
fi

if [[ "${#MINION_ENDPOINTS[@]}" -eq 0 ]]; then
    if [[ -z "$MINION_CAPACITY_BYTES" ]]; then
        echo "minion capacity is required; pass --minion ip:port:capacity or set MINION_CAPACITY_BYTES" >&2
        exit 1
    fi

    MINION_ENDPOINTS+=("$MINION_IP:$MINION_PORT:$MINION_CAPACITY_BYTES")
fi

if [[ ! -x "$MASTER_NBD_BIN" ]]; then
    make -C "$ROOT_DIR" master-nbd
fi

args=(
    "$MASTER_NBD_BIN"
    --nbd-device "$NBD_DEVICE"
    --device-size-bytes "$DEVICE_SIZE_BYTES"
    --block-size "$BLOCK_SIZE"
    --master-bind-ip "$MASTER_BIND_IP"
    --master-port "$MASTER_PORT"
)

for endpoint in "${MINION_ENDPOINTS[@]}"; do
    args+=(--minion "$endpoint")
done

if [[ -n "$PLUGINS_DIR" ]]; then
    args+=(--plugins-dir "$PLUGINS_DIR")
fi

echo "Starting master NBD runtime on $NBD_DEVICE"
echo "Exported size: $DEVICE_SIZE_BYTES bytes"
echo "Minion endpoints: ${MINION_ENDPOINTS[*]}"

use_sudo=0
case "$RUN_WITH_SUDO" in
    auto)
        if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
            use_sudo=1
        fi
        ;;
    1|true|yes)
        use_sudo=1
        ;;
    0|false|no)
        use_sudo=0
        ;;
    *)
        echo "invalid RUN_WITH_SUDO value: $RUN_WITH_SUDO" >&2
        exit 1
        ;;
esac

if [[ "$use_sudo" -eq 1 ]]; then
    echo "Running master NBD process through sudo for $NBD_DEVICE access"
    exec sudo "${args[@]}"
fi

exec "${args[@]}"
