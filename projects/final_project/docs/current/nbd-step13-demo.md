Step 13 NBD Demo
================

Purpose
-------

Step 13 replaces the synthetic master input with real Linux `NBD` request
intake while preserving the existing framework path:

1. Linux sends block-device requests to `/dev/nbdX`.
2. `NBDCommunicator` receives raw `NBD` requests.
3. `NBDProxy` converts read/write/flush requests into concrete framework
   tasks.
4. `MasterReadCommand`, `MasterWriteCommand`, and `MasterFlushCommand` route
   through `RAIDManager`.
5. `MinionProxy` sends work to the minion over UDP.
6. `MinionResponseProxy` feeds minion responses into `ResponseManager`.
7. `MasterRuntime` completion callbacks return the final reply through
   `NBDProxy` to the kernel.

Implemented Components
----------------------

- `concrete/master/include/nbd/NBDCommunicator.hpp`
- `concrete/master/src/NBDCommunicator.cpp`
- `concrete/master/include/nbd/NBDProxy.hpp`
- `concrete/master/src/NBDProxy.cpp`
- `concrete/master/app/MasterNBDMain.cpp`
- `build/master_nbd`
- `scripts/setup_nbd.sh`
- `scripts/run_master_nbd.sh`
- `scripts/run_single_machine_nbd.sh`
- non-root tests for `NBDCommunicator` and `NBDProxy`

The code is clean-room C++ implementation. The external BUSE project remains a
reference for Linux `NBD` behavior, not a vendored dependency.

Build and Non-Root Verification
-------------------------------

Build everything:

```bash
make all
```

Build only the real `NBD` master:

```bash
make master-nbd
```

Run the non-root test suite:

```bash
make test
```

The automated tests use socket pairs and raw `NBD` request/reply structures.
They do not require root, `/dev/nbdX`, `modprobe`, formatting, or mounting.

Storage Model
-------------

In this demo there are three different storage-facing paths:

- `/dev/nbd0` is the Linux block-device interface. It is not where file names
  are stored. It is the kernel entry point that makes this project look like a
  disk.
- `/mnt/ilrd-nbd` is the mounted filesystem view. This is the normal folder
  where users can drag files, copy files, list files, and open files.
- `build/nbd-simulation/minion*.bin` are the current minion backing-store
  files. In single-node mode there is one file. In hybrid RAID0+1 demo mode
  there are multiple files, and ext2 blocks are distributed across them
  according to the current ring policy.

The relationship is equivalent to an external disk:

```text
External disk:
  /dev/sdb       = block-device interface
  /mnt/usb       = mounted folder view
  physical disk  = actual storage media

Current project demo:
  /dev/nbd0                          = block-device interface
  /mnt/ilrd-nbd                      = mounted folder view
  build/nbd-simulation/minion*.bin   = current storage media behind the minions
```

In a future product, `minion*.bin` can be replaced by real storage owned by
minions, such as files, partitions, or disks. The user should still
interact with one mounted folder while `RAIDManager` decides where each block
is stored.

Manual Single-Machine Demo
--------------------------

The actual mounted-drive path needs Linux `NBD` privileges. Keep these steps
manual so destructive filesystem actions are visible.

Prepare the host device:

```bash
scripts/setup_nbd.sh --nbd-device /dev/nbd0 --max-sectors-kb 4
```

Start the minion set and the master `NBD` runtime:

```bash
scripts/run_single_machine_nbd.sh \
  --nbd-device /dev/nbd0 \
  --device-size-bytes 16777216
```

By default this starts a 2-minion hybrid RAID0+1 ring. To run the supported
single-node fallback mode instead, pass `--minion-count 1`.

This script starts the minion processes as the current user and starts only
`build/master_nbd` through `sudo`, because opening `/dev/nbd0` and issuing the
Linux `NBD` ioctls requires privileges. If sudo authentication is required, the
script asks before launching the background master process.

In another terminal, format and mount the exported device:

```bash
sudo mkfs.ext2 -F /dev/nbd0
sudo mkdir -p /mnt/ilrd-nbd
sudo mount /dev/nbd0 /mnt/ilrd-nbd
```

Exercise the mounted path:

```bash
echo "hello from nbd" | sudo tee /mnt/ilrd-nbd/hello.txt
sudo sync
sudo cat /mnt/ilrd-nbd/hello.txt
```

These commands prove basic mounted-filesystem usability. The write creates a
normal file through `/mnt/ilrd-nbd`, `sync` forces dirty filesystem data toward
the block device, and `cat` reads the file back through the mounted path.

For a stronger persistence proof, unmount and remount before reading:

```bash
sudo umount /mnt/ilrd-nbd
sudo mount /dev/nbd0 /mnt/ilrd-nbd
sudo cat /mnt/ilrd-nbd/hello.txt
```

If the file survives unmount/remount, it was not only visible through the page
cache. The filesystem state was persisted into the minion backing store and
then reconstructed through `/dev/nbd0`.

Visual Folder Demo
------------------

After mounting, optionally make the mount writable by the current user:

```bash
sudo chown "$USER:$USER" /mnt/ilrd-nbd
```

Open the mounted folder in the desktop file manager:

```bash
xdg-open /mnt/ilrd-nbd
```

Drag a file into that folder or create one manually:

```bash
echo "this file went through the project NBD stack" > /mnt/ilrd-nbd/visual-demo.txt
ls -la /mnt/ilrd-nbd
cat /mnt/ilrd-nbd/visual-demo.txt
```

Then prove persistence:

```bash
sync
cd ~
sudo umount /mnt/ilrd-nbd
sudo mount /dev/nbd0 /mnt/ilrd-nbd
ls -la /mnt/ilrd-nbd
cat /mnt/ilrd-nbd/visual-demo.txt
```

If `umount` reports `target is busy`, some process still has the mount open.
Common causes are a terminal whose current directory is `/mnt/ilrd-nbd` or a
file manager window showing the folder. Diagnose with:

```bash
sudo fuser -vm /mnt/ilrd-nbd
```

Unmount before stopping the demo:

```bash
sudo umount /mnt/ilrd-nbd
```

Then press `Ctrl-C` in the terminal running `scripts/run_single_machine_nbd.sh`.

Observed Result
---------------

The visual demo has been run successfully: a file dragged/created under
`/mnt/ilrd-nbd` remained visible after `sync`, `umount`, and remounting
`/dev/nbd0`.

That verifies the current end-to-end path:

```text
file manager or shell
-> mounted filesystem at /mnt/ilrd-nbd
-> /dev/nbd0
-> NBDCommunicator
-> NBDProxy
-> Framework Reactor/InputMediator/ThreadPool
-> MasterWriteCommand / MasterReadCommand
-> RAIDManager
-> MinionProxy
-> MinionStorageBackend
-> build/nbd-simulation/minion0.bin
```

Current Scope
-------------

Step 13 proves real kernel `NBD` request intake and reply completion using the
same master/minion command path as the synthetic simulation.

The current implementation uses static command-line topology configuration and
supports both:

- single-node mode with one minion
- hybrid RAID0+1 ring mode with two or more minions

Persistent metadata, discovery, recovery, and rebalance remain later roadmap
steps.
