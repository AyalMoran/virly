/**************************************************************
 * File    : ThreadPool.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_THREADPOOL_HPP
#define _ILRD_THREADPOOL_HPP
#include <functional>
#include <map>
#include <mutex>
#include <semaphore>
#include <thread>
#include <unordered_map>
#include <variant>

#include "PriorityQueue.hpp"
#include "ScopeLock.hpp"
#include "SharedPtr.hpp"
#include "WaitableQueue.hpp"

#ifndef NDEBUG
#include <iostream>
#endif
namespace ilrd
{

thread_local bool tls_is_running = true;

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

bool operator<(const Priority& p1, const Priority& p2)
{
    auto get_int_value = [](const Priority& p)
    { return std::visit([](auto&& arg) { return static_cast<int>(arg); }, p); };
#ifndef NDEBUG
    std::cout << "p1: " << get_int_value(p1) << " p2: " << get_int_value(p2)
              << std::endl;
#endif
    if (get_int_value(p1) == get_int_value(p2))
    {
        return false;
    }
    return get_int_value(p1) < get_int_value(p2);
}

class ThreadMap
{
  public:
    class ProxyValue
    {
      public:
        ProxyValue(ThreadMap& owner, std::thread::id id)
            : m_lock(owner.m_mutex), m_value(&owner.m_threadsIsRunning[id])
        {
        }

        ProxyValue& operator=(bool value)
        {
            *m_value = value;
            return *this;
        }

        operator bool() const
        {
            return *m_value;
        }

      private:
        std::unique_lock<std::mutex> m_lock;
        bool* m_value;
    };

    ThreadMap() : m_threadsIsRunning()
    {
    }

    ProxyValue operator[](std::thread::id id)
    {
        return ProxyValue(*this, id);
    }

    void Clear()
    {
        ScopeLock<std::mutex> lock(m_mutex);
        m_threadsIsRunning.clear();
    }

  private:
    mutable std::mutex m_mutex;
    std::unordered_map<std::thread::id, bool> m_threadsIsRunning;
};

class ThreadPool
{
    //* Forward Declarations
  private:
    friend class ThreadFunc;
    // Nested Types
  public:
    //* Tasks Hierarchy
    class ITPTask
    {
      public:
        virtual void Execute() = 0;
        virtual ~ITPTask() = default;
    };

    class FunctionTask : public ITPTask
    {
      public:
        FunctionTask(std::function<void()> fnc) : m_fnc(fnc)
        {
        }
        void Execute()
        {
            m_fnc();
        }

      private:
        std::function<void()> m_fnc;
    };

    template <typename T> class FutureTask : public ITPTask
    {
      public:
        FutureTask(std::function<T()> fnc) : m_fnc(fnc), m_sem(0)
        {
        }
        void Execute()
        {
            m_ret = m_fnc();
            m_sem.release();
        }
        T Get()
        {
            m_sem.acquire();
            return m_ret;
        }

      private:
        std::function<T()> m_fnc;
        T m_ret;
        std::binary_semaphore m_sem;
    };

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
        uint64_t m_seq; // smaller = older
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

    ThreadPool(std::size_t num_threads = std::thread::hardware_concurrency());
    ~ThreadPool();

    void AddTask(SharedPtr<ITPTask> task, const Priority& p);
    // All API non-thread-safe (user has only main thread)
    void Pause();  // Blocking call (if thread is doing something, it is
                   // paused when done)
    void Resume(); // Possible non blocking
    void SetNumThreads(
        std::size_t num_threads); // join, for example use map<id,is_running>

    void Stop();
    // No req for Run() / Stop()

  private:
    using TaskQueue = WaitableQueue<
        TaskWrapper,
        PriorityQueue<TaskWrapper, std::vector<TaskWrapper>, TaskCmp>>;

    TaskQueue m_tasksQueue;
    std::vector<std::jthread> m_threads;
    ThreadMap m_threadsIsRunning;
    std::atomic<uint64_t> m_seq = 0;
};

class ThreadFunc
{
  private:
    using TaskQueue =
        WaitableQueue<ThreadPool::TaskWrapper,
                      PriorityQueue<ThreadPool::TaskWrapper,
                                    std::vector<ThreadPool::TaskWrapper>,
                                    ThreadPool::TaskCmp>>;

  public:
    explicit ThreadFunc(ThreadPool& tasks) : m_pool(tasks)
    {
    }

    void operator()(std::stop_token stop_token)
    {
        m_pool.m_threadsIsRunning[std::this_thread::get_id()] = true;
        while (!stop_token.stop_requested())
        {
            ThreadPool::TaskWrapper taskWrapper;
            m_pool.m_tasksQueue.Pop(taskWrapper);
            if (!taskWrapper.GetTask())
            {
                continue;
            }
            taskWrapper.GetTask()->Execute();
        }
        m_pool.m_threadsIsRunning[std::this_thread::get_id()] = false;
    }

  private:
    ThreadPool& m_pool;
};

ThreadPool::ThreadPool(std::size_t num_threads)
    : m_tasksQueue(TaskQueue()), m_threads(), m_threadsIsRunning()
{
    try
    {
        for (std::size_t i = 0; i < num_threads; ++i)
        {
            m_threads.push_back(std::jthread(ThreadFunc(*this)));
        }
    }
    catch (const std::exception& e)
    {
        // TODO: Stop queue:
        // TODO: Join threads
        throw;
    }
    catch (...)
    {
        // TODO: Stop queue:
        // TODO: Join threads
        throw;
    }
}

void ThreadPool::Stop()
{
    for (auto& thread : m_threads)
    {
        AddTask(SharedPtr<ITPTask>(new FunctionTask(
                    [&thread]()
                    {
                        tls_is_running = false;
                        thread.request_stop();
                    })),
                AdminPriority::MAX);
    }
}

ThreadPool::~ThreadPool()
{
    Stop();
    for_each(m_threads.begin(), m_threads.end(),
             [](std::jthread& thread) { thread.join(); });
}

void ThreadPool::AddTask(SharedPtr<ITPTask> task, const Priority& p)
{
    m_tasksQueue.Push(TaskWrapper(task, p, m_seq.fetch_add(1)));
}

} // namespace ilrd

#endif /* _ILRD_THREADPOOL_HPP */
