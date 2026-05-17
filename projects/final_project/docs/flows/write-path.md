# End-to-End Write Path

## Purpose

This document explains how a large file write should flow through the system.
The key point is that the system is a block-storage backend, not a file-transfer service.

That means:

- the user writes a file through the mounted filesystem
- the filesystem turns that into block writes to the `NBD` device
- the project handles those writes as many bounded block operations
- minions store block ranges in backing files, not whole user files

## Core Model

A "large file write" is really a sequence of independent block write requests.

Each concrete write request should contain at least:

- `request_id`
- `logical_offset`
- `operation_length`
- payload bytes

With the current wire contract, that is represented as a `WRITE_REQ`.

## Why This Matters for UDP

UDP is not suitable for sending an arbitrarily large file in one message.
So the design must never treat "write file" as "send one big blob to one minion".

Instead:

- the write is split into many bounded `WRITE_REQ` messages
- each request carries one block-sized or chunk-sized payload
- the master routes each write independently

This keeps the transport model aligned with the block-storage architecture.

## Common Front Half of the Flow

The first half of the write flow is the same in both deployment modes.

1. The user copies or writes a file into the mounted Linux folder.
2. The filesystem above `NBD` translates that file operation into block writes.
3. The master-side `NBD` integration receives one write request per logical block range.
4. The master converts each write into a concrete framework task.
5. The concrete write command runs through the framework:
   `Reactor -> InputMediator -> ThreadPool -> WriteCommand`
6. `WriteCommand` uses metadata and placement logic to decide where that logical block belongs.
7. The master sends one or more `WRITE_REQ` messages to minions.
8. Each target minion receives the request through `MasterProxy`.
9. `MasterProxy` converts the datagram into a `WriteTask`.
10. The minion-side concrete write command uses `MinionStorageBackend` to write the payload into the correct backing-file region.
11. The minion uses `MasterProxy::SendWriteResponse(...)` to return `WRITE_RESP`.
12. On the master, `MinionResponseProxy` receives the UDP response through the reactor/input-proxy path.
13. `MinionResponseProxy` validates and deserializes the response, then calls `ResponseManager::HandleResponse(...)`.
14. `ResponseManager` matches the response to the in-flight request by `UUID` and invokes the registered completion callback.
15. The master completes the original block write when its policy says the write has succeeded.

The difference between single-minion mode and RAID01 mode is in step 6 onward.

---

## Single-Minion Mode

## High-Level Idea

Single-minion mode is the simplest logical fallback.
There is only one storage-bearing minion, so there is no striping and no mirror target.

Every logical write goes to the same minion.

## Precise Flow

Assume the filesystem produces these block writes for part of a large file:

- `WRITE_REQ(offset=0, length=4096, payload=chunk0)`
- `WRITE_REQ(offset=4096, length=4096, payload=chunk1)`
- `WRITE_REQ(offset=8192, length=4096, payload=chunk2)`

For each request:

1. The master receives the block write for logical offset `X`.
2. The placement layer resolves `X` to the only available minion.
3. The master sends a single `WRITE_REQ` datagram to that minion.
4. The minion receives the datagram through `MasterProxy::GetTask(fd)`.
5. `MasterProxy` deserializes the message into a `WriteTask`.
6. The minion write command translates the logical block range into the correct local backing-file location.
7. The command writes the payload bytes into the backing file.
8. The minion sends `WRITE_RESP` with success or failure.
9. The master's `MinionResponseProxy` receives the response datagram and forwards it to `ResponseManager`.
10. `ResponseManager` matches the `WRITE_RESP` to the pending request ID.
11. The master marks that block write complete.

## Result

The large file is stored as many block writes inside one minion's local backing storage.
The minion is not aware of the file as a file.
It only sees:

- logical offset
- length
- payload

## Example Mapping

If the minion owns the entire logical address space, then:

- logical `0..4095` -> local backing file offset `0..4095`
- logical `4096..8191` -> local backing file offset `4096..8191`
- logical `8192..12287` -> local backing file offset `8192..12287`

So a 100 MB file simply becomes many adjacent writes into the minion backing file.

This single-file, direct-offset mapping is the current implemented minion-side model.
It is a deliberate first step before introducing primary/mirror-specific local ownership mapping.

---

## RAID01 Striped + Mirrored Mode

## High-Level Idea

In RAID01 mode, the logical space is striped across primary owners and each primary block range has a fixed mirror target.

That means each block write has:

- one primary minion
- one mirror minion

The file is spread block-by-block across the cluster according to the placement rule.

