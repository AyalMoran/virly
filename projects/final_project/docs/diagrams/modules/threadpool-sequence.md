# ThreadPool Sequence Diagram

This document describes the current generic `ThreadPool` behavior implemented in
`framework/src/ThreadPool.cpp`, `framework/src/ThreadPoolTasks.cpp`,
`framework/src/Pauser.cpp`, and `framework/src/ThreadMap.cpp`.

Notes:
- Same-priority task ordering is FIFO because `TaskWrapper` carries `m_seq`.
- Administrative flows use special queue entries: pause tasks, `KillTask`, `nullptr` sentinels, and wake-up no-op tasks.
- Pause is cooperative. Workers stop only after they dequeue and execute the injected pause task.

## Normal Task Execution

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant ThreadPool
    participant WaitableQueue
    participant Worker as Worker Thread
    participant Task as TPTaskBase / concrete task

    Worker->>WaitableQueue: Pop(taskWrapper)
    Note over Worker,WaitableQueue: Worker blocks until a task is available

    Client->>ThreadPool: AddTask(task, priority)
    ThreadPool->>ThreadPool: Wrap task with priority + m_seq
    ThreadPool->>WaitableQueue: Push(TaskWrapper)
    WaitableQueue-->>Worker: Return TaskWrapper

    Worker->>Worker: task = taskWrapper.GetTask()
    alt task == nullptr
        Worker-->>Worker: Break worker loop
    else task->IsKillTask()
        Worker-->>Worker: request_stop() on self stop source
        Worker-->>Worker: Continue loop
    else regular task
        Worker->>Task: Execute()
        alt Execute throws
            Worker-->>Worker: Catch and log exception
        else Execute succeeds
            Task-->>Worker: Return
        end
        Worker->>WaitableQueue: Pop(next taskWrapper)
    end
```

## Pause / Resume

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant ThreadPool
    participant Pauser
    participant WaitableQueue
    participant Worker as Worker Thread

    Client->>ThreadPool: Pause()
    ThreadPool->>ThreadPool: Check not stopped and still accepting tasks
    ThreadPool->>Pauser: ArmPause(worker_count)
    loop once per worker
        ThreadPool->>ThreadPool: AddTask(FunctionTask(Pauser::Pause), AdminPriority::MAX)
        ThreadPool->>WaitableQueue: Push(pause TaskWrapper)
    end
    ThreadPool->>Pauser: WaitUntilPaused()

    par each worker eventually dequeues one pause task
        Worker->>WaitableQueue: Pop(pause TaskWrapper)
        WaitableQueue-->>Worker: pause TaskWrapper
        Worker->>Pauser: Pause()
        Pauser-->>Pauser: Increment paused count
        alt last required worker arrives
            Pauser-->>ThreadPool: Unblock WaitUntilPaused()
        end
        Pauser-->>Worker: Block until Resume()
    and controller waits
        Pauser-->>ThreadPool: WaitUntilPaused returns after all workers parked
    end

    Client->>ThreadPool: Resume()
    ThreadPool->>Pauser: Resume()
    Pauser-->>Worker: Release all paused workers
    Worker->>WaitableQueue: Pop(next taskWrapper)
```

## Shrink Worker Count

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant ThreadPool
    participant WaitableQueue
    participant Worker as Worker Thread
    participant KillTask
    participant ThreadMap

    Client->>ThreadPool: SetNumThreads(smaller_count)
    ThreadPool->>ThreadPool: Compute to_remove
    loop once per worker to remove
        ThreadPool->>WaitableQueue: Push(TaskWrapper(KillTask, AdminPriority::MAX, m_seq))
    end

    loop workers consume kill tasks
        Worker->>WaitableQueue: Pop(kill TaskWrapper)
        WaitableQueue-->>Worker: kill TaskWrapper
        Worker->>KillTask: IsKillTask()
        KillTask-->>Worker: true
        Worker-->>Worker: self stop_source.request_stop()
        Worker-->>ThreadMap: [thread_id] = false on loop exit
    end

    alt enough stopped workers already visible
        ThreadPool->>ThreadMap: Poll m_threadsIsRunning[id]
    else not enough stopped workers yet
        ThreadPool->>ThreadMap: WaitForStopped()
    end

    ThreadPool->>ThreadPool: Join stopped jthreads
    ThreadPool->>ThreadPool: Erase removed workers from m_workers
```

## Graceful Stop

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant ThreadPool
    participant Pauser
    participant WaitableQueue
    participant Worker as Worker Thread

    Client->>ThreadPool: Stop()
    ThreadPool->>ThreadPool: m_isStopped = true
    ThreadPool->>ThreadPool: m_acceptingTasks = false
    ThreadPool->>Pauser: Resume()
    loop once per worker
        ThreadPool->>WaitableQueue: Push(TaskWrapper(nullptr, UserPriority::LOW, m_seq))
    end

    Note over WaitableQueue,Worker: Existing higher-priority queued work may run before the low-priority nullptr sentinel

    loop per worker
        Worker->>WaitableQueue: Pop(taskWrapper)
        WaitableQueue-->>Worker: taskWrapper
        alt regular queued task
            Worker-->>Worker: Execute task
            Worker->>WaitableQueue: Pop(next taskWrapper)
        else nullptr sentinel
            Worker-->>Worker: Break loop
            Worker-->>ThreadPool: Thread becomes joinable for Stop()
        end
    end

    ThreadPool->>ThreadPool: Join all workers
```

## Immediate Stop

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant ThreadPool
    participant Pauser
    participant WaitableQueue
    participant Worker as Worker Thread
    participant WakeTask as no-op FunctionTask

    Client->>ThreadPool: StopNow()
    ThreadPool->>ThreadPool: m_isStopped = true
    ThreadPool->>ThreadPool: m_acceptingTasks = false
    ThreadPool->>Pauser: Resume()
    loop once per worker
        ThreadPool-->>Worker: request_stop() via worker stop_source
    end
    loop once per worker
        ThreadPool->>WaitableQueue: Push(TaskWrapper(WakeTask, AdminPriority::MAX, m_seq))
    end

    Worker->>WaitableQueue: Pop(wake taskWrapper)
    WaitableQueue-->>Worker: wake taskWrapper
    Worker->>WakeTask: Execute()
    WakeTask-->>Worker: return
    Worker-->>Worker: Loop condition sees stop_requested()
    Worker-->>Worker: Exit loop without draining remaining user tasks

    ThreadPool->>ThreadPool: Join all workers
```
