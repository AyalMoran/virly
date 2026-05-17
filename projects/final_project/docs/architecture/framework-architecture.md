# Framework Architecture

## Purpose

This document describes the framework that is actually implemented under
`framework/`, based on the current code rather than on intended future shape.

The framework is the reusable runtime substrate for the concrete storage
project. Its job is to:

- wait for input readiness on file descriptors
- translate ready input into typed tasks
- dispatch those tasks asynchronously to commands
- support runtime command registration and plugin-based command override
- provide shared infrastructure such as thread execution, delayed task
  scheduling, logging, and thread-safe queues

The framework does not define the distributed storage protocol or storage
policy. Those live in `concrete/`.

## Actual Runtime Flow

The code currently implements this runtime path:

`fd readiness -> Reactor -> InputMediator -> IInputProxy::GetTask(fd) -> FrameworkTask -> ThreadPool -> CreateCommand(task key) -> ICommand::Execute(task)`

There is also one optional follow-up path after command execution:

`ICommand::Execute() returns PostTaskParams -> FrameworkTask creates AsyncInjection -> AsyncInjection schedules itself through Scheduler -> delayed action runs later`

This second path is the framework's built-in mechanism for retry-style or
polling-style delayed work.

## Core Interfaces

### `IKeyTask`

Defined in `framework/include/Framework.hpp`.

Role in the system:

- provides the integer dispatch key used to select a command implementation
- makes task routing independent of the concrete task type

What it does in code:

- declares one pure virtual method: `int GetKey() const`
- is the minimal contract required by the command factory path

The framework does not inspect concrete task fields. It only requires a key.

### `ITask`

Defined in `framework/include/Framework.hpp`.

Role in the system:

- represents a unit of work that can be executed by a framework command
- forms the common base type passed through the entire runtime path

What it does in code:

- extends `IKeyTask`
- adds no new methods of its own

In practice, concrete projects derive task classes from `ITask` and store
whatever request data they need there.

### `IInputProxy`

Defined in `framework/include/Framework.hpp`.

Role in the system:

- owns translation from "this fd became ready" into "here is a framework task"
- forms the boundary between low-level I/O and framework task dispatch

What it does in code:

- declares one pure virtual method: `ITask* GetTask(int fd)`
- is called by `InputMediator` when a watched `(mode, fd)` becomes ready
- may return `nullptr`, in which case no task is queued

The interface allows proxies to consume the input immediately and either:

- create a new task for asynchronous processing, or
- handle the event inline and return `nullptr`

The concrete `MinionResponseProxy` uses the second pattern.

### `ICommand`

Defined in `framework/include/Framework.hpp`.

Role in the system:

- encapsulates executable logic selected by task key
- keeps command behavior decoupled from input handling and threading

What it does in code:

- declares `Execute(SharedPtr<ITask> task)`
- returns `std::unique_ptr<PostTaskParams>`
- `PostTaskParams` contains:
  - `std::function<bool()> action`
  - `std::chrono::milliseconds time_interval`

If `Execute()` returns `nullptr`, command processing ends there.
If it returns `PostTaskParams`, the framework schedules repeated delayed
execution through `AsyncInjection`.

## Main Runtime Components

### `Framework`

Defined in `framework/include/Framework.hpp` and
`framework/src/Framework.cpp`.

Role in the system:

- owns the runtime wiring of the framework
- ties together command registration, input monitoring, plugin loading, and
  controlled shutdown

What it does in code:

- receives:
  - a map of `(mode, fd) -> IInputProxy`
  - a map of `command key -> CommandCreator`
  - an optional plugins directory path
- registers the provided command creators into a global command factory
- creates an internal stop pipe and registers its read end with the reactor
- asks `InputMediator` to register all input proxies into the reactor
- optionally creates a `DirMonitor` for the plugins directory
- subscribes only to "file added" events and attempts to load newly added
  shared objects
- on `Run()`:
  - loads existing `.so` files already present in the plugins directory
  - marks itself as the active framework in global runtime state
  - enters the reactor loop
