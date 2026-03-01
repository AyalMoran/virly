/**************************************************************
 * File    : ThreadPool.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include "ThreadPool.hpp"

#include <algorithm>
#include <chrono>
#include <iostream>

namespace ilrd
{

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
        while (!stop_token.stop_requested())
        {
            ThreadPool::TaskWrapper taskWrapper;
            m_pool.m_tasksQueue.Pop(taskWrapper);
            SharedPtr<ThreadPool::ITPTask> task = taskWrapper.GetTask();
            if (!task)
            {
                break;
            }
            if (task->IsKillTask())
            {
                m_selfStopSource.request_stop();
                continue;
            }
            try
            {
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
    }

  private:
    ThreadPool& m_pool;
    std::stop_source& m_selfStopSource;
};

ThreadPool::ThreadPool(std::size_t num_threads)
    : m_tasksQueue(TaskQueue()), m_workers(), m_threadsIsRunning(), m_seq(0),
      m_acceptingTasks(true), m_isStopped(false), m_pauser()
{
    try
    {
        for (std::size_t i = 0; i < num_threads; ++i)
        {
            std::unique_ptr<Worker> worker(new Worker());
            Worker* worker_ptr = worker.get();
            std::stop_token worker_token = worker_ptr->stop_source.get_token();
            worker_ptr->thread = std::jthread(
                [this, worker_token, worker_ptr]() mutable
                { ThreadFunc(*this, worker_ptr->stop_source)(worker_token); });
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
        for (std::size_t i = 0; i < to_add; ++i)
        {
            std::unique_ptr<Worker> worker(new Worker());
            Worker* worker_ptr = worker.get();
            std::stop_token worker_token = worker_ptr->stop_source.get_token();
            worker_ptr->thread = std::jthread(
                [this, worker_token, worker_ptr]() mutable
                { ThreadFunc(*this, worker_ptr->stop_source)(worker_token); });
            m_workers.push_back(std::move(worker));
        }
        return;
    }

    const std::size_t to_remove = current - num_threads;
    for (std::size_t i = 0; i < to_remove; ++i)
    {
        m_tasksQueue.Push(TaskWrapper(SharedPtr<ITPTask>(new KillTask()),
                                      AdminPriority::MAX, m_seq.fetch_add(1)));
    }

    std::size_t removed = 0;
    while (removed < to_remove)
    {
        std::vector<std::thread::id> stopped_ids =
            m_threadsIsRunning.ExtractStopped(to_remove - removed);

        for (std::size_t i = 0; i < stopped_ids.size(); ++i)
        {
            std::vector<std::unique_ptr<Worker>>::iterator it = std::find_if(
                m_workers.begin(), m_workers.end(),
                [&stopped_ids, i](const std::unique_ptr<Worker>& worker)
                { return worker->thread.get_id() == stopped_ids[i]; });

            if (it != m_workers.end())
            {
                if ((*it)->thread.joinable())
                {
                    (*it)->thread.join();
                }
                m_workers.erase(it);
                ++removed;
            }
        }

        if (removed < to_remove)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
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
        return;
    }

    m_tasksQueue.Push(TaskWrapper(task, p, m_seq.fetch_add(1)));
}

} // namespace ilrd
