#!/usr/bin/env bash
set -euo pipefail

NBD_DEVICE="${NBD_DEVICE:-/dev/nbd0}"
MAX_SECTORS_KB="${MAX_SECTORS_KB:-4}"

usage() {
    cat <<USAGE
usage: $0 [--nbd-device /dev/nbdX] [--max-sectors-kb n]

Loads the Linux nbd module and constrains the selected device request size.
Run before starting build/master_nbd.

Environment overrides: NBD_DEVICE, MAX_SECTORS_KB
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --nbd-device)
            NBD_DEVICE="$2"
            shift 2
            ;;
        --max-sectors-kb)
            MAX_SECTORS_KB="$2"
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

device_name="$(basename "$NBD_DEVICE")"
queue_file="/sys/block/$device_name/queue/max_sectors_kb"

sudo modprobe nbd

if [[ ! -e "$NBD_DEVICE" ]]; then
    echo "NBD device does not exist after modprobe: $NBD_DEVICE" >&2
    exit 1
fi

if [[ -w "$queue_file" ]]; then
    printf '%s\n' "$MAX_SECTORS_KB" > "$queue_file"
else
    printf '%s\n' "$MAX_SECTORS_KB" | sudo tee "$queue_file" >/dev/null
fi

echo "Prepared $NBD_DEVICE with max_sectors_kb=$MAX_SECTORS_KB"
