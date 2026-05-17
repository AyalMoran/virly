# Final Project Roadmap

## Purpose

This roadmap turns the agreed target architecture into implementation milestones.
It is written to help the team move from the current framework prototype to a working distributed `NBD`-backed drive.

Milestones are intentionally concrete. They should be used as engineering checkpoints, not only as presentation bullets.

## Milestone 1: Documentation Baseline and Framework Alignment

### Goal

Establish a shared understanding of what already exists, what is planned, and what assumptions are locked.

### Outputs

- system overview document
- framework architecture document
- milestone roadmap
- consistent terminology across docs

### Dependencies

- current framework code
- external design notes

### Done Criteria

- the team can distinguish framework truth from target-system intent
- the docs no longer mix file-level and block-level storage models
- the architecture decisions in this roadmap are explicit

## Milestone 2: Shared Serialization and Command Envelope

### Goal

Define the concrete request/response contract shared by master and minion.

### Status

Implemented.

### Outputs

- concrete serialization module used by both sides
- request envelope including request ID, logical offset, length, and role-specific payload
- response envelope including status, payload when needed, and degraded-state warning fields
- fixed-size `MessageHeaderV1`
- heartbeat request and acknowledgment envelopes
- wire validation for version, flags, payload length, and reserved fields

### Dependencies

- framework command execution path

### Done Criteria

- master and minion can exchange read/write messages using the same serialization layer
- degraded-state information can be returned on every affected response

### Implementation Note

The current implementation lives under `concrete/common` and `concrete/minion` and includes:

- `UUID` as a wire-stable request ID
- `MessageHeaderV1`
- storage message envelopes
- heartbeat message envelopes
- concrete protocol tests covering byte order, round trips, and validation failures
- a concrete task hierarchy keyed directly by wire request message type
- a task factory that maps validated request envelopes into framework `ITask` objects

### Deferred

- checksum and versioning fields
- transport-specific fragmentation or framing policy beyond the current message envelope

## Milestone 3: Concrete Task Types and Command Keys

### Goal

Bridge the wire protocol into framework dispatch with concrete request task types and stable command keys.

### Status

Implemented.

### Outputs

- shared concrete task types for `READ_REQ`, `WRITE_REQ`, `FLUSH_REQ`, and `HEARTBEAT_REQ`
- command keys derived directly from `wire::MessageType`
- a concrete task-construction layer that rejects response messages and parses request payloads into task objects

### Dependencies

- shared serialization and command envelope

### Done Criteria

- validated wire requests can be converted into framework `ITask` instances
- concrete commands can register against stable integer keys without introducing a second protocol vocabulary
- request payloads needed by concrete commands are available on the task object

## Milestone 4: Minion Transport Proxy

### Goal

Implement the first real concrete minion/master transport bridge on the minion side.

### Status

Implemented.

### Outputs

- a bidirectional minion-side `MasterProxy`
- inbound parsing of master-originated UDP request datagrams
- deserialization from raw bytes into `wire::MessageV1`
- task construction through the concrete task factory
- integration with the existing framework `InputMediator` flow
- outbound serialization and sending of `READ_RESP`, `WRITE_RESP`, and `FLUSH_RESP`
- outbound serialization and sending of `HEARTBEAT_RESP`

### Dependencies

- shared serialization
- concrete task types and command keys

### Done Criteria

- a minion can receive a master request on its transport input
- the minion proxy can deserialize the request into `wire::MessageV1`
- the minion proxy can return the correct concrete `ITask` to the framework
- the minion proxy can serialize and send read/write/flush responses back to the master over UDP
- the minion proxy can serialize and send heartbeat acknowledgments back to the master over UDP

### Implementation Note

The current implementation includes:

- datagram-oriented request intake through `IInputProxy::GetTask(int fd)`
- dropping and logging malformed or response-side inbound datagrams without stopping the reactor
- cached master endpoint handling from valid inbound traffic
- `SendReadResponse()`, `SendWriteResponse()`, and `SendFlushResponse()` on the same `MasterProxy`
- `SendHeartbeatResponse()` on the same `MasterProxy`

### Deferred

- stream framing or multi-message connection semantics beyond UDP datagrams
- response-correlation logic on the master side

