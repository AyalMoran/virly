# IPC Showcase (C++98)

This project benchmarks several IPC mechanisms by transferring one large file from a sender process to a receiver process and checking correctness.

Implemented IPC methods:
- Shared Memory (`shared_memory`)
- TCP socket over loopback (`tcp`)
- UDP socket over loopback (`udp`)
- Unix Domain socket (`unix_domain`)
- POSIX Message Queue (`message_queue`)
- Memory Mapping (`mmap`)

## What is compared
- Speed: elapsed time and throughput (MB/s)
- Correctness: transferred bytes and checksum match
- Reliability: method-specific reliability status (UDP tracks packet loss)

## Build
```bash
make
```

## Run
Default run creates/uses a 1GB file (`./ipc_test_1gb.bin`) and runs all methods:
```bash
./ipc_showcase
```

Run one method:
```bash
./ipc_showcase --method tcp
```

Useful options:
```bash
./ipc_showcase --method all --file ./big.bin --size 1G --chunk 65536 --iterations 3
```

Notes:
- `--size` supports suffix `K`, `M`, `G`.
- Message queue payload is capped to keep default Linux mq limits practical.
- UDP includes a small framing protocol with sequence numbers to detect loss/out-of-order behavior.

## Output
Example columns:
- `time s`: average seconds per method
- `MB/s`: average throughput
- `correct`: all iterations matched size+checksum
- `reliable`: all iterations satisfied reliability checks