- on `Stop()`:
  - sets an internal stop flag
  - writes one byte to the stop pipe
  - the stop-pipe callback removes itself and stops the reactor
- in the destructor:
  - calls `Stop()`
  - destroys plugin-monitoring infrastructure
  - closes stop-pipe file descriptors
  - stops the global `ThreadPool`

Important implementation detail:

- `Framework` is not itself the command registry. It only seeds a global
  factory through `RegisterCommandCreator()`.

### `InputMediator`

Defined in `framework/include/Framework.hpp` and
`framework/src/Framework.cpp`.

Role in the system:

- bridges the reactor and the thread pool
- centralizes the framework's "ready input becomes async work" policy

What it does in code:

- stores the proxy map given to `Framework`
- registers one reactor callback per `(mode, fd)` pair
- when a callback fires:
  - finds the matching `IInputProxy`
  - calls `GetTask(fd)`
  - wraps the returned raw pointer in `SharedPtr<ITask>`
  - if the pointer is non-null, creates a `FrameworkTask`
  - submits that task to the global `ThreadPool` at `UserPriority::MED`

It does not parse data, select commands, or own any transport logic.

### `FrameworkTask`

Defined in `framework/include/Framework.hpp` and
`framework/src/Framework.cpp`.

Role in the system:

- adapts a framework `ITask` into a thread-pool task
- is the handoff point between task ingestion and command execution

What it does in code:

- stores a `SharedPtr<ITask>`
- when executed by a worker thread:
  - calls `CreateCommand(m_task->GetKey())`
  - invokes the command's `Execute()`
  - if `Execute()` returns delayed work parameters, allocates
    `new AsyncInjection(...)`

`FrameworkTask` is the component that turns key-based task dispatch into actual
command execution.

### `Reactor`

Defined in `framework/include/Reactor.hpp` and `framework/src/Reactor.cpp`.

Role in the system:

- owns the single-threaded readiness event loop
- maps ready `(mode, fd)` pairs to callbacks

What it does in code:

- stores callbacks in an internal hash map keyed by `(mode, fd)`
- `AddFd()` validates input and adds or replaces the callback for that key
- `RemoveFd()` erases the callback
- `Run()`:
  - prevents re-entry with `m_isRunning`
  - repeatedly builds the current descriptor list
  - asks `IListener` for the ready descriptors
  - invokes the matching callbacks one by one
  - stops when `Stop()` was requested or when no callbacks remain
- `Stop()` sets `m_stopRequested = true`

Important behavior:

- callback order for multiple ready descriptors is not guaranteed
- callbacks may remove descriptors while the loop is running
- the reactor is purely callback-driven; it does not know about tasks or
  commands

### `IListener`

Defined in `framework/include/Reactor.hpp`.

Role in the system:

- abstracts the blocking system call used to wait on file descriptors

What it does in code:

- declares `Listen(const std::vector<ModeAndFd>& descriptors)`
- returns the ready subset of those descriptors

This keeps `Reactor` independent of a particular waiting primitive.

### `LinuxFdListener`

Defined in `framework/include/Reactor.hpp` and
`framework/src/Reactor.cpp`.

Role in the system:

- provides the Linux implementation of `IListener`

What it does in code:

- builds `fd_set`s for read and write descriptors
- uses `select()` to block until readiness
- retries on `EINTR`
- validates that modes and file descriptors are legal
- returns the exact `(mode, fd)` pairs that are ready

This is the current platform-specific readiness backend used by `Framework`.

## Command Registration and Creation

### `Factory<Base, Key, ...>`

Defined in `framework/include/Factory.hpp`.

Role in the system:

- provides generic key-to-creator registration
- is the underlying mechanism used for command dispatch

What it does in code:

- stores creator functions in an `unordered_map`
- supports `Add(key, creator)`
- supports `Create(key, args...)`
- throws `KeyNotFoundException` when no creator exists for the key

