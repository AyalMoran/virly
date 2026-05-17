#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NBD_DEVICE="${NBD_DEVICE:-/dev/nbd0}"
MAX_SECTORS_KB="${MAX_SECTORS_KB:-4}"
MOUNT_POINT="${MOUNT_POINT:-/mnt/ilrd-nbd}"

usage() {
    cat <<USAGE
usage: $0 [--nbd-device /dev/nbdX] [--max-sectors-kb n] [--mount-point path]

Resets a local Linux NBD device without rebooting:
- attempts to unmount the mount point
- kills common local processes using the NBD device
- disconnects the kernel NBD client
- reloads the nbd kernel module
- reapplies the queue max_sectors_kb setting

Environment overrides: NBD_DEVICE, MAX_SECTORS_KB, MOUNT_POINT
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
        --mount-point)
            MOUNT_POINT="$2"
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

echo "Resetting $NBD_DEVICE"

if mountpoint -q "$MOUNT_POINT"; then
    echo "Unmounting $MOUNT_POINT"
    sudo umount "$MOUNT_POINT" || true
else
    echo "Mount point is not mounted: $MOUNT_POINT"
fi

echo "Stopping common local users of $NBD_DEVICE"
sudo pkill -f "build/master_nbd|scripts/run_master_nbd.sh|mkfs\\.ext2|mkfs\\.ext4|dd if=$NBD_DEVICE|dd of=$NBD_DEVICE|mount $NBD_DEVICE" || true

echo "Disconnecting kernel NBD client for $NBD_DEVICE"
sudo nbd-client -d "$NBD_DEVICE" || true

echo "Reloading nbd kernel module"
sudo modprobe -r nbd || true
sudo modprobe nbd

echo "Reapplying NBD queue settings"
"$ROOT_DIR/scripts/setup_nbd.sh" --nbd-device "$NBD_DEVICE" --max-sectors-kb "$MAX_SECTORS_KB"

echo "Reset complete for $NBD_DEVICE"
