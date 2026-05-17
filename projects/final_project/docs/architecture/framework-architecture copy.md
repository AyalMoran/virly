# Framework Architecture

## Purpose

This document explains the framework that is already implemented in the repository and how it is intended to support the concrete distributed-drive project.

The framework is generic. The storage system is one concrete use case built on top of it.

## Implemented Runtime Flow

The current runtime flow is:

`fd/input -> Reactor callback -> InputMediator::OnInputReady -> IInputProxy::GetTask -> ThreadPool task -> FrameworkTask -> command factory -> ICommand::Execute`

This flow is already implemented in the framework code and demonstrated by the framework demo.

## Core Interfaces

### `IKeyTask`

Provides the factory key used to choose the command implementation.

### `ITask`

Represents a framework task. It extends `IKeyTask` and is the object passed into command execution.

### `IInputProxy`

Owns the translation from input readiness into framework tasks.

Current contract:

- `ITask* GetTask(int fd)`

The proxy reads from the input source, interprets the data, and returns a concrete task object.

### `ICommand`

Represents command execution logic selected by task key.

Current contract:

- `Execute(SharedPtr<ITask> task)`

Commands may optionally return delayed-response parameters that schedule later asynchronous work.

## Main Flow by Component

### Reactor

The framework uses a single-threaded `Reactor` to monitor file descriptors and invoke callbacks when input is ready.

This keeps the input side simple and deterministic.

### InputMediator

`InputMediator` registers framework callbacks into the reactor.
When an input event arrives:

- it locates the relevant `IInputProxy`
- asks the proxy to build a concrete `ITask`
- wraps that task in a framework thread-pool task
- submits it to the global `ThreadPool`

`InputMediator` is the bridge from low-level input readiness to asynchronous command execution.

### ThreadPool

The framework uses `ThreadPool` for actual command processing work.

This gives the project:

- asynchronous handling
- fixed-size worker execution
- separation between input intake and command processing

For the concrete project, this is especially important because the master can keep input intake single-threaded while still processing reads, writes, health events, and admin actions concurrently.

### FrameworkTask

`FrameworkTask` is the adapter between a generic framework task and command execution.

Its responsibilities are:

- inspect the task key
- create the matching command from the factory
- execute the command
- optionally trigger delayed asynchronous work

## Command Factory and Plugin Model

The framework keeps a command factory keyed by integer task keys.

It supports:

- static command registration at startup
- runtime registration from plugins
- command replacement by registering an updated implementation

### Plugin Flow

The framework can monitor a plugins directory and load shared objects at runtime.
In its current form, the framework loads existing plugin files at startup and also loads newly added shared objects while running.
When a plugin is loaded, it can register or override command creators.

This is already demonstrated by the test plugin that replaces the print command during framework demo execution.

This plugin mechanism is part of the framework itself, not specific to storage.

## Current Demo Proof Points

The current framework demo proves:

- input readiness can be converted into concrete tasks
- tasks can be dispatched into the thread pool
- command selection is key-based
- commands execute through the framework flow
- runtime plugin loading can replace command behavior

The demo `NBDProxy` is still a stub-style proxy used to prove the framework shape.
It should be treated as a framework demonstration aid, not as the finished storage-side `NBD` implementation.

## Reuse in the Final Project

Both `Master` and `Minion` should reuse the same core framework.

They differ in concrete behavior, not in the framework skeleton:

- the master will use concrete commands for metadata, routing, read/write orchestration, health tracking, and admin control
- a minion will use concrete commands for local storage access and request handling
- both sides can use the same task intake, command dispatch, thread-pool execution, and plugin structure

## Concrete Project Additions Above the Framework

The framework does not define the distributed storage protocol.
The concrete project still must add or complete:

- full master/minion networking lifecycle
- storage placement logic
- metadata ownership rules
- health and watchdog integration
- recovery and rebalance commands

These belong to the concrete project layer, not the generic framework API.

The first part of that concrete layer is now implemented under `concrete/common`, `concrete/minion`, and `concrete/master`:

- a shared serializer buffer utility
- a wire-stable request ID / `UUID`
- `MessageHeaderV1`
- storage and heartbeat message envelope types
- concrete framework task types keyed directly by wire request message type
- a task-construction layer that converts validated wire requests into concrete `ITask` objects
- a bidirectional minion-side `MasterProxy` that parses inbound UDP requests and serializes outbound UDP responses
- a fixed-capacity `MinionStorageBackend` for local backing-file reads, writes, and flushes
- a shared `MinionRuntime` that exposes storage plus reply transport to concrete commands
- concrete minion `ReadCommand`, `WriteCommand`, and `FlushCommand` implementations registered against the wire-derived command keys
- a master-side `IMinionProxy` abstraction and UDP-backed `MinionProxy` for outbound requests
- a master-side `ResponseManager` for request-ID correlation, terminal state tracking, timeout handling, and completion callbacks
- a master-side `MinionResponseProxy` that plugs minion UDP responses into the existing `Reactor -> InputMediator -> IInputProxy` intake model

That means the project now has a concrete message contract to build transport, proxies, and command payloads on top of.

The concrete framework bridge on the minion side is now:

`socket/fd input -> deserialize wire::MessageV1 -> BuildTaskFromWireMessage -> InputMediator -> ThreadPool -> concrete command -> MinionStorageBackend -> MasterProxy::Send*Response()`

`MasterProxy` is the first place where the concrete wire protocol feeds directly into the generic framework runtime, and it centralizes UDP response serialization so the concrete commands do not build wire messages themselves.

The minion commands currently use a shared runtime/context object to access storage and response transport.
That keeps the command interface aligned with the generic framework while avoiding per-command transport or storage ownership.

The concrete framework bridge on the master response side is now:

`socket/fd input -> Reactor readiness -> InputMediator -> MinionResponseProxy::GetTask(fd) -> deserialize wire::MessageV1 -> ResponseManager::HandleResponse() -> completion callback`

`MinionResponseProxy` intentionally returns `nullptr` from `GetTask()` after handling the datagram.
Minion responses are completions for existing operations, not new command tasks that should be queued into the thread pool.
This keeps the generic framework free of concrete minion-response logic while keeping `ResponseManager` focused on correlation instead of socket ownership.

## Concurrency Model

The intended model for the project is:

- single-threaded event intake via `Reactor`
- `InputMediator` used as the callback bridge
- write and other processing work handled through `ThreadPool`

This matches the current framework design and should remain the baseline architecture unless a later milestone proves a need to change it.

## Deferred Details

The framework architecture is stable enough to document now, but these concrete-project details remain intentionally deferred:

- exact transport binding and socket-level behavior
- checksum and integrity fields
- recovery generation/version metadata
- exact admin command syntax
- exact health-confirmation handshake between watchdog-based minions and the master
- controlled plugin update or reload semantics for modified and deleted plugin files
- actual production `NBDProxy` implementation and reply completion path
