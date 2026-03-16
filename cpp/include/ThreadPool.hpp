/**************************************************************
 * File    : ThreadPool.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_THREADPOOL_HPP
#define _ILRD_THREADPOOL_HPP

#include <atomic>   // std::atomic
#include <cstddef>  // std::size_t
#include <cstdint>  // std::uint64_t
#include <memory>   // std::unique_ptr
#include <thread>   // std::thread
#include <variant>  // std::variant
#include <vector>   // std::vector

#include "Pauser.hpp"            // Pauser
#include "PriorityQueue.hpp"     // PriorityQueue
#include "SharedPtr.hpp"         // SharedPtr
#include "ThreadMap.hpp"         // ThreadMap
#include "ThreadPoolTasks.hpp"   // ThreadPoolTasks
#include "WaitableQueue.hpp"     // WaitableQueue

#include "Handleton.hpp"

namespace ilrd
{

class ThreadFunc;

enum class UserPriority
{
    LOW = 1,
    MED = 2,
    HIGH = 3
};

enum class AdminPriority
{
    LOW = 1,
    MED = 2,
    HIGH = 3,
    MAX = 4
};

using Priority = std::variant<UserPriority, AdminPriority>;
bool operator<(const Priority& p1, const Priority& p2);

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

    class TaskWrapper
    {
      public:
        TaskWrapper(SharedPtr<ITPTask> task = SharedPtr<ITPTask>(nullptr),
                    Priority p = UserPriority::LOW, uint64_t seq = 0)
            : m_task(task), m_priority(p), m_seq(seq)
        {
        }

        int PriorityValue() const
        {
            return std::visit([](auto x) { return static_cast<int>(x); },
                              m_priority);
        }

        SharedPtr<ITPTask> GetTask() const
        {
            return m_task;
        }

        uint64_t GetSeq() const
        {
            return m_seq;
        }

      private:
        SharedPtr<ITPTask> m_task;
        Priority m_priority;
        uint64_t m_seq;
    };

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

    explicit ThreadPool(
        std::size_t num_threads = std::thread::hardware_concurrency());
    ~ThreadPool();

    void AddTask(SharedPtr<ITPTask> task, const Priority& p = UserPriority::LOW);
    void Pause();
    void Resume();
    void SetNumThreads(std::size_t num_threads);
    void StopNow();
    void Stop();

  private:
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
