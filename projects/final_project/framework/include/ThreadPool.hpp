/**************************************************************
 * File    : ThreadPool.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
/**
 * @file ThreadPool.hpp
 * @brief Declares the shared worker pool and task priority model.
 */
#ifndef _ILRD_THREADPOOL_HPP
#define _ILRD_THREADPOOL_HPP

#include <atomic>  // std::atomic
#include <cstddef> // std::size_t
#include <cstdint> // std::uint64_t
#include <memory>  // std::unique_ptr
#include <thread>  // std::thread
#include <variant> // std::variant
#include <vector>  // std::vector

#include "Handleton.hpp"
#include "Pauser.hpp"          // Pauser
#include "PriorityQueue.hpp"   // PriorityQueue
#include "SharedPtr.hpp"       // SharedPtr
#include "ThreadMap.hpp"       // ThreadMap
#include "ThreadPoolTasks.hpp" // ThreadPoolTasks
#include "WaitableQueue.hpp"   // WaitableQueue

namespace ilrd
{

class ThreadFunc;

/**
 * @brief Priorities available to user-submitted tasks.
 */
enum class UserPriority
{
    LOW = 1,
    MED = 2,
    HIGH = 3
};

/**
 * @brief Priorities reserved for thread-pool administrative work.
 */
enum class AdminPriority
{
    LOW = 1,
    MED = 2,
    HIGH = 3,
    MAX = 4
};

/**
 * @brief Variant holding either a user or administrative priority.
 */
using Priority = std::variant<UserPriority, AdminPriority>;

/**
 * @brief Orders priorities by their numeric weight.
 * @param p1 Left operand.
 * @param p2 Right operand.
 * @return `true` when `p1` is lower priority than `p2`.
 */
bool operator<(const Priority& p1, const Priority& p2);

/**
 * @brief Multi-threaded task executor with pause, resize, and shutdown controls.
 *
 * The pool is currently exposed through Handleton and is used as shared process
 * infrastructure by the framework.
 */
class ThreadPool
{
  private:
    friend class ilrd::Handleton<ThreadPool>;
    friend class ThreadFunc;

  public:
    using ITPTask = TPTaskBase;
    using FunctionTask = TPFunctionTask;
    using KillTask = TPKillTask;
    template <typename T> using FutureTask = TPFutureTask<T>;

    /**
     * @brief Queue entry that pairs a task with its priority and sequence id.
     */
    class TaskWrapper
    {
      public:
        /**
         * @brief Builds a queued task record.
         * @param task Task to enqueue.
         * @param p Task priority.
         * @param seq Sequence number used as a FIFO tiebreaker.
         */
        TaskWrapper(SharedPtr<ITPTask> task = SharedPtr<ITPTask>(nullptr),
                    Priority p = UserPriority::LOW, uint64_t seq = 0)
            : m_task(task), m_priority(p), m_seq(seq)
        {
        }

        /**
         * @brief Returns the numeric value of the wrapped priority.
         * @return Integer priority rank.
         */
        int PriorityValue() const
        {
            return std::visit([](auto x) { return static_cast<int>(x); },
                              m_priority);
        }

        /**
         * @brief Returns the wrapped task.
         * @return Shared task pointer.
         */
        SharedPtr<ITPTask> GetTask() const
        {
            return m_task;
        }

        /**
         * @brief Returns the insertion sequence number.
         * @return Monotonic sequence id.
         */
        uint64_t GetSeq() const
        {
            return m_seq;
        }

      private:
        SharedPtr<ITPTask> m_task;
        Priority m_priority;
        uint64_t m_seq;
    };

    /**
     * @brief Orders queued tasks by priority and insertion order.
     */
    struct TaskCmp
    {
        bool operator()(const TaskWrapper& a, const TaskWrapper& b) const
        {
            if (a.PriorityValue() != b.PriorityValue())
            {
                return a.PriorityValue() < b.PriorityValue();
            }
            return a.GetSeq() > b.GetSeq();
        }
    };

    /**
     * @brief Starts a pool with `num_threads` worker threads.
     * @param num_threads Number of worker threads to create initially.
     */
    explicit ThreadPool(
        std::size_t num_threads = std::thread::hardware_concurrency());

    /**
     * @brief Stops workers and releases pool resources.
     */
    ~ThreadPool();

    /**
     * @brief Enqueues a task for execution.
     * @param task Task to execute.
     * @param p Priority assigned to the task.
     */
    void AddTask(SharedPtr<ITPTask> task, const Priority& p = UserPriority::LOW);

    /**
     * @brief Requests all workers to enter the cooperative pause barrier.
     */
    void Pause();

    /**
     * @brief Releases workers blocked in Pause().
     */
    void Resume();

    /**
     * @brief Grows or shrinks the worker count.
     * @param num_threads Target worker count.
     */
    void SetNumThreads(std::size_t num_threads);

    /**
     * @brief Stops workers immediately, without draining queued user work.
     */
    void StopNow();

    /**
     * @brief Stops the pool after processing the queued shutdown sequence.
     */
    void Stop();

  private:
    /**
     * @brief Owned worker thread and its stop source.
     */
    struct Worker
    {
        Worker() : thread(), stop_source()
        {
        }

        std::jthread thread;
        std::stop_source stop_source;
    };

    using TaskQueue = WaitableQueue<
        TaskWrapper,
        PriorityQueue<TaskWrapper, std::vector<TaskWrapper>, TaskCmp>>;

    TaskQueue m_tasksQueue;
    std::vector<std::unique_ptr<Worker>> m_workers;
    ThreadMap m_threadsIsRunning;
    Pauser m_pauser;
    std::atomic<uint64_t> m_seq;
    std::atomic<bool> m_acceptingTasks;
    std::atomic<bool> m_isStopped;
};

} // namespace ilrd

#endif /* _ILRD_THREADPOOL_HPP */