## Milestone 5: Minion Storage Backend

### Goal

Implement local backing storage on the minion side.

### Status

Implemented.

### Outputs

- a fixed-capacity backing-file storage backend on the minion side
- read/write access to bounded block ranges within that backing file
- flush support for durability boundaries
- concrete minion `ReadCommand`, `WriteCommand`, and `FlushCommand`
- concrete minion `HeartbeatCommand`
- a shared minion runtime/context that binds storage and `MasterProxy`
- wire-status mapping from storage/validation failures to response messages
- runnable minion executable wiring UDP socket intake, framework dispatch, storage, runtime, and commands

### Dependencies

- shared serialization
- minion concrete commands

### Done Criteria

- a minion can receive a read/write command from the master
- the minion can access the correct local backing region
- the minion can return status and requested payload correctly

### Implementation Note

The current implementation includes:

- `MinionStorageBackend` for fixed-size local backing-file I/O
- strict range validation for reads and writes against configured capacity
- `ReadCommand`, `WriteCommand`, and `FlushCommand` registered against the existing wire-derived command keys
- `HeartbeatCommand` registered against the existing wire-derived command key
- `MinionRuntime` as the shared access point for storage and response sending
- `MasterProxy` response integration for `READ_RESP`, `WRITE_RESP`, and `FLUSH_RESP`
- `MasterProxy` response integration for `HEARTBEAT_RESP`
- `build/minion` as a runnable minion process
- tests covering backing-file creation, reopen behavior, size mismatch rejection, bounds enforcement, command-to-response flow, heartbeat acknowledgments, and minion smoke execution

### Deferred

- region ownership tables and primary/mirror-specific local mapping
- multi-file storage layouts
- degraded success semantics on the minion side

## Milestone 6: Master-Side Minion Transport Client

### Goal

Implement the first master-side transport component that can send concrete requests to a configured minion and receive validated response datagrams.

### Status

Implemented.

### Outputs

- master-side `IMinionProxy` abstraction matching the concrete diagram vocabulary
- UDP-backed `MinionProxy` implementation for one configured minion endpoint
- async request send methods for read, write, flush, and heartbeat
- response receive method that validates wire messages and filters invalid or unexpected datagrams
- request `UUID` fallback behavior that supports localhost-only and offline environments

### Dependencies

- shared serialization and command envelope
- runnable minion process

### Done Criteria

- the master side can send `READ_REQ`, `WRITE_REQ`, `FLUSH_REQ`, and `HEARTBEAT_REQ`
- the master side can receive `READ_RESP`, `WRITE_RESP`, `FLUSH_RESP`, and `HEARTBEAT_RESP`
- responses from unexpected endpoints are rejected
- malformed datagrams and request-side datagrams are rejected without crashing the caller
- the new transport works against `build/minion` in an integration-style test

### Implementation Note

The current implementation includes:

- `concrete/master/include/transport/IMinionProxy.hpp`
- `concrete/master/include/transport/MinionProxy.hpp`
- `concrete/master/src/MinionProxy.cpp`
- `concrete/master/test/MinionProxyTest.cpp`
- Makefile integration for master concrete sources and tests
- `UUID::ResolveIPAddress()` now prefers non-loopback IPv4, falls back to loopback IPv4, then falls back to `0.0.0.0`

### Deferred

- response correlation across multiple in-flight requests
- multi-minion routing
- retries, resend policy, and timeout ownership
- master runtime ownership of sockets and proxy lifecycle

## Milestone 7: Master Response Correlation

### Goal

Track in-flight master requests by request ID and complete storage operations when the required minion responses arrive.

### Status

Implemented.

### Outputs

- `ResponseManager` for request registration, response matching, and completion status
- timeout handling for missing responses
- response validation at the operation level, not only at the wire-message level
- completion callback support for the future `NBDProxy` reply path
- reactor-facing minion response input proxy that feeds responses into `ResponseManager`

### Dependencies

- master-side minion transport client
- shared request IDs

### Done Criteria

- the master can register a pending operation before sending to a minion
- incoming responses can be matched to pending operations by `UUID`
- completed, failed, and timed-out operations are distinguishable
- terminal responses invoke the registered completion callback once
- UDP responses can enter through the framework `Reactor` without creating a thread-pool command task

