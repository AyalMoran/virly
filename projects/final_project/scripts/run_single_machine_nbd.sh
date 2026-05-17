#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SIM_DIR="${SIM_DIR:-$ROOT_DIR/build/nbd-simulation}"
BIND_IP="${BIND_IP:-127.0.0.1}"
MINION_PORT="${MINION_PORT:-39124}"
MINION_COUNT="${MINION_COUNT:-2}"
NBD_DEVICE="${NBD_DEVICE:-/dev/nbd0}" 
DEVICE_SIZE_BYTES="${DEVICE_SIZE_BYTES:-}"
MINION_CAPACITY_BYTES="${MINION_CAPACITY_BYTES:-4194304}"
BLOCK_SIZE="${BLOCK_SIZE:-4096}"
STORAGE_PATH="${STORAGE_PATH:-}"

usage() {
    cat <<USAGE
usage: $0 [--nbd-device /dev/nbdX] [--device-size-bytes n] [--minion-capacity-bytes n[,n...]] [--block-size n] [--bind-ip ip] [--minion-port port] [--minion-count n] [--storage-path path]

Starts a local ring of minions and one master NBD runtime. Run scripts/setup_nbd.sh
first. Filesystem formatting and mounting are intentionally left as explicit
operator commands; see docs/current/nbd-step13-demo.md.

One minion starts single-node mode. Two or more minions use the hybrid RAID0+1 ring.

The minion runs unprivileged. The master NBD process is started with sudo when
this script is not already root because Linux NBD ioctls require privileges.

Environment overrides: SIM_DIR, BIND_IP, MINION_PORT, MINION_COUNT, NBD_DEVICE, DEVICE_SIZE_BYTES, MINION_CAPACITY_BYTES, BLOCK_SIZE, STORAGE_PATH
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
        --minion-capacity-bytes)
            MINION_CAPACITY_BYTES="$2"
            shift 2
            ;;
        --block-size)
            BLOCK_SIZE="$2"
            shift 2
            ;;
        --bind-ip)
            BIND_IP="$2"
            shift 2
            ;;
        --minion-port)
            MINION_PORT="$2"
            shift 2
            ;;
        --minion-count)
            MINION_COUNT="$2"
            shift 2
            ;;
        --storage-path)
            STORAGE_PATH="$2"
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

mkdir -p "$SIM_DIR"

if [[ "$MINION_COUNT" -lt 1 ]]; then
    echo "--minion-count must be at least 1" >&2
    exit 1
fi

IFS=',' read -r -a MINION_CAPACITY_LIST <<< "$MINION_CAPACITY_BYTES"
if [[ "${#MINION_CAPACITY_LIST[@]}" -eq 0 || -z "${MINION_CAPACITY_LIST[0]}" ]]; then
    echo "--minion-capacity-bytes must provide at least one capacity" >&2
    exit 1
fi

if [[ "${#MINION_CAPACITY_LIST[@]}" -ne 1 &&
      "${#MINION_CAPACITY_LIST[@]}" -ne "$MINION_COUNT" ]]; then
    echo "--minion-capacity-bytes must provide one capacity or one per minion" >&2
    exit 1
fi

min_capacity=0
for ((i = 0; i < MINION_COUNT; ++i)); do
    capacity_index=0
    if [[ "${#MINION_CAPACITY_LIST[@]}" -gt 1 ]]; then
        capacity_index=$i
    fi

    capacity="${MINION_CAPACITY_LIST[$capacity_index]}"
    if [[ -z "$capacity" || "$capacity" -le 0 ]]; then
        echo "invalid minion capacity at index $i: $capacity" >&2
        exit 1
    fi

    if [[ "$i" -eq 0 || "$capacity" -lt "$min_capacity" ]]; then
        min_capacity="$capacity"
    fi
done

if [[ -z "$DEVICE_SIZE_BYTES" ]]; then
    if [[ "$MINION_COUNT" -gt 1 ]]; then
        DEVICE_SIZE_BYTES=$(((min_capacity / 2) * MINION_COUNT))
    else
        DEVICE_SIZE_BYTES=$((min_capacity * MINION_COUNT))
    fi
fi

if [[ ! -x "$ROOT_DIR/build/minion" || ! -x "$ROOT_DIR/build/master_nbd" ]]; then
    make -C "$ROOT_DIR" minion master-nbd
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Validating sudo access for master NBD process on $NBD_DEVICE"
    sudo -v
fi

declare -a MINION_PIDS=()
declare -a MINION_ENDPOINTS=()

cleanup() {
    if [[ -n "${MASTER_PID:-}" ]] && kill -0 "$MASTER_PID" 2>/dev/null; then
        kill "$MASTER_PID" 2>/dev/null || true
        wait "$MASTER_PID" 2>/dev/null || true
    fi

    for pid in "${MINION_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        fi
    done
}
trap cleanup EXIT

for ((i = 0; i < MINION_COUNT; ++i)); do
    port=$((MINION_PORT + i))
    capacity_index=0
    if [[ "${#MINION_CAPACITY_LIST[@]}" -gt 1 ]]; then
        capacity_index=$i
    fi
    capacity="${MINION_CAPACITY_LIST[$capacity_index]}"
    if [[ -n "$STORAGE_PATH" ]]; then
        storage_path="$STORAGE_PATH"
        if [[ "$MINION_COUNT" -gt 1 ]]; then
            storage_path="${STORAGE_PATH%.*}_$i.${STORAGE_PATH##*.}"
            if [[ "$STORAGE_PATH" != *.* ]]; then
                storage_path="${STORAGE_PATH}_$i"
            fi
        fi
    else
        storage_path="$SIM_DIR/minion$i.bin"
    fi

    rm -f "$storage_path"
    "$ROOT_DIR/scripts/run_minion.sh" \
        --bind-ip "$BIND_IP" \
        --port "$port" \
        --storage-path "$storage_path" \
        --capacity-bytes "$capacity" &
    MINION_PIDS+=($!)
    MINION_ENDPOINTS+=("$BIND_IP:$port:$capacity")
done

sleep 0.3

master_args=(
    "$ROOT_DIR/scripts/run_master_nbd.sh"
    --nbd-device "$NBD_DEVICE"
    --device-size-bytes "$DEVICE_SIZE_BYTES"
    --block-size "$BLOCK_SIZE"
    --sudo
)
for endpoint in "${MINION_ENDPOINTS[@]}"; do
    master_args+=(--minion "$endpoint")
done

"${master_args[@]}" &
MASTER_PID=$!

cat <<INFO

NBD demo processes are running.
Exported NBD size: $DEVICE_SIZE_BYTES bytes
Minion capacities: ${MINION_CAPACITY_LIST[*]}

In another terminal, run explicit filesystem commands, for example:
  sudo mkfs.ext2 -F $NBD_DEVICE
  sudo mkdir -p /mnt/ilrd-nbd
  sudo mount $NBD_DEVICE /mnt/ilrd-nbd
  echo hello | sudo tee /mnt/ilrd-nbd/hello.txt
  sudo cat /mnt/ilrd-nbd/hello.txt
  sudo umount /mnt/ilrd-nbd

Press Ctrl-C here to stop the master and minion.
INFO

wait "$MASTER_PID"