Inside the framework, this template is instantiated as a command factory:

- base type: `ICommand`
- key type: `int`

### `RegisterCommandCreator()` / `CreateCommand()`

Defined in `framework/include/Framework.hpp` and
`framework/src/Framework.cpp`.

Role in the system:

- expose the framework's global command-registry API

What they do in code:

- `RegisterCommandCreator(key, creator)`:
  - validates non-null creator
  - locks a global factory state
  - registers or replaces the creator for that key
- `CreateCommand(key)`:
  - locks the same factory state
  - returns a newly created command instance

Important behavior:

- command registration is global, not per-`Framework` instance
- later registration for the same key replaces the old one
- this replacement behavior is what enables plugin override

## Thread Execution Components

### `ThreadPool`

Defined in `framework/include/ThreadPool.hpp` and
`framework/src/ThreadPool.cpp`.

Role in the system:

- provides asynchronous worker-thread execution for framework tasks
- separates input readiness handling from command work

What it does in code:

- owns:
  - a waitable priority task queue
  - a vector of worker `std::jthread`s
  - a `ThreadMap` tracking whether each worker is still running
  - a `Pauser` used for coordinated pause/resume
- `AddTask()` pushes work into the queue if the pool still accepts tasks
- workers repeatedly:
  - pop the next task
  - stop if they receive a null task
  - request self-stop if they receive a kill task
  - otherwise execute the task and catch exceptions
- supports:
  - `Pause()`
  - `Resume()`
  - `SetNumThreads()`
  - graceful `Stop()`
  - immediate-ish `StopNow()`

Task ordering behavior:

- tasks are ordered first by priority, then by submission sequence number
- higher numeric priority wins
- equal-priority tasks preserve FIFO order via the sequence counter

### `ThreadPool::TaskWrapper`

Defined in `framework/include/ThreadPool.hpp`.

Role in the system:

- packages a thread-pool task together with scheduling metadata

What it does in code:

- stores:
  - `SharedPtr<ITPTask>`
  - `Priority`
  - sequence number
- exposes a numeric priority value for comparison

This is the unit actually stored in the internal priority queue.

### `ThreadPoolTasks`

Defined in `framework/include/ThreadPoolTasks.hpp` and
`framework/src/ThreadPoolTasks.cpp`.

Role in the system:

- provide standard task types used by the thread pool itself

What they do in code:

- `TPTaskBase`:
  - abstract base with `Execute()`
  - defaults `IsKillTask()` to `false`
- `TPFunctionTask`:
  - wraps a plain `std::function<void()>`
- `TPKillTask`:
  - identifies a worker-removal control task
- `TPFutureTask<T>`:
  - runs a function, stores its return value, and exposes `Get()` via a
    binary semaphore

These are framework utility task types, not part of the command system.

### `Pauser`

Defined in `framework/include/Pauser.hpp` and `framework/src/Pauser.cpp`.

Role in the system:

- coordinates full-pool pause and resume

What it does in code:

- `ArmPause(workers)` sets the expected number of workers that must block
- `Pause()`:
  - increments the paused-worker count
  - notifies when all targeted workers reached the pause point
  - blocks until resume
- `WaitUntilPaused()` waits until all targeted workers are paused
- `Resume()` releases all paused workers and clears pause state

The thread pool uses this by injecting high-priority pause tasks into worker
threads.

### `ThreadMap`

Defined in `framework/include/ThreadMap.hpp` and
`framework/src/ThreadMap.cpp`.

Role in the system:

- tracks worker-thread running state for dynamic resizing

What it does in code:

- stores `thread::id -> bool is_running`
- `operator[]` returns a proxy that reads or writes state under lock
- notifies a condition variable when a worker becomes stopped
- `WaitForStopped()` blocks until at least one tracked worker is no longer
  running
- `ExtractStopped()` removes and returns stopped thread ids

In practice, `ThreadPool::SetNumThreads()` uses it to detect which workers have
already exited after kill tasks were submitted.

## Delayed Work Components