### Implementation Note

The current implementation includes:

- `concrete/master/include/response/ResponseManager.hpp`
- `concrete/master/src/ResponseManager.cpp`
- `concrete/master/test/ResponseManagerTest.cpp`
- `concrete/master/include/transport/MinionResponseProxy.hpp`
- `concrete/master/src/MinionResponseProxy.cpp`
- `concrete/master/test/MinionResponseProxyTest.cpp`
- thread-safe request registration by `UUID`
- expected response-type validation per registered operation
- response state transitions to `COMPLETED`, `FAILED`, or `TIMED_OUT`
- `ResponseCompletion` and `CompletionCallback` for NBD-facing completion integration
- blocking wait support through `WaitForResponse()`
- cleanup through `RemoveRequest()`
- `UUID` ordering support so request IDs can be used directly as map keys
- `MinionResponseProxy::GetTask()` reads and validates response datagrams, calls `ResponseManager::HandleResponse()`, and returns `nullptr`

### Deferred

- aggregating multiple minion responses for mirrored writes
- retry/resend ownership
- higher-level operation policy for degraded success
- actual `NBDProxy` completion/reply implementation

## Milestone 8: Static Single-Minion Master Command Slice

### Goal

Create the first master-side storage orchestration without real NBD or RAID01.

### Status

Implemented.

### Outputs

- minimal master runtime/context for commands
- `RAIDManager` v0 with single-minion/static placement
- master `ReadCommand`, `WriteCommand`, and `FlushCommand`
- master commands routing through `RAIDManager` instead of directly hardcoding a minion
- `RAIDManager` v0 returning one configured `MinionProxy` target for read/write/flush
- synthetic input/test path that exercises master command execution through the framework

### Dependencies

- master-side minion transport client
- response correlation
- static node configuration

### Done Criteria

- a synthetic master write command reaches one minion and receives `WRITE_RESP`
- a synthetic master read command receives the payload previously written to the minion
- a synthetic master flush command receives `FLUSH_RESP`
- master commands use `RAIDManager` as the placement boundary even though v0 only has one target
- the flow uses the existing framework dispatch path

### Implementation Note

The current implementation includes:

- `concrete/master/include/runtime/MasterRuntime.hpp`
- `concrete/master/src/MasterRuntime.cpp`
- `concrete/master/include/placement/RAIDManager.hpp`
- `concrete/master/src/RAIDManager.cpp`
- `concrete/master/include/commands/MasterCommands.hpp`
- `concrete/master/src/MasterCommands.cpp`
- `concrete/master/test/MasterCommandsTest.cpp`
- request registration through `ResponseManager` before minion sends
- send-failure completion through the same response completion model
- synthetic framework input coverage for write/read/flush against `build/minion`

### Deferred

- reusable non-test simulation harness
- multi-minion placement
- mirrored response aggregation
- actual `NBDProxy` request intake and completion replies

## Milestone 9: Single-Machine End-to-End Simulation Without NBD

### Goal

Run one master-side synthetic driver plus one or more real minion processes over UDP.

### Status

Implemented.

### Outputs

- reusable simulation/demo harness outside the unit test binary
- static master configuration for one minion first
- clear startup and shutdown ownership for master-side sockets and minion process
- write/read/flush scenario using the same framework command path as tests

### Dependencies

- static single-minion master command slice
- runnable minion process
- response correlation

### Done Criteria

- the simulation can be run repeatably by a developer
- requests route through master commands and `RAIDManager` v0
- responses correlate through `ResponseManager`
- minion storage persists data during the run
- write/read/flush round trips complete without `NBD`

### Implementation Note

The current implementation includes:

- `build/master_sim` as the reusable master-side simulation process
- `scripts/run_minion.sh` for starting a standalone minion process
- `scripts/run_master_sim.sh` for running the master simulation against an existing minion
- `scripts/run_single_machine_sim.sh` as the one-shot combined demo
- default demo artifacts under `build/simulation`
- visible backing-file byte inspection after the demo write/read/flush scenario

### Deferred

- normal mounted-folder semantics through `NBD`
- multi-minion simulation
- metadata-backed configuration

