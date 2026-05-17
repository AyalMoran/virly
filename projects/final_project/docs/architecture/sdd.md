# Software Design Description
## For Final Project Distributed Drive

Version 0.1  
Prepared by Ayal Moran  
Infinity Labs  
2026-04-14

## Table of Contents
<!-- TOC -->
* [1. Introduction](#1-introduction)
  * [1.1 Document Purpose](#11-document-purpose)
  * [1.2 Subject Scope](#12-subject-scope)
  * [1.3 Definitions, Acronyms, and Abbreviations](#13-definitions-acronyms-and-abbreviations)
  * [1.4 References](#14-references)
  * [1.5 Document Overview](#15-document-overview)
* [2. Design Overview](#2-design-overview)
  * [2.1 Stakeholder Concerns](#21-stakeholder-concerns)
  * [2.2 Selected Viewpoints](#22-selected-viewpoints)
* [3. Design Views](#3-design-views)
* [4. Decisions](#4-decisions)
* [5. Appendixes](#5-appendixes)
<!-- TOC -->

## Revision History

| Name | Date | Reason For Changes | Version |
|------|------|--------------------|---------|
| Ayal Moran | 2026-04-14 | Initial first draft | 0.1 |

## 1. Introduction

### 1.1 Document Purpose

This Software Design Description captures the current architecture of the final project and the agreed target architecture where the implementation is not complete yet. Its primary audience is developers, maintainers, and reviewers who need one document that explains system boundaries, core components, runtime flows, and major design decisions. It is also intended to support future implementation work by clearly separating implemented baseline behavior from planned extensions.

### 1.2 Subject Scope

The subject of this SDD is a private distributed drive implemented as a replicated block-storage backend exposed through Linux `NBD`. The system is built on top of a reusable command-processing framework and currently includes framework runtime infrastructure, a concrete master/minion protocol, local minion backing storage, and master-side request routing/orchestration. This document covers both the implemented baseline and the intended target system that adds persistent metadata, richer recovery, and fuller operational workflows. Linux filesystem semantics above `NBD` are outside the system boundary.

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|------|------------|
| API | Application Programming Interface |
| Command | Executable logic selected by task key inside the framework |
| Concrete Project | The distributed storage system built on top of the generic framework |
| DEGRADED_OK | Response outcome indicating successful completion under degraded replica conditions |
| Framework | The reusable runtime layer under `framework/` |
| Master | The coordinating process that owns placement, routing, and metadata decisions |
| Minion | A storage-bearing device or process managed by the master |
| NBD | Network Block Device, used to expose backend storage as a Linux block device |
| Plugin | A runtime-loaded shared object that registers or overrides commands |
| RAID01 | The current mirrored striped placement model used by the project |
| SDD | Software Design Description |
| Task | A unit of work passed through framework dispatch and command execution |
| UUID | Wire-stable request identifier used for response correlation |

### 1.4 References

| Reference | Owner | Version/Date | Type | Location |
|-----------|-------|--------------|------|----------|
| SDD Template | Infinity Labs | 2026-04-14 | Informative | `/home/moranayal/vaults/InfinityLabs/Projects/sdd-template.md` |
| Final Project System Overview | Repo | current | Normative | `docs/architecture/system-overview.md` |
| Framework Architecture | Repo | current | Normative | `docs/architecture/framework-architecture.md` |
| Final Project Roadmap | Repo | current | Informative | `docs/architecture/roadmap.md` |
| End-to-End Write Path | Repo | current | Informative | `docs/flows/write-path.md` |
| Project Presentation Notes | Repo | current | Informative | `docs/presentation/project-presentation.md` |

### 1.5 Document Overview

Section 2 explains the architectural concerns that shaped this document and identifies the viewpoints used in this first draft. Section 3 contains the main design views, each tagged with an explicit implementation status so readers can distinguish implemented behavior from target design. Section 4 records major architecture decisions already visible in the repository and surrounding documentation. Section 5 contains supporting tables for terminology, current-versus-target comparisons, and deferred viewpoints.

## 2. Design Overview

### 2.1 Stakeholder Concerns

| Stakeholder | Main Concerns | Addressed By |
|-------------|---------------|--------------|
| Developers | Component boundaries, runtime flow, abstractions, extension points | Composition, Logical, Interface, Patterns |
| Maintainers | Change impact, debug flow, concurrency behavior, operational entrypoints | Interaction, Concurrency, Deployment |
| Operators / Demo Owners | What runs where, how requests flow, degraded behavior, system boundary | Context, Interaction, Deployment |
| Future Integrators | Wire contracts, process responsibilities, external interfaces | Interface, Information, Decisions |

### 2.2 Selected Viewpoints

This first SDD version focuses on the viewpoints that are already well-supported by the codebase and existing architecture documents.

#### 2.2.1 Context

Used to define the system boundary around the Linux filesystem, `NBD`, master, minions, and local backing files.

#### 2.2.2 Composition

Used to show how the reusable framework and the concrete distributed-storage modules are assembled into the current system.

#### 2.2.3 Logical

Used to explain the main stable abstractions and their responsibilities, especially at the framework/runtime boundaries.

#### 2.2.4 Interface

Used to document externally visible process, protocol, and registration boundaries between components and runtime roles.

#### 2.2.5 Interaction

Used to explain key runtime sequences such as request intake, minion execution, and response correlation.

#### 2.2.6 Information

Used to describe the main information structures handled by the system today and those planned as later extensions.

#### 2.2.7 Concurrency

Used to explain readiness-driven intake, thread-pool execution, delayed work scheduling, and synchronization implications.

#### 2.2.8 Patterns

Used to record the reusable architectural ideas that shape both framework and concrete layers.

#### 2.2.9 Deployment

Used to describe the current runnable demo topology and the target distributed deployment topology.

The template viewpoints `Physical`, `Structure`, `Dependency`, `Algorithm`, `State Dynamics`, and `Resources` are deferred in this draft. They are not omitted accidentally; they are postponed because the current repository truth is better captured through the viewpoints above.

## 3. Design Views

- ID: `V-001-context`
- Title: System Context and Boundary
- Viewpoint: Context
- Status: Mixed (`Implemented` boundary, `Target design` environment)
- Representation:
  The system is a replicated block-storage backend that sits below the Linux filesystem and above local minion backing files.

  `user -> Linux filesystem -> NBD device -> Master -> Minions -> local backing files`

  The project owns block placement, replica management, request routing, health state, and recovery policy. The Linux filesystem remains responsible for directories, filenames, and user-visible file semantics. The master is the coordination boundary; minions are storage-bearing execution nodes.
- More Information: `docs/architecture/system-overview.md`

- ID: `V-002-composition`
- Title: Framework and Concrete System Composition
- Viewpoint: Composition
- Status: `Implemented but limited`
- Representation:
  The system is composed of two major layers:

  1. `framework/`
     Reusable runtime services including `Reactor`, `InputMediator`, `ThreadPool`, `FrameworkTask`, scheduler support, plugin loading, and command factory registration.
  2. `concrete/`
     Distributed-drive-specific logic split into:
     - `concrete/common`: serialization, wire types, `UUID`, task model
     - `concrete/master`: placement, metadata, response correlation, minion transport, `NBD` entrypoints
     - `concrete/minion`: master-facing transport proxy, local storage backend, minion commands and runtime

  This composition is already implemented enough to run minion processes, master simulation, and static-topology `NBD` demos, but it does not yet include persistent metadata, discovery, recovery, or rebalance.
- More Information: `docs/architecture/system-overview.md`, `docs/architecture/framework-architecture.md`

- ID: `V-003-logical`
- Title: Core Logical Elements
- Viewpoint: Logical
- Status: `Implemented but limited`
- Representation:
  The key logical elements are:

  - `Framework`: owns runtime wiring, proxy registration, plugin monitoring, and shutdown control
  - `Reactor`: single-threaded readiness loop over registered `(mode, fd)` callbacks
  - `IInputProxy`: translates ready file descriptors into framework tasks or inline side effects
  - `ITask` / `IKeyTask`: minimal dispatch contract for command selection
  - `ICommand`: executable behavior selected by task key
  - `FrameworkTask`: adapts framework tasks into thread-pool work items
  - `MasterRuntime`: aggregates child completions into one logical completion for master-side storage operations
  - `ResponseManager`: correlates minion responses by `UUID`
  - `MasterMetadata`: in-memory registry for configured minion state
  - `RAIDManager`: resolves logical ranges into primary and mirror placement segments
  - `MinionProxy`: outbound master-side transport to minion endpoints
  - `MinionResponseProxy`: inbound master-side response intake and validation boundary
  - `MasterProxy`: minion-side inbound request intake and outbound response sender
  - `MinionRuntime`: binds local storage and transport response sending on the minion
  - `MinionStorageBackend`: bounded local backing-file I/O

  The logical model is stable enough for the current implementation, but metadata persistence, ownership mapping, and richer recovery state are still target-state additions.
- More Information: `framework/include/Framework.hpp`, `docs/architecture/framework-architecture.md`

- ID: `V-004-interface`
- Title: Interfaces and Contracts
- Viewpoint: Interface
- Status: Mixed (`Implemented` interfaces, `Target design` extensions)
- Representation:
  Main external and subsystem interfaces:

  - Process entrypoints:
    - `build/minion` from `concrete/minion/app/MinionMain.cpp`
    - `build/master_nbd` from `concrete/master/app/MasterNBDMain.cpp`
    - `build/master_sim` from `concrete/master/app/MasterSimMain.cpp`
  - Framework interfaces:
    - `IInputProxy::GetTask(int fd)`
    - `ICommand::Execute(SharedPtr<ITask>)`
  - Wire contract:
    - versioned `MessageHeaderV1`
    - request/response envelopes for read, write, flush, and heartbeat
    - `UUID` request correlation
  - Placement interface:
    - logical ranges mapped to primary and optional mirror placement segments
  - `NBD` boundary:
    - the master-side `NBDProxy` path is the block-operation ingress for mounted-drive access

  The wire contract is already shared by master and minion. Checksums, richer versioning policy, discovery contracts, and recovery-control interfaces remain deferred.
- More Information: `concrete/common/include/wire/WireProtocol.hpp`, `concrete/master/app/MasterNBDMain.cpp`, `concrete/minion/app/MinionMain.cpp`

- ID: `V-005-interaction`
- Title: End-to-End Storage Interaction
- Viewpoint: Interaction
- Status: `Implemented but limited`
- Representation:
  Representative write path:

  1. Linux filesystem emits block operations to the `NBD` device.
  2. Master-side `NBD` integration converts the block operation into a concrete task.
  3. Framework runtime dispatches the task through `Reactor -> InputMediator -> ThreadPool -> command`.
  4. Master command logic asks `RAIDManager` and metadata which minion targets should serve the operation.
  5. `MinionProxy` sends `WRITE_REQ` datagrams to one or more minions.
  6. On the minion, `MasterProxy` validates and converts the request into a task.
  7. Minion commands execute against `MinionStorageBackend`.
  8. The minion sends a response datagram back to the master.
  9. `MinionResponseProxy` validates the response and forwards it to `ResponseManager`.
  10. `ResponseManager` and `MasterRuntime` resolve logical completion, including degraded outcomes where policy allows them.

  Single-minion mode writes only to one target. RAID01 mode fans writes out to primary and mirror targets and may split one logical request across stripes.
- More Information: `docs/flows/write-path.md`

- ID: `V-006-concurrency`
- Title: Concurrency Model
- Viewpoint: Concurrency
- Status: `Implemented`
- Representation:
  The current concurrency model is layered:

  - `Reactor` performs readiness detection in a single-threaded callback loop
  - `InputMediator` converts ready inputs into asynchronous work items
  - `ThreadPool` executes commands concurrently
  - optional delayed work is expressed through `PostTaskParams`, `AsyncInjection`, and `Scheduler`

  Important current properties:

  - callback order for multiple ready descriptors is not guaranteed
  - transport intake is decoupled from command execution
  - response correlation relies on request `UUID`
  - degraded completion policy depends on correct aggregation of concurrent child responses

  This model already supports concurrent master/minion processing, but later recovery and persistence flows may require additional synchronization rules.
- More Information: `docs/architecture/framework-architecture.md`

- ID: `V-007-information`
- Title: Information Model
- Viewpoint: Information
- Status: Mixed (`Implemented` v1 model, `Target design` extensions)
- Representation:
  Main information handled by the system today:

  - `UUID` request identifiers
  - `MessageHeaderV1` and request/response envelope fields
  - logical offset, operation length, and payload bytes
  - configured minion identity, endpoint, capacity, health, active state, and primary ownership
  - node-level out-of-sync state for degraded-mode v1

  Information planned for later versions:

  - persistent metadata storage
  - block-range-level out-of-sync tracking
  - recovery progress state
  - richer topology and lifecycle metadata

  The current minion backing store is a fixed-size file with direct logical-offset access. It does not yet implement per-region ownership tables or separate primary/mirror physical layouts.
- More Information: `docs/architecture/system-overview.md`

- ID: `V-008-patterns`
- Title: Applied Architectural Patterns
- Viewpoint: Patterns
- Status: `Implemented`
- Representation:
  The design currently applies these patterns:

  - Reactor: In general, the Reactor pattern waits for readiness events on multiple input sources and dispatches the matching handlers, solving the problem of managing many blocking I/O sources without dedicating one thread per source. In this project, `Reactor` monitors sockets, pipes, and other file descriptors, then invokes the relevant proxy callback when input is ready.
  - Command: In general, the Command pattern encapsulates executable behavior as objects selected at runtime, solving the problem of decoupling request intake from the logic that handles the request. In this project, concrete read, write, flush, and heartbeat operations are implemented as commands selected by task keys.
  - Factory: In general, the Factory pattern centralizes object creation behind a stable creation interface, solving the problem of constructing the right concrete type without hard-coding it at the call site. In this project, the framework creates command instances from dispatch keys registered by the concrete layer or plugins.
  - Mediator: In general, the Mediator pattern centralizes communication between cooperating objects, solving the problem of tight coupling when each object would otherwise need to know about all the others. In this project, `InputMediator` connects `Reactor`, `IInputProxy`, and `ThreadPool` by receiving readiness callbacks, asking the relevant proxy for a task, and submitting that task for asynchronous execution.
  - Proxy: In general, the Proxy pattern places an adapter object in front of another subsystem or remote endpoint, solving the problem of isolating callers from transport, validation, and protocol details. In this project, master-side and minion-side proxies adapt UDP datagrams into framework tasks or response-handling callbacks.
  - Plugin extension: In general, plugin extension loads behavior dynamically so the system can be extended or overridden without rebuilding the core executable, solving the problem of late-bound customization. In this project, runtime-loaded shared objects can register or replace commands in the framework command registry.
  - Scheduler-based delayed task injection: In general, delayed task injection schedules work to run later rather than immediately, solving retry, timeout, and polling needs without blocking the current command. In this project, commands can return `PostTaskParams`, which are converted into scheduled `AsyncInjection` work through the framework scheduler.

  These patterns are not presentation-only terminology; they are directly visible in the code and determine the project’s extensibility model.
- More Information: `docs/architecture/framework-architecture.md`

- ID: `V-009-deployment`
- Title: Deployment Topology
- Viewpoint: Deployment
- Status: Mixed (`Implemented` demo deployment, `Target design` distributed deployment)
- Representation:
  Current runnable deployment:

  - one master process on Linux
  - one or more minion processes
  - UDP communication between master and minions
  - local backing files on minion hosts
  - optional mounted `NBD` device on the master host for demo usage

  Target deployment:

  - one master as the coordination node
  - multiple physically distinct minion devices such as Raspberry Pi or other hosts
  - the same logical storage protocol across networked nodes
  - operator-driven recovery and rebalance workflows

  The current code assumes static topology passed through command-line configuration rather than discovery or persistent cluster membership.
- More Information: `concrete/master/app/MasterNBDMain.cpp`, `concrete/minion/app/MinionMain.cpp`

## 4. Decisions

| ID | Decision | Status |
|----|----------|--------|
| D-001 | The system is a block-storage backend, not a replicated file-object store. | Accepted |
| D-002 | Linux filesystem semantics are outside project scope; `NBD` is the user-facing integration boundary. | Accepted |
| D-003 | The reusable framework remains separate from concrete distributed-storage logic. | Accepted |
| D-004 | Master and minion communicate through a shared versioned wire contract with stable request IDs. | Accepted |
| D-005 | The current placement model is fixed `RAID01`-style primary plus mirror routing with single-minion fallback. | Accepted |
| D-006 | Degraded-mode success is allowed in limited scenarios when topology and policy permit it. | Accepted |
| D-007 | Metadata is currently in-memory and static; persistence and richer lifecycle control are deferred. | Accepted |
| D-008 | Plugins extend behavior by runtime loading shared objects into the framework command system. | Accepted |
| D-009 | Current deployment uses UDP datagrams and bounded block-oriented requests instead of whole-file transfer semantics. | Accepted |

## 5. Appendixes

### 5.1 Current State vs Target State

| Area | Current State | Target State |
|------|---------------|--------------|
| Framework runtime | Implemented | Reused by master and minion |
| Concrete wire protocol | Implemented for storage and heartbeat messages | Extended cautiously as protocol needs grow |
| Master metadata | In-memory static registry | Persistent topology and storage metadata |
| Placement | RAID01 v1 plus single-minion fallback | Recovery-aware placement and rebalance integration |
| Degraded mode | Read failover and missing-replica write success in limited scenarios | Richer recovery and resynchronization behavior |
| Minion storage layout | One fixed-capacity backing file with direct offset access | Ownership-aware, RAID-aware local layout |
| Deployment | Static command-line topology | Multi-device operational deployment |
| Recovery / rebalance | Planned | Operator-controlled and block-level |

### 5.2 Deferred Viewpoints

| Viewpoint | Reason Deferred |
|-----------|-----------------|
| Physical | The repo currently describes process and network topology better than hardware topology. |
| Structure | Internal part/port modeling would mostly repeat the existing composition and logical views at this stage. |
| Dependency | Build-time and package dependency mapping is not yet the main architectural risk area. |
| Algorithm | Specific algorithms such as placement and recovery deserve their own later focused documentation once they stabilize further. |
| State Dynamics | Stateful recovery and lifecycle behavior is not fully implemented yet. |
| Resources | Resource budgeting is important but not yet documented at a level that would be more accurate than speculation. |

### 5.3 Terminology Notes

- `Implemented`: present in the current repository and runnable or testable now.
- `Implemented but limited`: present in code, but intentionally narrower than the final intended design.
- `Target design`: agreed direction not yet fully implemented.
- `Mixed`: the view describes both current baseline truth and target-state extensions, and each part is labeled accordingly.
