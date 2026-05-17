# Final Project System Overview

## Purpose

This project aims to build a private distributed drive backed by home or IoT devices.
At a product level, the closest mental model is "Google Drive, but backed by your own devices".

That analogy is only a starting point. The actual architecture in this project is a block-backed distributed storage system built on top of a reusable command-processing framework.

## Current State

The repository already contains a generic framework implementation under `framework/`.
That framework is the current implemented core of the project and already provides:

- input handling through `Reactor`
- task extraction through `IInputProxy`
- task dispatch through `InputMediator`
- asynchronous execution through `ThreadPool`
- command creation and execution through a factory-based command flow
- runtime loading of existing and newly added plugins, with command override support

The repository also now contains the first concrete transport and storage pieces under `concrete/common`, `concrete/minion`, and `concrete/master`:

- a shared serializer buffer utility in `concrete/common/include/serialization`
- a wire-stable request ID / UUID representation
- a versioned `MessageHeaderV1` wire contract
- storage and heartbeat message envelope types
- validation rules for payload length, degraded status, and reserved header fields
- concrete framework task types for `READ_REQ`, `WRITE_REQ`, `FLUSH_REQ`, and `HEARTBEAT_REQ`
- a concrete task factory that maps validated wire requests into framework `ITask` instances
- a bidirectional minion-side `MasterProxy` that receives master request datagrams and sends serialized read/write/flush responses back over UDP
- a fixed-capacity `MinionStorageBackend` for local backing-file I/O
- a shared `MinionRuntime` that binds concrete storage and transport response sending
- concrete minion `ReadCommand`, `WriteCommand`, and `FlushCommand` implementations on top of that runtime
- a master-side `IMinionProxy` abstraction and UDP-backed `MinionProxy` for sending requests to configured minion endpoints
- a master-side `ResponseManager` that tracks in-flight requests by request `UUID`
- completion callbacks for the future `NBDProxy` reply path
- a reactor-facing `MinionResponseProxy` that receives UDP minion responses from configured endpoints, validates them, and feeds them into `ResponseManager`
- a master-side `MasterMetadata` registry for v1 static node IDs, capacity, health, active state, and primary ownership
- a metadata-backed `RAIDManager` v1 that resolves RAID01 primary/mirror placement segments and preserves single-minion fallback
- degraded-mode v1 handling for inactive primary/mirror targets, including read failover, degraded write success, node-level out-of-sync tracking, and degraded completion propagation
- master-side request fan-out and aggregation for cross-stripe reads, mirrored writes, and multi-node flush completion

The current concrete demo is still framework-oriented. It proves the generic command flow and plugin override mechanism, and the repository now also contains a real minion-side storage vertical slice.
It is not yet the full distributed drive.
The current master simulation proves both the non-`NBD` single-node path and the
multi-minion command path through master commands, `RAIDManager` v1 routing,
`ResponseManager`, `MinionResponseProxy`, and real minion processes.
`RAIDManager` now resolves RAID01 placement, preserves single-minion fallback,
and exposes inactive targets for degraded-mode policy decisions.
Persistent metadata, discovery, recovery, and real `NBDProxy` completion remain later steps.

## Target System

The target system is a concrete project built on top of the framework.

It is expected to provide:

- an `NBD`-backed mounted drive interface on Linux
- a normal mounted Linux folder experience for the user through the filesystem layered on top of that `NBD` device
- a `Master` process that coordinates storage, metadata, and routing
- multiple `Minion` processes or devices that provide backing storage
- mirrored redundancy with a fixed `RAID01`-style layout
- degraded operation and later recovery when devices disconnect and return
- operator-driven recovery and rebalance flows

## System Boundary

This project owns the replicated block-storage backend.

It does not own Linux filesystem semantics such as directories, filenames, and file metadata in the usual user-facing sense. Those sit above the backend through the mounted `NBD` drive and the filesystem running on top of it.

From the user's perspective, the system should still appear as a normal mounted Linux folder. The `NBD` block device is the backend mechanism that makes that folder experience possible.

That means:

- the project is responsible for block placement, replication, health, recovery, and backend metadata
- Linux and the mounted filesystem are responsible for normal file and directory semantics

## Main Components

### Framework

The framework is the reusable generic layer.
It handles command intake, dispatch, execution, and plugin extensibility.

### Master

The `Master` is the authoritative coordinator in the concrete project.
It owns:

- block placement decisions
- metadata about logical storage layout
- minion membership and health view
- read/write routing
- degraded mode decisions
- recovery and rebalance control

The `Master` is an orchestrator, not a primary storage node.

The currently implemented master-side pieces are intentionally narrower than the final master:

- `MinionProxy` is the outbound transport client that sends concrete wire requests to configured minion endpoints.
- `MinionResponseProxy` is the inbound framework adapter that reads response datagrams when the reactor marks the UDP socket readable.
- `ResponseManager` is the correlation component that matches minion responses to in-flight request IDs and invokes completion callbacks.
- `MasterMetadata` is the v1 in-memory registry for configured minion identity, capacity, health, and active state.
- `RAIDManager` v1 uses `MasterMetadata` as the placement boundary and resolves logical ranges into primary and optional mirror placement segments.
- `MasterRuntime` now aggregates child completions back into one logical request completion for cross-stripe reads, mirrored writes, and multi-node flushes.
- Degraded-mode v1 lets master commands fail reads over to a mirror, allow writes to proceed when one replica is missing, mark unavailable replica nodes out-of-sync, and return degraded success through the completion path when the topology actually has redundant replicas.
- The `NBDProxy` path is implemented for the current static-topology demo and is the entry point for new block operations.

This keeps the flow split cleanly: `NBDProxy` will start storage operations, while `MinionResponseProxy` finishes already-sent operations by delivering replies to `ResponseManager`.

### Minion

A `Minion` is a storage-bearing device, such as a Raspberry Pi or another host.
Each minion runs the same framework skeleton as the master, but with minion-specific concrete commands and proxies.

A minion:

- receives commands from the master
- stores backing data in regular local files
- serves read/write requests for the storage regions it owns
- can also hold mirrored backup regions for another minion

These local files are backing-storage files, not user-visible replicated source files.

### Serialization Module

The repository contains a concrete-project serialization and wire-contract layer under `concrete/common`.

Its job is to serialize and deserialize request and response messages exchanged between nodes.
The current implemented contract includes:

- a wire-stable `UUID` / request ID
- a fixed-size `MessageHeaderV1`
- storage request and response envelopes
- heartbeat request and acknowledgment envelopes
- explicit validation of version, payload size, flags, and reserved fields

It is not part of the generic framework API, but it should be designed as a reusable utility that can later be extracted if needed.

### Minion Storage Backend

The repository also now contains the first concrete local storage execution layer for a minion.

The current implementation provides:

- a fixed-size backing file created or reopened at startup
- bounded block-range reads and writes using logical offset as the current local file offset
- explicit `Flush()` support
- wire-status mapping for out-of-range, bad-length, I/O, and internal command failures

This is intentionally a v1 local storage model.
It does not yet implement per-region ownership tables or separate primary/mirror local layouts.

## Current State vs Target State

| Area | Current State | Target State |
| --- | --- | --- |
| Framework runtime | Implemented | Reused by master and minion |
| Input-to-command flow | Implemented | Reused for storage commands |
| Plugin loading | Implemented | Reused for extensibility |
| Serialization and wire contract | Implemented in `concrete/` for header and envelope types | Reused by master and minion networking |
| Concrete request task model | Implemented in `concrete/` for storage and heartbeat request types | Reused by concrete proxies and command dispatch |
| Master/minion storage system | Implemented through minion local storage execution plus master-side single-node and multi-minion request/response orchestration | Concrete distributed block storage |
| Minion transport proxy | Implemented for UDP request intake and read/write/flush replies | Feeds minion command execution and reply transport |
| Master minion transport client | Implemented for UDP read/write/flush/heartbeat requests to configured minion endpoints | Extended with routing, retries, and lifecycle ownership |
| Master response correlation | Implemented through `ResponseManager`, `MinionResponseProxy`, parent/child aggregation in `MasterRuntime`, and NBD completion propagation | Extended with retries and richer policy control |
| Master metadata v1 | Implemented as in-memory static node registry, capacity/health state, and node-level out-of-sync state | Persistent metadata, topology, and block-range-level out-of-sync tracking |
| RAID01 placement | Implemented through `RAIDManager` v1 primary/mirror segment resolution plus inactive-target exposure for degraded policy | Used by mirrored command orchestration, recovery, and rebalance |
| Degraded-mode v1 | Implemented for read failover, missing-replica write success, node-level out-of-sync tracking, and DEGRADED_OK propagation | Extended with block-range tracking, recovery, and resync |
| Minion backing storage and commands | Implemented for fixed-capacity local file I/O and read/write/flush command execution | Extended with ownership mapping and RAID-aware local layout |
| NBD-backed drive | Implemented for static command-line topology in single-node and hybrid RAID01 demo modes | Main user-facing access path |
| Mirrored write orchestration | Implemented for the current fixed ring layout | Extended with richer policy, retries, and recovery integration |
| Recovery/rebalance | Planned | Operator-controlled and block-level |

## Terminology

- `Framework`: the reusable command-processing infrastructure in `framework/`
- `Concrete Project`: the distributed storage system built on top of the framework
- `Master`: the coordinator and metadata owner
- `Minion`: a storage-bearing device managed by the master
- `Task`: a unit produced by input handling and passed into command execution
- `Command`: logic selected by key and executed by the framework
- `Plugin`: a runtime-loaded shared object that can register or replace commands
- `NBD`: the block-device interface used to expose the drive on Linux
- `RAID01`: the target mirrored storage layout used in the concrete project

## Presentation Note

The repo already contains presentation guidance in [`project-presentation.md`](../presentation/project-presentation.md).
That file is useful for future demo and interview framing, but this document is the engineering source of truth for the high-level system description.
