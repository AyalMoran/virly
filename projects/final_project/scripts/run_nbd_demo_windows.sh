#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v terminator >/dev/null 2>&1; then
    echo "terminator is not installed or not in PATH" >&2
    exit 1
fi

launch() {
    local title="$1"
    local command="$2"

    terminator --title="$title" -e "bash -lc 'cd \"$SCRIPT_DIR\" && $command; exec bash'" &
}

launch "minion0" "./run_minion.sh --storage-path ../demo/storage/minion0.bin --port 5001"
launch "minion1" "./run_minion.sh --storage-path ../demo/storage/minion1.bin --port 5002"
launch "minion2" "./run_minion.sh --storage-path ../demo/storage/minion2.bin --port 5003"
launch "master_nbd" "./run_master_nbd.sh --minion 127.0.0.1:5001:4194304 --minion 127.0.0.1:5002:4194304 --minion 127.0.0.1:5003:4194304 --device-size-bytes 6291456 --nbd-device /dev/nbd0 --sudo"
