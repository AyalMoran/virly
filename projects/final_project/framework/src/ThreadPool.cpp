/**************************************************************
 * File    : ThreadPool.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <iostream>   // std::cerr
#include <string>     // std::to_string
#include <thread>     // std::this_thread
#include <vector>     // std::vector

#include "ThreadPool.hpp" // ThreadPool
#include "DebugLogger.hpp"
 
namespace ilrd
{

bool operator<(const Priority& p1, const Priority& p2)
{
    auto get_int_value = [](const Priority& p)
    { return std::visit([](auto&& arg) { return static_cast<int>(arg); }, p); };
#ifndef NDEBUG
    ILRD_DEBUG_LOG("ThreadPool priority compare lhs=" +
                   std::to_string(get_int_value(p1)) + " rhs=" +
                   std::to_string(get_int_value(p2)));
#endif
    return get_int_value(p1) < get_int_value(p2);
}

class ThreadFunc
{
  public:
    explicit ThreadFunc(ThreadPool& tasks, std::stop_source& self_stop_source)
        : m_pool(tasks), m_selfStopSource(self_stop_source)
    {
    }

    void operator()(std::stop_token stop_token)
    {
        m_pool.m_threadsIsRunning[std::this_thread::get_id()] = true;
        ILRD_DEBUG_LOG("ThreadPool worker started");
        while (!stop_token.stop_requested())
        {
            ThreadPool::TaskWrapper taskWrapper;
            m_pool.m_tasksQueue.Pop(taskWrapper);
            SharedPtr<ThreadPool::ITPTask> task = taskWrapper.GetTask();
            if (!task)
            {
                ILRD_DEBUG_LOG("ThreadPool worker received shutdown sentinel");
                break;
            }
            if (task->IsKillTask())
            {
                ILRD_DEBUG_LOG("ThreadPool worker received kill task");
                m_selfStopSource.request_stop();
                continue;
            }
            try
            {
                ILRD_DEBUG_LOG("ThreadPool worker executing task");
                task->Execute();
            }
            catch (const std::exception& e)
            {
                std::cerr << "Thread " << std::this_thread::get_id()
                          << " threw an exception: " << e.what() << std::endl;
            }
            catch (...)
            {
                std::cerr << "Thread " << std::this_thread::get_id()
                          << " threw an unknown exception" << std::endl;
            }
        }
        m_pool.m_threadsIsRunning[std::this_thread::get_id()] = false;
        ILRD_DEBUG_LOG("ThreadPool worker stopped");
    }

  private:
    ThreadPool& m_pool;
    std::stop_source& m_selfStopSource;
};

ThreadPool::ThreadPool(std::size_t num_threads)
    : m_tasksQueue(TaskQueue()), m_workers(), m_threadsIsRunning(), m_pauser(), m_seq(0),
      m_acceptingTasks(true), m_isStopped(false)
{
    const std::size_t hc = std::thread::hardware_concurrency();
    const std::size_t threads =
        (num_threads == 0) ? ((hc == 0) ? 1 : hc) : num_threads;

    try
    {
        ILRD_DEBUG_LOG("ThreadPool starting " + std::to_string(threads) +
                       " worker threads");
        for (std::size_t i = 0; i < threads; ++i)
        {
            std::unique_ptr<Worker> worker(new Worker());
            Worker* worker_ptr = worker.get();
            std::stop_token worker_token = worker_ptr->stop_source.get_token();
            worker_ptr->thread = std::jthread(
                [this, worker_token, worker_ptr]() mutable
                { ThreadFunc(*this, worker_ptr->stop_source)(worker_token); });
            m_threadsIsRunning[worker_ptr->thread.get_id()] = true;
            m_workers.push_back(std::move(worker));
        }
    }
    catch (...)
    {
        throw;
    }
}

void ThreadPool::StopNow()
{
    bool expected = false;
    if (!m_isStopped.compare_exchange_strong(expected, true))
    {
        return;
    }

    m_acceptingTasks.store(false, std::memory_order_relaxed);
    m_pauser.Resume();
    ILRD_DEBUG_LOG("ThreadPool::StopNow requested");

    for (std::size_t i = 0; i < m_workers.size(); ++i)
    {
        m_workers[i]->stop_source.request_stop();
    }

    for (std::size_t i = 0; i < m_workers.size(); ++i)
    {
        m_tasksQueue.Push(
            TaskWrapper(SharedPtr<ITPTask>(new FunctionTask([]() {})),
                        AdminPriority::MAX, m_seq.fetch_add(1)));
    }

    for (std::size_t i = 0; i < m_workers.size(); ++i)
    {
        if (m_workers[i]->thread.joinable())
        {
            m_workers[i]->thread.join();
        }
    }
}

void ThreadPool::Pause()
{
    if (m_isStopped.load(std::memory_order_relaxed) ||
        !m_acceptingTasks.load(std::memory_order_relaxed))
    {
        return;
    }

    const std::size_t workers = m_workers.size();
    ILRD_DEBUG_LOG("ThreadPool::Pause requested for " +
                   std::to_string(workers) + " workers");
    m_pauser.ArmPause(workers);

    for (std::size_t i = 0; i < workers; ++i)
    {
        AddTask(SharedPtr<ITPTask>(
                    new FunctionTask([this]() { m_pauser.Pause(); })),
                AdminPriority::MAX);
    }

    m_pauser.WaitUntilPaused();
}

void ThreadPool::Resume()
{
    m_pauser.Resume();
    ILRD_DEBUG_LOG("ThreadPool resumed");
}

void ThreadPool::Stop()
{
    bool expected = false;
    if (!m_isStopped.compare_exchange_strong(expected, true))
    {
        return;
    }

    m_acceptingTasks.store(false, std::memory_order_relaxed);
    m_pauser.Resume();
    ILRD_DEBUG_LOG("ThreadPool::Stop requested");

    for (std::size_t i = 0; i < m_workers.size(); ++i)
    {
        m_tasksQueue.Push(TaskWrapper(SharedPtr<ITPTask>(nullptr),
                                      UserPriority::LOW, m_seq.fetch_add(1)));
    }

    for (std::size_t i = 0; i < m_workers.size(); ++i)
    {
        if (m_workers[i]->thread.joinable())
        {
            m_workers[i]->thread.join();
        }
    }
}

void ThreadPool::SetNumThreads(std::size_t num_threads)
{
    if (m_isStopped.load(std::memory_order_relaxed))
    {
        return;
    }

    const std::size_t current = m_workers.size();
    if (num_threads == current)
    {
        return;
    }

    if (num_threads > current)
    {
        const std::size_t to_add = num_threads - current;
        ILRD_DEBUG_LOG("ThreadPool increasing worker count by " +
                       std::to_string(to_add));
        for (std::size_t i = 0; i < to_add; ++i)
        {
            std::unique_ptr<Worker> worker(new Worker());
            Worker* worker_ptr = worker.get();
            std::stop_token worker_token = worker_ptr->stop_source.get_token();
            worker_ptr->thread = std::jthread(
                [this, worker_token, worker_ptr]() mutable
                { ThreadFunc(*this, worker_ptr->stop_source)(worker_token); });
            m_threadsIsRunning[worker_ptr->thread.get_id()] = true;
            m_workers.push_back(std::move(worker));
        }
        return;
    }

    const std::size_t to_remove = current - num_threads;
    ILRD_DEBUG_LOG("ThreadPool decreasing worker count by " +
                   std::to_string(to_remove));
    for (std::size_t i = 0; i < to_remove; ++i)
    {
        m_tasksQueue.Push(TaskWrapper(SharedPtr<ITPTask>(new KillTask()),
                                      AdminPriority::MAX, m_seq.fetch_add(1)));
    }

    std::size_t removed = 0;
    while (removed < to_remove)
    {
        for (std::vector<std::unique_ptr<Worker>>::iterator it = m_workers.begin();
             it != m_workers.end() && removed < to_remove;)
        {
            const std::thread::id id = (*it)->thread.get_id();
            if (!m_threadsIsRunning[id])
            {
                if ((*it)->thread.joinable())
                {
                    (*it)->thread.join();
                }
                it = m_workers.erase(it);
                ++removed;
            }
            else
            {
                ++it;
            }
        }

        if (removed < to_remove)
        {
            m_threadsIsRunning.WaitForStopped();
        }
    }
}

ThreadPool::~ThreadPool()
{
    Stop();
}

void ThreadPool::AddTask(SharedPtr<ITPTask> task, const Priority& p)
{
    if (!m_acceptingTasks.load(std::memory_order_relaxed))
    {
        ILRD_DEBUG_LOG("ThreadPool rejected task because it is no longer accepting work");
        return;
    }

    m_tasksQueue.Push(TaskWrapper(task, p, m_seq.fetch_add(1)));
    ILRD_DEBUG_LOG("ThreadPool queued task");
}

} // namespace ilrd