## Example Topology

Assume four minions:

- `M0`
- `M1`
- `M2`
- `M3`

Assume a stripe size of `4 KB` and a fixed next-node mirror mapping:

- primary on `M0` mirrored to `M1`
- primary on `M1` mirrored to `M2`
- primary on `M2` mirrored to `M3`
- primary on `M3` mirrored to `M0`

The placement module owns this rule. RAIDManager v1 uses the next registered
node as the mirror target, wrapping from the last node back to the first.

## Example Large File Write

Suppose the filesystem emits these writes:

- block 0: `offset=0`, `length=4096`
- block 1: `offset=4096`, `length=4096`
- block 2: `offset=8192`, `length=4096`
- block 3: `offset=12288`, `length=4096`

Assume the placement logic resolves them as:

- block 0 primary -> `M0`, mirror -> `M1`
- block 1 primary -> `M1`, mirror -> `M2`
- block 2 primary -> `M2`, mirror -> `M3`
- block 3 primary -> `M3`, mirror -> `M0`

If one logical request crosses a stripe boundary, RAIDManager v1 splits it into
multiple placement segments. Each segment has its own logical offset, segment
length, primary target, optional mirror target, and local backing-file offset.

## Precise Flow Per Block

For each block write:

1. The master receives the write for logical offset `X`.
2. `RAIDManager` resolves `X` into:
   - primary owner
   - mirror owner
3. The master creates two outbound storage operations:
   - one `WRITE_REQ` to the primary minion
   - one `WRITE_REQ` to the mirror minion
4. Each minion receives its request through `MasterProxy`.
5. Each `MasterProxy` turns the message into a `WriteTask`.
6. Each minion write command writes the payload into its own local backing-file region.
7. Each minion sends `WRITE_RESP`.
8. The master's `MinionResponseProxy` receives response datagrams and forwards them to `ResponseManager`.
9. `ResponseManager` correlates each response by request `UUID`.
10. The master decides final success according to policy:
   - healthy success if both writes succeed
   - degraded success if only one succeeds and degraded mode allows completion
   - failure if policy requires both and neither acceptable path succeeds

## Result

One user file becomes many block writes, and each block is stored twice:

- once in its primary location
- once in its mirror location

The file is therefore:

- striped across primaries
- mirrored across partner minions

No minion stores "the whole file" as a user-visible object.
Each minion stores only the block ranges it owns as primary and/or mirror.

## Example Physical Outcome

For the four example blocks:

- block 0 data exists on `M0` and `M1`
- block 1 data exists on `M1` and `M2`
- block 2 data exists on `M2` and `M3`
- block 3 data exists on `M3` and `M0`

So the file is distributed across all four minions even though the user sees one normal file in one mounted folder.

---

## Large File Behavior

For a large file, the pattern simply repeats many times.

Example:

- a 100 MB file with `4 KB` writes produces about 25,600 write requests
- in single-minion mode, that is about 25,600 `WRITE_REQ` operations to one minion
- in RAID01 mode, that is about 25,600 primary writes plus about 25,600 mirror writes

This is exactly why the write path must be block-oriented and bounded.

## Responsibility Split

The responsibility split should stay clear:

- filesystem and `NBD`: convert file operations into block writes
- `NBDProxy` on master: receive new block operations from the NBD side
- master commands/orchestration: register pending requests, route each logical block write, and define completion policy
- `RAIDManager`: decide primary and mirror targets
- `MinionProxy` on master: send request datagrams to minions
- `MinionResponseProxy` on master: receive response datagrams through the framework input path
- `ResponseManager` on master: correlate responses by request `UUID` and invoke completion callbacks
- `MasterProxy` on minion: receive requests and send responses
- minion write command: validate request-to-storage assumptions and write payload into backing storage
- backing file: persist the block bytes locally

## Recovery and Degraded Mode

If one mirror target is unavailable during RAID01 writes:

- the master may still complete the write in degraded mode
- the successful copy becomes the authoritative available replica
- metadata must mark the missing replica as out-of-sync
- later recovery must rebuild the missing mirror copy

If the topology is intentionally single-minion:

- the write is not considered degraded
- there is no mirror target to mark out-of-sync
- successful completion remains normal `OK`

That degraded and recovery behavior is separate from the basic write path, but it depends on the same block-by-block routing model.

## Final Takeaway

The correct mental model is:

- not "send a large file to a minion"
- but "execute many bounded block writes across minions according to placement rules"

That model works for both:

- single-minion fallback
- RAID01 striped + mirrored distribution