### `AsyncInjection`

Defined in `framework/include/AsyncInjection.hpp` and
`framework/src/AsyncInjection.cpp`.

Role in the system:

- implements repeating delayed execution for commands that return
  `PostTaskParams`

What it does in code:

- is heap-allocated by `FrameworkTask` with `new AsyncInjection(...)`
- stores:
  - a `std::function<bool()>` action
  - a repeat interval
- immediately schedules itself through `Scheduler`
- when triggered:
  - runs the action
  - if the action returns `true`, deletes itself
  - otherwise re-schedules itself after the same interval

This is effectively a self-owning retry/polling helper.

### `Scheduler`

Defined in `framework/include/Scheduler.hpp` and
`framework/src/Scheduler.cpp`.

Role in the system:

- provides timed execution for scheduler tasks
- is the timer backend used by `AsyncInjection`

What it does in code:

- is a process-wide singleton
- stores pending tasks ordered by execution time and sequence number
- owns one POSIX timer created with `timer_create(..., SIGEV_THREAD, ...)`
- `AddTask()`:
  - wraps the task with an absolute execution time
  - either arms it immediately as the next task or queues it
- timer expiry invokes `OnTimer()`, which calls `HandleTimer()`
- `HandleTimer()`:
  - checks whether the armed task is due
  - executes it outside the mutex
  - promotes the next queued task and re-arms the timer

Important behavior:

- there is exactly one armed timer task at a time
- additional scheduled tasks wait in the internal priority queue

## Plugin Infrastructure

### `DirMonitor`

Defined in `framework/include/DirMonitor.hpp` and
`framework/src/DirMonitor.cpp`.

Role in the system:

- watches a directory for filesystem changes
- is the framework's trigger source for runtime plugin discovery

What it does in code:

- canonicalizes the watched path
- creates an `inotify` instance and watch
- starts a dedicated monitoring thread
- exposes subscriptions for:
  - added files
  - deleted files
  - modified files
- translates `inotify` events into full file paths and invokes callbacks

Current framework usage:

- `Framework` only subscribes to added-file events
- delete and modify subscriptions exist in the utility but are not currently
  used by `Framework`

### `DllLoader`

Defined in `framework/include/DllLoader.hpp` and
`framework/src/DllLoader.cpp`.

Role in the system:

- loads shared objects into the process exactly once per canonical path

What it does in code:

- canonicalizes the requested file path
- keeps a map of canonical path to `dlopen()` handle
- ignores duplicate load requests for already loaded paths
- uses `dlopen(..., RTLD_NOW | RTLD_LOCAL)`
- closes all stored handles in its destructor

Current framework behavior:

- `Framework` calls it only for `.so` files
- loading a shared object is enough to run its static initialization, which is
  how plugins register commands

## Support Infrastructure

### `Logger`

Defined in `framework/include/Logger.hpp` and `framework/src/Logger.cpp`.

Role in the system:

- provides asynchronous process-wide logging

What it does in code:

- is a singleton accessed by `Logger::Instance()`
- formats each message with timestamp and level
- queues log tasks into a `WaitableQueue`
- drains them on a dedicated worker thread
- supports:
  - default ostream sink
  - raw file-descriptor sink
  - sink replacement
  - explicit flush

This is a support service used by both framework and concrete layers.

### `WaitableQueue<T, CONTAINER>`

Defined in `framework/include/WaitableQueue.hpp`.

Role in the system:

- provides blocking producer-consumer queues for framework internals

What it does in code:

- wraps an arbitrary queue-like container
- supports:
  - `Push()`
  - blocking `Pop()`
  - timed `Pop(timeout, out)`
  - `IsEmpty()`
- internally uses:
  - `std::timed_mutex`
  - `std::condition_variable_any`

Used by:

- `ThreadPool`
- `Scheduler`
- `Logger`

### `PriorityQueue<T, ...>`

Defined in `framework/include/PriorityQueue.hpp`.

Role in the system:

- adapts `std::priority_queue` to a simpler queue-like API

What it does in code:

- exposes `push`, `pop`, `front`, `empty`, and `size`

Used as the underlying container type inside `WaitableQueue` for:

- `ThreadPool`
- `Scheduler`

### `SharedPtr<T>`

Defined in `framework/include/SharedPtr.hpp`.

Role in the system:

- provides the framework's own shared-ownership smart pointer

What it does in code:

- stores a raw pointer plus atomic reference count
- supports copy and cross-type copy construction
- deletes the managed object when the last reference goes away

Used by:

- framework tasks
- thread-pool tasks
- scheduler tasks

The framework uses this instead of `std::shared_ptr` in several core paths.

### `Singleton<T>`

Defined in `framework/include/Singleton.hpp`.

Role in the system:

- provides lazy process-wide singleton creation with `atexit` cleanup

What it does in code:

- allocates the singleton instance on first use
- registers destruction through `std::atexit`

Used directly by:

- `Logger`
- `Scheduler`

### `Handleton<T>`

Defined in `framework/include/Handleton.hpp`.

Role in the system:

- provides another lazy global-instance mechanism used by older framework code

What it does in code:

- lazily allocates one process-wide instance
- registers destruction with `atexit`

Used directly by:

- global command factory state
- global framework runtime state
- global `ThreadPool`

In current framework code, `Singleton` and `Handleton` coexist.

### `ScopeLock<T>`

Defined in `framework/include/ScopeLock.hpp`.

Role in the system:

- provides minimal RAII lock/unlock behavior for lock types exposing `lock()`
  and `unlock()`

What it does in code:

- locks in the constructor
- unlocks in the destructor

It is not used by the main C++20 framework path very much, but it remains part
of the framework utility layer and is used by the legacy non-C++11 branch of
singleton helpers.

## Plugin Flow As Implemented

The plugin path in the current framework is:

1. `Framework` is constructed with an optional plugins directory.
2. If the directory path is non-empty:
   - the directory is created if needed
   - `DirMonitor` starts watching it
   - newly added files trigger `TryLoadPlugin(path)`
3. `Run()` also scans the directory and loads any already existing `.so` files.
4. `DllLoader` calls `dlopen()`.
5. Plugin static initialization code is expected to call
   `RegisterCommandCreator()`.
6. The global command factory now creates the plugin's command for that key.

What the framework does not currently implement here:

- unload-on-delete behavior
- reload-on-modify behavior
- rollback or versioning for plugin replacement

The framework utility classes support file deletion and modification
notifications, but `Framework` does not currently act on them.

## Concurrency Model

The actual concurrency model is:

- one reactor thread for fd readiness and callback dispatch
- a global worker thread pool for task execution
- one background thread inside `DirMonitor` when plugin watching is enabled
- one background thread inside `Logger`
- POSIX timer callback threads created by `Scheduler` through `SIGEV_THREAD`

This means the framework is not "single-threaded"; only the readiness intake
path is single-threaded.

## What The Framework Owns vs What It Leaves To Concrete Code

The framework owns:

- fd readiness monitoring
- ready-fd callback dispatch
- conversion from proxy output into asynchronous work submission
- command creation by integer key
- plugin-triggered command registration
- worker-thread execution
- delayed rescheduling utilities
- shared support utilities such as logging and waitable queues

The framework does not own:

- message formats
- transport protocols
- storage semantics
- request/response correlation
- placement logic
- recovery policy
- concrete task schemas

Those are supplied by the concrete project built on top of it.

## Concrete Integration Boundary

The concrete storage project plugs into the framework at these exact points:

- it implements `IInputProxy` for concrete inputs such as UDP sockets and NBD
- it defines concrete `ITask` types carrying protocol-specific data
- it maps task keys to concrete `ICommand` implementations
- it optionally uses plugin registration to replace command creators at runtime

That means the framework is currently best understood as:

- an event-to-task-to-command execution engine
- plus a small set of reusable systems utilities around that engine
