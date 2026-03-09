/**************************************************************
 * File    : Scheduler.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/ 
#ifndef ILRD_SCHEDULER_HPP
#define ILRD_SCHEDULER_HPP

#include <chrono>  // std::chrono::*
#include <cstdint> // uint64_t
#include <memory>  // std::shared_ptr
#include <mutex>   // std::mutex
#include <vector>  // std::vector
#include <signal.h> // sigval

#include "PriorityQueue.hpp" // PriorityQueue
#include "Singleton.hpp"     // Singleton
#include "WaitableQueue.hpp" // WaitableQueue

namespace ilrd
{

class Scheduler
{
  public:
    class ISchedulerTask
    {
      public:
        virtual ~ISchedulerTask() = default;
        virtual void Execute() = 0;
    };

    static Scheduler* GetInstance();
    void AddTask(std::shared_ptr<ISchedulerTask> task,
                 std::chrono::milliseconds dt_msec);

  private:
    struct SchedulerTaskWrapper
    {
        std::shared_ptr<ISchedulerTask> m_schedulerTask;
        std::chrono::steady_clock::time_point m_executionTime;
        uint64_t m_seq;
    };

    struct SchedulerTaskCompare
    {
        bool operator()(const std::shared_ptr<SchedulerTaskWrapper>& lhs,
                        const std::shared_ptr<SchedulerTaskWrapper>& rhs) const;
    };

    Scheduler();
    ~Scheduler();

    Scheduler(const Scheduler&) = delete;
    Scheduler& operator=(const Scheduler&) = delete;

    static void OnTimer(sigval sv);
    void HandleTimer();
    void ResetTimerLocked();

    using TaskPtr = std::shared_ptr<SchedulerTaskWrapper>;
    using TaskQueue =
        WaitableQueue<TaskPtr, PriorityQueue<TaskPtr, std::vector<TaskPtr>,
                                             SchedulerTaskCompare>>;

    TaskQueue m_tasks;
    TaskPtr m_armedTask;
    std::mutex m_mutex;
    timer_t m_timer;
    uint64_t m_seq;

    friend class Singleton<Scheduler>;
};

} // namespace ilrd

#endif /* ILRD_SCHEDULER_HPP */