## Milestone 10: Master Metadata, Node Identity, and Stable Membership

### Goal

Give the master authoritative control over placement and cluster topology.

### Status

Implemented for v1 in-memory static metadata.

### Outputs

- master metadata registry
- stable minion IDs supplied by caller/config
- master-assigned node ordering for current process lifetime
- configured minion capacity
- health and active/inactive node state
- simple primary ownership data for single-minion routing

### Dependencies

- minion identity model
- concrete command transport
- static single-minion master command slice

### Done Criteria

- the master can register minion nodes with stable IDs, capacity, health, and transport proxy
- `RAIDManager` v0 resolves its target through `MasterMetadata`
- `RAIDManager` v0 validates logical ranges against configured metadata capacity
- the single-machine simulation still passes with metadata-backed placement

### Implementation Note

The current implementation includes:

- `concrete/master/include/metadata/MasterMetadata.hpp`
- `concrete/master/src/MasterMetadata.cpp`
- `concrete/master/test/MasterMetadataTest.cpp`
- `RAIDManager` construction from `MasterMetadata`
- compatibility construction of `RAIDManager` from a single `IMinionProxy`
- metadata-backed master simulation setup in `build/master_sim`

### Deferred

- persistent metadata storage across master restarts
- persistent master-assigned ring order
- out-of-sync replica tracking
- multi-minion ownership metadata

## Milestone 11: RAIDManager v1: RAID01 Placement

### Goal

Extend the `RAIDManager` v0 object into the concrete placement component shown in `Master.png`.

### Outputs

- preserved single-minion fallback mode from `RAIDManager` v0
- striped primary ownership
- fixed next-node mirror partner mapping in a ring/cycle
- logical offset to primary and mirror target resolution
- cross-stripe request splitting into placement segments
- exposed capacity based on primary space only
- `1-minion` logical fallback mode with no actual redundancy

### Dependencies

- stable node ordering
- master metadata

### Done Criteria

- logical offsets can be resolved into primary and mirror locations
- the layout remains stable unless membership changes
- topology changes do not silently trigger automatic rebalance

### Implementation Note

RAIDManager v1 is implemented as a placement-only milestone. It exposes
primary/mirror placement segments, splits cross-stripe requests, uses
next-node mirror mapping, preserves single-minion fallback compatibility, and
now feeds mirrored write dispatch and response aggregation in the master.

## Milestone 12: Degraded-Mode v1

### Goal

Add policy handling for missing replicas before adding real discovery/recovery.

### Status

Implemented for v1 coarse degraded policy.

### Outputs

- read failover to mirror
- write success with warning when policy allows
- out-of-sync tracking in metadata
- degraded response propagation where appropriate

### Dependencies

- placement model
- master metadata

### Done Criteria

- the master can continue when a replica is unavailable and policy allows it
- reads prefer primary owner and fail over to mirror when needed
- writes mark missing replicas out-of-sync
- affected completions expose degraded state

### Implementation Note

The current implementation keeps degraded-mode policy on the master side.
`RAIDManager` now exposes target activity and health state so master commands
can choose a viable replica instead of failing immediately on an inactive
primary. `MasterMetadata` tracks node-level out-of-sync state, and
`MasterRuntime` upgrades affected successful completions to `DEGRADED_OK` with
`FLAG_DEGRADED`.

Covered v1 behavior includes:

- read failover from inactive primary to active mirror
- write success when the configured primary or mirror is unavailable but at
  least one replica target remains active
- marking unavailable replica nodes out-of-sync
- degraded completion propagation through the existing response-correlation
  callback path

### Deferred

- block-range-level out-of-sync tracking
- richer degraded policy beyond the current coarse request-level handling
- automatic recovery/resync after a stale node returns

## Milestone 13: Real NBD Integration on the Master

### Goal

Replace synthetic master input with actual `NBD` request intake.

### Status

Implemented.

### Outputs

- master-side `NBDProxy`
- conversion from block-device read/write/flush requests into concrete framework tasks
- completion path from `ResponseManager` callbacks back to `NBD`
- mounted-drive single-machine demo path

### Dependencies

- non-NBD distributed path
- response completion callbacks
- master command slice

### Done Criteria

- writing through the mounted drive reaches the master
- the master routes storage work to minions
- data can be read back through the mounted drive path
- request completion is not test-only

### Implementation Note

The current implementation includes:

- `concrete/master/include/nbd/NBDCommunicator.hpp`
- `concrete/master/src/NBDCommunicator.cpp`
- `concrete/master/include/nbd/NBDProxy.hpp`
- `concrete/master/src/NBDProxy.cpp`
- `concrete/master/app/MasterNBDMain.cpp`
- `build/master_nbd`
- `scripts/setup_nbd.sh`
- `scripts/run_master_nbd.sh`
- `scripts/run_single_machine_nbd.sh`
- `docs/current/nbd-step13-demo.md`

`NBDCommunicator` owns the Linux `NBD` socketpair/ioctl boundary and translates
kernel requests/replies. `NBDProxy` owns framework conversion and reply
correlation from `MasterRuntime`/`ResponseManager` completions. The master NBD
runtime registers both the `NBD` fd and minion-response UDP fd with the
existing `Framework` reactor, so mounted-drive requests use the same command
path as the non-NBD simulation.

Non-root tests cover request decoding, reply encoding, task conversion,
unsupported request handling, and completion-to-reply behavior.

### Deferred

- privileged host setup automation beyond explicit scripts
- persistent topology/configuration for `build/master_nbd`
- recovery/resync and rebalance workflows

## Milestone 14: Persistent Metadata

### Goal

Make master state survive restart.

### Outputs

- persisted minion IDs
- persisted topology/order
- persisted out-of-sync state
- persisted placement-related metadata

### Dependencies

- master metadata v1
- placement model

### Done Criteria

- the master can restart without changing placement for known nodes
- degraded/recovery state can survive process restart
- metadata writes have a defined durability boundary

## Milestone 15: Discovery and Health Reporting

### Goal

Move from static/manual cluster setup to discovery plus periodic health state updates.

### Outputs

- minion discovery path
- heartbeat/watchdog-driven health state updates
- transition rules for healthy/degraded/offline nodes
- operator-visible health summary

### Dependencies

- stable node identity
- persistent metadata
- heartbeat transport

### Done Criteria

- the master can discover or re-confirm configured minions
- health state changes drive placement/degraded policy
- stale nodes are visible to operators

## Milestone 16: Recovery / Resync

### Goal

Repair stale or missing replicas after a minion returns.

### Outputs

- healthy rejoin flow
- block-level resync mechanism
- out-of-sync tracking cleared after successful repair

### Dependencies

- degraded-write tracking
- node health
- persistent metadata

### Done Criteria

- a returning minion can be identified and reattached
- missing block ranges can be repaired from healthy copies
- the cluster can return from degraded to healthy state without full manual data reconstruction

## Milestone 17: Rebalance and Operator Control Plane

### Goal

Provide deliberate administrative control over recovery and topology-change actions.

### Outputs

- CLI-based admin commands
- health and status inspection
- recovery trigger commands
- explicit rebalance command path

### Dependencies

- health state model
- persistent metadata
- recovery/resync

### Done Criteria

- operators can inspect coarse system state
- operators can trigger recovery and rebalance explicitly
- rebalance is not performed automatically

## Milestone 18: Demo and Presentation Readiness

### Goal

Package the project so it can be demonstrated clearly and defended in an interview or review setting.

### Outputs

- repeatable demo flow
- updated diagrams
- architecture explanation aligned with the docs
- project story that cleanly distinguishes framework and concrete storage system

### Dependencies

- at least one stable end-to-end `NBD` demo

### Done Criteria

- the team can explain the framework and the storage system separately
- the demo can show healthy flow and degraded behavior
- the presentation material stays consistent with the engineering docs

## Cross-Cutting Rules

- Keep the framework generic and reusable.
- Keep serialization as a concrete-project shared utility that could later be extracted.
- Treat file and directory semantics as above the project boundary.
- Expose coarse health state upward: `healthy`, `degraded`, `recovery-in-progress`, `rebalance-required`.
- Keep detailed topology and low-level repair state in logs, admin output, or telemetry rather than in the user-facing mounted-drive contract.
